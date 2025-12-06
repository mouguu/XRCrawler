/**
 * XApiClient - Twitter API Client with Unified Architecture
 *
 * **Architecture Overview:**
 *
 * This client uses a hybrid approach optimized for stability and reliability:
 *
 * 1. **SearchTimeline (Search Queries)**:
 *    - Uses PASSIVE INTERCEPTION mode via `xclid-puppeteer.ts`
 *    - Browser navigates to Twitter search page
 *    - Intercepts GraphQL API responses automatically
 *    - This avoids TLS fingerprint detection and is the most stable approach
 *    - **IMPORTANT**: Even in "GraphQL mode", search queries require browser
 *      because direct Axios requests fail with 404 due to TLS fingerprint detection
 *
 * 2. **Other APIs (UserTweets, UserByScreenName, TweetDetail)**:
 *    - Uses direct Axios HTTP requests (true API-only, no browser)
 *    - These endpoints are less protected and work reliably with direct calls
 *    - **This is where GraphQL mode provides true API-only scraping**
 *
 * **Why this architecture?**
 * - SearchTimeline is heavily protected (TLS fingerprint, rate limiting)
 * - Passive interception bypasses all protections by using real browser
 * - Other APIs don't require the same level of protection
 *
 * **Key Design Principles:**
 * - SearchTimeline: Always use passive interception (no direct Axios possible)
 * - Other APIs: Direct Axios is acceptable and faster (true API-only)
 * - No fallback to deprecated xclid.ts (algorithm-based approach)
 *
 * **Mode Clarification:**
 * - "GraphQL mode" for Timeline = True API-only (direct Axios)
 * - "GraphQL mode" for Search = Browser passive interception (still uses browser)
 * - "Puppeteer mode" = DOM parsing (always uses browser)
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Protocol } from 'puppeteer';
import {
  X_API_BEARER_TOKEN,
  X_API_FEATURES_TIMELINE,
  X_API_FEATURES_USER_DETAILS,
  X_API_OPS,
} from '../config/constants';
import { ScraperErrors } from './errors';
import { Proxy } from './proxy-manager';
import { XClIdGenPuppeteer } from './xclid-puppeteer';

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_INITIAL_DELAY_MS = 1500; // Initial delay increased to 1.5 seconds
const RETRY_BACKOFF_FACTOR = 2; // Exponential backoff factor

export class XApiClient {
  private cookies: Protocol.Network.CookieParam[];
  private headers: Record<string, string>;
  private xclidGenPuppeteer?: XClIdGenPuppeteer;
  private axiosInstance: AxiosInstance;
  private proxy?: Proxy;

  /**
   * Force passive interception mode for SearchTimeline
   * This is the ONLY reliable way to bypass Twitter's protections for search queries.
   * DO NOT change this to false - direct Axios requests for SearchTimeline will fail with 404.
   */
  private readonly usePassiveMode: boolean = true;

  constructor(cookies: Protocol.Network.CookieParam[], proxy?: Proxy) {
    this.cookies = cookies;
    this.proxy = proxy;
    this.headers = this.buildHeaders();

    const axiosConfig: AxiosRequestConfig = {
      timeout: 30000,
      headers: this.headers,
      validateStatus: () => true,
    };

    if (this.proxy) {
      let proxyUrl = `http://${this.proxy.host}:${this.proxy.port}`;
      if (this.proxy.username && this.proxy.password) {
        proxyUrl = `http://${this.proxy.username}:${this.proxy.password}@${this.proxy.host}:${this.proxy.port}`;
      }
      const agent = new HttpsProxyAgent(proxyUrl);
      axiosConfig.httpsAgent = agent;
      axiosConfig.httpAgent = agent;
      axiosConfig.proxy = false;
      console.log(`[XApiClient] Initialized with proxy: ${this.proxy.host}:${this.proxy.port}`);
    } else {
      axiosConfig.proxy = false;
    }

    this.axiosInstance = axios.create(axiosConfig);
  }

  private buildHeaders(): Record<string, string> {
    const cookieStr = this.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const ct0 = this.cookies.find((c) => c.name === 'ct0')?.value || '';
    return {
      authorization: X_API_BEARER_TOKEN,
      'x-csrf-token': ct0,
      cookie: cookieStr,
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    };
  }

  private async getPuppeteer() {
      if (!this.xclidGenPuppeteer) {
          console.log('[XApiClient] Starting Puppeteer Engine (Passive Mode)...');
          const cookieStr = this.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
          try {
            const createPromise = XClIdGenPuppeteer.create(cookieStr, this.headers['user-agent'], this.proxy);
            const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Puppeteer init timeout')), 60000));
            this.xclidGenPuppeteer = await Promise.race([createPromise, timeoutPromise]);
            console.log('[XApiClient] Puppeteer Engine Ready.');
          } catch (e) {
            console.error('[XApiClient] Puppeteer init failed:', e);
            throw e;
          }
      }
      return this.xclidGenPuppeteer;
  }

  /**
   * Core request dispatcher - routes requests to appropriate handler
   *
   * **Routing Logic:**
   * - SearchTimeline → Passive interception (xclid-puppeteer)
   * - All other operations → Direct Axios HTTP requests
   *
   * **Why this separation?**
   * - SearchTimeline is heavily protected and requires browser-based interception
   * - Other APIs (UserTweets, UserByScreenName) work fine with direct HTTP calls
   * - This hybrid approach maximizes both stability and performance
   */
  private async performRequest(op: any, variables: any) {
    // ============================================================
    // SearchTimeline: ALWAYS use passive interception
    // ============================================================
    // This is the ONLY reliable way to bypass Twitter's protections
    // Direct Axios requests will fail with 404 due to TLS fingerprint detection
    if (op.operationName === 'SearchTimeline') {
      if (!this.usePassiveMode) {
        throw new Error(
          'SearchTimeline requires passive interception mode. ' +
          'Direct Axios requests are not supported and will fail with 404 errors.'
        );
      }

      const engine = await this.getPuppeteer();
      if (!engine) {
        throw new Error('Puppeteer engine not available for SearchTimeline passive interception');
      }

      try {
        // 回到简单的逻辑：有 cursor 就滚动，没 cursor 就新搜索
        // 这是"负负得正"版本的核心：让底层 performSearch 自己判断是否需要滚动
        if (variables.cursor) {
          console.log('[XApiClient] (Legacy Mode) Instruction: CONTINUE search (scroll)');
          return await engine.performScrollNext();
        } else {
          console.log('[XApiClient] (Legacy Mode) Instruction: START NEW search (navigate)');
          return await engine.performSearch(variables.rawQuery);
        }
      } catch (e: any) {
        console.error('[XApiClient] Passive Interception Failed:', e.message);
        throw ScraperErrors.apiRequestFailed(`Passive interception failed: ${e.message}`);
      }
    }

    // ============================================================
    // Other APIs: Use direct Axios HTTP requests
    // ============================================================
    // These endpoints (UserTweets, UserByScreenName, TweetDetail) are less protected
    // and work reliably with direct HTTP calls. No need for browser interception.
    const queryId = op.queryId;
    const url = `https://x.com/i/api/graphql/${queryId}/${op.operationName}`;
    let features = X_API_FEATURES_TIMELINE;
    if (op.operationName === 'UserByScreenName') {
      features = X_API_FEATURES_USER_DETAILS as any;
    }

    const searchParams = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(features),
    });

    // =================================================================
    // CRITICAL FIX: Retry logic with exponential backoff
    // =================================================================
    // Retry transient failures (network errors, 5xx server errors, 429 rate limits)
    // This significantly improves reliability by handling temporary network glitches
    let lastError: any = null;

    for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
      try {
        const response = await this.axiosInstance.get(`${url}?${searchParams.toString()}`);

        // Check for retryable HTTP status codes
        if (response.status >= 500 && response.status < 600) {
          // Server-side errors (500, 502, 503, 504, etc.) - retryable
          throw ScraperErrors.apiRequestFailed(
            `API server error: ${response.status}`,
            response.status
          );
        }

        // Check for 429 Rate Limit - retryable
        if (response.status === 429) {
          throw ScraperErrors.rateLimitExceeded(`API rate limit exceeded (429)`);
        }

        // Non-200 status codes that are not retryable (4xx client errors except 429)
        if (response.status !== 200) {
          throw ScraperErrors.apiRequestFailed(
            `API request failed with status: ${response.status}`,
            response.status
          );
        }

        // Request successful, return data
        return response.data;
      } catch (error: any) {
        lastError = error; // Save the last error for final throw

        // Determine if error is retryable
        const isNetworkError =
          error.code &&
          [
            'ECONNRESET',
            'ETIMEDOUT',
            'ECONNABORTED',
            'ENOTFOUND',
            'EAI_AGAIN',
            'ECONNREFUSED',
            'EPIPE',
          ].includes(error.code);
        const isRetryableApiError =
          error.statusCode && error.statusCode >= 500 && error.statusCode < 600;
        const isRateLimit =
          error.code === 'RATE_LIMIT_EXCEEDED' ||
          error.statusCode === 429 ||
          (error instanceof Error && error.message.includes('rate limit'));

        // Check if we should retry
        const shouldRetry =
          (isNetworkError || isRetryableApiError || isRateLimit) &&
          attempt < RETRY_MAX_ATTEMPTS;

        if (shouldRetry) {
          // Calculate exponential backoff delay
          const delay = RETRY_INITIAL_DELAY_MS * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1);
          console.log(
            `[XApiClient] Request for ${op.operationName} failed (attempt ${attempt}/${RETRY_MAX_ATTEMPTS}). ` +
              `Error: ${error.message || error.code || 'Unknown'}. Retrying in ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue; // Continue to next retry attempt
        }

        // If error is not retryable or we've exhausted retries, throw immediately
        throw lastError;
      }
    }

    // This should never be reached (loop will throw before), but TypeScript needs it
    throw lastError || new Error('Request failed after all retry attempts');
  }

  // Wrapper Methods (保持不变)
  async getUserByScreenName(screenName: string): Promise<string | null> {
    const data = await this.request(X_API_OPS.UserByScreenName, { screen_name: screenName, withGrokTranslatedBio: false });
    return data?.data?.user?.result?.rest_id || null;
  }

  async getUserTweets(userId: string, count: number = 40, cursor?: string) {
      const variables: any = { userId, count, includePromotedContent: true, withQuickPromoteEligibilityTweetFields: true, withVoice: true };
      if (cursor) variables.cursor = cursor;
      return this.request(X_API_OPS.UserTweets, variables);
  }

  // 恢复 searchTweets 的原始签名（移除 isContinuation 参数）
  async searchTweets(query: string, count: number = 20, cursor?: string) {
      const variables: any = { rawQuery: query, count, querySource: 'typed_query', product: 'Top', withGrokTranslatedBio: false };
      if (cursor) variables.cursor = cursor;
      return this.request(X_API_OPS.SearchTimeline, variables);
  }

  async getTweetDetail(tweetId: string, cursor?: string) {
      const variables: any = { focalTweetId: tweetId, includePromotedContent: true, withBirdwatchNotes: true, withVoice: true, withCommunity: true, referrer: 'tweet', controller_data: 'DAACDAABDAABCgABAAAAAAAAAAgAAgAAAAA=' };
      if (cursor) variables.cursor = cursor;
      return this.request(X_API_OPS.TweetDetail, variables);
  }

  async getTweetResult(tweetId: string) {
      const variables: any = { tweetId, includePromotedContent: true, withBirdwatchNotes: true, withVoice: true, withCommunity: true };
      return this.request(X_API_OPS.TweetResultByRestId, variables);
  }

  async getTweetsByIds(tweet_ids: string[], concurrency: number = 5): Promise<any[]> {
    const results: any[] = [];
    for (let i = 0; i < tweet_ids.length; i += concurrency) {
      const batch = tweet_ids.slice(i, i + concurrency);
      const batchPromises = batch.map((id) =>
        this.getTweetResult(id).catch(() => null),
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((r) => r !== null));
    }
    return results;
  }

  // ============================================================
  // Legacy/Deprecated Methods
  // ============================================================

  /**
   * @deprecated REST API v1.1 is not accessible with web cookies
   * This method always throws an error to prevent accidental usage
   */
  async getUserTimelineRest(screenName: string, options: any = {}) {
    throw new Error(
      'REST API v1.1 is deprecated and not accessible with web cookies. ' +
      'Use GraphQL API (getUserTweets) instead.'
    );
  }

  /**
   * @deprecated This method is not used and should not be called
   */
  private async performRestRequest(url: string) {
    return (await this.axiosInstance.get(url)).data;
  }

  private async request(op: any, variables: any) {
      return this.performRequest(op, variables);
  }
}
