# 🎬 YouTube Integration Service

## Overview

The YouTube Integration service provides comprehensive music search, metadata extraction, and high-quality audio access through official YouTube Data API v3 and optimized audio extraction. This service forms the content foundation of MusicForge API, connecting AI-powered music understanding to actual playable content.

## 🎯 Core Capabilities

### **Intelligent Music Search**
```typescript
interface YouTubeSearchOptions {
  query: string;
  maxResults: number;
  duration?: 'short' | 'medium' | 'long';  // <4min, 4-20min, >20min
  order?: 'relevance' | 'date' | 'rating' | 'viewCount';
  safeSearch?: 'moderate' | 'strict' | 'none';
  regionCode?: string;  // For localized results
}

const results = await youtubeService.searchMusic("deep house sunset", {
  maxResults: 10,
  duration: 'medium',
  order: 'relevance'
});
```

### **Search Result Data**
```json
{
  "id": "dQw4w9WgXcQ",
  "title": "Deep House Sunset Mix 2024",
  "description": "1 hour of deep house music perfect for sunset vibes...",
  "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "channelTitle": "Sunset Sounds",
  "duration": "1:02:35",
  "publishedAt": "2024-01-15T10:30:00Z",
  "viewCount": 125000,
  "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

## 🔧 Technical Implementation

### **YouTube Service Architecture**
```typescript
class YouTubeService {
  private youtube: youtube_v3.Youtube;
  
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

  async searchMusic(
    query: string,
    maxResults: number = 10,
    options: SearchOptions = {}
  ): Promise<YouTubeSearchResult[]> {
    // Check cache first
    const cacheKey = this.generateCacheKey(query, maxResults, options);
    const cached = await redis.getJson<YouTubeSearchResult[]>(cacheKey);
    if (cached) {
      logger.info('YouTube search cache hit');
      return cached;
    }

    // Execute search with optimized parameters
    const searchParams = this.buildSearchParams(query, maxResults, options);
    const response = await this.youtube.search.list(searchParams);

    if (!response.data.items) return [];

    // Enrich with video details
    const enrichedResults = await this.enrichWithDetails(response.data.items);
    
    // Cache for 1 hour
    await redis.setJson(cacheKey, enrichedResults, 3600);
    
    return enrichedResults;
  }
}
```

### **Music-Optimized Search Parameters**
```typescript
private buildSearchParams(query: string, maxResults: number, options: SearchOptions) {
  const params = {
    part: ['snippet'],
    q: this.optimizeSearchQuery(query),
    type: ['video'],
    maxResults: Math.min(maxResults, 50), // YouTube API limit
    order: options.order || 'relevance',
    videoCategoryId: '10', // Music category only
    regionCode: options.regionCode || 'US',
    relevanceLanguage: 'en',
    safeSearch: options.safeSearch || 'moderate'
  };

  // Add duration filter if specified
  if (options.duration) {
    params.videoDuration = options.duration;
  }

  // Add upload date filter for fresh content
  if (options.publishedAfter) {
    params.publishedAfter = options.publishedAfter.toISOString();
  }

  return params;
}

