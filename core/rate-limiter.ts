/**
 * Dynamic Rate Limiter based on Twitter API headers
 */

import { createEnhancedLogger, safeJsonParse } from '../utils';
import { redisConnection } from './queue/connection';

const logger = createEnhancedLogger('RateLimiter');

interface RateLimitInfo {
  remaining: number;
  reset: number; // Unix timestamp in seconds
  limit: number;
}

export class RateLimiter {
  private readonly DEFAULT_DELAY = 2000; // 2 seconds
  private readonly LOW_REMAINING_THRESHOLD = 50;
  private readonly CRITICAL_REMAINING_THRESHOLD = 10;

  /**
   * Update rate limit info from Twitter API headers
   */
  async updateFromHeaders(endpoint: string, headers: Record<string, string>): Promise<void> {
    try {
      const remaining = parseInt(headers['x-rate-limit-remaining'] || '0');
      const reset = parseInt(headers['x-rate-limit-reset'] || '0');
      const limit = parseInt(headers['x-rate-limit-limit'] || '0');

      if (remaining > 0 && reset > 0) {
        const info: RateLimitInfo = { remaining, reset, limit };
        const key = `rate_limit:${endpoint}`;
        const ttl = Math.max(reset - Math.floor(Date.now() / 1000), 60);

        await redisConnection.set(key, JSON.stringify(info), 'EX', ttl);
        
        logger.debug('Updated rate limit', { endpoint, remaining, reset, limit });
      }
    } catch (error: any) {
      logger.error('Failed to update rate limit', error);
    }
  }

  /**
   * Get current rate limit info for an endpoint
   */
  async getRateLimitInfo(endpoint: string): Promise<RateLimitInfo | null> {
    try {
      const key = `rate_limit:${endpoint}`;
      const data = await redisConnection.get(key);
      
      if (data) {
        return safeJsonParse(data);
      }
    } catch (error: any) {
      logger.error('Failed to get rate limit info', error);
    }
    
    return null;
  }

  /**
   * Calculate delay needed before next request
   */
  async getDelay(endpoint: string): Promise<number> {
    const info = await this.getRateLimitInfo(endpoint);
    
    if (!info) {
      return this.DEFAULT_DELAY;
    }

    const { remaining, reset } = info;
    const now = Math.floor(Date.now() / 1000);

    // If rate limit exhausted, wait until reset
    if (remaining <= 0 && reset > now) {
      const waitTime = (reset - now + 1) * 1000;
      logger.warn(`Rate limit exhausted for ${endpoint}, waiting ${waitTime}ms`);
      return waitTime;
    }

    // If critically low, add significant delay
    if (remaining < this.CRITICAL_REMAINING_THRESHOLD) {
      logger.warn(`Rate limit critical for ${endpoint}: ${remaining} remaining`);
      return 10000; // 10 seconds
    }

    // If low, add moderate delay
    if (remaining < this.LOW_REMAINING_THRESHOLD) {
      logger.info(`Rate limit low for ${endpoint}: ${remaining} remaining`);
      return 5000; // 5 seconds
    }

    return this.DEFAULT_DELAY;
  }

  /**
   * Check if we should wait before making a request
   */
  async shouldWait(endpoint: string): Promise<boolean> {
    const info = await this.getRateLimitInfo(endpoint);
    
    if (!info) {
      return false;
    }

    const { remaining, reset } = info;
    const now = Math.floor(Date.now() / 1000);

    // If rate limit exhausted and not yet reset, should wait
    if (remaining <= 0 && reset > now) {
      return true;
    }

    return false;
  }

  /**
   * Wait for the appropriate delay
   */
  async wait(endpoint: string): Promise<void> {
    const delay = await this.getDelay(endpoint);
    
    if (delay > this.DEFAULT_DELAY) {
      logger.info(`Throttling request to ${endpoint} for ${delay}ms`);
    }
    
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
