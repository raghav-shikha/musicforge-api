import { Router } from 'express';

const router = Router();

/**
 * @swagger
 * /templates:
 *   get:
 *     summary: List available templates
 *     description: Get a list of all available templates in the marketplace
 *     tags: [Templates]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by template category
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of templates
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      templates: [
        {
          id: 'dj-app-template',
          name: 'DJ Mixing Application',
          description: 'Complete DJ application like MixForge with dual decks, crossfader, and real-time mixing',
          category: 'music',
          techStack: ['React', 'TypeScript', 'Web Audio API', 'Tailwind CSS'],
          price: 0,
          isPublic: true,
          downloadCount: 42,
          rating: 4.8
        },
        {
          id: 'music-discovery-template',
          name: 'Music Discovery App',
          description: 'AI-powered music discovery platform with personalized recommendations',
          category: 'music',
          techStack: ['Next.js', 'TypeScript', 'Prisma', 'Tailwind CSS'],
          price: 2900, // $29
          isPublic: true,
          downloadCount: 23,
          rating: 4.6
        }
      ],
      totalCount: 2,
      currentPage: 1,
      totalPages: 1
    },
    meta: {
      requestId: 'temp-request-id',
      processingTime: 50
    }
  });
});

/**
 * @swagger
 * /templates/{id}:
 *   get:
 *     summary: Get template details
 *     description: Get detailed information about a specific template
 *     tags: [Templates]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template details
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  // Mock response for now
  res.json({
    success: true,
    data: {
      id,
      name: 'DJ Mixing Application',
      description: 'A complete DJ application built with React and Web Audio API. Features dual decks, crossfader, real-time audio effects, and BPM synchronization.',
      category: 'music',
      techStack: {
        frontend: ['React 18', 'TypeScript', 'Tailwind CSS'],
        audio: ['Web Audio API', 'Wavesurfer.js'],
        state: ['Zustand'],
        build: ['Vite', 'PWA']
      },
      features: [
        'Dual DJ decks with transport controls',
        'Real-time crossfading',
        '3-band EQ per deck',
        'BPM detection and sync',
        'Waveform visualization',
        'PWA support for offline use',
        'Mobile responsive design'
      ],
      configSchema: {
        type: 'object',
        properties: {
          appName: { type: 'string', default: 'DJ App' },
          primaryColor: { type: 'string', default: '#3b82f6' },
          enableRecording: { type: 'boolean', default: false },
          maxTrackDuration: { type: 'integer', default: 600 }
        }
      },
      price: 0,
      downloadCount: 42,
      rating: 4.8
    }
  });
});

/**
 * @swagger
 * /templates/{id}/deploy:
 *   post:
 *     summary: Deploy template
 *     description: Deploy a template with custom configuration
 *     tags: [Templates]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Deployment name
 *               config:
 *                 type: object
 *                 description: Template configuration
 *     responses:
 *       202:
 *         description: Deployment started
 */
router.post('/:id/deploy', (req, res) => {
  res.status(202).json({
    success: true,
    data: {
      deploymentId: 'deploy-' + Date.now(),
      status: 'pending',
      message: 'Deployment started. You will receive a webhook notification when complete.',
      estimatedTime: '3-5 minutes'
    }
  });
});

export { router as templateRoutes };
