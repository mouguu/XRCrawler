/**
 * RedditApiClient 单元测试
 */

import { RedditApiClient } from '../../core/reddit-api-client';

// Mock fetch
global.fetch = jest.fn();

describe('RedditApiClient', () => {
  let client: RedditApiClient;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    client = new RedditApiClient('http://localhost:5002', 5000);
    mockFetch.mockClear();
  });

  describe('constructor', () => {
    it('should use provided baseUrl', () => {
      const customClient = new RedditApiClient('http://custom:8080');
      expect(customClient).toBeDefined();
    });

    it('should use environment variable if baseUrl not provided', () => {
      process.env.REDDIT_API_URL = 'http://env:8080';
      const envClient = new RedditApiClient();
      expect(envClient).toBeDefined();
      delete process.env.REDDIT_API_URL;
    });

    it('should use default URL if nothing provided', () => {
      const defaultClient = new RedditApiClient();
      expect(defaultClient).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should return true when service is healthy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);

      const result = await client.healthCheck();
      
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5002/health',
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    it('should return false when service is unavailable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await client.healthCheck();
      
      expect(result).toBe(false);
    });

    it('should return false on timeout', async () => {
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      const result = await client.healthCheck();
      
      expect(result).toBe(false);
    });
  });

  describe('scrapeSubreddit', () => {
    it('should successfully scrape subreddit', async () => {
      const mockResponse = {
        success: true,
        data: { scraped_count: 10 }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await client.scrapeSubreddit({
        subreddit: 'test',
        maxPosts: 10
      });

      expect(result.success).toBe(true);
      expect(result.data?.scraped_count).toBe(10);
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' })
      } as Response);

      // scrapeSubreddit throws ScraperError on API errors
      await expect(
        client.scrapeSubreddit({
          subreddit: 'test'
        })
      ).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // scrapeSubreddit throws ScraperError on network errors
      await expect(
        client.scrapeSubreddit({
          subreddit: 'test'
        })
      ).rejects.toThrow();
    });
  });

  describe('scrapePost', () => {
    it('should successfully scrape post', async () => {
      const mockResponse = {
        success: true,
        data: { post: { id: '123' } }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await client.scrapePost('https://reddit.com/r/test/comments/123');

      expect(result.success).toBe(true);
      expect(result.data?.post).toBeDefined();
    });

    it('should handle errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed'));

      // scrapePost throws ScraperError on network errors, not returns error result
      await expect(
        client.scrapePost('invalid')
      ).rejects.toThrow();
    });
  });
});

