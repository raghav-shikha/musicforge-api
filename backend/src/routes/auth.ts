import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { database } from '@/utils/database';
import { logger } from '@/utils/logger';
import { generateApiKey, hashApiKey } from '@/middleware/auth';
import { APIResponse, User, ApiKey } from '@/types';

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register new user
 *     description: Create a new user account and API key
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "developer@example.com"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: "securepassword123"
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *               company:
 *                 type: string
 *                 example: "Acme Corp"
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     apiKey:
 *                       type: string
 *                       description: API key for accessing the service
 *       400:
 *         description: Invalid input or email already exists
 */
router.post('/register', async (
  req: Request<{}, APIResponse, { email: string; password: string; name: string; company?: string }>,
  res: Response<APIResponse>
) => {
  try {
    const { email, password, name, company } = req.body;

    // Validate input
    if (!email || !password || !name) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Email, password, and name are required',
          timestamp: new Date()
        }
      });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({
        success: false,
        error: {
          code: 'WEAK_PASSWORD',
          message: 'Password must be at least 8 characters long',
          timestamp: new Date()
        }
      });
      return;
    }

    // Check if user already exists
    const existingUser = await database.queryOne<User>(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser) {
      res.status(400).json({
        success: false,
        error: {
          code: 'EMAIL_EXISTS',
          message: 'User with this email already exists',
          timestamp: new Date()
        }
      });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user and API key in transaction
    const result = await database.transaction(async (client) => {
      // Create user
      const userResult = await client.query(`
        INSERT INTO users (id, email, password_hash, name, company, plan, created_at, updated_at, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        uuidv4(),
        email,
        passwordHash,
        name,
        company || null,
        'free',
        new Date(),
        new Date(),
        true
      ]);

      const user = userResult.rows[0];

      // Generate API key
      const apiKey = generateApiKey();
      const keyHash = hashApiKey(apiKey);

      // Create API key
      const apiKeyResult = await client.query(`
        INSERT INTO api_keys (id, user_id, key_hash, name, created_at, is_active, rate_limit_tier)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        uuidv4(),
        user.id,
        keyHash,
        'Default API Key',
        new Date(),
        true,
        'free'
      ]);

      return { user, apiKey, apiKeyRecord: apiKeyResult.rows[0] };
    });

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          company: result.user.company,
          plan: result.user.plan,
          createdAt: result.user.created_at,
          updatedAt: result.user.updated_at,
          isActive: result.user.is_active
        },
        apiKey: result.apiKey
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REGISTRATION_ERROR',
        message: 'Failed to create user account',
        timestamp: new Date()
      }
    });
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user and return JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: JWT token
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (
  req: Request<{}, APIResponse, { email: string; password: string }>,
  res: Response<APIResponse>
) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CREDENTIALS',
          message: 'Email and password are required',
          timestamp: new Date()
        }
      });
      return;
    }

    // Find user
    const user = await database.queryOne<User & { password_hash: string }>(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          timestamp: new Date()
        }
      });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          timestamp: new Date()
        }
      });
      return;
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    logger.info(`User logged in: ${email}`);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          company: user.company,
          plan: user.plan,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          isActive: user.is_active
        }
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_ERROR',
        message: 'Failed to authenticate user',
        timestamp: new Date()
      }
    });
  }
});

export { router as authRoutes };
