export interface CoverImage {
  base64: string;
  mimeType: string;
  prompt: string;
}

export interface Thread {
  tweets: string[];
  coverImage?: CoverImage | null;
  metadata: {
    totalCharacters: number;
    tweetCount: number;
    generatedAt: string;
    validation?: {
      valid: boolean;
      warnings: string[];
      stats: {
        totalTweets: number;
        avgLength: number;
        totalChars: number;
      };
    };
  };
}

export interface GenerateThreadResponse {
  requestId: string;
  success: boolean;
  thread: Thread;
}

export interface ProcessFileResponse {
  requestId: string;
  success: boolean;
  content: {
    text: string;
    stats: {
      length: number;
      wordCount: number;
      readingTimeMinutes: number;
      estimatedTweets: number;
      extractedTopics: string[];
    };
  };
}

export interface PostThreadResponse {
  requestId: string;
  success: boolean;
  data: {
    tweetIds?: string[];
    message: string;
    error?: string;
  };
}

export interface Variation {
  id: number;
  tweets: string[];
  metadata: {
    totalCharacters: number;
    tweetCount: number;
    generatedAt: string;
  };
}

export interface GenerateVariationsResponse {
  requestId: string;
  success: boolean;
  variations: Variation[];
}

export interface PostingProgress {
  isPosting: boolean;
  currentTweet: number;
  totalTweets: number;
  tweetIds: string[];
  error?: string;
  done: boolean;
}

export interface TweetImage {
  file?: File;
  preview: string;
  base64?: string;
  mimeType?: string;
  isGenerated?: boolean;
  conversationHistory?: any[];
}

export interface GenerateImageResponse {
  requestId: string;
  success: boolean;
  image: {
    base64: string;
    mimeType: string;
    prompt: string;
    thoughtSignatures?: string[];
    conversationHistory?: any[];
  };
}

export type ViewMode = 'input' | 'preview' | 'variations' | 'posted';
