/**
 * XApiClient 单元测试
 */

import { XApiClient } from '../../core/x-api';
import { Protocol } from 'puppeteer';
import { ScraperErrors } from '../../core/errors';

// Mock fetch
global.fetch = jest.fn();

// Mock XClIdGen
jest.mock('../../core/xclid', () => ({
  XClIdGen: {
    create: jest.fn().mockResolvedValue({
      calc: jest.fn().mockReturnValue('mock-xclid')
    })
  }
}));

describe('XApiClient', () => {
  let client: XApiClient;
  let mockCookies: Protocol.Network.CookieParam[];
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockCookies = [
      { name: 'auth_token', value: 'token123', domain: '.x.com' },
      { name: 'ct0', value: 'csrf123', domain: '.x.com' }
    ];
    client = new XApiClient(mockCookies);
    mockFetch.mockClear();
  });

  describe('constructor', () => {
    it('should initialize with cookies', () => {
      expect(client).toBeDefined();
    });

    it('should build headers from cookies', () => {
      const client = new XApiClient(mockCookies);
      expect(client).toBeDefined();
    });
  });

  describe('getUserByScreenName', () => {
    it('should return user ID for valid screen name', async () => {
      const mockResponse = {
        data: {
          user: {
            result: {
              rest_id: '123456789'
            }
          }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const userId = await client.getUserByScreenName('testuser');

      expect(userId).toBe('123456789');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should throw error for invalid screen name', async () => {
      const mockResponse = {
        data: {
          user: {
            result: null
          }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);

      await expect(
        client.getUserByScreenName('invaliduser')
      ).rejects.toThrow();
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      } as Response);

      await expect(
        client.getUserByScreenName('testuser')
      ).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        client.getUserByScreenName('testuser')
      ).rejects.toThrow();
    });
  });

  describe('getUserTweets', () => {
    it('should fetch user tweets', async () => {
      const mockResponse = {
        data: {
          user: {
            result: {
              timeline_v2: {
                timeline: {
                  instructions: []
                }
              }
            }
          }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await client.getUserTweets('123456789', 20);

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should include cursor for pagination', async () => {
      const mockResponse = { data: {} };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);

      await client.getUserTweets('123456789', 20, 'cursor123');

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0] as string;
      expect(url).toContain('cursor123');
    });
  });

  describe('searchTweets', () => {
    it('should search tweets with query', async () => {
      const mockResponse = {
        data: {
          search_by_raw_query: {
            search_timeline: {
              timeline: {
                instructions: []
              }
            }
          }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await client.searchTweets('test query', 20);

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should include cursor for pagination', async () => {
      const mockResponse = { data: {} };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);

      await client.searchTweets('test', 20, 'cursor123');

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('getTweetDetail', () => {
    it('should fetch tweet detail', async () => {
      const mockResponse = {
        data: {
          threaded_conversation_with_injections_v2: {
            instructions: []
          }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await client.getTweetDetail('tweet123');

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should include cursor for pagination', async () => {
      const mockResponse = { data: {} };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);

      await client.getTweetDetail('tweet123', 'cursor123');

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('rate limit handling', () => {
    it('should throw rate limit error on 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429
      } as Response);

      await expect(
        client.getUserTweets('123456789')
      ).rejects.toThrow();
    });
  });

  describe('authentication handling', () => {
    it('should throw auth error on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      } as Response);

      await expect(
        client.getUserTweets('123456789')
      ).rejects.toThrow();
    });

    it('should throw auth error on 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403
      } as Response);

      await expect(
        client.getUserTweets('123456789')
      ).rejects.toThrow();
    });
  });
});

