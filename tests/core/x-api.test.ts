import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Protocol } from 'puppeteer';
import { XApiClient } from '../../core/x-api';

// Create a mock Axios instance
const mockAxiosInstance = {
  get: mock(() => Promise.resolve({ status: 200, data: {} })),
  defaults: {
    headers: {
      common: {},
    },
  },
};

// Mock axios module
mock.module('axios', () => ({
  default: {
    create: () => mockAxiosInstance,
    isAxiosError: (err: any) => !!err.isAxiosError,
  },
}));

// Mock XClIdGen
mock.module('../../core/xclid', () => ({
  XClIdGen: {
    create: mock(() =>
      Promise.resolve({
        calc: mock(() => 'mock-xclid'),
      }),
    ),
  },
}));

describe('XApiClient', () => {
  let client: XApiClient;
  let mockCookies: Protocol.Network.CookieParam[];

  beforeEach(() => {
    mockCookies = [
      { name: 'auth_token', value: 'token123', domain: '.x.com' },
      { name: 'ct0', value: 'csrf123', domain: '.x.com' },
    ];
    // Reset mock
    mockAxiosInstance.get.mockClear();
    mockAxiosInstance.get.mockResolvedValue({ status: 200, data: {} });
    
  });
  
  beforeEach(() => {
    client = new XApiClient(mockCookies);
  });

  describe('constructor', () => {
    test('should initialize with cookies', () => {
      expect(client).toBeDefined();
    });
  });

  describe('getUserByScreenName', () => {
    test('should return user ID for valid screen name', async () => {
      const mockResponse = {
        data: {
          user: {
            result: {
              rest_id: '123456789',
            },
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      const userId = await client.getUserByScreenName('testuser');

      expect(userId).toBe('123456789');
      expect(mockAxiosInstance.get).toHaveBeenCalled();
    });

    test('should throw error for invalid screen name', async () => {
      const mockResponse = {
        data: {
          user: {
            result: null,
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      await expect(client.getUserByScreenName('invaliduser')).rejects.toThrow();
    });

    test('should handle API errors', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 401,
          statusText: 'Unauthorized'
        }
      });

      await expect(client.getUserByScreenName('testuser')).rejects.toThrow();
    });

    test('should handle network errors', async () => {
      // Setup persistent failure for retries
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      await expect(client.getUserByScreenName('testuser')).rejects.toThrow();
    }, 15000);
  });

  describe('getUserTweets', () => {
    test('should fetch user tweets', async () => {
      const mockResponse = {
        data: {
          user: {
            result: {
              timeline_v2: {
                timeline: {
                  instructions: [],
                },
              },
            },
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        status: 200,
        data: mockResponse,
      });

      const result = await client.getUserTweets('123456789', 20);

      expect(result).toBeDefined();
      expect(mockAxiosInstance.get).toHaveBeenCalled();
    });
  });
});
