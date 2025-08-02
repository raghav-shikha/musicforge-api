# 🔊 Advanced Audio Analysis

## Overview

The Audio Analysis service provides comprehensive real-time analysis of music tracks, extracting crucial metadata including BPM, musical key, energy levels, and waveform data. This enables DJ applications, music discovery platforms, and content creation tools to make intelligent decisions about music selection and mixing.

## 🎯 Core Capabilities

### **Multi-Parameter Analysis**
```json
{
  "bpm": 128.5,
  "musicalKey": "C minor",
  "camelotKey": "5A",
  "energyLevel": 0.75,
  "loudness": -14.2,
  "tempoConfidence": 0.92,
  "keyConfidence": 0.88,
  "waveformPeaks": [0.1, 0.3, 0.8, 0.4, ...],
  "genre": "Deep House",
  "mood": "Energetic"
}
```

### **Analysis Features**
| Feature | Description | Use Case |
|---------|-------------|----------|
| **BPM Detection** | Accurate tempo analysis | DJ mixing, workout playlists |
| **Musical Key** | Chromatic key identification | Harmonic mixing, music theory |
| **Camelot Wheel** | DJ-friendly key notation | Seamless transitions |
| **Energy Level** | 0-1 intensity scale | Playlist energy management |
| **Waveform Data** | Peak visualization data | Audio players, DJ software |
| **Genre Classification** | AI-powered categorization | Music discovery, tagging |
| **Mood Detection** | Emotional classification | Playlist curation |

## 🏗️ Technical Architecture

### **Multi-Provider Strategy**
```typescript
class AudioAnalysisService {
  async analyzeFromUrl(audioUrl: string): Promise<AudioAnalysisResult> {
    // Run multiple analysis methods in parallel for accuracy
    const [auddResult, basicAnalysis, waveformData] = await Promise.allSettled([
      this.analyzeWithAudD(audioUrl),      // Professional service
      this.basicAudioAnalysis(audioUrl),   // FFmpeg-based
      this.generateWaveform(audioUrl)      // Visualization data
    ]);

    // Combine results with confidence weighting
    return this.combineResults(auddResult, basicAnalysis, waveformData);
  }
}
```

### **Provider Hierarchy**
1. **AudD.io** (Primary) - Professional music recognition service
2. **FFmpeg Analysis** (Fallback) - Open-source audio processing
3. **Custom Algorithms** (Backup) - Heuristic-based analysis

## 🔧 Analysis Methods

### **1. BPM Detection**
```typescript
private async detectBPM(audioUrl: string): Promise<BPMResult> {
  // AudD.io professional analysis
  const auddResult = await this.auddAnalysis(audioUrl);
  if (auddResult.tempo) {
    return {
      bpm: Math.round(auddResult.tempo),
      confidence: 0.9,
      method: 'audd'
    };
  }

  // Fallback to FFmpeg analysis
  const ffmpegResult = await this.ffmpegBPMDetection(audioUrl);
  return {
    bpm: ffmpegResult.bpm,
    confidence: ffmpegResult.confidence,
    method: 'ffmpeg'
  };
}

private async ffmpegBPMDetection(audioUrl: string): Promise<BPMResult> {
  return new Promise((resolve) => {
    ffmpeg(audioUrl)
      .audioFilters([
        'lowpass=3000',  // Remove high frequencies
        'highpass=60'    // Remove very low frequencies
      ])
      .on('progress', (progress) => {
        // Real-time BPM estimation from processing data
        const estimatedBPM = this.calculateBPMFromProgress(progress);
        resolve({ bpm: estimatedBPM, confidence: 0.7 });
      });
  });
}
```

### **2. Musical Key Detection**
```typescript
private async detectMusicalKey(audioUrl: string): Promise<KeyResult> {
  // AudD.io provides most accurate key detection
  const auddResult = await this.auddAnalysis(audioUrl);
  if (auddResult.key) {
    return {
      musicalKey: auddResult.key,
      camelotKey: this.convertToCamelot(auddResult.key),
      confidence: 0.85,
      method: 'audd'
    };
  }

  // Fallback to chromagram analysis
  return await this.chromagramKeyDetection(audioUrl);
}

private convertToCamelot(key: string): string {
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
  return camelotMap[key] || 'Unknown';
}
```

