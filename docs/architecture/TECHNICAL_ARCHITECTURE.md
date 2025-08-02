# 🏗️ MusicForge API - Technical Architecture

## 🎯 Architecture Overview

MusicForge API is built as a **microservices-oriented monolith** that provides unified music intelligence through a scalable, production-ready architecture. The system is designed for high availability, sub-500ms response times, and enterprise-grade security.

## 🛠️ Technology Stack

### **Backend Infrastructure**
```
┌─────────────────────────────────────────────────────────────┐
│                    MusicForge API Stack                     │
├─────────────────────────────────────────────────────────────┤
│ Runtime:      Node.js 18+ (LTS)                           │
│ Framework:    Express.js 4.x                              │
│ Language:     TypeScript 5.x                              │
│ Database:     PostgreSQL 15+ (Primary)                    │
│ Cache:        Redis 7+ (Performance)                      │
│ Queue:        Bull Queue (Background processing)          │
│ Storage:      AWS S3 + CloudFront CDN                     │
│ Deployment:   Docker + Kubernetes                         │
│ Monitoring:   Winston + Health checks                     │
└─────────────────────────────────────────────────────────────┘
```

### **External Service Integrations**
- **AI/LLM**: OpenAI GPT-4 / Anthropic Claude
- **Music Search**: YouTube Data API v3
- **Audio Processing**: AudD.io, FFmpeg, Essentia
- **Audio Download**: yt-dlp (YouTube audio extraction)
- **CDN**: CloudFront for global audio delivery

## 🏭 System Architecture

### **High-Level Architecture Diagram**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │  Load Balancer  │    │   API Gateway   │
│                 │◄──►│                 │◄──►│                 │
│ DJ Apps, Web    │    │ NGINX/ALB       │    │ Express.js      │
│ Mobile, etc.    │    │                 │    │ Rate Limiting   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                         ┌─────────────────────────────┼─────────────────────────────┐
                         │                             ▼                             │
                         │                  ┌─────────────────┐                      │
                         │                  │   Core API      │                      │
                         │                  │   (Express.js)  │                      │
                         │                  └─────────────────┘                      │
                         │                             │                             │
        ┌────────────────┼─────────────────────────────┼─────────────────────────────┼────────────────┐
        │                │                             │                             │                │
        ▼                ▼                             ▼                             ▼                ▼
┌─────────────┐ ┌─────────────┐              ┌─────────────┐              ┌─────────────┐ ┌─────────────┐
│ LLM Service │ │YouTube Svc  │              │Audio Analysis│              │Auth Service │ │Rate Limiter │
│             │ │             │              │   Service    │              │             │ │             │
│ OpenAI/     │ │ Search &    │              │              │              │ JWT + API   │ │ Redis-based │
│ Claude      │ │ Download    │              │ BPM, Key,    │              │ Keys        │ │ Tier limits │
│             │ │             │              │ Energy, Wave │              │             │ │             │
└─────────────┘ └─────────────┘              └─────────────┘              └─────────────┘ └─────────────┘
        │                │                             │                             │                │
        │                │                             │                             │                │
        ▼                ▼                             ▼                             ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    Data Layer                                                            │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │PostgreSQL   │    │   Redis     │    │ Bull Queue  │    │   AWS S3    │    │External APIs│            │
│  │             │    │             │    │             │    │             │    │             │            │
│  │• Users      │    │• Cache      │    │• Audio      │    │• Audio      │    │• YouTube    │            │
│  │• Tracks     │    │• Sessions   │    │  Analysis   │    │  Files      │    │• OpenAI     │            │
│  │• Requests   │    │• Rate       │    │• Downloads  │    │• Waveforms  │    │• AudD       │            │
│  │• Analytics  │    │  Limits     │    │• Webhooks   │    │             │    │             │            │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘            │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 🔧 Core Components

### **1. API Gateway (Express.js)**
```typescript
// Main application entry point
const app = express();

// Global middleware stack
app.use(helmet());           // Security headers
app.use(cors());             // Cross-origin requests
app.use(compression());      // Response compression
app.use(morgan('combined')); // Request logging
app.use(rateLimitMiddleware); // Rate limiting
app.use(authMiddleware);     // Authentication

// API routes
app.use('/v1/music', musicRoutes);
app.use('/v1/auth', authRoutes);
app.use('/v1/templates', templateRoutes);
```

**Features:**
- Request/response middleware pipeline
- Global error handling and logging
- OpenAPI/Swagger documentation
- Health checks and monitoring endpoints
- Security headers (CORS, CSRF, XSS protection)

