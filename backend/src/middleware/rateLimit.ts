import { Request, Response, NextFunction } from 'express';
import { redis } from '@/utils/redis';
import { logger } from '@/utils/logger';
import { APIResponse, RateLimitInfo } from '@/types';

// Rate limit tiers based on user plans
const RATE_LIMITS: Record<string, { requests: number; windowMs: number }> = {
  free: { requests: 100, windowMs: 3600000 }, // 100 per hour
  starter: { requests: 1000, windowMs: 3600000 }, // 1,000 per hour
  pro: { requests: 10000, windowMs: 3600000 }, // 10,000 per hour
  scale: { requests: 50000, windowMs: 3600000 }, // 50,000 per hour
  enterprise: { requests: 200000, windowMs: 3600000 } // 200,000 per hour
};

export async function rateLimitMiddleware(
  req: Request,
  res: Response<APIResponse>,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || !req.apiKey) {
      // Should not happen if auth middleware is working
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required for rate limiting',
          timestamp: new Date()
        }
      });
      return;
    }

    const userId = req.user.id;
    const plan = req.user.plan;
    const limits = RATE_LIMITS[plan] || RATE_LIMITS.free;

    // Create Redis key for this user's rate limit
    const windowStart = Math.floor(Date.now() / limits.windowMs) * limits.windowMs;
    const key = `rate_limit:${userId}:${windowStart}`;

    // Get current request count
    const currentCount = await redis.get(key);
    const requestCount = currentCount ? parseInt(currentCount, 10) : 0;

    // Calculate rate limit info
    const resetTime = new Date(windowStart + limits.windowMs);
    const rateLimitInfo: RateLimitInfo = {
      limit: limits.requests,
      remaining: Math.max(0, limits.requests - requestCount - 1),
      resetTime
    };

    // Check if limit exceeded
    if (requestCount >= limits.requests) {
      // Log rate limit violation
      logger.warn('Rate limit exceeded', {
        userId,
        plan,
        requestCount,
        limit: limits.requests,
        ip: req.ip,
        endpoint: req.path
      });

      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. You are limited to ${limits.requests} requests per hour on the ${plan} plan.`,
          details: {
            limit: limits.requests,
            resetTime: resetTime.toISOString(),
            upgradeUrl: 'https://musicforge.io/pricing'
          },
          timestamp: new Date()
        },
        meta: {
          requestId: req.headers['x-request-id'] as string || 'unknown',
          processingTime: 0,
          rateLimit: rateLimitInfo
        }
      });
      return;
    }

    // Increment request count
    await redis.incr(key);
    
    // Set expiration on first request in window
    if (requestCount === 0) {
      await redis.expire(key, Math.ceil(limits.windowMs / 1000));
    }

    // Log API usage for analytics
    req.on('finish', () => {
      // Don't await this to avoid blocking the response
      logApiUsage(req, res).catch(error => 
        logger.error('Failed to log API usage:', error)
      );
    });

    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': limits.requests.toString(),
      'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(resetTime.getTime() / 1000).toString(),
      'X-RateLimit-Reset-Time': resetTime.toISOString()
    });

    // Attach rate limit info to response meta
    res.locals.rateLimitInfo = rateLimitInfo;

    next();

  } catch (error) {
    logger.error('Rate limiting error:', error);
    // Don't block requests on rate limiting errors
    next();
  }
}

/**
 * Log API usage for analytics and billing
 */
async function logApiUsage(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.apiKey) return;

  try {
    const usage = {
      user_id: req.user.id,
      api_key_id: req.apiKey.id,
      endpoint: req.path,
      method: req.method,
      status_code: res.statusCode,
      response_time_ms: res.locals.responseTime || 0,
      created_at: new Date()
    };

    // Log to database (async, don't wait)
    const { database } = await import('@/utils/database');
    database.query(`
      INSERT INTO api_usage (user_id, api_key_id, endpoint, method, status_code, response_time_ms, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      usage.user_id,
      usage.api_key_id,
      usage.endpoint,
      usage.method,
      usage.status_code,
      usage.response_time_ms,
      usage.created_at
    ]).catch(error => logger.error('Failed to log API usage to database:', error));

    // Also cache recent usage for quick access
    const usageKey = `usage:recent:${req.user.id}`;
    const recentUsage = await redis.getJson<any[]>(usageKey) || [];
    recentUsage.unshift(usage);
    
    // Keep only last 100 requests
    if (recentUsage.length > 100) {
      recentUsage.splice(100);
    }
    
    await redis.setJson(usageKey, recentUsage, 3600); // Cache for 1 hour

  } catch (error) {
    logger.error('Error logging API usage:', error);
  }
}

/**
 * Get current rate limit status for a user
 */
export async function getRateLimitStatus(userId: string, plan: string): Promise<RateLimitInfo> {
  const limits = RATE_LIMITS[plan] || RATE_LIMITS.free;
  const windowStart = Math.floor(Date.now() / limits.windowMs) * limits.windowMs;
  const key = `rate_limit:${userId}:${windowStart}`;

  const currentCount = await redis.get(key);
  const requestCount = currentCount ? parseInt(currentCount, 10) : 0;

  return {
    limit: limits.requests,
    remaining: Math.max(0, limits.requests - requestCount),
    resetTime: new Date(windowStart + limits.windowMs)
  };
}

/**
 * Reset rate limit for a user (admin function)
 */
export async function resetRateLimit(userId: string): Promise<void> {
  const pattern = `rate_limit:${userId}:*`;
  
  // Get Redis client and scan for keys
  const redisClient = redis.getClient();
  if (!redisClient) {
    throw new Error('Redis not connected');
  }

  const keys = await redisClient.keys(pattern);
  if (keys.length > 0) {
    await redisClient.del(...keys);
    logger.info(`Reset rate limit for user ${userId}`);
  }
}
