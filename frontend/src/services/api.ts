import axios from 'axios';
import { GenerateThreadResponse, ProcessFileResponse, PostThreadResponse, GenerateVariationsResponse, GenerateImageResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiService = {
  // Generate thread from script
  generateThread: async (
    script: string,
    options?: {
      toneOfVoice?: string;
      targetAudience?: string;
      includeResearch?: boolean;
    }
  ): Promise<GenerateThreadResponse> => {
    const response = await api.post('/generate-thread', {
      script,
      ...options,
    });
    return response.data;
  },

  // Process uploaded file
  processFile: async (file: File): Promise<ProcessFileResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/process-file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Post thread to Twitter (with optional images)
  postThread: async (
    tweets: string[],
    replyChain: boolean = true,
    images?: Record<number, { base64: string; mimeType: string }>
  ): Promise<PostThreadResponse> => {
    const response = await api.post('/post-thread', {
      tweets,
      replyChain,
      images,
    });
    return response.data;
  },

  // Generate variations
  generateVariations: async (
    script: string,
    count: number = 3,
    targetAudience?: string
  ): Promise<GenerateVariationsResponse> => {
    const response = await api.post('/generate-variations', {
      script,
      count,
      targetAudience,
    });
    return response.data;
  },

  // Generate image using Nano Banana Pro (Gemini 3 Pro Image Preview)
  generateImage: async (
    options: { prompt?: string; tweetText?: string; threadContext?: string },
    referenceImages?: File[]
  ): Promise<GenerateImageResponse> => {
    if (referenceImages && referenceImages.length > 0) {
      // Use multipart form data for reference images
      const formData = new FormData();
      if (options.prompt) formData.append('prompt', options.prompt);
      if (options.tweetText) formData.append('tweetText', options.tweetText);
      if (options.threadContext) formData.append('threadContext', options.threadContext);
      referenceImages.forEach((file) => formData.append('referenceImages', file));

      const response = await api.post('/generate-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    }

    const response = await api.post('/generate-image', options);
    return response.data;
  },

  // Edit an existing image using multi-turn conversation history
  editImage: async (
    editPrompt: string,
    previousResult: { conversationHistory: any[] },
    referenceFiles?: File[]
  ): Promise<GenerateImageResponse> => {
    if (referenceFiles && referenceFiles.length > 0) {
      const formData = new FormData();
      formData.append('editPrompt', editPrompt);
      formData.append('previousResult', JSON.stringify(previousResult));
      referenceFiles.forEach((file) => formData.append('referenceImages', file));
      const response = await api.post('/edit-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    }
    const response = await api.post('/edit-image', { editPrompt, previousResult });
    return response.data;
  },

  // Get Twitter auth URL
  getTwitterAuthUrl: async () => {
    const response = await api.get('/twitter-auth-url');
    return response.data;
  },

  // Check Twitter auth status
  checkTwitterAuthStatus: async () => {
    const response = await api.get('/twitter-auth-status');
    return response.data;
  },

  // Analyze script
  analyzeScript: async (script: string) => {
    const response = await api.post('/analyze-script', { script });
    return response.data;
  },

  // Health check
  healthCheck: async () => {
    const response = await api.get('/health');
    return response.data;
  },

  // ─── Noise2Article ─────────────────────────────────────────────────────

  // Discover ideas (run full Noise2Article pipeline)
  discoverIdeas: async (options?: {
    twitterAccounts?: string[];
    topThemesToEnrich?: number;
    niche?: string;
  }): Promise<{ success: boolean; data?: any; error?: string; durationMs?: number }> => {
    const response = await api.post('/n2a/discover', options || {}, {
      // Cloud Run request timeout is configured on the backend (Console screenshot).
      // This client timeout just needs to be comfortably higher than the longest
      // expected pipeline run so the browser doesn't give up early.
      timeout: 600000, // 10 min client timeout — plenty of headroom for long runs
    });
    return response.data;
  },

  // List saved Noise2Article articles
  listN2AArticles: async (): Promise<{ success: boolean; data?: any; error?: string }> => {
    const response = await api.get('/n2a/articles');
    return response.data;
  },

  // Get a saved Noise2Article article by id
  getN2AArticle: async (id: string): Promise<{ success: boolean; data?: any; error?: string }> => {
    const response = await api.get(`/n2a/articles/${encodeURIComponent(id)}`);
    return response.data;
  },

  // Delete a saved Noise2Article article
  deleteN2AArticle: async (id: string): Promise<{ success: boolean; error?: string }> => {
    const response = await api.delete(`/n2a/articles/${encodeURIComponent(id)}`);
    return response.data;
  },

  // Regenerate article header image
  regenerateArticleImage: async (
    id: string,
    options?: { prompt?: string; referenceImageBase64?: string; referenceImageMimeType?: string }
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    const response = await api.post(`/n2a/articles/${encodeURIComponent(id)}/regenerate-image`, options || {});
    return response.data;
  },

  // Edit article image with multi-turn conversation history
  editArticleImage: async (
    id: string,
    editPrompt: string,
    conversationHistory: any[]
  ): Promise<{ success: boolean; data?: any; conversationHistory?: any[]; error?: string }> => {
    const response = await api.post(
      `/n2a/articles/${encodeURIComponent(id)}/edit-image`,
      { editPrompt, conversationHistory },
      { timeout: 60000 }
    );
    return response.data;
  },

  // Update article niche
  updateN2AArticleNiche: async (id: string, niche: string): Promise<{ success: boolean; data?: any; error?: string }> => {
    const response = await api.patch(`/n2a/articles/${encodeURIComponent(id)}`, { niche });
    return response.data;
  },

  // Test master image prompts (no article required)
  testImagePrompt: async (options: {
    title: string;
    promptStrategy: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'auto';
    referenceImageBase64?: string;
    referenceImageMimeType?: string;
  }): Promise<{ success: boolean; data?: { base64: string; mimeType: string; prompt: string; strategy: string; title: string }; error?: string }> => {
    const response = await api.post('/n2a/test-image', options, { timeout: 60000 });
    return response.data;
  },
};

export default apiService;
