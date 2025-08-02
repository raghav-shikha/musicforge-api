# 🛡️ Authentication & Rate Limiting

## Overview

The Authentication & Rate Limiting system provides secure, scalable access control for MusicForge API. Built with enterprise-grade security practices, it supports API key-based authentication with tiered rate limiting based on user subscription plans.

## 🔐 Authentication Architecture

### **Multi-Layer Security Model**
```
┌─────────────────────────────────────────────────────────────┐
│                    Request Flow                              │
├─────────────────────────────────────────────────────────────┤
│ 1. API Key Validation (X-API-Key header)                   │
│ 2. User Authentication & Authorization                      │
│ 3. Rate Limit Check (plan-based)                          │
│ 4. Request Processing                                       │
│ 5. Usage Logging & Analytics                              │
└─────────────────────────────────────────────────────────────┘
```

### **API Key System**
```typescript
interface ApiKey {
  id: string;
  userId: string;
  keyHash: string;          // SHA-256 hashed
  name: string;             // User-friendly name
  rateLimitTier: string;    // 'free', 'starter', 'pro', etc.
  lastUsedAt?: Date;
  createdAt: Date;
  isActive: boolean;
}

// API key format: mf_[32-character-hex-string]
// Example: mf_a1b2c3d4e5f6789012345678901234567890abcd
```

## 🔧 Authentication Implementation

