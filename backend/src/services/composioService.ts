import { Composio } from '@composio/core';
import axios from 'axios';
import crypto from 'crypto';

interface TwitterAuthConfig {
  composioApiKey: string;
  userId: string; // **CRITICAL**: User ID is required for Composio sessions
}

interface PostResponse {
  success: boolean;
  tweetIds?: string[];
  error?: string;
  message: string;
}

interface ThreadPostRequest {
  tweets: string[];
  replyChain?: boolean;
  tweetImages?: Record<number, { base64: string; mimeType: string }>; // Images keyed by tweet index
  scheduling?: {
    scheduledTime?: Date;
    interval?: number;
  };
}

class ComposioService {
  private composio: Composio | null = null;
  private userId: string;
  private apiKey: string;

  constructor(config: TwitterAuthConfig) {
    this.userId = config.userId; // Store the user ID
    this.apiKey = config.composioApiKey;
  }

  // Initialize Composio SDK (lazy initialization)
  private async initComposio(): Promise<Composio> {
    if (!this.composio) {
      this.composio = new Composio({
        apiKey: this.apiKey,
      });
    }
    return this.composio;
  }

  // Get authorization URL for Twitter (user clicks to authenticate)
  async authenticateTwitter(): Promise<{ authUrl: string; status: string }> {
    try {
      const composio = await this.initComposio();

      // Generate Composio Connect URL with user ID and Twitter toolkit
      // Format: https://connect.composio.dev/?entityId={userId}&integrationId=twitter
      const authUrl = `https://connect.composio.dev/?entityId=${encodeURIComponent(this.userId)}&integrationId=twitter`;

      return {
        authUrl,
        status: 'pending_authentication',
      };
    } catch (error) {
      console.error('Twitter auth error:', error);
      throw new Error(`Failed to initiate Twitter authentication: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Check if user has connected Twitter account
  async checkAuthStatus(): Promise<{ authenticated: boolean; provider: string; connectedAccountId?: string }> {
    try {
      const composio = await this.initComposio();
      
      // Try to get connected accounts for this user
      // If this fails, it means no account is connected
      try {
        // Attempt to get user info via helper tool if available
        const result = await composio.tools.execute('TWITTER_GET_USER_BY_ID', {
          userId: this.userId,
          arguments: {},
          dangerouslySkipVersionCheck: true,
        });
        
        return { 
          authenticated: true, 
          provider: 'twitter',
          connectedAccountId: (result?.data as any)?.connectedAccountId,
        };
      } catch (error: any) {
        // If the tool itself is missing, fall back to a simple HTTP check
        if (error?.code === 'TS-SDK::TOOL_NOT_FOUND' ||
            error?.cause?.error?.message?.includes('Tool TWITTER_GET_USER_BY_ID not found')) {
          try {
            const resp = await axios.get(
              `https://backend.composio.dev/api/v1/connectedAccounts?user_uuid=${encodeURIComponent(this.userId)}`,
              { headers: { 'X-API-Key': this.apiKey } },
            );
            const items = resp.data?.items || resp.data || [];
            const twitterAccounts = Array.isArray(items)
              ? items.filter((a: any) => a.appName === 'twitter' || a.appUniqueId === 'twitter')
              : [];
            if (twitterAccounts.length > 0) {
              return { authenticated: true, provider: 'twitter', connectedAccountId: twitterAccounts[0].id };
            }
            return { authenticated: false, provider: 'twitter' };
          } catch {
            return { authenticated: false, provider: 'twitter' };
          }
        }
        // If we get a "No connected account" error, user is not authenticated
        if (error?.cause?.error?.error?.message?.includes('No connected account found')) {
          return { authenticated: false, provider: 'twitter' };
        }
        // Other errors might mean auth is working but something else failed
        throw error;
      }
    } catch (error) {
      console.error('Auth status check error:', error);
      return { authenticated: false, provider: 'twitter' };
    }
  }

  /**
   * Upload media to Twitter via Composio:
   * 1. Request presigned S3 URL from Composio
   * 2. Upload the image buffer to S3
   * 3. Execute TWITTER_UPLOAD_MEDIA with the S3 key
   * 4. Return the media_id for attaching to tweets
   */
  async uploadMedia(
    imageBase64: string,
    filename: string,
    mimetype: string
  ): Promise<string> {
    const composio = await this.initComposio();

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const md5Hash = crypto.createHash('md5').update(imageBuffer).digest('hex');

    console.log(`[Media Upload] Requesting presigned URL for ${filename} (${mimetype}, ${imageBuffer.length} bytes)`);

    // Step 1: Request presigned upload URL from Composio
    const uploadRequest = await axios.post(
      'https://backend.composio.dev/api/v3/files/upload/request',
      {
        toolkit_slug: 'twitter',
        tool_slug: 'TWITTER_UPLOAD_MEDIA',
        filename,
        mimetype,
        md5: md5Hash,
      },
      {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    // Composio returns newPresignedUrl (not url) for the presigned upload URL
    const presignedUrl = uploadRequest.data.newPresignedUrl || uploadRequest.data.new_presigned_url;
    const s3Key = uploadRequest.data.key;
    
    if (!presignedUrl) {
      throw new Error(`No presigned URL in Composio response. Keys received: ${Object.keys(uploadRequest.data).join(', ')}`);
    }
    console.log(`[Media Upload] Got presigned URL, s3Key: ${s3Key}`);

    // Step 2: Upload the file to Composio's Cloudflare R2 storage
    await axios.put(presignedUrl, imageBuffer, {
      headers: {
        'Content-Type': mimetype,
      },
    });
    console.log(`[Media Upload] File uploaded to S3`);

    // Step 3: Execute TWITTER_UPLOAD_MEDIA with the S3 key
    const uploadResult = await composio.tools.execute('TWITTER_UPLOAD_MEDIA', {
      userId: this.userId,
      arguments: {
        media: {
          name: filename,
          mimetype,
          s3key: s3Key,
        },
        media_category: 'tweet_image',
      },
      dangerouslySkipVersionCheck: true,
    });

    console.log(`[Media Upload] Upload result:`, JSON.stringify(uploadResult, null, 2));

    // Extract media_id from result
    // Twitter v2 format: { data: { data: { id: "...", media_key: "3_..." } } }
    const mediaId =
      (uploadResult?.data as any)?.data?.id ||             // Twitter v2 nested: data.data.id
      (uploadResult?.data as any)?.media_id_string ||      // Classic v1.1 format
      (uploadResult?.data as any)?.media_id ||             // Direct format
      (uploadResult?.data as any)?.id ||                   // Direct id
      (uploadResult?.data as any)?.data?.media_id_string;  // Nested v1.1

    if (!mediaId) {
      throw new Error(`No media_id returned from upload. Response: ${JSON.stringify(uploadResult?.data)}`);
    }

    console.log(`[Media Upload] Media uploaded with ID: ${mediaId}`);
    return String(mediaId);
  }

  // Post a single tweet using Composio SDK
  async postTweet(text: string, mediaIds?: string[]): Promise<PostResponse> {
    try {
      const composio = await this.initComposio();

      // Execute the TWITTER_CREATION_OF_A_POST action with user context
      // The SDK expects parameters to be passed in arguments object
      const tweetArgs: any = { text };
      if (mediaIds && mediaIds.length > 0) {
        tweetArgs.media_media_ids = mediaIds;
        // Some tool variants expect nested media object
        tweetArgs.media = { media_ids: mediaIds };
      }

      const result = await composio.tools.execute('TWITTER_CREATION_OF_A_POST', {
        userId: this.userId, // **CRITICAL**: Pass user ID for session context
        arguments: tweetArgs,
        dangerouslySkipVersionCheck: true,
      });

      // Log full result for debugging
      console.log('[Single Tweet] Full result:', JSON.stringify(result, null, 2));

      // Twitter API v2 returns tweet data in result.data.data.id (nested structure)
      // Check multiple possible locations for tweet ID
      const tweetId = 
        (result?.data as any)?.data?.id ||  // Twitter API v2 format
        (result?.data as any)?.id ||        // Direct format
        (result as any)?.id;                 // Top-level format

      if (tweetId) {
        return {
          success: true,
          tweetIds: [String(tweetId)],
          message: 'Tweet posted successfully',
        };
      }

      // Log the full result structure to help debug
      console.error('[Single Tweet] No tweet ID found in result:', JSON.stringify(result, null, 2));
      throw new Error(`No tweet ID received from Composio. Response structure: ${JSON.stringify(result?.data || result)}`);
    } catch (error: any) {
      console.error('Post tweet error:', error);
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        statusCode: error?.statusCode,
        cause: error?.cause,
      });
      
      // Extract error message
      const errorMessage = 
        error?.cause?.error?.error?.message ||
        error?.cause?.message ||
        error?.message ||
        'Unknown error';
      
      return {
        success: false,
        error: errorMessage,
        message: 'Failed to post tweet',
      };
    }
  }

  // Post a thread (multiple tweets as replies)
  async postThread(request: ThreadPostRequest): Promise<PostResponse> {
    try {
      const tweetIds: string[] = [];

      // Validate tweets
      const validTweets = request.tweets.filter((tweet) => tweet.trim().length > 0);

      if (validTweets.length === 0) {
        return {
          success: false,
          message: 'No valid tweets to post',
        };
      }

      const composio = await this.initComposio();

      // Post tweets in sequence
      for (let i = 0; i < validTweets.length; i++) {
        const tweet = validTweets[i];
        const delay = request.scheduling?.interval || 1000; // 1 second default delay

        // Add delay between tweets to avoid rate limiting
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        try {
          // Build arguments for tweet post
          const tweetArgs: any = { text: tweet };
          
          // If replyChain is enabled and this is not the first tweet, add reply_in_reply_to_tweet_id
          // Composio/Twitter API v2 format: { "reply_in_reply_to_tweet_id": "tweet_id" }
          if (request.replyChain !== false && i > 0 && tweetIds.length > 0) {
            tweetArgs.reply_in_reply_to_tweet_id = String(tweetIds[tweetIds.length - 1]);
            // Some tool variants expect nested reply object
            tweetArgs.reply = { in_reply_to_tweet_id: String(tweetIds[tweetIds.length - 1]) };
            console.log(`[Tweet ${i + 1}] Replying to tweet ${tweetIds[tweetIds.length - 1]}`);
          }

          // Upload image for this tweet if provided
          if (request.tweetImages && request.tweetImages[i]) {
            try {
              const img = request.tweetImages[i];
              const ext = img.mimeType.split('/')[1] || 'png';
              const mediaId = await this.uploadMedia(
                img.base64,
                `tweet_${i + 1}_image.${ext}`,
                img.mimeType
              );
              tweetArgs.media_media_ids = [mediaId];
              tweetArgs.media = { media_ids: [mediaId] };
              console.log(`[Tweet ${i + 1}] Attached media: ${mediaId}`);
            } catch (mediaError: any) {
              console.warn(`[Tweet ${i + 1}] Media upload failed, posting without image:`, mediaError.message);
            }
          }

          // Execute tweet post with user context
          const result = await composio.tools.execute('TWITTER_CREATION_OF_A_POST', {
            userId: this.userId, // **CRITICAL**: User ID for session
            arguments: tweetArgs,
            dangerouslySkipVersionCheck: true,
          });

          // Log full result for debugging
          console.log(`[Tweet ${i + 1}] Full result:`, JSON.stringify(result, null, 2));

          // Twitter API v2 returns tweet data in result.data.data.id (nested structure)
          // Check multiple possible locations for tweet ID
          const tweetId = 
            (result?.data as any)?.data?.id ||  // Twitter API v2 format
            (result?.data as any)?.id ||        // Direct format
            (result as any)?.id;                 // Top-level format

          if (tweetId) {
            tweetIds.push(String(tweetId));
            console.log(`[Tweet ${i + 1}] Posted successfully with ID: ${tweetId}`);
          } else {
            // Log the full result structure to help debug
            console.error(`[Tweet ${i + 1}] No tweet ID found in result:`, JSON.stringify(result, null, 2));
            throw new Error(`Failed to post tweet ${i + 1}: No tweet ID in response. Response structure: ${JSON.stringify(result?.data || result)}`);
          }
        } catch (tweetError: any) {
          console.error(`Error posting tweet ${i + 1}:`, tweetError);
          console.error(`Error details:`, {
            message: tweetError?.message,
            code: tweetError?.code,
            statusCode: tweetError?.statusCode,
            cause: tweetError?.cause,
            stack: tweetError?.stack,
          });
          
          // Check for authentication/connected account errors
          if (
            tweetError?.cause?.error?.error?.message?.includes('No connected account found') ||
            tweetError?.message?.includes('No connected account found')
          ) {
            const authError = new Error(
              `Twitter account not connected for user ${this.userId}. Please authenticate your Twitter account first via Composio Connect.`
            );
            (authError as any).code = 'TWITTER_NOT_CONNECTED';
            throw authError;
          }
          
          // Extract and throw a more descriptive error
          const errorMessage = 
            tweetError?.cause?.error?.error?.message ||
            tweetError?.cause?.message ||
            tweetError?.message ||
            'Unknown error occurred';
          
          const enhancedError = new Error(`Failed to post tweet ${i + 1}: ${errorMessage}`);
          (enhancedError as any).originalError = tweetError;
          throw enhancedError;
        }
      }

      return {
        success: true,
        tweetIds,
        message: `Successfully posted thread with ${tweetIds.length} tweets`,
      };
    } catch (error: any) {
      console.error('Post thread error:', error);
      
      // Provide helpful error messages
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (error?.code === 'TWITTER_NOT_CONNECTED') {
        errorMessage = error.message;
      } else if (error?.cause?.error?.error?.message?.includes('No connected account found')) {
        errorMessage = `Twitter account not connected for user ${this.userId}. Please authenticate your Twitter account first via Composio Connect.`;
      }
      
      return {
        success: false,
        error: errorMessage,
        message: 'Failed to post thread',
      };
    }
  }

  // Get user profile info from Twitter
  async getUserProfile(): Promise<any> {
    try {
      const composio = await this.initComposio();

      // Get user profile info
      const result = await composio.tools.execute('TWITTER_GET_USER_BY_ID', {
        userId: this.userId,
        arguments: {}, // Empty arguments for GET request
        dangerouslySkipVersionCheck: true,
      });

      return result?.data;
    } catch (error) {
      console.error('Get profile error:', error);
      throw error;
    }
  }

  // Schedule tweet for later
  async scheduleTweet(text: string, scheduledTime: Date): Promise<PostResponse> {
    try {
      const now = new Date();
      const delayMs = scheduledTime.getTime() - now.getTime();

      if (delayMs > 0) {
        // Schedule the tweet
        setTimeout(async () => {
          await this.postTweet(text);
        }, delayMs);

        return {
          success: true,
          message: `Tweet scheduled for ${scheduledTime.toISOString()}`,
        };
      } else {
        return await this.postTweet(text);
      }
    } catch (error) {
      console.error('Schedule tweet error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to schedule tweet',
      };
    }
  }
}

export default ComposioService;
export type { TwitterAuthConfig, PostResponse, ThreadPostRequest };