### **3. Energy Level Analysis**
```typescript
private calculateEnergyLevel(options: {
  bpm?: number;
  loudness?: number;
  spectralCentroid?: number;
  spectralRolloff?: number;
}): number {
  let energy = 0.5; // Base energy level

  // BPM contribution (30% of energy)
  if (options.bpm) {
    if (options.bpm > 140) energy += 0.3;
    else if (options.bpm > 120) energy += 0.2;
    else if (options.bpm > 100) energy += 0.1;
    else energy -= 0.1;
  }

  // Loudness contribution (40% of energy)
  if (options.loudness !== undefined) {
    // LUFS scale: -23 (quiet) to -16 (loud)
    const loudnessNormalized = Math.max(0, Math.min(1, (options.loudness + 30) / 20));
    energy += (loudnessNormalized - 0.5) * 0.4;
  }

  // Spectral characteristics (30% of energy)
  if (options.spectralCentroid) {
    const spectralEnergy = Math.min(1, options.spectralCentroid / 3000);
    energy += (spectralEnergy - 0.5) * 0.3;
  }

  return Math.max(0, Math.min(1, energy));
}
```

### **4. Waveform Generation**
```typescript
private async generateWaveform(audioUrl: string, peakCount: number = 1000): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const peaks: number[] = [];
    let maxPeak = 0;

    ffmpeg(audioUrl)
      .audioFilters([
        `aresample=8000`,                    // Downsample for performance
        `asetnsamples=n=${Math.floor(8000 / peakCount)}`
      ])
      .format('f64le')                       // Raw audio data
      .on('end', () => {
        // Normalize peaks to 0-1 range
        const normalizedPeaks = peaks.map(peak => peak / maxPeak);
        resolve(normalizedPeaks);
      })
      .on('error', reject)
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
  });
}
```

## 🎵 Camelot Wheel Integration

### **Harmonic Mixing Theory**
The Camelot Wheel system enables DJs to mix harmonically compatible tracks:

```typescript
class CamelotWheel {
  static getCompatibleKeys(camelotKey: string): string[] {
    const compatible = [];
    const [number, letter] = [parseInt(camelotKey), camelotKey.slice(-1)];
    
    // Same key
    compatible.push(camelotKey);
    
    // Adjacent numbers (±1)
    compatible.push(`${number === 12 ? 1 : number + 1}${letter}`);
    compatible.push(`${number === 1 ? 12 : number - 1}${letter}`);
    
    // Relative major/minor
    const oppositeLetter = letter === 'A' ? 'B' : 'A';
    compatible.push(`${number}${oppositeLetter}`);
    
    return compatible;
  }

  static getEnergyDirection(fromKey: string, toKey: string): 'up' | 'down' | 'same' {
    const fromNumber = parseInt(fromKey);
    const toNumber = parseInt(toKey);
    
    if (fromNumber === toNumber) return 'same';
    
    // Clockwise movement increases energy
    const clockwiseDistance = (toNumber - fromNumber + 12) % 12;
    return clockwiseDistance <= 6 ? 'up' : 'down';
  }
}
```

## ⚡ Performance Optimization

### **Caching Strategy**
```typescript
const ANALYSIS_CACHE = {
  // Cache completed analysis for 24 hours
  ttl: 86400,
  keyPattern: 'audio:analysis:{url_hash}',
  
  // Cache partial results for faster completion
  partialTTL: 3600,
  partialPattern: 'audio:partial:{url_hash}:{analysis_type}'
};

async analyzeFromUrl(audioUrl: string): Promise<AudioAnalysisResult> {
  const cacheKey = `audio:analysis:${this.hashUrl(audioUrl)}`;
  
  // Check for complete analysis cache
  const cached = await redis.getJson<AudioAnalysisResult>(cacheKey);
  if (cached) {
    logger.info('Analysis cache hit');
    return cached;
  }

  // Perform analysis and cache result
  const result = await this.performAnalysis(audioUrl);
  await redis.setJson(cacheKey, result, 86400);
  
  return result;
}
```