### **2. LLM Service (Music Intelligence)**
```typescript
class LLMService {
  async processRequest(userInput: string): Promise<ProcessedQuery> {
    // Convert natural language to structured query
    const systemPrompt = `Convert music requests to structured data...`;
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput }
      ],
      response_format: { type: 'json_object' }
    });
    
    return JSON.parse(response.choices[0].message.content);
  }
}
```

**Capabilities:**
- Natural language understanding for music requests
- Structured query generation (BPM, key, genre, mood filters)
- Confidence scoring for request understanding
- Fallback handling for unclear requests
- Caching of processed queries (1 hour TTL)

### **3. YouTube Service (Search & Download)**
```typescript
class YouTubeService {
  async searchMusic(query: string, options: SearchOptions): Promise<YouTubeSearchResult[]> {
    // YouTube Data API v3 integration
    const response = await this.youtube.search.list({
      part: ['snippet'],
      q: query,
      type: ['video'],
      videoCategoryId: '10', // Music category
      maxResults: options.maxResults
    });
    
    return this.processResults(response.data.items);
  }
  
  async getDownloadUrl(videoId: string): Promise<DownloadInfo> {
    // yt-dlp integration for audio extraction
    const info = await ytdl.getInfo(`https://youtube.com/watch?v=${videoId}`);
    const audioFormat = this.selectBestAudioFormat(info.formats);
    return { url: audioFormat.url, quality: audioFormat.audioBitrate };
  }
}
```

**Features:**
- Intelligent music-focused search
- Video metadata extraction and validation
- High-quality audio URL generation
- Caching of search results and download URLs
- Rate limiting compliance with YouTube API

### **4. Audio Analysis Service**
```typescript
class AudioAnalysisService {
  async analyzeFromUrl(audioUrl: string): Promise<AudioAnalysisResult> {
    // Multi-provider analysis for accuracy
    const [auddResult, basicAnalysis, waveform] = await Promise.allSettled([
      this.analyzeWithAudD(audioUrl),
      this.basicFFmpegAnalysis(audioUrl),
      this.generateWaveform(audioUrl)
    ]);
    
    return this.combineResults(auddResult, basicAnalysis, waveform);
  }
  
