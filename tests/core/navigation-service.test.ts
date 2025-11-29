/**
 * NavigationService 单元测试
 */

import { NavigationService } from '../../core/navigation-service';
import { ScraperEventBus } from '../../core/event-bus';
import { Page } from 'puppeteer';

// Mock puppeteer
jest.mock('puppeteer');

describe('NavigationService', () => {
  let service: NavigationService;
  let mockEventBus: jest.Mocked<ScraperEventBus>;
  let mockPage: jest.Mocked<Page>;

  beforeEach(() => {
    mockEventBus = {
      emitLog: jest.fn(),
      emitProgress: jest.fn(),
      emitPerformance: jest.fn(),
      on: jest.fn(),
      off: jest.fn()
    } as any;

    mockPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      waitForNavigation: jest.fn().mockResolvedValue(undefined),
      url: jest.fn().mockReturnValue('https://example.com'),
      evaluate: jest.fn().mockResolvedValue(undefined)
    } as any;

    service = new NavigationService(mockEventBus);
  });

  describe('navigateToUrl', () => {
    it('should navigate to URL', async () => {
      const result = await service.navigateToUrl(mockPage, 'https://example.com');
      
      expect(result).toBe(true);
      expect(mockPage.goto).toHaveBeenCalled();
    });

    it('should emit log on navigation error', async () => {
      mockPage.goto = jest.fn().mockRejectedValue(new Error('Navigation failed'));
      
      await expect(service.navigateToUrl(mockPage, 'https://example.com')).rejects.toThrow();
      
      expect(mockEventBus.emitLog).toHaveBeenCalled();
    });

    it('should handle navigation errors', async () => {
      mockPage.goto = jest.fn().mockRejectedValue(new Error('Navigation failed'));
      
      await expect(service.navigateToUrl(mockPage, 'https://example.com')).rejects.toThrow();
    });
  });

  describe('waitForTweets', () => {
    it('should wait for tweets selector', async () => {
      await service.waitForTweets(mockPage);
      
      expect(mockPage.waitForSelector).toHaveBeenCalled();
    });

    it('should handle timeout', async () => {
      mockPage.waitForSelector = jest.fn().mockRejectedValue(new Error('Timeout'));
      
      await expect(service.waitForTweets(mockPage, { timeout: 1000 })).rejects.toThrow();
    });
  });
});

