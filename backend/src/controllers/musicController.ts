import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { database } from '@/utils/database';
import { logger } from '@/utils/logger';
import { llmService } from '@/services/llm';
import { youtubeService } from '@/services/youtube';
import { audioAnalysisService } from '@/services/audioAnalysis';
import { 
  APIResponse, 
  ProcessMusicRequest, 
  MusicRequestResult, 
  Track, 
  ProcessingStep,
  SearchRequest,
  AnalyzeRequest 
} from '@/types';

/**
 * Main endpoint: Process natural language music requests
 * POST /v1/music/process
 */
export async function processMusic(
  req: Request<{}, APIResponse<MusicRequestResult>, ProcessMusicRequest>,
  res: Response<APIResponse<MusicRequestResult>>
): Promise<void> {
  const startTime = Date.now();
  const requestId = uuidv4();

  try {
    const { request: userQuery, maxTracks = 10, analyzeAudio = true, downloadQuality = 'standard' } = req.body;

    if (!userQuery || typeof userQuery !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request field is required and must be a string',
          timestamp: new Date()
        }
      });
      return;
    }

    logger.info(`Processing music request: "${userQuery}"`, { requestId, userId: req.user?.id });

    const processingSteps: ProcessingStep[] = [];
    const tracks: Track[] = [];

    // Step 1: Process with LLM
    const stepStart = Date.now();
    const processedQuery = await llmService.processRequest(userQuery);
    processingSteps.push({
      step: 'llm_processing',
      status: 'completed',
      duration: Date.now() - stepStart,
      details: { intent: processedQuery.intent, searchTerms: processedQuery.searchTerms.length }
    });

    // Step 2: Search YouTube
    const searchStart = Date.now();
    const searchPromises = processedQuery.searchTerms.slice(0, 3).map(term => 
      youtubeService.searchMusic(term, Math.ceil(maxTracks / processedQuery.searchTerms.length))
    );
    
    const searchResults = await Promise.all(searchPromises);
    const allResults = searchResults.flat();
    
    // Remove duplicates and limit results
    const uniqueResults = allResults
      .filter((result, index, arr) => arr.findIndex(r => r.id === result.id) === index)
      .slice(0, maxTracks);

    processingSteps.push({
      step: 'youtube_search',
      status: 'completed',
      duration: Date.now() - searchStart,
      details: { 
        searchTerms: processedQuery.searchTerms.length,
        totalResults: allResults.length,
        uniqueResults: uniqueResults.length 
      }
    });

    // Step 3: Convert to Track objects and optionally analyze
    const trackProcessingStart = Date.now();
    
    for (const ytResult of uniqueResults) {
      try {
        // Get additional metadata
        const metadata = await youtubeService.getVideoMetadata(ytResult.id);
        
        // Create basic track object
        const track: Track = {
          id: uuidv4(),
          youtubeId: ytResult.id,
          title: metadata?.title || ytResult.title,
          artist: metadata?.artist,
          durationSeconds: metadata?.duration,
          thumbnailUrl: ytResult.thumbnailUrl,
          youtubeUrl: `https://www.youtube.com/watch?v=${ytResult.id}`,
          audioUrl: undefined, // Will be generated on demand
          analysisStatus: 'pending',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Add LLM-extracted metadata
        const llmMetadata = await llmService.extractMetadata(track.title, ytResult.description);
        if (llmMetadata.genre) track.genre = llmMetadata.genre;
        if (llmMetadata.mood) track.mood = llmMetadata.mood;
        if (llmMetadata.bpm) track.bpm = llmMetadata.bpm;
        if (llmMetadata.key) track.musicalKey = llmMetadata.key;

        // Perform audio analysis if requested
        if (analyzeAudio) {
          try {
            const downloadInfo = await youtubeService.getDownloadUrl(ytResult.id, downloadQuality);
            track.audioUrl = downloadInfo.url;
            
            const analysis = await audioAnalysisService.analyzeFromUrl(downloadInfo.url);
            
            // Apply analysis results
            if (analysis.bpm) track.bpm = analysis.bpm;
            if (analysis.musicalKey) track.musicalKey = analysis.musicalKey;
            if (analysis.camelotKey) track.camelotKey = analysis.camelotKey;
            if (analysis.energyLevel !== undefined) track.energyLevel = analysis.energyLevel;
            if (analysis.loudness !== undefined) track.loudness = analysis.loudness;
            if (analysis.waveformPeaks) track.waveformPeaks = analysis.waveformPeaks;
            if (analysis.genre && !track.genre) track.genre = analysis.genre;
            if (analysis.mood && !track.mood) track.mood = analysis.mood;
            
            track.tempoConfidence = analysis.tempoConfidence;
            track.keyConfidence = analysis.keyConfidence;
            track.analysisStatus = 'completed';
            track.analysisCompletedAt = new Date();
            
          } catch (analysisError) {
            logger.error(`Analysis failed for track ${track.id}:`, analysisError);
            track.analysisStatus = 'failed';
          }
        }

        tracks.push(track);

        // Save track to database
        await saveTrackToDatabase(track);

      } catch (trackError) {
        logger.error(`Failed to process track ${ytResult.id}:`, trackError);
        // Continue with other tracks
      }
    }

    processingSteps.push({
      step: 'track_processing',
      status: 'completed',
      duration: Date.now() - trackProcessingStart,
      details: { tracksProcessed: tracks.length, analyzeAudio }
    });

    // Log the request to database
    await logMusicRequest(req, userQuery, processedQuery, tracks, processingSteps, requestId);

    const totalTime = Date.now() - startTime;
    logger.info(`Music request completed`, { 
      requestId, 
      totalTime, 
      tracksFound: tracks.length,
      userId: req.user?.id 
    });

    // Calculate confidence score
    const confidence = calculateConfidenceScore(processedQuery, tracks);

    const result: MusicRequestResult = {
      tracks,
      totalFound: tracks.length,
      processingSteps,
      confidence
    };

    res.json({
      success: true,
      data: result,
      meta: {
        requestId,
        processingTime: totalTime,
        rateLimit: res.locals.rateLimitInfo
      }
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.error('Music processing error:', error);

    res.status(500).json({
      success: false,
      error: {
        code: 'PROCESSING_ERROR',
        message: 'Failed to process music request',
        timestamp: new Date()
      },
      meta: {
        requestId,
        processingTime: totalTime,
        rateLimit: res.locals.rateLimitInfo
      }
    });
  }
}

/**
 * Search YouTube only
 * GET /v1/music/search
 */
export async function searchMusic(
  req: Request<{}, APIResponse, {}, SearchRequest>,
  res: Response<APIResponse>
): Promise<void> {
  try {
    const { query, maxResults = 10, type = 'video', duration, order = 'relevance' } = req.query;

    if (!query) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_QUERY',
          message: 'Query parameter is required',
          timestamp: new Date()
        }
      });
      return;
    }

    const results = await youtubeService.searchMusic(
      query as string, 
      Number(maxResults),
      { duration: duration as any, order: order as any }
    );

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SEARCH_ERROR',
        message: 'Failed to search music',
        timestamp: new Date()
      }
    });
  }
}