  private async analyzeWithAudD(url: string): Promise<AudDResult> {
    // AudD.io API for professional audio analysis
    const response = await axios.post('https://api.audd.io/', {
      url: url,
      api_token: this.auddApiKey,
      return: 'musicbrainz'
    });
    
    return this.parseAudDResponse(response.data);
  }
}
```

**Analysis Capabilities:**
- **BPM Detection**: Accurate tempo analysis with confidence scoring
- **Musical Key Detection**: Full chromatic key identification
- **Camelot Wheel**: Harmonic mixing notation for DJ applications
- **Energy Level**: 0-1 scale for playlist energy management
- **Waveform Generation**: Peak data for audio visualization
- **Genre/Mood Classification**: AI-powered music categorization

### **5. Authentication & Authorization**
```typescript
class AuthService {
  async validateApiKey(keyHeader: string): Promise<User | null> {
    // API key validation with caching
    const keyHash = crypto.createHash('sha256').update(keyHeader).digest('hex');
    
    // Check cache first
    const cached = await redis.getJson<User>(`apikey:${keyHash}`);
    if (cached) return cached;
    
    // Database lookup
    const result = await database.query(`
      SELECT u.*, ak.rate_limit_tier 
      FROM users u 
      JOIN api_keys ak ON u.id = ak.user_id 
      WHERE ak.key_hash = $1 AND ak.is_active = true
    `, [keyHash]);
    
    if (result.length === 0) return null;
    
    // Cache for 5 minutes
    await redis.setJson(`apikey:${keyHash}`, result[0], 300);
    return result[0];
  }
}
```

**Security Features:**
- SHA-256 hashed API key storage
- JWT tokens for web dashboard access
- Rate limiting by user plan tier
- Request logging and analytics
- Session management with Redis

### **6. Rate Limiting System**
```typescript
class RateLimiter {
  async checkLimit(userId: string, plan: string): Promise<RateLimitResult> {
    const limits = RATE_LIMITS[plan];
    const windowStart = Math.floor(Date.now() / limits.windowMs) * limits.windowMs;
    const key = `rate_limit:${userId}:${windowStart}`;
    
    const currentCount = await redis.incr(key);
    
    if (currentCount === 1) {
      await redis.expire(key, Math.ceil(limits.windowMs / 1000));
    }
    
    return {
      allowed: currentCount <= limits.requests,
      remaining: Math.max(0, limits.requests - currentCount),
      resetTime: new Date(windowStart + limits.windowMs)
    };
  }
}
```

**Rate Limiting Strategy:**
- Sliding window algorithm with Redis
- Per-plan rate limits (Free: 100/hour → Enterprise: Unlimited)
- Graceful degradation with 429 responses
- Rate limit headers in responses
- Usage analytics for billing

## 🗄️ Database Design

### **PostgreSQL Schema**
```sql
-- Core entities with optimized indexes
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    plan VARCHAR(50) DEFAULT 'free',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL,
    rate_limit_tier VARCHAR(50) DEFAULT 'free',
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    youtube_id VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    artist VARCHAR(500),
    bpm DECIMAL(6,2),
    musical_key VARCHAR(10),
    camelot_key VARCHAR(5),
    energy_level DECIMAL(3,2),
    waveform_peaks JSONB,
    analysis_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE music_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    original_query TEXT NOT NULL,
    processed_query JSONB,
    result JSONB,
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
CREATE INDEX idx_tracks_youtube_id ON tracks(youtube_id);
CREATE INDEX idx_tracks_bpm ON tracks(bpm) WHERE bpm IS NOT NULL;
CREATE INDEX idx_tracks_musical_key ON tracks(musical_key) WHERE musical_key IS NOT NULL;
CREATE INDEX idx_music_requests_user_id_created_at ON music_requests(user_id, created_at);
```

**Design Principles:**
- UUID primary keys for distributed systems
- JSONB for flexible metadata storage
- Proper indexing for query performance
- Foreign key constraints for data integrity
- Timestamps for audit trails

### **Redis Caching Strategy**
```typescript
// Cache patterns with TTL
const CACHE_PATTERNS = {
  'apikey:{hash}': 300,           // 5 minutes
  'llm:query:{base64}': 3600,     // 1 hour
  'youtube:search:{hash}': 3600,  // 1 hour
  'audio:analysis:{hash}': 86400, // 24 hours
  'rate_limit:{user}:{window}': 'dynamic'
};
```

## 🚀 Deployment Architecture

### **Container Strategy (Docker)**
```dockerfile
# Multi-stage build for optimization
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime
RUN apk add --no-cache ffmpeg python3 py3-pip make g++
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"
CMD ["npm", "start"]
```

### **Kubernetes Deployment**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: musicforge-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: musicforge-api
  template:
    spec:
      containers:
      - name: api
        image: musicforge/api:latest
        ports:
        - containerPort: 3001
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: musicforge-secrets
              key: database-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
```

## 📊 Performance & Scaling

### **Performance Targets**
- **Response Time**: <500ms for 95% of requests
- **Throughput**: 1000+ requests per second
- **Availability**: 99.9% uptime
- **Cache Hit Rate**: >80% for repeated requests

### **Scaling Strategy**
1. **Horizontal Pod Autoscaling**: Based on CPU/memory usage
2. **Database Read Replicas**: For analytics and reporting
3. **CDN Distribution**: Global audio file delivery
4. **Background Job Processing**: Queue-based audio analysis
5. **Redis Clustering**: For high-availability caching

### **Monitoring & Observability**
```typescript
// Comprehensive logging with Winston
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Health check endpoints
app.get('/health', healthController.check);
app.get('/health/ready', healthController.readiness);
app.get('/health/live', healthController.liveness);
```

## 🔒 Security Architecture

### **API Security**
- **Authentication**: API keys with SHA-256 hashing
- **Authorization**: Role-based access control
- **Rate Limiting**: Prevent abuse and ensure fair usage
- **Input Validation**: Joi schema validation on all endpoints
- **CORS**: Configurable cross-origin resource sharing
- **Helmet**: Security headers for XSS, CSRF protection

### **Data Security**
- **Encryption**: TLS 1.3 for all communications
- **Database**: Connection pooling with SSL
- **Secrets Management**: Environment variables and Kubernetes secrets
- **Audit Logging**: All API requests and user actions logged
- **PII Protection**: No personal data stored beyond email

### **Infrastructure Security**
- **Container Scanning**: Regular vulnerability assessments
- **Network Policies**: Kubernetes network segmentation
- **Resource Limits**: Prevent resource exhaustion attacks
- **Backup Strategy**: Automated database backups with encryption

---

**This architecture is designed to scale from startup MVP to enterprise-grade platform, handling millions of requests per day while maintaining sub-500ms response times and 99.9% availability.**
