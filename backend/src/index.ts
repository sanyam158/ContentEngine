import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import n2aRoutes from './routes/noise2article.js';
import i2cRoutes from './routes/idea2content.js';
import vcgRoutes from './routes/videocreater.js';
import { requireAuth } from './middleware/requireAuth.js';
import { validateEnvVariables } from './utils/helpers.js';

// Setup __dirname for ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const app: Express = express();
const PORT = process.env.PORT || 5000;

// Validate configuration (warn only; routes will fail if keys missing)
const envErrors = validateEnvVariables();
if (envErrors.length > 0) {
  console.warn('Configuration warnings:');
  envErrors.forEach((err) => console.warn(`  - ${err}`));
}

// Middleware
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3001', // Vite dev server alternative port
    ],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Public API health check (useful for probes)
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth, apiRoutes);
app.use('/api/n2a', requireAuth, n2aRoutes);
app.use('/api/i2c', requireAuth, i2cRoutes);
app.use('/api/vcg', requireAuth, vcgRoutes);

// Health check root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'ContentEngine API Server',
    version: '1.0.0',
    endpoints: {
      'POST /api/auth/login': 'Authenticate with preconfigured credentials',
      'GET /api/auth/me': 'Get authenticated user profile',
      'GET /api/health': 'Public health check',
      'POST /api/generate-thread': 'Generate a Twitter thread from a script',
      'POST /api/process-file': 'Upload and process PDF/text file',
      'POST /api/post-thread': 'Post generated thread to Twitter',
      'POST /api/generate-variations': 'Generate multiple thread variations',
      'POST /api/analyze-script': 'Analyze script for insights',
      'GET /api/twitter-auth-url': 'Get Twitter authentication URL',
      'GET /api/twitter-auth-status': 'Check Twitter authentication status',
      'POST /api/n2a/discover': 'Noise2Article: Discover trending ideas from Reddit, HN, Twitter',
    },
  });
});

// Error handling middleware
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', error);

  // Multer errors
  if (error.message.includes('File too large')) {
    return res.status(413).json({
      error: 'File too large. Maximum size is 10MB',
    });
  }

  // API errors
  if (error.message.includes('Failed to')) {
    return res.status(500).json({
      error: error.message,
    });
  }

  // Generic error response
  return res.status(500).json({
    error: 'Internal server error',
    message: error.message,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
ContentEngine API Server
Running on port ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}

Available Endpoints:
  - POST  /api/auth/login
  - GET   /api/auth/me
  - POST  /api/generate-thread
  - POST  /api/process-file
  - POST  /api/post-thread
  - POST  /api/generate-variations
  - POST  /api/analyze-script
  - GET   /api/twitter-auth-url
  - GET   /api/twitter-auth-status
  - POST  /api/n2a/discover       (Noise2Article)

Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}
  `);
});

export default app;