/**
 * Analyze specific audio
 * POST /v1/music/analyze
 */
export async function analyzeAudio(
  req: Request<{}, APIResponse, AnalyzeRequest>,
  res: Response<APIResponse>
): Promise<void> {
  try {
    const { youtubeUrl, audioUrl, analysisType = ['bpm', 'key', 'energy', 'waveform'] } = req.body;

    let analysisUrl = audioUrl;

    if (youtubeUrl && !audioUrl) {
      const videoId = youtubeService.validateAndExtractId(youtubeUrl);
      if (!videoId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_YOUTUBE_URL',
            message: 'Invalid YouTube URL',
            timestamp: new Date()
          }
        });
        return;
      }

      const downloadInfo = await youtubeService.getDownloadUrl(videoId);
      analysisUrl = downloadInfo.url;
    }

    if (!analysisUrl) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_AUDIO_SOURCE',
          message: 'Either youtubeUrl or audioUrl is required',
          timestamp: new Date()
        }
      });
      return;
    }

    const analysis = await audioAnalysisService.analyzeFromUrl(analysisUrl);

    // Filter results based on requested analysis types
    const filteredAnalysis: any = {};
    if (analysisType.includes('bpm') && analysis.bpm) filteredAnalysis.bpm = analysis.bpm;
    if (analysisType.includes('key') && analysis.musicalKey) {
      filteredAnalysis.musicalKey = analysis.musicalKey;
      filteredAnalysis.camelotKey = analysis.camelotKey;
    }
    if (analysisType.includes('energy') && analysis.energyLevel !== undefined) {
      filteredAnalysis.energyLevel = analysis.energyLevel;
    }
    if (analysisType.includes('waveform') && analysis.waveformPeaks) {
      filteredAnalysis.waveformPeaks = analysis.waveformPeaks;
    }

    res.json({
      success: true,
      data: filteredAnalysis
    });

  } catch (error) {
    logger.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYSIS_ERROR',
        message: 'Failed to analyze audio',
        timestamp: new Date()
      }
    });
  }
}

