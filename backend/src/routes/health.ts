import { Router, Request, Response } from 'express';
import { database } from '@/utils/database';
import { redis } from '@/utils/redis';
import { logger } from '@/utils/logger';

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Check if the API is healthy and all services are operational
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 services:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       enum: [healthy, unhealthy]
 *                     redis:
 *                       type: string
 *                       enum: [healthy, unhealthy]
 *                     external_apis:
 *                       type: object
 *       503:
 *         description: Service is unhealthy
 */
router.get('/', async (req: Request, res: Response) => {
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    services: {
      database: 'unknown',
      redis: 'unknown',
      external_apis: {
        openai: 'unknown',
        youtube: 'unknown',
        audd: 'unknown'
      }
    }
  };

  let isHealthy = true;

  // Check database connection
  try {
    await database.query('SELECT 1');
    healthCheck.services.database = 'healthy';
  } catch (error) {
    logger.error('Database health check failed:', error);
    healthCheck.services.database = 'unhealthy';
    isHealthy = false;
  }

  // Check Redis connection
  try {
    await redis.set('health_check', 'ok', 10);
    const result = await redis.get('health_check');
    if (result === 'ok') {
      healthCheck.services.redis = 'healthy';
    } else {
      throw new Error('Redis health check failed');
    }
  } catch (error) {
    logger.error('Redis health check failed:', error);
    healthCheck.services.redis = 'unhealthy';
    isHealthy = false;
  }

  // Check external APIs (basic connectivity)
  try {
    // OpenAI API check
    if (process.env.OPENAI_API_KEY) {
      healthCheck.services.external_apis.openai = 'configured';
    } else {
      healthCheck.services.external_apis.openai = 'not_configured';
    }

    // YouTube API check
    if (process.env.YOUTUBE_API_KEY) {
      healthCheck.services.external_apis.youtube = 'configured';
    } else {
      healthCheck.services.external_apis.youtube = 'not_configured';
    }

    // AudD API check
    if (process.env.AUDD_API_KEY) {
      healthCheck.services.external_apis.audd = 'configured';
    } else {
      healthCheck.services.external_apis.audd = 'not_configured';
    }
  } catch (error) {
    logger.error('External API health check failed:', error);
  }

  // Set overall status
  if (!isHealthy) {
    healthCheck.status = 'unhealthy';
  }

  res.status(isHealthy ? 200 : 503).json(healthCheck);
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness check
 *     description: Check if the service is ready to accept requests
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *       503:
 *         description: Service is not ready
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check if essential services are available
    await database.query('SELECT 1');
    await redis.get('health_check');

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness check
 *     description: Check if the service is alive (basic ping)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is alive
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  });
});

export { router as healthRoutes };
