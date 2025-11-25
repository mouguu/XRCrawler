
import { CookieManager } from '../../core/cookie-manager';
import * as fs from 'fs';
import * as path from 'path';
import { Page } from 'puppeteer';

// Mock fs.promises
jest.mock('fs', () => ({
    promises: {
        access: jest.fn(),
        readdir: jest.fn(),
        readFile: jest.fn(),
    },
}));

// Mock validation utils
jest.mock('../../utils/validation', () => ({
    validateEnvCookieData: jest.fn(),
}));

import * as validation from '../../utils/validation';

describe('CookieManager', () => {
    let cookieManager: CookieManager;
    const mockCookiesDir = '/mock/cookies';

    beforeEach(() => {
        jest.clearAllMocks();
        // Default mocks
        (fs.promises.access as jest.Mock).mockResolvedValue(undefined);
        (fs.promises.readdir as jest.Mock).mockResolvedValue([]);
        cookieManager = new CookieManager({ cookiesDir: mockCookiesDir });
    });

    describe('scanCookieFiles', () => {
        it('should return a list of json files in the directory', async () => {
            (fs.promises.readdir as jest.Mock).mockResolvedValue(['cookie1.json', 'cookie2.json', 'readme.txt']);
            
            const files = await cookieManager.scanCookieFiles();
            
            expect(files).toHaveLength(2);
            expect(files).toContain(path.join(mockCookiesDir, 'cookie1.json'));
            expect(files).toContain(path.join(mockCookiesDir, 'cookie2.json'));
        });

        it('should return empty list if directory access fails', async () => {
            (fs.promises.access as jest.Mock).mockRejectedValue(new Error('Not found'));
            
            const files = await cookieManager.scanCookieFiles();
            
            expect(files).toEqual([]);
        });
    });

    describe('getNextCookieFile', () => {
        it('should rotate through cookie files', async () => {
            (fs.promises.readdir as jest.Mock).mockResolvedValue(['cookie1.json', 'cookie2.json']);
            
            const file1 = await cookieManager.getNextCookieFile();
            const file2 = await cookieManager.getNextCookieFile();
            const file3 = await cookieManager.getNextCookieFile();
            
            expect(file1).toContain('cookie1.json');
            expect(file2).toContain('cookie2.json');
            expect(file3).toContain('cookie1.json'); // Rotated back
        });

        it('should respect excludePath', async () => {
            (fs.promises.readdir as jest.Mock).mockResolvedValue(['cookie1.json', 'cookie2.json']);
            
            const file1 = await cookieManager.getNextCookieFile();
            // Next should be cookie2.json normally.
            // If we exclude cookie2.json, it should skip to cookie1.json (if logic allows, or just pick next available)
            // The logic in code: while (current == exclude) rotate.
            
            // Let's reset index for clarity in test or just rely on state
            // Current index is 1 (pointing to cookie2) after first call? 
            // Actually getNextCookieFile increments index AFTER picking? 
            // Code: 
            // const cookieFile = this.cookieFiles[this.currentCookieIndex];
            // this.currentCookieIndex = (this.currentCookieIndex + 1) % length;
            // return cookieFile;
            
            // So call 1 returns index 0, sets index to 1.
            // Call 2 starts with index 1.
            
            // Let's re-instantiate to be sure
            cookieManager = new CookieManager({ cookiesDir: mockCookiesDir });
            (fs.promises.readdir as jest.Mock).mockResolvedValue(['cookie1.json', 'cookie2.json']);

            const first = await cookieManager.getNextCookieFile(); // returns cookie1, index -> 1
            expect(first).toContain('cookie1.json');

            // Now index is 1 (cookie2). If we exclude cookie2, it should skip it?
            // The code:
            // if (excludePath) { while (cookieFiles[index] == exclude) index++ }
            
            const second = await cookieManager.getNextCookieFile(path.join(mockCookiesDir, 'cookie2.json'));
            // Should skip cookie2 and go back to cookie1
            expect(second).toContain('cookie1.json');
        });
    });

    describe('loadFromFile', () => {
        it('should load and validate cookies from file', async () => {
            const mockCookieData = { cookies: [{ name: 'auth', value: '123' }] };
            (fs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockCookieData));
            (validation.validateEnvCookieData as jest.Mock).mockReturnValue({
                valid: true,
                cookies: mockCookieData.cookies,
                username: 'testuser'
            });

            const result = await cookieManager.loadFromFile('cookie.json');

            expect(result.cookies).toHaveLength(1);
            expect(result.username).toBe('testuser');
            expect(cookieManager.getCookies()).toEqual(mockCookieData.cookies);
        });

        it('should throw error if validation fails', async () => {
            (fs.promises.readFile as jest.Mock).mockResolvedValue('{}');
            (validation.validateEnvCookieData as jest.Mock).mockReturnValue({
                valid: false,
                error: 'Invalid format'
            });

            await expect(cookieManager.loadFromFile('cookie.json')).rejects.toThrow('Cookie validation failed');
        });
    });

    describe('injectIntoPage', () => {
        it('should set cookies on puppeteer page', async () => {
            const mockPage = {
                setCookie: jest.fn().mockResolvedValue(undefined),
            } as unknown as Page;

            // Manually set state
            const mockCookieData = { cookies: [{ name: 'auth', value: '123' }] };
            (fs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockCookieData));
            (validation.validateEnvCookieData as jest.Mock).mockReturnValue({
                valid: true,
                cookies: mockCookieData.cookies
            });
            
            await cookieManager.loadFromFile('cookie.json');
            await cookieManager.injectIntoPage(mockPage);

            expect(mockPage.setCookie).toHaveBeenCalledWith(mockCookieData.cookies[0]);
        });
    });
});