/**
 * Save track to database
 */
async function saveTrackToDatabase(track: Track): Promise<void> {
  try {
    await database.query(`
      INSERT INTO tracks (
        id, youtube_id, title, artist, duration_seconds, thumbnail_url, youtube_url, audio_url,
        bpm, musical_key, camelot_key, energy_level, loudness, tempo_confidence, key_confidence,
        waveform_peaks, genre, mood, tags, analysis_status, analysis_completed_at,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
      ) ON CONFLICT (youtube_id) DO UPDATE SET
        title = EXCLUDED.title,
        artist = EXCLUDED.artist,
        bpm = COALESCE(EXCLUDED.bpm, tracks.bpm),
        musical_key = COALESCE(EXCLUDED.musical_key, tracks.musical_key),
        analysis_status = EXCLUDED.analysis_status,
        updated_at = CURRENT_TIMESTAMP
    `, [
      track.id, track.youtubeId, track.title, track.artist, track.durationSeconds,
      track.thumbnailUrl, track.youtubeUrl, track.audioUrl, track.bpm, track.musicalKey,
      track.camelotKey, track.energyLevel, track.loudness, track.tempoConfidence,
      track.keyConfidence, JSON.stringify(track.waveformPeaks), track.genre, track.mood,
      track.tags || [], track.analysisStatus, track.analysisCompletedAt,
      track.createdAt, track.updatedAt
    ]);
  } catch (error) {
    logger.error('Failed to save track to database:', error);
    // Don't throw - this shouldn't break the main request
  }
}

/**
 * Log music request to database
 */
async function logMusicRequest(
  req: Request,
  originalQuery: string,
  processedQuery: any,
  tracks: Track[],
  processingSteps: ProcessingStep[],
  requestId: string
): Promise<void> {
  try {
    await database.query(`
      INSERT INTO music_requests (
        id, user_id, api_key_id, original_query, processed_query, status, result,
        processing_time_ms, created_at, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      requestId,
      req.user?.id,
      req.apiKey?.id,
      originalQuery,
      JSON.stringify(processedQuery),
      'completed',
      JSON.stringify({ tracks: tracks.length, processingSteps }),
      processingSteps.reduce((sum, step) => sum + step.duration, 0),
      new Date(),
      new Date()
    ]);
  } catch (error) {
    logger.error('Failed to log music request:', error);
  }
}

/**
 * Calculate confidence score for the results
 */
function calculateConfidenceScore(processedQuery: any, tracks: Track[]): number {
  if (tracks.length === 0) return 0;

  let score = 0.5; // Base score

  // Boost for having results
  score += Math.min(tracks.length / 10, 0.3);

  // Boost for analyzed tracks
  const analyzedTracks = tracks.filter(t => t.analysisStatus === 'completed');
  if (analyzedTracks.length > 0) {
    score += (analyzedTracks.length / tracks.length) * 0.2;
  }

  // Boost for matching BPM filters
  if (processedQuery.filters?.bpm && analyzedTracks.length > 0) {
    const matchingBPM = analyzedTracks.filter(t => {
      if (!t.bpm) return false;
      const min = processedQuery.filters.bpm.min || 0;
      const max = processedQuery.filters.bpm.max || 200;
      return t.bpm >= min && t.bpm <= max;
    });
    if (matchingBPM.length > 0) {
      score += (matchingBPM.length / analyzedTracks.length) * 0.2;
    }
  }

  return Math.min(score, 1.0);
}
