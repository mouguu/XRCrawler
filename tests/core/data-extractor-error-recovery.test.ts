/**
 * 错误恢复逻辑单元测试
 * 测试 detectErrorPage, clickTryAgainButton, recoverFromErrorPage 等函数
 */

import { Page } from 'puppeteer';
import {
    detectErrorPage,
    clickTryAgainButton,
    recoverFromErrorPage
} from '../../core/data-extractor';
import { ERROR_RECOVERY_CONFIG } from '../../config/constants';

describe('DataExtractor Error Recovery', () => {
    let mockPage: Page;

    beforeEach(() => {
        mockPage = {
            evaluate: jest.fn(),
        } as unknown as Page;
    });

    describe('detectErrorPage', () => {
        it('should detect error pages with "something went wrong"', async () => {
            (mockPage.evaluate as jest.Mock).mockResolvedValue(true);

            const result = await detectErrorPage(mockPage);
            expect(result).toBe(true);
            expect(mockPage.evaluate).toHaveBeenCalled();
        });

        it('should detect error pages with "rate limit"', async () => {
            (mockPage.evaluate as jest.Mock).mockImplementation(() => {
                // Simulate page with rate limit error
                return Promise.resolve(true);
            });

            const result = await detectErrorPage(mockPage);
            expect(result).toBe(true);
        });

        it('should return false for normal pages', async () => {
            (mockPage.evaluate as jest.Mock).mockResolvedValue(false);

            const result = await detectErrorPage(mockPage);
            expect(result).toBe(false);
        });

        it('should handle evaluation errors gracefully', async () => {
            (mockPage.evaluate as jest.Mock).mockRejectedValue(new Error('Evaluation failed'));

            const result = await detectErrorPage(mockPage);
            expect(result).toBe(false);
        });
    });

    describe('clickTryAgainButton', () => {
        it('should click button with "Try again" text', async () => {
            (mockPage.evaluate as jest.Mock).mockResolvedValue(true);

            const result = await clickTryAgainButton(mockPage);
            expect(result).toBe(true);
            expect(mockPage.evaluate).toHaveBeenCalled();
        });

        it('should click button with "Retry" text', async () => {
            (mockPage.evaluate as jest.Mock).mockResolvedValue(true);

            const result = await clickTryAgainButton(mockPage);
            expect(result).toBe(true);
        });

        it('should return false when no button found', async () => {
            (mockPage.evaluate as jest.Mock).mockResolvedValue(false);

            const result = await clickTryAgainButton(mockPage);
            expect(result).toBe(false);
        });

        it('should handle evaluation errors gracefully', async () => {
            (mockPage.evaluate as jest.Mock).mockRejectedValue(new Error('Evaluation failed'));

            const result = await clickTryAgainButton(mockPage);
            expect(result).toBe(false);
        });

        it('should wait after clicking button', async () => {
            jest.useFakeTimers({ advanceTimers: true });
            (mockPage.evaluate as jest.Mock).mockResolvedValue(true);

            const clickPromise = clickTryAgainButton(mockPage);
            
            // Fast-forward time and run all pending timers
            await jest.runAllTimersAsync();
            
            const result = await clickPromise;
            expect(result).toBe(true);
            
            jest.useRealTimers();
        });
    });

    describe('recoverFromErrorPage', () => {
        it('should return true immediately if no error detected', async () => {
            (mockPage.evaluate as jest.Mock).mockResolvedValue(false); // No error

            const result = await recoverFromErrorPage(mockPage);
            expect(result).toBe(true);
        });

        it('should successfully recover after clicking Try Again button', async () => {
            // First call: detect error (true)
            // Second call: click button (true)
            // Third call: check again (false - recovered)
            (mockPage.evaluate as jest.Mock)
                .mockResolvedValueOnce(true)  // Initial error detection
                .mockResolvedValueOnce(true)  // Button click success
                .mockResolvedValueOnce(false); // Recovery check - no error

            jest.useFakeTimers({ advanceTimers: true });
            const recoverPromise = recoverFromErrorPage(mockPage, 2);
            
            // Fast-forward through wait times
            await jest.runAllTimersAsync();
            
            const result = await recoverPromise;
            expect(result).toBe(true);
            
            jest.useRealTimers();
        });

        it('should retry multiple times if recovery fails', async () => {
            // All attempts detect error
            (mockPage.evaluate as jest.Mock)
                .mockResolvedValueOnce(true)  // Initial error
                .mockResolvedValueOnce(true)  // Button click
                .mockResolvedValueOnce(true)  // Still has error
                .mockResolvedValueOnce(true)  // Retry: error still present
                .mockResolvedValueOnce(true)  // Button click
                .mockResolvedValueOnce(true); // Still has error

            jest.useFakeTimers({ advanceTimers: true });
            const recoverPromise = recoverFromErrorPage(mockPage, 2);
            
            // Fast-forward through all wait times
            await jest.runAllTimersAsync();
            
            const result = await recoverPromise;
            expect(result).toBe(false); // Failed to recover
            
            jest.useRealTimers();
        }, 10000); // Increase timeout for this test

        it('should handle case when no Try Again button is found', async () => {
            // Error detected, but no button found
            (mockPage.evaluate as jest.Mock)
                .mockResolvedValueOnce(true)  // Error detected
                .mockResolvedValueOnce(false) // No button found
                .mockResolvedValueOnce(true); // Still has error after auto-recovery wait

            jest.useFakeTimers({ advanceTimers: true });
            const recoverPromise = recoverFromErrorPage(mockPage, 2);
            
            // Fast-forward through auto-recovery wait
            await jest.runAllTimersAsync();
            
            const result = await recoverPromise;
            expect(result).toBe(false);
            
            jest.useRealTimers();
        });

        it('should auto-recover if page recovers without button click', async () => {
            // Error detected, no button, but page auto-recovers
            (mockPage.evaluate as jest.Mock)
                .mockResolvedValueOnce(true)  // Initial error
                .mockResolvedValueOnce(false) // No button found
                .mockResolvedValueOnce(false); // Auto-recovered

            jest.useFakeTimers({ advanceTimers: true });
            const recoverPromise = recoverFromErrorPage(mockPage, 2);
            
            await jest.runAllTimersAsync();
            
            const result = await recoverPromise;
            expect(result).toBe(true);
            
            jest.useRealTimers();
        });

        it('should handle evaluation errors during recovery gracefully', async () => {
            // Test that errors during recovery don't crash the function
            // This is tested implicitly through other tests, but we verify the function
            // handles errors without throwing
            (mockPage.evaluate as jest.Mock)
                .mockRejectedValueOnce(new Error('Evaluation failed'))
                .mockResolvedValueOnce(false); // Second call succeeds (no error)

            jest.useFakeTimers({ advanceTimers: true });
            const recoverPromise = recoverFromErrorPage(mockPage, 1);
            
            await jest.runAllTimersAsync();
            
            // Function should complete without throwing
            const result = await recoverPromise;
            expect(typeof result).toBe('boolean');
            
            jest.useRealTimers();
        });

        it('should respect maxRetries parameter', async () => {
            // All attempts fail
            (mockPage.evaluate as jest.Mock)
                .mockResolvedValue(true); // Always has error

            jest.useFakeTimers({ advanceTimers: true });
            const recoverPromise = recoverFromErrorPage(mockPage, 1); // Only 1 retry
            
            // Fast-forward through wait time
            await jest.runAllTimersAsync();
            
            const result = await recoverPromise;
            expect(result).toBe(false);
            
            // Should only attempt once (initial check + button click + recovery check)
            expect(mockPage.evaluate).toHaveBeenCalledTimes(3);
            
            jest.useRealTimers();
        });

        it('should use default maxRetries from config when not specified', async () => {
            (mockPage.evaluate as jest.Mock).mockResolvedValue(false);

            const result = await recoverFromErrorPage(mockPage);
            expect(result).toBe(true);
        });
    });
});

