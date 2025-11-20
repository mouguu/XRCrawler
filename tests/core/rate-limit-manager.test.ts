import { RateLimitManager } from '../../core/rate-limit-manager';
import { ScraperEventBus } from '../../core/event-bus';
import { Page } from 'puppeteer';

// Mock CookieManager
jest.mock('../../core/cookie-manager', () => ({
    CookieManager: jest.fn().mockImplementation(() => ({
        load: jest.fn().mockResolvedValue({
            cookies: [],
            username: 'testuser',
            source: 'test.json'
        }),
        injectIntoPage: jest.fn().mockResolvedValue(undefined)
    }))
}));

describe('RateLimitManager', () => {
    let rateLimitManager: RateLimitManager;
    let mockEventBus: ScraperEventBus;
    let mockPage: Partial<Page>;

    beforeEach(() => {
        mockEventBus = new ScraperEventBus();
        rateLimitManager = new RateLimitManager(mockEventBus);
        mockPage = {} as Page;
    });

    test('should detect rate limit errors', () => {
        const error = new Error('Navigation timeout exceeded');
        expect(rateLimitManager.isRateLimitError(error)).toBe(true);

        const normalError = new Error('Something else');
        expect(rateLimitManager.isRateLimitError(normalError)).toBe(false);
    });

    test('should handle rate limit with cookie rotation', async () => {
        const error = new Error('Rate limit exceeded');
        const result = await rateLimitManager.handleRateLimit(mockPage as Page, 0, error);
        expect(result).toBe(true);
    });
});
