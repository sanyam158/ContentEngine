import { Router, Request, Response, NextFunction } from 'express';
import GeminiService, { ThreadGenerationOptions } from '../services/geminiService.js';
import TavilyService from '../services/tavilyService.js';
import ComposioService from '../services/composioService.js';
import ImageService from '../services/imageService.js';
import FileProcessingService from '../utils/fileProcessing.js';
import { validateThread, formatTweet, generateRequestId, improveAuthenticity } from '../utils/helpers.js';
import multer from 'multer';
import path from 'path';

const router = Router();
const upload = multer({
  dest: path.join(process.cwd(), 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Helper function to extract/generate user ID from request
const getUserId = (req: Request): string => {
  // Try from request headers
  if (req.headers['x-user-id'] && typeof req.headers['x-user-id'] === 'string') {
    return req.headers['x-user-id'];
  }
  // Try to get from query params
  if (req.query.userId && typeof req.query.userId === 'string') {
    return req.query.userId;
  }
  // Try from body
  if (req.body?.userId && typeof req.body.userId === 'string') {
    return req.body.userId;
  }
  // Fall back to environment variable or default
  return process.env.DEFAULT_USER_ID || 'default-user';
};

// Lazy initialize services - only on first access after dotenv has loaded
let gemini: GeminiService | null = null;
let tavily: TavilyService | null = null;
let composio: ComposioService | null = null;
let imageGen: ImageService | null = null;
const fileProcessor = new FileProcessingService();

const getGemini = () => {
  if (!gemini) {
    gemini = new GeminiService(process.env.GEMINI_API_KEY || '');
  }
  return gemini;
};

const getTavily = () => {
  if (!tavily) {
    tavily = new TavilyService(
      process.env.TAVILY_API_KEY || '',
      process.env.GEMINI_API_KEY || '' // Pass Gemini key for intelligent query generation
    );
  }
  return tavily;
};

const getImageService = () => {
  if (!imageGen) {
    imageGen = new ImageService(process.env.GEMINI_API_KEY || '');
  }
  return imageGen;
};

const getComposio = (userId: string = 'default-user') => {
  // Create a new instance with the user ID
  // (or cache per user if needed for performance)
  return new ComposioService({
    composioApiKey: process.env.COMPOSIO_API_KEY || '',
    userId: userId, // **CRITICAL**: Pass user ID for session context
  });
};

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Generate thread from script
router.post('/generate-thread', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = generateRequestId();
    console.log(`[${requestId}] Generating thread...`);

    const { script, toneOfVoice, targetAudience, includeResearch } = req.body;

    if (!script || script.trim().length === 0) {
      return res.status(400).json({ error: 'Script is required' });
    }

    // Clean the script
    const cleanedScript = fileProcessor.cleanScript(script);

    // Optionally gather research context
    let researchContext = '';
    if (includeResearch) {
      console.log(`[${requestId}] Gathering research...`);
      try {
        // Use Gemini to extract the main topic intelligently, then search
        // Pass the full script to TavilyService for better context understanding
        const research = await getTavily().generateInsights('', cleanedScript);
        researchContext = research.summary;

        console.log(`[${requestId}] Research gathered:`, {
          topic: research.topic,
          sources: research.sources.length,
          keyFindings: research.keyFindings.length,
        });
      } catch (researchError) {
        console.warn(`[${requestId}] Research gathering failed, continuing without it:`, researchError);
      }
    }

    // Generate thread
    console.log(`[${requestId}] Calling Gemini to generate thread...`);
    const threadOptions: ThreadGenerationOptions = {
      script: cleanedScript,
      toneOfVoice: toneOfVoice || 'natural and conversational',
      targetAudience: targetAudience || 'tech-savvy creators',
      researchContext,
    };

    const thread = await getGemini().generateThread(threadOptions);

    // Validate thread
    const validation = validateThread(thread.tweets);

    if (!validation.valid) {
      console.warn(`[${requestId}] Thread validation warnings:`, validation.errors);
    }

    // Improve authenticity of tweets
    const improvedTweets = thread.tweets.map((tweet) => improveAuthenticity(tweet));

    // Auto-generate cover image for the first tweet
    let coverImage: { 
      base64: string; 
      mimeType: string; 
      prompt: string;
      thoughtSignatures?: string[];
      conversationHistory?: any[];
    } | null = null;
    try {
      console.log(`[${requestId}] Generating cover image...`);
      const imgResult = await getImageService().generateCoverImage(
        improvedTweets[0] || '',
        cleanedScript.substring(0, 500)
      );
      coverImage = imgResult;
      console.log(`[${requestId}] Cover image generated`);
    } catch (imgError) {
      console.warn(`[${requestId}] Cover image generation failed, continuing without it:`, imgError);
    }

    const response = {
      requestId,
      success: true,
      thread: {
        tweets: improvedTweets,
        coverImage: coverImage ? {
          base64: coverImage.base64,
          mimeType: coverImage.mimeType,
          prompt: coverImage.prompt,
          thoughtSignatures: coverImage.thoughtSignatures,
          conversationHistory: coverImage.conversationHistory, // Include for editing
        } : null,
        metadata: {
          ...thread.metadata,
          validation: {
            valid: validation.valid,
            warnings: validation.errors,
            stats: validation.stats,
          },
        },
      },
    };

    console.log(`[${requestId}] Thread generated successfully with ${improvedTweets.length} tweets`);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Upload and process PDF/text file
router.post('/process-file', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = generateRequestId();

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`[${requestId}] Processing file: ${req.file.filename}`);

    const extractedText = await fileProcessor.processUploadedFile(req.file);
    const cleanedScript = fileProcessor.cleanScript(extractedText);

    const readingTime = fileProcessor.estimateReadingTime(cleanedScript);
    const topics = fileProcessor.extractTopics(cleanedScript);

    res.json({
      requestId,
      success: true,
      content: {
        text: cleanedScript,
        stats: {
          length: cleanedScript.length,
          wordCount: cleanedScript.split(/\s+/).length,
          readingTimeMinutes: readingTime,
          estimatedTweets: Math.ceil(cleanedScript.length / 500), // Rough estimate
          extractedTopics: topics,
        },
      },
    });

    console.log(`[${requestId}] File processed successfully`);
  } catch (error) {
    next(error);
  }
});

// Post thread to X/Twitter
router.post('/post-thread', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = generateRequestId();
    const { tweets, replyChain = true, images } = req.body;
    const userId = getUserId(req);

    if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
      return res.status(400).json({ error: 'Tweets array is required' });
    }

    console.log(`[${requestId}] Posting ${tweets.length} tweets to X/Twitter for user ${userId}...`);

    // Validate thread structure
    const validation = validateThread(tweets);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid thread structure',
        details: validation.errors,
      });
    }

    // Build tweetImages from the images field
    // images is Record<string, { base64: string; mimeType: string }>
    let tweetImages: Record<number, { base64: string; mimeType: string }> | undefined;
    if (images && typeof images === 'object') {
      tweetImages = {};
      for (const [key, val] of Object.entries(images)) {
        const idx = Number(key);
        const imgData = val as { base64: string; mimeType: string };
        if (!isNaN(idx) && imgData.base64 && imgData.mimeType) {
          tweetImages[idx] = imgData;
        }
      }
      if (Object.keys(tweetImages).length === 0) tweetImages = undefined;
      else console.log(`[${requestId}] Images attached to tweet indices: ${Object.keys(tweetImages).join(', ')}`);
    }

    // Post thread
    const postResponse = await getComposio(userId).postThread({
      tweets,
      replyChain,
      tweetImages,
      scheduling: {
        interval: 2000, // 2 seconds between tweets
      },
    });

    if (postResponse.success) {
      console.log(`[${requestId}] Thread posted successfully:`, postResponse.tweetIds);
      res.json({
        requestId,
        success: true,
        data: postResponse,
      });
    } else {
      console.error(`[${requestId}] Failed to post thread:`, postResponse.error);
      res.status(500).json({
        requestId,
        success: false,
        error: postResponse.error || 'Failed to post thread',
      });
    }
  } catch (error) {
    next(error);
  }
});

