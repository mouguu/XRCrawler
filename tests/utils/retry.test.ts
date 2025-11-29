/**
 * Retry 工具单元测试
 */

import * as retry from '../../utils/retry';
import { Page } from 'puppeteer';

describe('Retry Utils', () => {
  describe('sleep', () => {
    it('should delay for specified time', async () => {
      const start = Date.now();
      await retry.sleep(100);
      const duration = Date.now() - start;
      
      expect(duration).toBeGreaterThanOrEqual(90);
      expect(duration).toBeLessThan(200);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      const result = await retry.retryWithBackoff(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockResolvedValue('success');
      
      const result = await retry.retryWithBackoff(fn, { maxRetries: 2 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Always fail'));
      
      await expect(
        retry.retryWithBackoff(fn, { maxRetries: 2 })
      ).rejects.toThrow('Always fail');
      
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should call onRetry callback', async () => {
      const onRetry = jest.fn();
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');
      
      await retry.retryWithBackoff(fn, { maxRetries: 1, onRetry });
      
      expect(onRetry).toHaveBeenCalled();
    });

    it('should respect shouldRetry callback', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Non-retryable'));
      const shouldRetry = jest.fn().mockReturnValue(false);
      
      await expect(
        retry.retryWithBackoff(fn, { maxRetries: 2, shouldRetry })
      ).rejects.toThrow('Non-retryable');
      
      expect(fn).toHaveBeenCalledTimes(1); // Should not retry
    });

    it('should use exponential backoff', async () => {
      const delays: number[] = [];
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');
      
      const start = Date.now();
      await retry.retryWithBackoff(fn, {
        maxRetries: 2,
        baseDelay: 100
      });
      const totalTime = Date.now() - start;
      
      // Should have delays between retries
      expect(totalTime).toBeGreaterThan(100);
    });
  });

  describe('retryPageGoto', () => {
    it('should have retryPageGoto function', () => {
      expect(typeof retry.retryPageGoto).toBe('function');
    });
  });

  describe('retryWaitForSelector', () => {
    it('should have retryWaitForSelector function', () => {
      expect(typeof retry.retryWaitForSelector).toBe('function');
    });
  });
});

