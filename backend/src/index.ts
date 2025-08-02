import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';

import { logger } from '@/utils/logger';
import { database } from '@/utils/database';
import { redis } from '@/utils/redis';
import { errorHandler } from '@/middleware/errorHandler';
import { authMiddleware } from '@/middleware/auth';
import { rateLimitMiddleware } from '@/middleware/rateLimit';

// Routes
import { healthRoutes } from '@/routes/health';
import { authRoutes } from '@/routes/auth';
import { musicRoutes } from '@/routes/music';
import { templateRoutes } from '@/routes/templates';
import { webhookRoutes } from '@/routes/webhooks';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const API_VERSION = process.env.API_VERSION || 'v1';

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MusicForge API',
      version: '1.0.0',
      description: 'Unified Music Intelligence API - The future of music development',
      contact: {
        name: 'MusicForge Team',
        email: 'api@musicforge.io',
        url: 'https://musicforge.io'
      }
    },
    servers: [
      {
        url: `http://localhost:${PORT}/${API_VERSION}`,
        description: 'Development server'
      },
      {
        url: `https://api.musicforge.io/${API_VERSION}`,
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      }
    }
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow Swagger UI
}));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Global rate limiting
const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalRateLimit);

// API Documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'MusicForge API Documentation'
}));

// Health check (no auth required)
app.use('/health', healthRoutes);

// API routes
const apiRouter = express.Router();

// Authentication routes (no global auth middleware)
apiRouter.use('/auth', authRoutes);

// Protected routes (require API key)
apiRouter.use('/music', authMiddleware, rateLimitMiddleware, musicRoutes);
apiRouter.use('/templates', authMiddleware, templateRoutes);
apiRouter.use('/webhooks', authMiddleware, webhookRoutes);

app.use(`/${API_VERSION}`, apiRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'MusicForge API - Unified Music Intelligence',
    version: '1.0.0',
    documentation: `/docs`,
    endpoints: {
      health: '/health',
      music: `/${API_VERSION}/music`,
      templates: `/${API_VERSION}/templates`,
      auth: `/${API_VERSION}/auth`
    }
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.originalUrl} not found`,
      timestamp: new Date().toISOString()
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Close database connections
  await database.close();
  await redis.disconnect();
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  // Close database connections
  await database.close();
  await redis.disconnect();
  
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    // Initialize database
    await database.connect();
    logger.info('Database connected successfully');
    
    // Initialize Redis
    await redis.connect();
    logger.info('Redis connected successfully');
    
    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`🚀 MusicForge API server running on port ${PORT}`);
      logger.info(`📚 API Documentation: http://localhost:${PORT}/docs`);
      logger.info(`🎵 Ready to process music requests!`);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
