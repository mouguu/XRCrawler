"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rate_limit_manager_1 = require("../../core/rate-limit-manager");
const event_bus_1 = require("../../core/event-bus");
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
    let rateLimitManager;
    let mockEventBus;
    let mockPage;
    beforeEach(() => {
        mockEventBus = new event_bus_1.ScraperEventBus();
        rateLimitManager = new rate_limit_manager_1.RateLimitManager(mockEventBus);
        mockPage = {};
    });
    test('should detect rate limit errors', () => {
        const error = new Error('Navigation timeout exceeded');
        expect(rateLimitManager.isRateLimitError(error)).toBe(true);
        const normalError = new Error('Something else');
        expect(rateLimitManager.isRateLimitError(normalError)).toBe(false);
    });
    test('should handle rate limit with cookie rotation', async () => {
        const error = new Error('Rate limit exceeded');
        const result = await rateLimitManager.handleRateLimit(mockPage, 0, error);
        expect(result).toBe(true);
    });
});
