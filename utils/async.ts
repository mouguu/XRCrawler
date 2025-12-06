/**
 * Async Utilities (Consolidated)
 * Merges functionality from retry.ts and concurrency.ts.
 */

import { GoToOptions, Page, WaitForSelectorOptions } from 'puppeteer';

// ==========================================
// Part 1: Concurrency & Cancellation (from concurrency.ts)
// ==========================================

export async function waitOrCancel<T>(
  promise: Promise<T>,
  shouldStop: () => Promise<boolean> | boolean,
  checkIntervalMs: number = 200,
): Promise<T> {
  let interval: ReturnType<typeof setInterval> | undefined;

  const cancelCheck = new Promise<never>((_, reject) => {
    interval = setInterval(async () => {
      try {
        const stopped = await shouldStop();
        if (stopped) {
          clearInterval(interval);
          reject(new Error('Job cancelled by user'));
        }
      } catch (error) {
        // Ignore errors in shouldStop check
      }
    }, checkIntervalMs);
  });

  try {
    return await Promise.race([promise, cancelCheck]);
  } finally {
    if (interval) clearInterval(interval);
  }
}

export async function sleepOrCancel(
  ms: number,
  shouldStop: () => Promise<boolean> | boolean,
  checkIntervalMs: number = 200,
): Promise<void> {
  if (ms <= 0) return;
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await shouldStop()) {
      throw new Error('Job cancelled by user');
    }
    const remaining = ms - (Date.now() - start);
    if (remaining <= 0) break;
    const waitTime = Math.max(0, Math.min(remaining, checkIntervalMs));
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
}

// ==========================================
// Part 2: Retry Logic (from retry.ts)
// ==========================================

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  delay?: number;
  onRetry?: (error: any, attempt: number) => void;
  shouldRetry?: (error: any) => boolean;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    onRetry = null,
    shouldRetry = null,
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (shouldRetry && !shouldRetry(error)) throw error;
      if (attempt === maxRetries) throw error;

      const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
      if (onRetry) onRetry(error, attempt + 1);
      
      console.log(`Retrying ${attempt + 1}/${maxRetries}, retrying after ${delay}ms...`);
      await sleep(delay);
    }
  }
  throw lastError;
}

export async function retryWithLinearBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, delay = 1000, onRetry = null, shouldRetry = null } = options;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (shouldRetry && !shouldRetry(error)) throw error;
      if (attempt === maxRetries) throw error;

      if (onRetry) onRetry(error, attempt + 1);
      console.log(`Retrying ${attempt + 1}/${maxRetries}, retrying after ${delay}ms...`);
      await sleep(delay);
    }
  }
  throw lastError;
}

export function isRetryableError(error: any): boolean {
  const message = (error.message || '').toLowerCase();
  const networkErrors = [
    'timeout', 'econnreset', 'econnrefused', 'enetunreach', 'enotfound',
    'network', 'navigation timeout', 'net::err', 'waiting for selector',
  ];
  const temporaryErrors = [
    '503', '502', '504', '429', 'service unavailable', 'gateway timeout',
  ];

  return [...networkErrors, ...temporaryErrors].some(err => message.includes(err));
}

export async function retryPageGoto(
  page: Page,
  url: string,
  navigationOptions: GoToOptions = {},
  retryOptions: RetryOptions = {},
): Promise<any> {
  return retryWithBackoff(() => page.goto(url, navigationOptions), {
    maxRetries: retryOptions.maxRetries || 3,
    baseDelay: retryOptions.baseDelay || 2000,
    shouldRetry: isRetryableError,
    onRetry: (error, _attempt) => {
      console.log(`Page navigation to ${url} failed: ${error.message}`);
    },
    ...retryOptions,
  });
}

export async function retryWaitForSelector(
  page: Page,
  selector: string,
  waitOptions: WaitForSelectorOptions = {},
  retryOptions: RetryOptions = {},
): Promise<any> {
  return retryWithBackoff(() => page.waitForSelector(selector, waitOptions), {
    maxRetries: retryOptions.maxRetries || 2,
    baseDelay: retryOptions.baseDelay || 1000,
    shouldRetry: isRetryableError,
    onRetry: (error, _attempt) => {
      console.log(`Waiting for selector ${selector} failed: ${error.message}`);
    },
    ...retryOptions,
  });
}
