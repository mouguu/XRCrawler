/**
 * Rate Limit Guard (Elite Core)
 *
 * Consolidates global rate limiting (Redis) and local session rotation logic.
 *
 * Components:
 * - GlobalRateLimiter: Redis-based sliding window limiter.
 * - RateLimitManager: Session rotation and error handling.
 */

import { Redis } from 'ioredis';
import { Page } from 'puppeteer';
import { createEnhancedLogger } from '../utils';
import { Session, SessionManager } from './session-manager';
import { ScraperEventBus } from './scraper-engine.types';

const logger = createEnhancedLogger('RateLimitGuard');

// ==========================================
// 1. Global Rate Limiter (Redis)
// ==========================================

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  key: string;
}

export class GlobalRateLimiter {
  constructor(private redis: Redis) {}

  async checkLimit(config: RateLimitConfig): Promise<boolean> {
    const { key, maxRequests, windowMs } = config;
    try {
      const script = `
        local key = KEYS[1]
        local max = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local count = redis.call('INCR', key)
        if count == 1 then redis.call('PEXPIRE', key, window) end
        return count <= max
      `;
      const result = (await this.redis.eval(script, 1, key, String(maxRequests), String(windowMs))) as number;
      return result === 1;
    } catch (error) {
      logger.error(`Rate limit check failed for ${key}`, error as Error);
      return true; // Fail open
    }
  }

  async waitForSlot(config: RateLimitConfig, maxWaitMs: number = 60000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (await this.checkLimit(config)) return true;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  }
}

// ==========================================
// 2. Rate Limit Manager (Session Rotation)
// ==========================================

export class RateLimitManager {
  private eventBus?: ScraperEventBus;
  private sessionManager: SessionManager;
  private maxRotationAttempts = 3;
  private enableRotation = true;

  constructor(sessionManager: SessionManager, eventBus?: ScraperEventBus) {
    this.sessionManager = sessionManager;
    this.eventBus = eventBus;
  }

  setEnableRotation(enable: boolean) {
    this.enableRotation = enable;
  }


  async handleRateLimit(
    _page: Page,
    currentAttempt: number,
    error: Error,
    currentSessionId?: string,
  ): Promise<Session | null> {
    if (currentAttempt >= this.maxRotationAttempts) {
      this.log(`Rate limit handling failed after ${currentAttempt} attempts`, 'error');
      return null;
    }

    if (!this.enableRotation) {
      this.log('Rotation disabled, stopping execution', 'warn');
      return null;
    }

    this.log(`Rate limit detected! Rotating (attempt ${currentAttempt + 1})`, 'warn');

    try {
      if (currentSessionId) {
        await this.sessionManager.markBad(currentSessionId, 'rate-limit');
      }
      const nextSession = await this.sessionManager.getNextSession();
      if (!nextSession) {
        this.log('No sessions available to rotate into', 'error');
        return null;
      }
      
      this.log(`Switched to session: ${nextSession.id}`);
      await new Promise(r => setTimeout(r, 2000));
      return nextSession;
    } catch (err: any) {
      this.log(`Rotation failed: ${err.message}`, 'error');
      return null;
    }
  }

  isRateLimitError(error: Error): boolean {
    const msg = (error.message || '').toLowerCase();
    const hints = ['rate limit', '429', 'too many requests', 'timeout exceeded'];
    return hints.some(h => msg.includes(h));
  }

  private log(msg: string, level: 'info' | 'warn' | 'error' = 'info') {
    if (this.eventBus) this.eventBus.emitLog(msg, level);
    else logger[level](msg);
  }
}
