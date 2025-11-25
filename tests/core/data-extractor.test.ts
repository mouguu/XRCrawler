
import { parseCount, extractProfileInfo, extractTweetsFromPage, X_SELECTORS } from '../../core/data-extractor';
import { Page } from 'puppeteer';

describe('DataExtractor', () => {
    describe('parseCount', () => {
        it('should parse simple numbers', () => {
            expect(parseCount('123')).toBe(123);
            expect(parseCount('1,234')).toBe(1234);
        });

        it('should parse K suffix', () => {
            expect(parseCount('1.5K')).toBe(1500);
            expect(parseCount('10k')).toBe(10000);
        });

        it('should parse M suffix', () => {
            expect(parseCount('1.2M')).toBe(1200000);
            expect(parseCount('5m')).toBe(5000000);
        });

        it('should handle invalid input', () => {
            expect(parseCount(null)).toBe(0);
            expect(parseCount(undefined)).toBe(0);
            expect(parseCount('abc')).toBe(0);
        });
    });

    describe('extractProfileInfo', () => {
        let mockPage: Page;

        beforeEach(() => {
            mockPage = {
                evaluate: jest.fn(),
            } as unknown as Page;
        });

        it('should extract profile info successfully', async () => {
            const mockProfile = {
                displayName: 'Test User',
                handle: 'testuser',
                followers: 1000
            };
            (mockPage.evaluate as jest.Mock).mockResolvedValue(mockProfile);

            const result = await extractProfileInfo(mockPage);
            expect(result).toEqual(mockProfile);
        });

        it('should handle errors gracefully', async () => {
            (mockPage.evaluate as jest.Mock).mockRejectedValue(new Error('Evaluation failed'));
            
            // Should catch error and return null
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const result = await extractProfileInfo(mockPage);
            
            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('extractTweetsFromPage', () => {
        let mockPage: Page;

        beforeEach(() => {
            mockPage = {
                evaluate: jest.fn(),
            } as unknown as Page;
        });

        it('should extract tweets using correct selectors', async () => {
            const mockTweets = [
                { id: '1', text: 'Hello', author: 'user1' }
            ];
            (mockPage.evaluate as jest.Mock).mockImplementation((fn, selectors) => {
                // We can't execute the real browser function here easily without JSDOM
                // So we just verify selectors are passed correctly
                return Promise.resolve(mockTweets);
            });

            const result = await extractTweetsFromPage(mockPage);
            
            expect(result).toEqual(mockTweets);
            expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function), X_SELECTORS);
        });

        it('should return empty array on failure', async () => {
            (mockPage.evaluate as jest.Mock).mockRejectedValue(new Error('Failed'));
            
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const result = await extractTweetsFromPage(mockPage);
            
            expect(result).toEqual([]);
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });
});