### **Background Processing**
```typescript
// Queue system for heavy analysis tasks
class AnalysisQueue {
  private queue = new Bull('audio-analysis', {
    redis: { port: 6379, host: 'localhost' }
  });

  async queueAnalysis(trackId: string, audioUrl: string): Promise<void> {
    await this.queue.add('analyze-track', {
      trackId,
      audioUrl,
      priority: 'normal'
    }, {
      attempts: 3,
      backoff: 'exponential',
      delay: 5000
    });
  }

  private async processAnalysis(job: Bull.Job): Promise<void> {
    const { trackId, audioUrl } = job.data;
    
    // Update progress
    job.progress(10);
    
    const analysis = await this.analyzeFromUrl(audioUrl);
    
    job.progress(100);
    
    // Update database with results
    await this.saveAnalysisResults(trackId, analysis);
  }
}
```

## 📊 Quality Assurance

### **Confidence Scoring**
```typescript
interface ConfidenceMetrics {
  overall: number;        // 0.0 - 1.0
  bpm: number;           // BPM detection confidence
  key: number;           // Musical key confidence
  energy: number;        // Energy level confidence
  genre: number;         // Genre classification confidence
}

private calculateConfidence(results: AnalysisResults): ConfidenceMetrics {
  return {
    overall: this.weighedAverage([
      { value: results.bpmConfidence, weight: 0.3 },
      { value: results.keyConfidence, weight: 0.3 },
      { value: results.energyConfidence, weight: 0.2 },
      { value: results.genreConfidence, weight: 0.2 }
    ]),
    bpm: results.bpmConfidence,
    key: results.keyConfidence,
    energy: results.energyConfidence,
    genre: results.genreConfidence
  };
}
```

### **Validation & Correction**
```typescript
private validateResults(analysis: AudioAnalysisResult): AudioAnalysisResult {
  // BPM range validation
  if (analysis.bpm && (analysis.bpm < 60 || analysis.bpm > 200)) {
    logger.warn(`Suspicious BPM detected: ${analysis.bpm}`);
    analysis.bpm = undefined;
    analysis.tempoConfidence = 0;
  }

  // Key validation
  if (analysis.musicalKey && !this.isValidKey(analysis.musicalKey)) {
    logger.warn(`Invalid key detected: ${analysis.musicalKey}`);
    analysis.musicalKey = undefined;
    analysis.camelotKey = undefined;
    analysis.keyConfidence = 0;
  }

  // Energy level bounds
  if (analysis.energyLevel !== undefined) {
    analysis.energyLevel = Math.max(0, Math.min(1, analysis.energyLevel));
  }

  return analysis;
}
```

## 🎯 Use Cases & Applications

### **DJ Applications**
```typescript
// Find harmonically compatible tracks
const compatibleTracks = await musicForge.process({
  request: `Find tracks compatible with ${currentTrack.camelotKey} for smooth transitions`,
  maxTracks: 10,
  analyzeAudio: true
});

// Energy-based playlist sequencing
const playlist = await buildEnergyProgression(tracks, {
  startEnergy: 0.3,
  peakEnergy: 0.9,
  endEnergy: 0.4,
  duration: 120 // minutes
});
```

### **Music Discovery**
```typescript
// Mood-based recommendations
const moodTracks = await musicForge.process({
  request: `Find ${mood} tracks with similar energy to my favorites`,
  filters: {
    energy: { min: userProfile.preferredEnergy - 0.1, max: userProfile.preferredEnergy + 0.1 },
    bpm: { min: userProfile.preferredBPM - 10, max: userProfile.preferredBPM + 10 }
  }
});
```

### **Content Creation**
```typescript
// Scene-appropriate background music
const backgroundMusic = await musicForge.process({
  request: `Find subtle background music for ${sceneType} with energy level ${targetEnergy}`,
  filters: {
    energy: { min: targetEnergy - 0.05, max: targetEnergy + 0.05 },
    mood: [sceneType]
  }
});
```

---

**The Advanced Audio Analysis service transforms raw audio into actionable intelligence, enabling applications to make smart decisions about music selection, mixing, and user experience.**
