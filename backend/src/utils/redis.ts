import Redis from 'ioredis';
import { logger } from './logger';

class RedisClient {
  private client: Redis | null = null;

  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.client = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });

    this.client.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    this.client.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    // Test the connection
    try {
      await this.client.ping();
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async set(key: string, value: string, expireInSeconds?: number): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    if (expireInSeconds) {
      await this.client.setex(key, expireInSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    return await this.client.get(key);
  }

  async del(key: string): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    await this.client.del(key);
  }

  async setJson<T>(key: string, value: T, expireInSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), expireInSeconds);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    return value ? JSON.parse(value) : null;
  }

  async incr(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    return await this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (!this.client) {
      throw new Error('Redis not connected');
    }

    await this.client.expire(key, seconds);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      logger.info('Redis connection closed');
    }
  }

  getClient(): Redis | null {
    return this.client;
  }
}

export const redis = new RedisClient();