### **API Key Generation & Storage**
```typescript
class AuthService {
  generateApiKey(): string {
    // Generate cryptographically secure random key
    const randomBytes = crypto.randomBytes(32);
    return 'mf_' + randomBytes.toString('hex');
  }

  hashApiKey(apiKey: string): string {
    // SHA-256 hash for secure storage
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  async createApiKey(userId: string, name: string): Promise<{ apiKey: string; id: string }> {
    const apiKey = this.generateApiKey();
    const keyHash = this.hashApiKey(apiKey);
    
    const result = await database.query(`
      INSERT INTO api_keys (id, user_id, key_hash, name, rate_limit_tier, created_at, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      uuidv4(),
      userId,
      keyHash,
      name,
      'free', // Default tier
      new Date(),
      true
    ]);

    return {
      apiKey, // Return plain key only once
      id: result[0].id
    };
  }
}
```

### **Authentication Middleware**
```typescript
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKeyHeader = req.headers['x-api-key'] as string;
    
    if (!apiKeyHeader) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_API_KEY',
          message: 'API key is required. Include it in the X-API-Key header.',
          timestamp: new Date()
        }
      });
    }

    // Validate key format
    if (!apiKeyHeader.startsWith('mf_') || apiKeyHeader.length !== 67) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_API_KEY_FORMAT',
          message: 'API key must be in format: mf_[64-hex-characters]',
          timestamp: new Date()
        }
      });
    }

    // Hash key for lookup
    const keyHash = crypto.createHash('sha256').update(apiKeyHeader).digest('hex');
    
    // Check cache first (5-minute TTL)
    const cacheKey = `apikey:${keyHash}`;
    let userData = await redis.getJson<UserWithApiKey>(cacheKey);
    
    if (!userData) {
      // Database lookup
      const result = await database.query<UserWithApiKey>(`
        SELECT 
          u.id as user_id, u.email, u.name, u.company, u.plan, u.is_active as user_active,
          ak.id as api_key_id, ak.name as key_name, ak.rate_limit_tier, ak.is_active as key_active
        FROM api_keys ak
        JOIN users u ON ak.user_id = u.id
        WHERE ak.key_hash = $1
      `, [keyHash]);

      if (result.length === 0) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid or inactive API key',
            timestamp: new Date()
          }
        });
      }

      userData = result[0];
      
      // Cache for 5 minutes
      await redis.setJson(cacheKey, userData, 300);
    }

    // Check if user and key are active
    if (!userData.user_active || !userData.key_active) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INACTIVE_ACCOUNT',
          message: 'Account or API key is inactive',
          timestamp: new Date()
        }
      });
    }

    // Attach user and API key info to request
    req.user = {
      id: userData.user_id,
      email: userData.email,
      name: userData.name,
      company: userData.company,
      plan: userData.plan as User['plan'],
      isActive: userData.user_active
    };

    req.apiKey = {
      id: userData.api_key_id,
      userId: userData.user_id,
      name: userData.key_name,
      rateLimitTier: userData.rate_limit_tier,
      isActive: userData.key_active
    };

    // Update last used timestamp (async, don't wait)
    database.query(
      'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userData.api_key_id]
    ).catch(error => logger.error('Failed to update last_used_at:', error));

    next();

  } catch (error) {
    logger.error('Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Internal authentication error',
        timestamp: new Date()
      }
    });
  }
}
```

## ⚡ Rate Limiting System

### **Tiered Rate Limits**
```typescript
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  free: {
    requests: 100,
    windowMs: 3600000,    // 1 hour
    burstRequests: 10,    // Burst allowance
    burstWindowMs: 60000  // 1 minute burst window
  },
  starter: {
    requests: 1000,
    windowMs: 3600000,    // 1 hour
    burstRequests: 50,
    burstWindowMs: 60000
  },
  pro: {
    requests: 10000,
    windowMs: 3600000,    // 1 hour
    burstRequests: 200,
    burstWindowMs: 60000
  },
  scale: {
    requests: 50000,
    windowMs: 3600000,    // 1 hour
    burstRequests: 1000,
    burstWindowMs: 60000
  },
  enterprise: {
    requests: 200000,
    windowMs: 3600000,    // 1 hour
    burstRequests: 5000,
    burstWindowMs: 60000
  }
};
```

### **Sliding Window Rate Limiter**
```typescript
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || !req.apiKey) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required for rate limiting',
          timestamp: new Date()
        }
      });
    }

    const userId = req.user.id;
    const plan = req.user.plan;
    const limits = RATE_LIMITS[plan] || RATE_LIMITS.free;

    // Check both main limit and burst limit
    const [mainLimitResult, burstLimitResult] = await Promise.all([
      this.checkRateLimit(userId, limits, 'main'),
      this.checkRateLimit(userId, limits, 'burst')
    ]);

    // If either limit is exceeded, deny request
    if (!mainLimitResult.allowed || !burstLimitResult.allowed) {
      const limitType = !mainLimitResult.allowed ? 'hourly' : 'burst';
      const resetTime = !mainLimitResult.allowed ? mainLimitResult.resetTime : burstLimitResult.resetTime;

      logger.warn('Rate limit exceeded', {
        userId,
        plan,
        limitType,
        endpoint: req.path,
        ip: req.ip
      });

      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `${limitType} rate limit exceeded. Upgrade your plan for higher limits.`,
          details: {
            limitType,
            resetTime: resetTime.toISOString(),
            upgradeUrl: 'https://musicforge.io/pricing'
          },
          timestamp: new Date()
        },
        meta: {
          rateLimit: {
            limit: !mainLimitResult.allowed ? limits.requests : limits.burstRequests,
            remaining: 0,
            resetTime: resetTime
          }
        }
      });
    }

    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': limits.requests.toString(),
      'X-RateLimit-Remaining': mainLimitResult.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(mainLimitResult.resetTime.getTime() / 1000).toString(),
      'X-RateLimit-Burst-Limit': limits.burstRequests.toString(),
      'X-RateLimit-Burst-Remaining': burstLimitResult.remaining.toString()
    });

    // Store rate limit info for response meta
    res.locals.rateLimitInfo = {
      limit: limits.requests,
      remaining: mainLimitResult.remaining,
      resetTime: mainLimitResult.resetTime
    };

    next();

  } catch (error) {
    logger.error('Rate limiting error:', error);
    // Don't block requests on rate limiting errors
    next();
  }
}

