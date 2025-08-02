import { google } from 'googleapis';
import ytdl from 'ytdl-core';
import axios from 'axios';
import { logger } from '@/utils/logger';
import { redis } from '@/utils/redis';
import { YouTubeSearchResult } from '@/types';

class YouTubeService {
  private youtube;

  constructor() {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      throw new Error('YOUTUBE_API_KEY environment variable is required');
    }

    this.youtube = google.youtube({
      version: 'v3',
      auth: apiKey
    });
  }

  /**
   * Search YouTube for music videos
   */
  async searchMusic(
    query: string,
    maxResults: number = 10,
    options: {
      duration?: 'short' | 'medium' | 'long';
      order?: 'relevance' | 'date' | 'rating' | 'viewCount';
    } = {}
  ): Promise<YouTubeSearchResult[]> {
    const cacheKey = `youtube:search:${Buffer.from(`${query}:${maxResults}:${JSON.stringify(options)}`).toString('base64')}`;
    
    // Check cache first (cache for 1 hour)
    const cached = await redis.getJson<YouTubeSearchResult[]>(cacheKey);
    if (cached) {
      logger.info('YouTube search cache hit');
      return cached;
    }

    try {
      const searchParams = {
        part: ['snippet'],
        q: query,
        type: ['video'],
        maxResults: maxResults,
        order: options.order || 'relevance',
        videoCategoryId: '10', // Music category
        regionCode: 'US',
        relevanceLanguage: 'en'
      };

      // Add duration filter if specified
      if (options.duration) {
        (searchParams as any).videoDuration = options.duration;
      }

      const response = await this.youtube.search.list(searchParams);

      if (!response.data.items) {
        return [];
      }

      // Get video details for duration and view count
      const videoIds = response.data.items.map(item => item.id?.videoId).filter(Boolean);
      const videoDetails = await this.getVideoDetails(videoIds as string[]);

      const results: YouTubeSearchResult[] = response.data.items.map(item => {
        const videoId = item.id?.videoId;
        const details = videoDetails.find(d => d.id === videoId);
        
        return {
          id: videoId || '',
          title: item.snippet?.title || '',
          description: item.snippet?.description || '',
          thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || '',
          channelTitle: item.snippet?.channelTitle || '',
          duration: details?.duration || '',
          publishedAt: item.snippet?.publishedAt || '',
          viewCount: details?.viewCount
        };
      }).filter(result => result.id);

      // Cache for 1 hour
      await redis.setJson(cacheKey, results, 3600);

      logger.info(`YouTube search completed: ${results.length} results for "${query}"`);
      
      return results;

    } catch (error) {
      logger.error('YouTube search error:', error);
      throw new Error('Failed to search YouTube');
    }
  }

  /**
   * Get detailed video information
   */
  private async getVideoDetails(videoIds: string[]): Promise<Array<{
    id: string;
    duration: string;
    viewCount?: number;
  }>> {
    if (videoIds.length === 0) return [];

    try {
      const response = await this.youtube.videos.list({
        part: ['contentDetails', 'statistics'],
        id: videoIds
      });

      return response.data.items?.map(item => ({
        id: item.id || '',
        duration: this.parseDuration(item.contentDetails?.duration || ''),
        viewCount: parseInt(item.statistics?.viewCount || '0', 10)
      })) || [];

    } catch (error) {
      logger.error('Error getting video details:', error);
      return [];
    }
  }

  /**
   * Parse ISO 8601 duration to readable format
   */
  private parseDuration(isoDuration: string): string {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '';

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Get download URL for YouTube video
   */
  async getDownloadUrl(videoId: string, quality: 'standard' | 'high' = 'standard'): Promise<{
    url: string;
    format: string;
    quality: string;
  }> {
    const cacheKey = `youtube:download:${videoId}:${quality}`;
    
    // Check cache first (cache for 30 minutes)
    const cached = await redis.getJson<any>(cacheKey);
    if (cached) {
      logger.info('YouTube download URL cache hit');
      return cached;
    }

    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      // Get video info
      const info = await ytdl.getInfo(videoUrl);
      
      // Find the best audio format
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      
      let selectedFormat;
      if (quality === 'high') {
        // Get highest quality audio
        selectedFormat = audioFormats.reduce((best, format) => {
          const bestBitrate = parseInt(best.audioBitrate?.toString() || '0', 10);
          const formatBitrate = parseInt(format.audioBitrate?.toString() || '0', 10);
          return formatBitrate > bestBitrate ? format : best;
        });
      } else {
        // Get standard quality (128kbps or similar)
        selectedFormat = audioFormats.find(format => 
          format.audioBitrate && format.audioBitrate >= 128
        ) || audioFormats[0];
      }

      if (!selectedFormat) {
        throw new Error('No suitable audio format found');
      }

      const result = {
        url: selectedFormat.url,
        format: selectedFormat.container || 'webm',
        quality: selectedFormat.audioBitrate?.toString() || 'unknown'
      };

      // Cache for 30 minutes (YouTube URLs expire)
      await redis.setJson(cacheKey, result, 1800);

      logger.info(`Download URL generated for ${videoId}`);
      
      return result;

    } catch (error) {
      logger.error('Error getting download URL:', error);
      throw new Error('Failed to get download URL');
    }
  }

  /**
   * Validate YouTube URL or extract video ID
   */
  validateAndExtractId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^[a-zA-Z0-9_-]{11}$/ // Direct video ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    return null;
  }

  /**
   * Get video metadata
   */
  async getVideoMetadata(videoId: string): Promise<{
    title: string;
    artist: string;
    duration: number;
    thumbnailUrl: string;
    description: string;
  } | null> {
    try {
      const response = await this.youtube.videos.list({
        part: ['snippet', 'contentDetails'],
        id: [videoId]
      });

      const video = response.data.items?.[0];
      if (!video) return null;

      // Parse duration to seconds
      const durationMatch = video.contentDetails?.duration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      const hours = parseInt(durationMatch?.[1] || '0', 10);
      const minutes = parseInt(durationMatch?.[2] || '0', 10);
      const seconds = parseInt(durationMatch?.[3] || '0', 10);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;

      // Extract artist from title (common patterns)
      const title = video.snippet?.title || '';
      const artistMatch = title.match(/^([^-]+)\s*-\s*(.+)/) || title.match(/^(.+?)\s*[|•]\s*(.+)/);
      const artist = artistMatch ? artistMatch[1].trim() : video.snippet?.channelTitle || '';

      return {
        title: artistMatch ? artistMatch[2].trim() : title,
        artist,
        duration: totalSeconds,
        thumbnailUrl: video.snippet?.thumbnails?.high?.url || '',
        description: video.snippet?.description || ''
      };

    } catch (error) {
      logger.error('Error getting video metadata:', error);
      return null;
    }
  }
}

export const youtubeService = new YouTubeService();
