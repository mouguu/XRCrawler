import { NavigationService } from '../../core/navigation-service';
import { ScraperEventBus } from '../../core/event-bus';
import { Page } from 'puppeteer';
import * as dataExtractor from '../../core/data-extractor';

// Mock puppeteer
jest.mock('puppeteer');

// Mock data-extractor
jest.mock('../../core/data-extractor', () => ({
  X_SELECTORS: { TWEET: '[data-testid="tweet"]' },
  detectNoResultsPage: jest.fn(),
  detectErrorPage: jest.fn(),
  recoverFromErrorPage: jest.fn()
}));

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
      evaluate: jest.fn().mockResolvedValue(undefined),
      $: jest.fn().mockResolvedValue({ textContent: 'tweet' }) // Mock tweet element found
    } as any;

    service = new NavigationService(mockEventBus);

    // Reset all mocks before each test
    jest.clearAllMocks();
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
    it('should return true when tweets are found', async () => {
      mockPage.$ = jest.fn().mockResolvedValue({ textContent: 'tweet' }); // Tweets found
      (dataExtractor.detectNoResultsPage as jest.Mock).mockResolvedValue(false);
      (dataExtractor.detectErrorPage as jest.Mock).mockResolvedValue(false);
      
      const result = await service.waitForTweets(mockPage);
      
      expect(result).toBe(true);
      expect(mockPage.$).toHaveBeenCalled();
    });

    it('should return false when no results page is detected', async () => {
      mockPage.$ = jest.fn().mockResolvedValue(null); // No tweets
      (dataExtractor.detectNoResultsPage as jest.Mock).mockResolvedValue(true); // No results detected
      (dataExtractor.detectErrorPage as jest.Mock).mockResolvedValue(false);
      
      const result = await service.waitForTweets(mockPage);
      
      expect(result).toBe(false);
      expect(dataExtractor.detectNoResultsPage).toHaveBeenCalled();
    });

    it('should timeout if neither tweets nor empty state is found', async () => {
      mockPage.$ = jest.fn().mockResolvedValue(null); // Always return null
      (dataExtractor.detectNoResultsPage as jest.Mock).mockResolvedValue(false);
      (dataExtractor.detectErrorPage as jest.Mock).mockResolvedValue(false);
      
      await expect(service.waitForTweets(mockPage, { timeout: 1000 })).rejects.toThrow();
    });
  });
});

