// Validate API keys and configuration
export function validateEnvVariables(): string[] {
  const errors: string[] = [];

  const requiredVars = ['GEMINI_API_KEY', 'TAVILY_API_KEY', 'COMPOSIO_API_KEY'];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  return errors;
}

// Format tweet for length validation
export function formatTweet(text: string, maxLength: number = 280): { valid: boolean; text: string; length: number } {
  const cleaned = text.trim();
  return {
    valid: cleaned.length <= maxLength,
    text: cleaned,
    length: cleaned.length,
  };
}

// Detect AI-slop patterns and improve authenticity
export function improveAuthenticity(tweet: string): string {
  const patterns = [
    /\bincredible\b/gi,
    /\bamazing\b/gi,
    /\bunfortunately\b/gi,
    /\bat the end of the day\b/gi,
    /\bit's important to note\b/gi,
    /\bleveraging\b/gi,
    /\bsynergize\b/gi,
    /\bgroundbreaking\b/gi,
    /\brevolutionary\b/gi,
    /\bgame[- ]changing\b/gi,
    /\bparadigm shift\b/gi,
    /\bcutting[- ]edge\b/gi,
    /\bstate[- ]of[- ]the[- ]art\b/gi,
    /\bseamless(ly)?\b/gi,
    /\brobust\b/gi,
    /\btransformative\b/gi,
    /\bunprecedented\b/gi,
    /\bdelve\b/gi,
    /\bdelving\b/gi,
    /\butilize\b/gi,
    /\bharness\b/gi,
    /\bneedless to say\b/gi,
    /\bit goes without saying\b/gi,
    /\bwithout further ado\b/gi,
    /\blet's dive in(to)?\b/gi,
    /\bbuckle up\b/gi,
    /\binterestingly enough\b/gi,
  ];

  let improved = tweet;

  for (const pattern of patterns) {
    improved = improved.replace(pattern, '');
  }

  // Clean up double spaces left by removals
  improved = improved.replace(/\s{2,}/g, ' ');

  return improved.trim();
}

// Validate thread structure
export function validateThread(
  tweets: string[]
): {
  valid: boolean;
  errors: string[];
  stats: { totalTweets: number; avgLength: number; totalChars: number };
} {
  const errors: string[] = [];

  if (!tweets || tweets.length === 0) {
    errors.push('Thread must contain at least one tweet');
  }

  if (tweets.length > 30) {
    errors.push('Thread exceeds maximum of 30 tweets');
  }

  const stats = {
    totalTweets: tweets.length,
    avgLength: tweets.reduce((sum, t) => sum + t.length, 0) / tweets.length || 0,
    totalChars: tweets.reduce((sum, t) => sum + t.length, 0),
  };

  // Check individual tweet lengths
  for (let i = 0; i < tweets.length; i++) {
    if (tweets[i].length > 280) {
      errors.push(`Tweet ${i + 1} exceeds 280 characters (${tweets[i].length} chars)`);
    }
    if (tweets[i].length === 0) {
      errors.push(`Tweet ${i + 1} is empty`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    stats,
  };
}

// Generate unique ID for requests
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