private async checkRateLimit(
  userId: string,
  limits: RateLimitConfig,
  type: 'main' | 'burst'
): Promise<RateLimitResult> {
  const windowMs = type === 'main' ? limits.windowMs : limits.burstWindowMs;
  const maxRequests = type === 'main' ? limits.requests : limits.burstRequests;
  
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const key = `rate_limit:${userId}:${type}:${windowStart}`;

  // Increment counter atomically
  const pipeline = redis.getClient().pipeline();
  pipeline.incr(key);
  pipeline.expire(key, Math.ceil(windowMs / 1000));
  
  const results = await pipeline.exec();
  const currentCount = results[0][1] as number;

  return {
    allowed: currentCount <= maxRequests,
    remaining: Math.max(0, maxRequests - currentCount),
    resetTime: new Date(windowStart + windowMs),
    currentCount
  };
}
```

## 📊 Usage Analytics & Monitoring

### **Request Logging**
```typescript
async function logApiUsage(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.apiKey) return;

  const usage: ApiUsageRecord = {
    id: uuidv4(),
    userId: req.user.id,
    apiKeyId: req.apiKey.id,
    endpoint: req.path,
    method: req.method,
    statusCode: res.statusCode,
    responseTimeMs: res.locals.responseTime || 0,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
    createdAt: new Date()
  };

  // Log to database (async, don't block response)
  Promise.all([
    database.query(`
      INSERT INTO api_usage (
        id, user_id, api_key_id, endpoint, method, status_code, 
        response_time_ms, ip_address, user_agent, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      usage.id, usage.userId, usage.apiKeyId, usage.endpoint, usage.method,
      usage.statusCode, usage.responseTimeMs, usage.ipAddress, 
      usage.userAgent, usage.createdAt
    ]),

    // Also cache recent usage for quick access
    this.cacheRecentUsage(req.user.id, usage)
  ]).catch(error => logger.error('Failed to log API usage:', error));
}

private async cacheRecentUsage(userId: string, usage: ApiUsageRecord): Promise<void> {
  const key = `usage:recent:${userId}`;
  const recentUsage = await redis.getJson<ApiUsageRecord[]>(key) || [];
  
  recentUsage.unshift(usage);
  
  // Keep only last 100 requests
  if (recentUsage.length > 100) {
    recentUsage.splice(100);
  }
  
  await redis.setJson(key, recentUsage, 3600); // 1 hour TTL
}
```

### **Real-Time Analytics**
```typescript
class UsageAnalytics {
  async getUsageStats(userId: string, period: 'hour' | 'day' | 'month'): Promise<UsageStats> {
    const timeRanges = {
      hour: { minutes: 60, buckets: 60 },
      day: { minutes: 1440, buckets: 24 },
      month: { minutes: 43200, buckets: 30 }
    };

    const range = timeRanges[period];
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - range.minutes * 60 * 1000);

    const stats = await database.query<UsageStatsRow>(`
      SELECT 
        DATE_TRUNC('${period === 'hour' ? 'minute' : 'hour'}', created_at) as time_bucket,
        COUNT(*) as request_count,
        AVG(response_time_ms) as avg_response_time,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
      FROM api_usage 
      WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
      GROUP BY time_bucket
      ORDER BY time_bucket
    `, [userId, startTime, endTime]);

    return {
      period,
      totalRequests: stats.reduce((sum, row) => sum + row.request_count, 0),
      averageResponseTime: stats.reduce((sum, row) => sum + row.avg_response_time, 0) / stats.length,
      errorRate: stats.reduce((sum, row) => sum + row.error_count, 0) / 
                 stats.reduce((sum, row) => sum + row.request_count, 0),
      timeline: stats.map(row => ({
        timestamp: row.time_bucket,
        requests: row.request_count,
        responseTime: row.avg_response_time,
        errors: row.error_count
      }))
    };
  }

  async getQuotaUsage(userId: string): Promise<QuotaUsage> {
    const user = await database.queryOne<User>('SELECT plan FROM users WHERE id = $1', [userId]);
    const limits = RATE_LIMITS[user?.plan || 'free'];
    
    const currentHour = Math.floor(Date.now() / 3600000) * 3600000;
    const usageKey = `rate_limit:${userId}:main:${currentHour}`;
    
    const currentUsage = await redis.get(usageKey) || '0';
    
    return {
      plan: user?.plan || 'free',
      limit: limits.requests,
      used: parseInt(currentUsage, 10),
      remaining: Math.max(0, limits.requests - parseInt(currentUsage, 10)),
      resetTime: new Date(currentHour + 3600000),
      percentage: (parseInt(currentUsage, 10) / limits.requests) * 100
    };
  }
}
```

## 🔒 Security Features

### **API Key Security**
```typescript
class ApiKeySecurity {
  // API key rotation
  async rotateApiKey(keyId: string, userId: string): Promise<string> {
    const newApiKey = this.generateApiKey();
    const newKeyHash = this.hashApiKey(newApiKey);
    
    await database.transaction(async (client) => {
      // Update the key hash
      await client.query(`
        UPDATE api_keys 
        SET key_hash = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2 AND user_id = $3
      `, [newKeyHash, keyId, userId]);
      
      // Invalidate cache
      await this.invalidateApiKeyCache(keyId);
    });
    
    return newApiKey;
  }

  // Detect suspicious activity
  async detectSuspiciousActivity(userId: string): Promise<SecurityAlert[]> {
    const alerts: SecurityAlert[] = [];
    
    // Check for unusual usage patterns
    const recentUsage = await database.query(`
      SELECT ip_address, COUNT(*) as request_count
      FROM api_usage 
      WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'
      GROUP BY ip_address
      HAVING COUNT(*) > 100
    `, [userId]);
    
    if (recentUsage.length > 0) {
      alerts.push({
        type: 'HIGH_FREQUENCY_REQUESTS',
        severity: 'medium',
        message: 'Unusually high request frequency detected',
        details: recentUsage
      });
    }
    
    return alerts;
  }
}
```

### **Request Validation**
```typescript
import Joi from 'joi';

const apiKeySchema = Joi.string()
  .pattern(/^mf_[a-f0-9]{64}$/)
  .required()
  .messages({
    'string.pattern.base': 'API key must be in format: mf_[64-hex-characters]'
  });

export function validateApiKey(req: Request, res: Response, next: NextFunction): void {
  const { error } = apiKeySchema.validate(req.headers['x-api-key']);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_API_KEY_FORMAT',
        message: error.details[0].message,
        timestamp: new Date()
      }
    });
  }
  
  next();
}
```

## 🎯 Admin Functions

### **Rate Limit Management**
```typescript
class RateLimitAdmin {
  async adjustUserLimits(userId: string, customLimits: Partial<RateLimitConfig>): Promise<void> {
    // Create custom rate limit for specific user
    const key = `rate_limit:custom:${userId}`;
    await redis.setJson(key, customLimits, 86400); // 24 hours
    
    logger.info(`Custom rate limits applied for user ${userId}`, customLimits);
  }

  async resetUserRateLimit(userId: string): Promise<void> {
    // Find and delete all rate limit keys for user
    const pattern = `rate_limit:${userId}:*`;
    const keys = await redis.getClient().keys(pattern);
    
    if (keys.length > 0) {
      await redis.getClient().del(...keys);
      logger.info(`Rate limit reset for user ${userId}`);
    }
  }

  async getRateLimitStatus(userId: string): Promise<RateLimitStatus> {
    const user = await database.queryOne<User>('SELECT plan FROM users WHERE id = $1', [userId]);
    const limits = RATE_LIMITS[user?.plan || 'free'];
    
    const currentHour = Math.floor(Date.now() / 3600000) * 3600000;
    const keys = {
      main: `rate_limit:${userId}:main:${currentHour}`,
      burst: `rate_limit:${userId}:burst:${Math.floor(Date.now() / 60000) * 60000}`
    };
    
    const [mainUsage, burstUsage] = await Promise.all([
      redis.get(keys.main),
      redis.get(keys.burst)
    ]);
    
    return {
      plan: user?.plan || 'free',
      limits,
      usage: {
        main: parseInt(mainUsage || '0', 10),
        burst: parseInt(burstUsage || '0', 10)
      },
      resetTimes: {
        main: new Date(currentHour + 3600000),
        burst: new Date(Math.floor(Date.now() / 60000) * 60000 + 60000)
      }
    };
  }
}
```

---

**The Authentication & Rate Limiting system ensures secure, fair access to MusicForge API while providing the flexibility to scale from free tier to enterprise-grade usage patterns.**
