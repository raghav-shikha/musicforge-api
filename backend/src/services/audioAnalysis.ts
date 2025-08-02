import axios from 'axios';
import FormData from 'form-data';
import ffmpeg from 'fluent-ffmpeg';
import { parseFile } from 'music-metadata';
import { logger } from '@/utils/logger';
import { redis } from '@/utils/redis';
import { AudioAnalysisResult } from '@/types';

class AudioAnalysisService {
  private auddApiKey: string;

  constructor() {
    this.auddApiKey = process.env.AUDD_API_KEY || '';
  }

  /**
   * Analyze audio from URL using multiple services
   */
  async analyzeFromUrl(audioUrl: string): Promise<AudioAnalysisResult> {
    const cacheKey = `audio:analysis:${Buffer.from(audioUrl).toString('base64')}`;
    
    // Check cache first (cache for 24 hours)
    const cached = await redis.getJson<AudioAnalysisResult>(cacheKey);
    if (cached) {
      logger.info('Audio analysis cache hit');
      return cached;
    }

    logger.info(`Starting audio analysis for URL: ${audioUrl}`);

    try {
      // Run multiple analysis methods in parallel
      const [auddResult, basicAnalysis, waveformData] = await Promise.allSettled([
        this.analyzeWithAudD(audioUrl),
        this.basicAudioAnalysis(audioUrl),
        this.generateWaveform(audioUrl)
      ]);

      // Combine results
      const result: AudioAnalysisResult = {};

      // AudD results (most reliable for BPM and key)
      if (auddResult.status === 'fulfilled' && auddResult.value) {
        Object.assign(result, auddResult.value);
      }

      // Basic analysis fallback
      if (basicAnalysis.status === 'fulfilled' && basicAnalysis.value) {
        if (!result.bpm && basicAnalysis.value.bpm) {
          result.bpm = basicAnalysis.value.bpm;
        }
        if (!result.energyLevel && basicAnalysis.value.energyLevel) {
          result.energyLevel = basicAnalysis.value.energyLevel;
        }
      }

      // Waveform data
      if (waveformData.status === 'fulfilled' && waveformData.value) {
        result.waveformPeaks = waveformData.value;
      }

      // Set confidence scores
      result.tempoConfidence = result.bpm ? 0.8 : 0.0;
      result.keyConfidence = result.musicalKey ? 0.7 : 0.0;

      // Cache for 24 hours
      await redis.setJson(cacheKey, result, 86400);

      logger.info('Audio analysis completed', { 
        bpm: result.bpm, 
        key: result.musicalKey,
        energy: result.energyLevel 
      });

      return result;

    } catch (error) {
      logger.error('Audio analysis error:', error);
      throw new Error('Failed to analyze audio');
    }
  }

  /**
   * Analyze with AudD service (most reliable)
   */
  private async analyzeWithAudD(audioUrl: string): Promise<Partial<AudioAnalysisResult>> {
    if (!this.auddApiKey) {
      logger.warn('AudD API key not configured, skipping AudD analysis');
      return {};
    }

    try {
      const formData = new FormData();
      formData.append('url', audioUrl);
      formData.append('api_token', this.auddApiKey);
      formData.append('return', 'musicbrainz');

      const response = await axios.post('https://api.audd.io/', formData, {
        headers: formData.getHeaders(),
        timeout: 30000
      });

      if (response.data.status === 'success' && response.data.result) {
        const data = response.data.result;
        
        return {
          bpm: data.tempo ? Math.round(data.tempo) : undefined,
          musicalKey: data.key || undefined,
          camelotKey: this.convertToCamelot(data.key),
          genre: data.genre || undefined,
          loudness: data.loudness || undefined
        };
      }

      return {};
    } catch (error) {
      logger.error('AudD analysis error:', error);
      return {};
    }
  }

  /**
   * Basic audio analysis using FFmpeg and heuristics
   */
  private async basicAudioAnalysis(audioUrl: string): Promise<Partial<AudioAnalysisResult>> {
    return new Promise((resolve) => {
      try {
        let duration = 0;
        let energySum = 0;
        let sampleCount = 0;

        ffmpeg(audioUrl)
          .audioFilters([
            'lowpass=3000', // Remove high frequencies for BPM detection
            'highpass=60'   // Remove very low frequencies
          ])
          .format('wav')
          .on('codecData', (data) => {
            duration = this.parseDuration(data.duration);
          })
          .on('progress', (progress) => {
            // Estimate energy from processing speed (rough heuristic)
            if (progress.percent) {
              energySum += progress.percent;
              sampleCount++;
            }
          })
          .on('end', () => {
            const avgEnergy = sampleCount > 0 ? energySum / sampleCount / 100 : 0.5;
            
            resolve({
              energyLevel: Math.min(Math.max(avgEnergy, 0), 1),
              // BPM estimation based on duration and energy (very rough)
              bpm: duration ? this.estimateBPMFromDuration(duration, avgEnergy) : undefined
            });
          })
          .on('error', (error) => {
            logger.error('FFmpeg analysis error:', error);
            resolve({});
          })
          .pipe(require('stream').Writable({
            write: () => {} // Discard output
          }));

      } catch (error) {
        logger.error('Basic analysis error:', error);
        resolve({});
      }
    });
  }

