import { Router } from 'express';
import { processMusic, searchMusic, analyzeAudio } from '@/controllers/musicController';

const router = Router();

/**
 * @swagger
 * /music/process:
 *   post:
 *     summary: Process natural language music request
 *     description: The main endpoint that understands music requests and returns analyzed tracks
 *     tags: [Music]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - request
 *             properties:
 *               request:
 *                 type: string
 *                 description: Natural language music request
 *                 example: "Find me chill lofi house tracks around 120 BPM"
 *               maxTracks:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 50
 *                 default: 10
 *                 description: Maximum number of tracks to return
 *               analyzeAudio:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to perform audio analysis
 *               downloadQuality:
 *                 type: string
 *                 enum: [standard, high]
 *                 default: standard
 *                 description: Audio download quality
 *     responses:
 *       200:
 *         description: Successfully processed music request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     tracks:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Track'
 *                     totalFound:
 *                       type: integer
 *                     confidence:
 *                       type: number
 *                       minimum: 0
 *                       maximum: 1
 *       400:
 *         description: Invalid request
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/process', processMusic);

/**
 * @swagger
 * /music/search:
 *   get:
 *     summary: Search YouTube for music
 *     description: Search YouTube directly without LLM processing
 *     tags: [Music]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *         example: "deep house music"
 *       - in: query
 *         name: maxResults
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Maximum number of results
 *       - in: query
 *         name: duration
 *         schema:
 *           type: string
 *           enum: [short, medium, long]
 *         description: Video duration filter
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [relevance, date, rating, viewCount]
 *           default: relevance
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/YouTubeSearchResult'
 */
router.get('/search', searchMusic);

/**
 * @swagger
 * /music/analyze:
 *   post:
 *     summary: Analyze specific audio
 *     description: Analyze BPM, key, energy, and waveform of specific audio
 *     tags: [Music]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               youtubeUrl:
 *                 type: string
 *                 description: YouTube URL to analyze
 *                 example: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
 *               audioUrl:
 *                 type: string
 *                 description: Direct audio URL to analyze
 *               analysisType:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [bpm, key, energy, waveform]
 *                 default: [bpm, key, energy, waveform]
 *                 description: Types of analysis to perform
 *     responses:
 *       200:
 *         description: Analysis results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AudioAnalysis'
 */
router.post('/analyze', analyzeAudio);

export { router as musicRoutes };