// Get Twitter authentication URL
router.get('/twitter-auth-url', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    console.log(`[${new Date().toISOString()}] Getting Twitter auth URL for user ${userId}...`);
    const authResponse = await getComposio(userId).authenticateTwitter();
    res.json({
      success: true,
      authUrl: authResponse.authUrl,
      status: authResponse.status,
    });
  } catch (error) {
    next(error);
  }
});

// Check Twitter authentication status
router.get('/twitter-auth-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const status = await getComposio(userId).checkAuthStatus();
    res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    next(error);
  }
});

// Generate thread variations for A/B testing
router.post('/generate-variations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = generateRequestId();
    const { script, targetAudience, count = 3 } = req.body;

    if (!script || script.trim().length === 0) {
      return res.status(400).json({ error: 'Script is required' });
    }

    console.log(`[${requestId}] Generating ${count} thread variations...`);

    const cleanedScript = fileProcessor.cleanScript(script);

    const variations = await getGemini().generateVariations(
      {
        script: cleanedScript,
        targetAudience: targetAudience || 'tech-savvy creators',
      },
      count
    );

    res.json({
      requestId,
      success: true,
      variations: variations.map((v, index) => ({
        id: index + 1,
        tweets: v.tweets.map((t) => improveAuthenticity(t)),
        metadata: v.metadata,
      })),
    });

    console.log(`[${requestId}] Generated ${variations.length} variations`);
  } catch (error) {
    next(error);
  }
});

