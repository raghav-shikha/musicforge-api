// Core API Types for MusicForge

export interface User {
  id: string;
  email: string;
  name?: string;
  company?: string;
  plan: 'free' | 'starter' | 'pro' | 'scale' | 'enterprise';
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface ApiKey {
  id: string;
  userId: string;
  keyHash: string;
  name: string;
  lastUsedAt?: Date;
  createdAt: Date;
  isActive: boolean;
  rateLimitTier: string;
}

// Music Request Types
export interface MusicRequest {
  id: string;
  userId?: string;
  apiKeyId?: string;
  originalQuery: string;
  processedQuery?: ProcessedQuery;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: MusicRequestResult;
  errorMessage?: string;
  processingTimeMs?: number;
  createdAt: Date;
  completedAt?: Date;
}

export interface ProcessedQuery {
  intent: 'search' | 'analyze' | 'discover';
  searchTerms: string[];
  filters: {
    bpm?: { min?: number; max?: number };
    key?: string[];
    genre?: string[];
    mood?: string[];
    energy?: { min?: number; max?: number };
    duration?: { min?: number; max?: number };
  };
  maxResults?: number;
  sortBy?: 'relevance' | 'popularity' | 'date' | 'bpm' | 'energy';
}

export interface MusicRequestResult {
  tracks: Track[];
  totalFound: number;
  processingSteps: ProcessingStep[];
  confidence: number;
}

export interface ProcessingStep {
  step: string;
  status: 'completed' | 'failed';
  duration: number;
  details?: any;
}

// Track and Audio Analysis Types
export interface Track {
  id: string;
  youtubeId: string;
  title: string;
  artist?: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  youtubeUrl?: string;
  audioUrl?: string;
  
  // Audio Analysis
  bpm?: number;
  musicalKey?: string;
  camelotKey?: string;
  energyLevel?: number; // 0-1
  loudness?: number; // LUFS
  tempoConfidence?: number;
  keyConfidence?: number;
  
  // Waveform
  waveformPeaks?: number[];
  waveformDuration?: number;
  
  // Metadata
  genre?: string;
  mood?: string;
  tags?: string[];
  
  analysisStatus: 'pending' | 'processing' | 'completed' | 'failed';
  analysisCompletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AudioAnalysisResult {
  bpm?: number;
  musicalKey?: string;
  camelotKey?: string;
  energyLevel?: number;
  loudness?: number;
  tempoConfidence?: number;
  keyConfidence?: number;
  waveformPeaks?: number[];
  genre?: string;
  mood?: string;
}

// YouTube Types
export interface YouTubeSearchResult {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  channelTitle: string;
  duration: string;
  publishedAt: string;
  viewCount?: number;
}

// Template System Types
export interface Template {
  id: string;
  creatorId: string;
  name: string;
  description: string;
  category: string;
  techStack: Record<string, any>;
  configSchema: Record<string, any>;
  deploymentConfig: Record<string, any>;
  priceCents: number;
  isPublic: boolean;
  downloadCount: number;
  rating?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateDeployment {
  id: string;
  userId: string;
  templateId: string;
  deploymentUrl?: string;
  config: Record<string, any>;
  status: 'pending' | 'deploying' | 'deployed' | 'failed';
  createdAt: Date;
}

// API Request/Response Types
export interface ProcessMusicRequest {
  request: string;
  maxTracks?: number;
  analyzeAudio?: boolean;
  downloadQuality?: 'standard' | 'high';
  responseFormat?: 'json' | 'detailed';
}

export interface SearchRequest {
  query: string;
  maxResults?: number;
  type?: 'video' | 'playlist';
  duration?: 'short' | 'medium' | 'long';
  order?: 'relevance' | 'date' | 'rating' | 'viewCount';
}

export interface AnalyzeRequest {
  youtubeUrl?: string;
  audioUrl?: string;
  analysisType?: ('bpm' | 'key' | 'energy' | 'waveform')[];
}

// Webhook Types
export interface Webhook {
  id: string;
  userId: string;
  url: string;
  events: string[];
  secret?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface WebhookEvent {
  type: string;
  data: any;
  timestamp: Date;
}

// Error Types
export interface APIError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}

// Rate Limiting Types
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: Date;
}

// Response Wrappers
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: APIError;
  meta?: {
    requestId: string;
    processingTime: number;
    rateLimit?: RateLimitInfo;
  };
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
