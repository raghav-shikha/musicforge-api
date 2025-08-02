import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { database } from '@/utils/database';
import { redis } from '@/utils/redis';
import { logger } from '@/utils/logger';
import { APIResponse, ApiKey, User } from '@/types';

// Extend Express Request type to include user and apiKey
declare global {
  namespace Express {
    interface Request {
      user?: User;
      apiKey?: ApiKey;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response<APIResponse>,
  next: NextFunction
): Promise<void> {
  try {
    const apiKeyHeader = req.headers['x-api-key'] as string;
    
    if (!apiKeyHeader) {
      res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_API_KEY',
          message: 'API key is required. Include it in the X-API-Key header.',
          timestamp: new Date()
        }
      });
      return;
    }

    // Check if API key has the correct format
    if (!apiKeyHeader.startsWith('mf_')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_API_KEY_FORMAT',
          message: 'API key must start with "mf_"',
          timestamp: new Date()
        }
      });
      return;
    }

    // Hash the API key for lookup
    const keyHash = crypto.createHash('sha256').update(apiKeyHeader).digest('hex');
    
    // Check cache first
    const cacheKey = `apikey:${keyHash}`;
    let apiKeyData = await redis.getJson<ApiKey & { user: User }>(cacheKey);
    
    if (!apiKeyData) {
      // Query database
      const result = await database.query<ApiKey & { user: User }>(`
        SELECT 
          ak.*,
          u.id as user_id,
          u.email as user_email,
          u.name as user_name,
          u.company as user_company,
          u.plan as user_plan,
          u.is_active as user_is_active
        FROM api_keys ak
        JOIN users u ON ak.user_id = u.id
        WHERE ak.key_hash = $1 AND ak.is_active = true AND u.is_active = true
      `, [keyHash]);

      if (result.length === 0) {
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid or inactive API key',
            timestamp: new Date()
          }
        });
        return;
      }

      apiKeyData = result[0];
      
      // Cache for 5 minutes
      await redis.setJson(cacheKey, apiKeyData, 300);
    }

    // Update last used timestamp (async, don't wait)
    database.query('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1', [apiKeyData.id])
      .catch(error => logger.error('Failed to update API key last_used_at:', error));

    // Attach user and API key to request
    req.apiKey = {
      id: apiKeyData.id,
      userId: apiKeyData.userId || apiKeyData.user_id,
      keyHash: apiKeyData.keyHash || apiKeyData.key_hash,
      name: apiKeyData.name,
      lastUsedAt: apiKeyData.lastUsedAt || apiKeyData.last_used_at,
      createdAt: apiKeyData.createdAt || apiKeyData.created_at,
      isActive: apiKeyData.isActive ?? apiKeyData.is_active,
      rateLimitTier: apiKeyData.rateLimitTier || apiKeyData.rate_limit_tier
    };

    req.user = {
      id: apiKeyData.user_id || apiKeyData.userId,
      email: apiKeyData.user_email || apiKeyData.email,
      name: apiKeyData.user_name || apiKeyData.name,
      company: apiKeyData.user_company || apiKeyData.company,
      plan: (apiKeyData.user_plan || apiKeyData.plan) as User['plan'],
      createdAt: apiKeyData.createdAt || apiKeyData.created_at,
      updatedAt: apiKeyData.updatedAt || apiKeyData.updated_at,
      isActive: apiKeyData.user_is_active ?? apiKeyData.is_active
    };

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

// Utility function to generate API keys
export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32);
  const apiKey = 'mf_' + randomBytes.toString('hex');
  return apiKey;
}

// Utility function to hash API keys
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}
