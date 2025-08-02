import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { APIResponse } from '@/types';

export function errorHandler(
  error: any,
  req: Request,
  res: Response<APIResponse>,
  next: NextFunction
): void {
  // Log the error
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    userId: (req as any).user?.id,
    apiKeyId: (req as any).apiKey?.id
  });

  // Don't leak error details in production
  const isProduction = process.env.NODE_ENV === 'production';

  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let errorMessage = 'An internal error occurred';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = error.message;
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    errorMessage = 'Authentication failed';
  } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    statusCode = 503;
    errorCode = 'SERVICE_UNAVAILABLE';
    errorMessage = 'External service unavailable';
  } else if (error.message?.includes('rate limit')) {
    statusCode = 429;
    errorCode = 'RATE_LIMIT_EXCEEDED';
    errorMessage = error.message;
  } else if (!isProduction) {
    // In development, show the actual error
    errorMessage = error.message;
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
      ...(isProduction ? {} : { stack: error.stack }),
      timestamp: new Date()
    },
    meta: {
      requestId: req.headers['x-request-id'] as string || 'unknown',
      processingTime: 0
    }
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