// Generate image using Nano Banana (Gemini 2.5 Flash Image)
router.post('/generate-image', upload.array('referenceImages', 5), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = generateRequestId();
    const { prompt, tweetText, threadContext } = req.body;

    console.log(`[${requestId}] Generating image...`);

    // Process reference images if uploaded
    let referenceImages: { base64: string; mimeType: string }[] | undefined;
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const fs = await import('fs');
      referenceImages = req.files.map((file: Express.Multer.File) => {
        const buffer = fs.readFileSync(file.path);
        const base64 = buffer.toString('base64');
        // Clean up temp file
        fs.unlinkSync(file.path);
        return {
          base64,
          mimeType: file.mimetype,
        };
      });
      console.log(`[${requestId}] ${referenceImages.length} reference image(s) provided`);
    }

    let result;
    if (prompt) {
      // Custom prompt regeneration
      result = await getImageService().regenerateImage(prompt, referenceImages);
    } else if (tweetText) {
      // Auto-generate cover image from tweet content
      result = await getImageService().generateCoverImage(tweetText, threadContext || '');
    } else {
      return res.status(400).json({ error: 'Either prompt or tweetText is required' });
    }

    console.log(`[${requestId}] Image generated successfully`);
    res.json({
      requestId,
      success: true,
      image: {
        base64: result.base64,
        mimeType: result.mimeType,
        prompt: result.prompt,
        thoughtSignatures: result.thoughtSignatures,
        conversationHistory: result.conversationHistory, // Include for multi-turn editing
      },
    });
  } catch (error) {
    next(error);
  }
});

// Edit an existing image using conversation history (multi-turn editing)
router.post('/edit-image', upload.array('referenceImages', 5), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = generateRequestId();
    const { editPrompt, previousResult } = req.body;

    if (!editPrompt || !editPrompt.trim()) {
      return res.status(400).json({ error: 'editPrompt is required' });
    }

    if (!previousResult || !previousResult.conversationHistory) {
      return res.status(400).json({ 
        error: 'previousResult with conversationHistory is required for editing. Use /generate-image first.' 
      });
    }

    console.log(`[${requestId}] Editing image with prompt: "${editPrompt}"`);

    // Process reference images if uploaded
    let referenceImages: { base64: string; mimeType: string }[] | undefined;
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const fs = await import('fs');
      referenceImages = req.files.map((file: Express.Multer.File) => {
        const buffer = fs.readFileSync(file.path);
        const base64 = buffer.toString('base64');
        fs.unlinkSync(file.path);
        return {
          base64,
          mimeType: file.mimetype,
        };
      });
      console.log(`[${requestId}] ${referenceImages.length} reference image(s) provided`);
    }

    const result = await getImageService().editImage(
      editPrompt,
      previousResult,
      referenceImages
    );

    console.log(`[${requestId}] Image edited successfully`);
    res.json({
      requestId,
      success: true,
      image: {
        base64: result.base64,
        mimeType: result.mimeType,
        prompt: result.prompt,
        thoughtSignatures: result.thoughtSignatures,
        conversationHistory: result.conversationHistory,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Analyze script for insights
router.post('/analyze-script', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = generateRequestId();
    const { script } = req.body;

    if (!script || script.trim().length === 0) {
      return res.status(400).json({ error: 'Script is required' });
    }

    console.log(`[${requestId}] Analyzing script...`);

    const cleanedScript = fileProcessor.cleanScript(script);
    const analysis = await getGemini().analyzeScript(cleanedScript);

    res.json({
      requestId,
      success: true,
      analysis: {
        insights: analysis,
        topics: fileProcessor.extractTopics(cleanedScript),
        stats: {
          length: cleanedScript.length,
          wordCount: cleanedScript.split(/\s+/).length,
          readingTime: fileProcessor.estimateReadingTime(cleanedScript),
        },
      },
    });

    console.log(`[${requestId}] Script analysis complete`);
  } catch (error) {
    next(error);
  }
});

export default router;