private optimizeSearchQuery(query: string): string {
  // Enhance search queries for better music results
  const musicKeywords = ['music', 'mix', 'track', 'song', 'beat'];
  const hasMusic = musicKeywords.some(keyword => 
    query.toLowerCase().includes(keyword)
  );
  
  if (!hasMusic && query.length < 50) {
    return `${query} music`;
  }
  
  return query;
}
```

## 📊 Metadata Extraction & Enrichment

### **Video Details Enrichment**
```typescript
private async enrichWithDetails(items: youtube_v3.Schema$SearchResult[]): Promise<YouTubeSearchResult[]> {
  const videoIds = items.map(item => item.id?.videoId).filter(Boolean);
  
  if (videoIds.length === 0) return [];

  // Batch fetch video details for efficiency
  const detailsResponse = await this.youtube.videos.list({
    part: ['contentDetails', 'statistics', 'snippet'],
    id: videoIds
  });

  return items.map(item => {
    const videoId = item.id?.videoId;
    const details = detailsResponse.data.items?.find(d => d.id === videoId);
    
    return {
      id: videoId || '',
      title: this.cleanTitle(item.snippet?.title || ''),
      description: item.snippet?.description || '',
      thumbnailUrl: this.getBestThumbnail(item.snippet?.thumbnails),
      channelTitle: item.snippet?.channelTitle || '',
      duration: this.parseDuration(details?.contentDetails?.duration || ''),
      publishedAt: item.snippet?.publishedAt || '',
      viewCount: parseInt(details?.statistics?.viewCount || '0', 10),
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`
    };
  });
}
```

### **Title & Artist Extraction**
```typescript
async getVideoMetadata(videoId: string): Promise<VideoMetadata | null> {
  try {
    const response = await this.youtube.videos.list({
      part: ['snippet', 'contentDetails'],
      id: [videoId]
    });

    const video = response.data.items?.[0];
    if (!video) return null;

    const title = video.snippet?.title || '';
    const description = video.snippet?.description || '';
    
    // Extract artist and track from title using common patterns
    const metadata = this.parseArtistAndTitle(title);
    
    return {
      title: metadata.title,
      artist: metadata.artist || video.snippet?.channelTitle || '',
      duration: this.parseDurationToSeconds(video.contentDetails?.duration || ''),
      thumbnailUrl: this.getBestThumbnail(video.snippet?.thumbnails),
      description: description,
      channelTitle: video.snippet?.channelTitle || ''
    };
  } catch (error) {
    logger.error('Error getting video metadata:', error);
    return null;
  }
}

private parseArtistAndTitle(title: string): { artist?: string; title: string } {
  // Common patterns for "Artist - Title" format
  const patterns = [
    /^([^-]+)\s*-\s*(.+)$/,           // "Artist - Title"
    /^([^|]+)\s*\|\s*(.+)$/,         // "Artist | Title"
    /^([^•]+)\s*•\s*(.+)$/,          // "Artist • Title"
    /^(.+?)\s*["""](.+?)["""].*$/,   // "Artist "Title""
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) {
      return {
        artist: match[1].trim(),
        title: match[2].trim()
      };
    }
  }

  // No pattern matched, return full title
  return { title: title.trim() };
}
```

## 🎵 High-Quality Audio Access

### **Audio Download URL Generation**
```typescript
async getDownloadUrl(videoId: string, quality: 'standard' | 'high' = 'standard'): Promise<DownloadInfo> {
  const cacheKey = `youtube:download:${videoId}:${quality}`;
  
  // Check cache (URLs expire after 30 minutes)
  const cached = await redis.getJson<DownloadInfo>(cacheKey);
  if (cached) {
    logger.info('Download URL cache hit');
    return cached;
  }

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Get video info using yt-dlp integration
    const info = await ytdl.getInfo(videoUrl);
    
    // Filter audio-only formats
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    
    if (audioFormats.length === 0) {
      throw new Error('No audio formats available');
    }

    // Select best format based on quality preference
    const selectedFormat = this.selectAudioFormat(audioFormats, quality);
    
    const result: DownloadInfo = {
      url: selectedFormat.url,
      format: selectedFormat.container || 'webm',
      quality: selectedFormat.audioBitrate?.toString() || 'unknown',
      size: selectedFormat.contentLength,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    };

    // Cache for 30 minutes (YouTube URLs expire)
    await redis.setJson(cacheKey, result, 1800);
    
    logger.info(`Generated download URL for ${videoId}`, {
      quality: result.quality,
      format: result.format
    });
    
    return result;

  } catch (error) {
    logger.error('Error generating download URL:', error);
    throw new Error('Failed to generate download URL');
  }
}

private selectAudioFormat(formats: any[], quality: 'standard' | 'high'): any {
  if (quality === 'high') {
    // Prefer highest bitrate audio
    return formats.reduce((best, format) => {
      const bestBitrate = parseInt(best.audioBitrate?.toString() || '0', 10);
      const formatBitrate = parseInt(format.audioBitrate?.toString() || '0', 10);
      return formatBitrate > bestBitrate ? format : best;
    });
  } else {
    // Standard quality: prefer 128kbps+ or best available
    const preferred = formats.find(format => 
      format.audioBitrate && format.audioBitrate >= 128
    );
    return preferred || formats[0];
  }
}
```

### **URL Validation & Security**
```typescript
validateAndExtractId(url: string): string | null {
  const patterns = [
    // Standard YouTube URLs
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    // Direct video ID
    /^[a-zA-Z0-9_-]{11}$/,
    // YouTube Music URLs
    /music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    // YouTube playlist items
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})&list=/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const videoId = match[1] || match[0];
      
      // Validate video ID format
      if (this.isValidVideoId(videoId)) {
        return videoId;
      }
    }
  }

  return null;
}

private isValidVideoId(id: string): boolean {
  // YouTube video IDs are 11 characters: letters, numbers, hyphens, underscores
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}
```

## ⚡ Performance & Optimization

### **Caching Strategy**
```typescript
const YOUTUBE_CACHE_CONFIG = {
  search: {
    ttl: 3600,        // 1 hour for search results
    maxSize: 10000,
    keyPattern: 'youtube:search:{query_hash}'
  },
  downloadUrls: {
    ttl: 1800,        // 30 minutes (URLs expire)
    maxSize: 5000,
    keyPattern: 'youtube:download:{video_id}:{quality}'
  },
  metadata: {
    ttl: 86400,       // 24 hours for video metadata
    maxSize: 50000,
    keyPattern: 'youtube:meta:{video_id}'
  }
};
```

### **Rate Limiting Compliance**
```typescript
class YouTubeRateLimiter {
  private requestQueue: Queue;
  private quotaUsed: number = 0;
  private dailyQuota: number = 10000; // YouTube API quota

  async executeRequest<T>(request: () => Promise<T>): Promise<T> {
    // Check quota
    if (this.quotaUsed >= this.dailyQuota * 0.9) {
      throw new Error('YouTube API quota nearly exhausted');
    }

    // Add to queue with rate limiting
    return new Promise((resolve, reject) => {
      this.requestQueue.add(async () => {
        try {
          const result = await request();
          this.quotaUsed += this.calculateQuotaCost(request);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private calculateQuotaCost(request: any): number {
    // Different operations have different quota costs
    const costs = {
      'search.list': 100,
      'videos.list': 1,
      'channels.list': 1
    };
    
    return costs[request.method] || 1;
  }
}
```

### **Batch Processing**
```typescript
async batchGetVideoDetails(videoIds: string[]): Promise<VideoMetadata[]> {
  // Process in batches of 50 (YouTube API limit)
  const batches = this.chunkArray(videoIds, 50);
  const results: VideoMetadata[] = [];

  for (const batch of batches) {
    const response = await this.youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: batch
    });

    const batchResults = response.data.items?.map(item => 
      this.parseVideoMetadata(item)
    ) || [];
    
    results.push(...batchResults);
  }

  return results;
}
```

## 🛡️ Content Quality & Safety

### **Content Filtering**
```typescript
private async filterSearchResults(results: YouTubeSearchResult[]): Promise<YouTubeSearchResult[]> {
  return results.filter(result => {
    // Filter out non-music content
    if (this.isLikelyNonMusic(result.title, result.description)) {
      return false;
    }

    // Filter out very short videos (likely ads/intros)
    if (this.parseDurationToSeconds(result.duration) < 60) {
      return false;
    }

    // Filter out very long videos (likely podcasts/talks)
    if (this.parseDurationToSeconds(result.duration) > 3600) {
      return false;
    }

    return true;
  });
}

private isLikelyNonMusic(title: string, description: string): boolean {
  const nonMusicIndicators = [
    'tutorial', 'how to', 'review', 'unboxing', 'gameplay',
    'interview', 'podcast', 'news', 'vlog', 'reaction'
  ];

  const text = `${title} ${description}`.toLowerCase();
  return nonMusicIndicators.some(indicator => text.includes(indicator));
}
```

### **Geographic Optimization**
```typescript
async searchWithRegionFallback(
  query: string,
  options: SearchOptions
): Promise<YouTubeSearchResult[]> {
  const regions = ['US', 'GB', 'DE', 'CA', 'AU']; // Preference order
  
  for (const region of regions) {
    try {
      const results = await this.searchMusic(query, {
        ...options,
        regionCode: region
      });
      
      if (results.length > 0) {
        logger.info(`Found ${results.length} results in region ${region}`);
        return results;
      }
    } catch (error) {
      logger.warn(`Search failed for region ${region}:`, error);
    }
  }
  
  return []; // No results found in any region
}
```

## 📈 Analytics & Monitoring

### **Usage Tracking**
```typescript
interface YouTubeMetrics {
  searchRequests: number;
  downloadRequests: number;
  cacheHitRate: number;
  averageResponseTime: number;
  quotaUsage: number;
  errorRate: number;
}

class YouTubeAnalytics {
  async trackUsage(operation: string, duration: number, cached: boolean): Promise<void> {
    await redis.incr(`youtube:${operation}:count`);
    await redis.incrByFloat(`youtube:${operation}:duration`, duration);
    
    if (cached) {
      await redis.incr(`youtube:${operation}:cache_hits`);
    }
  }

  async getMetrics(): Promise<YouTubeMetrics> {
    // Aggregate metrics from Redis counters
    return {
      searchRequests: await redis.get('youtube:search:count') || 0,
      downloadRequests: await redis.get('youtube:download:count') || 0,
      cacheHitRate: await this.calculateCacheHitRate(),
      averageResponseTime: await this.calculateAverageResponseTime(),
      quotaUsage: this.quotaUsed,
      errorRate: await this.calculateErrorRate()
    };
  }
}
```

## 🎯 Use Cases & Integration

### **DJ Application Integration**
```typescript
// Find compatible tracks for mixing
const searchResults = await youtubeService.searchMusic(
  `${currentTrack.genre} ${currentTrack.key} ${currentTrack.bpm}bpm`,
  { maxResults: 20, duration: 'medium' }
);

// Filter by harmonic compatibility
const compatibleTracks = searchResults.filter(track => 
  track.analysis?.camelotKey && 
  isHarmonicallyCompatible(currentTrack.camelotKey, track.analysis.camelotKey)
);
```

### **Music Discovery Platform**
```typescript
// Trending music discovery
const trendingResults = await youtubeService.searchMusic(
  `${genre} 2024 new releases`,
  { 
    maxResults: 50,
    order: 'viewCount',
    publishedAfter: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
  }
);
```

### **Content Creation Tools**
```typescript
// Background music for specific mood/duration
const backgroundMusic = await youtubeService.searchMusic(
  `${mood} instrumental background music`,
  {
    maxResults: 20,
    duration: targetDuration > 600 ? 'long' : 'medium'
  }
);
```

---

**The YouTube Integration service provides the content foundation for MusicForge API, delivering high-quality music search and access while maintaining compliance with YouTube's terms of service and rate limits.**
