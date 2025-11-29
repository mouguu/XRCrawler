/**
 * Reddit API Client
 * 使用 HTTP API 替代 spawn 子进程通信
 */

import { ScraperError, ErrorCode } from './errors';

export interface RedditScrapeOptions {
  subreddit?: string;
  postUrl?: string;
  maxPosts?: number;
  strategy?: 'auto' | 'super_full' | 'super_recent' | 'new';
  saveJson?: boolean;
}

export interface RedditScrapeResult {
  success: boolean;
  data?: {
    post?: any;
    comments?: any[];
    comment_count?: number;
    scraped_count?: number;
    file_path?: string;
    message?: string;
  };
  error?: string;
  errorType?: string;
  traceback?: string;
}

export class RedditApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl?: string, timeout: number = 300000) {
    // 默认使用环境变量或本地服务器
    this.baseUrl = baseUrl || 
                   process.env.REDDIT_API_URL || 
                   'http://127.0.0.1:5002';
    this.timeout = timeout;
  }

  /**
   * 检查服务是否可用
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * 爬取 subreddit
   */
  async scrapeSubreddit(options: RedditScrapeOptions): Promise<RedditScrapeResult> {
    const { subreddit = 'UofT', maxPosts = 100, strategy = 'auto', saveJson = false } = options;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/api/scrape/subreddit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subreddit,
          max_posts: maxPosts,
          strategy,
          save_json: saveJson
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw ScraperError.fromHttpResponse(response, {
          subreddit,
          maxPosts,
          strategy,
          ...errorData
        });
      }

      const result = await response.json();
      return {
        success: result.success || false,
        data: result.data,
        error: result.error,
        errorType: result.error_type,
        traceback: result.traceback
      };
    } catch (error: any) {
      if (error instanceof ScraperError) {
        throw error;
      }

      // 处理网络错误
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        throw new ScraperError(
          ErrorCode.TIMEOUT,
          `Reddit API request timeout after ${this.timeout}ms`,
          {
            retryable: true,
            context: { subreddit, maxPosts }
          }
        );
      }

      throw new ScraperError(
        ErrorCode.NETWORK_ERROR,
        `Failed to connect to Reddit API: ${error.message}`,
        {
          retryable: true,
          originalError: error,
          context: { baseUrl: this.baseUrl }
        }
      );
    }
  }

  /**
   * 爬取单个 Reddit 帖子
   */
  async scrapePost(postUrl: string): Promise<RedditScrapeResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/api/scrape/post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ post_url: postUrl }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw ScraperError.fromHttpResponse(response, {
          postUrl,
          ...errorData
        });
      }

      const result = await response.json();
      return {
        success: result.success || false,
        data: result.data,
        error: result.error,
        errorType: result.error_type,
        traceback: result.traceback
      };
    } catch (error: any) {
      if (error instanceof ScraperError) {
        throw error;
      }

      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        throw new ScraperError(
          ErrorCode.TIMEOUT,
          `Reddit API request timeout after ${this.timeout}ms`,
          {
            retryable: true,
            context: { postUrl }
          }
        );
      }

      throw new ScraperError(
        ErrorCode.NETWORK_ERROR,
        `Failed to connect to Reddit API: ${error.message}`,
        {
          retryable: true,
          originalError: error,
          context: { baseUrl: this.baseUrl, postUrl }
        }
      );
    }
  }
}

