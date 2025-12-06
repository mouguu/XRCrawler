import { describe, expect, test } from 'bun:test';
import { ErrorClassifier, ErrorCode, ScraperError, isRecoverableError } from '../../core/errors';

describe('ErrorClassifier', () => {
  describe('classify', () => {
    test('should classify rate limit errors', () => {
      const error = new Error('Rate limit exceeded');
      const classified = ErrorClassifier.classify(error);

      expect(classified).toBeInstanceOf(ScraperError);
      expect(classified.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(classified.retryable).toBe(true);
    });

    test('should classify authentication errors', () => {
      const error = new Error('Authentication failed');
      const classified = ErrorClassifier.classify(error);

      expect(classified).toBeInstanceOf(ScraperError);
      expect(classified.code).toBe(ErrorCode.AUTH_FAILED);
      expect(classified.retryable).toBe(false);
    });

    test('should classify network errors', () => {
      const error = new Error('Network timeout');
      const classified = ErrorClassifier.classify(error);

      expect(classified).toBeInstanceOf(ScraperError);
      expect(classified.code).toBe(ErrorCode.NETWORK_ERROR); // Or TIMEOUT depending on implementation
      expect(classified.retryable).toBe(true);
    });

    test('should default to unknown for unrecognized errors', () => {
      const error = new Error('Unknown error');
      const classified = ErrorClassifier.classify(error);

      expect(classified.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });

  describe('isRecoverableError', () => {
    test('should identify retryable errors', () => {
      const error = new Error('Rate limit exceeded');
      expect(isRecoverableError(error)).toBe(true);
    });

    test('should identify non-retryable errors', () => {
      const error = new Error('Authentication failed');
      expect(isRecoverableError(error)).toBe(false);
    });
  });
});