  /**
   * Generate waveform peaks for visualization
   */
  private async generateWaveform(audioUrl: string, peakCount: number = 1000): Promise<number[]> {
    return new Promise((resolve, reject) => {
      try {
        const peaks: number[] = [];
        let maxPeak = 0;

        ffmpeg(audioUrl)
          .audioFilters([
            `aresample=8000`, // Downsample for performance
            `asetnsamples=n=${Math.floor(8000 / peakCount)}`
          ])
          .format('f64le') // Raw audio data
          .on('end', () => {
            // Normalize peaks
            const normalizedPeaks = peaks.map(peak => peak / maxPeak);
            resolve(normalizedPeaks);
          })
          .on('error', (error) => {
            logger.error('Waveform generation error:', error);
            resolve([]);
          })
          .pipe(require('stream').Writable({
            write: (chunk: Buffer, encoding, callback) => {
              // Convert buffer to float64 values
              for (let i = 0; i < chunk.length; i += 8) {
                if (i + 8 <= chunk.length) {
                  const sample = Math.abs(chunk.readDoubleLE(i));
                  peaks.push(sample);
                  maxPeak = Math.max(maxPeak, sample);
                }
              }
              callback();
            }
          }));

      } catch (error) {
        logger.error('Waveform generation error:', error);
        resolve([]);
      }
    });
  }

  /**
   * Convert musical key to Camelot notation
   */
  private convertToCamelot(key: string): string | undefined {
    if (!key) return undefined;

    const camelotMap: Record<string, string> = {
      'C major': '8B', 'A minor': '8A',
      'G major': '9B', 'E minor': '9A',
      'D major': '10B', 'B minor': '10A',
      'A major': '11B', 'F# minor': '11A',
      'E major': '12B', 'C# minor': '12A',
      'B major': '1B', 'G# minor': '1A',
      'F# major': '2B', 'D# minor': '2A',
      'C# major': '3B', 'A# minor': '3A',
      'G# major': '4B', 'F minor': '4A',
      'D# major': '5B', 'C minor': '5A',
      'A# major': '6B', 'G minor': '6A',
      'F major': '7B', 'D minor': '7A'
    };

    return camelotMap[key] || undefined;
  }

  /**
   * Parse duration string to seconds
   */
  private parseDuration(durationStr: string): number {
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  }

  /**
   * Rough BPM estimation based on duration and energy
   */
  private estimateBPMFromDuration(duration: number, energy: number): number | undefined {
    // Very rough heuristic based on common music patterns
    if (duration < 60) return undefined; // Too short
    
    // Electronic music patterns
    if (energy > 0.7) {
      return Math.round(120 + (energy - 0.7) * 40); // 120-132 BPM for high energy
    } else if (energy > 0.4) {
      return Math.round(100 + energy * 40); // 100-120 BPM for medium energy
    } else {
      return Math.round(80 + energy * 40); // 80-100 BPM for low energy
    }
  }

  /**
   * Estimate energy level from audio characteristics
   */
  calculateEnergyLevel(options: {
    bpm?: number;
    loudness?: number;
    tempo?: number;
  }): number {
    let energy = 0.5; // Default medium energy

    // BPM contribution
    if (options.bpm) {
      if (options.bpm > 140) energy += 0.3;
      else if (options.bpm > 120) energy += 0.2;
      else if (options.bpm > 100) energy += 0.1;
      else energy -= 0.1;
    }

    // Loudness contribution
    if (options.loudness !== undefined) {
      // LUFS scale: -23 (quiet) to -16 (loud)
      const loudnessNormalized = Math.max(0, Math.min(1, (options.loudness + 30) / 20));
      energy += (loudnessNormalized - 0.5) * 0.4;
    }

    return Math.max(0, Math.min(1, energy));
  }
}

export const audioAnalysisService = new AudioAnalysisService();
