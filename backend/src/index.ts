import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/api.js';
import n2aRoutes from './routes/noise2article.js';
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
  console.warn('⚠️  Configuration warnings:');
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
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api', apiRoutes);
app.use('/api/n2a', n2aRoutes);

// Health check root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'ContentEngine API Server',
    version: '1.0.0',
    endpoints: {
      'POST /api/generate-thread': 'Generate a Twitter thread from a script',
      'POST /api/process-file': 'Upload and process PDF/text file',
      'POST /api/post-thread': 'Post generated thread to Twitter',
      'POST /api/generate-variations': 'Generate multiple thread variations',
      'POST /api/analyze-script': 'Analyze script for insights',
      'GET /api/twitter-auth-url': 'Get Twitter authentication URL',
      'GET /api/twitter-auth-status': 'Check Twitter authentication status',
      'GET /api/health': 'API health check',
      'POST /api/n2a/discover': 'Noise2Article: Discover trending ideas from Reddit, HN, Twitter',
    },
  });
});

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
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
  res.status(500).json({
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
╔════════════════════════════════════════╗
║   ContentEngine API Server             ║
║   Running on port ${PORT}                ║
║   Environment: ${process.env.NODE_ENV || 'development'}          ║
╚════════════════════════════════════════╝

📝 Available Endpoints:
  - POST  /api/generate-thread
  - POST  /api/process-file
  - POST  /api/post-thread
  - POST  /api/generate-variations
  - POST  /api/analyze-script
  - GET   /api/twitter-auth-url
  - GET   /api/twitter-auth-status
  - POST  /api/n2a/discover       (Noise2Article)

🔗 Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}
  `);
});

export default app;
