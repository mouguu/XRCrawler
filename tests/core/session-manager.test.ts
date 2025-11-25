
import { SessionManager } from '../../core/session-manager';
import * as fs from 'fs';
import * as path from 'path';
import { CookieManager } from '../../core/cookie-manager';

// Mock fs
jest.mock('fs');

// Mock CookieManager
jest.mock('../../core/cookie-manager');

describe('SessionManager', () => {
    let sessionManager: SessionManager;
    const mockCookieDir = '/mock/cookies';

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset CookieManager mock implementation
        (CookieManager as jest.Mock).mockImplementation(() => ({
            loadFromFile: jest.fn().mockResolvedValue({
                cookies: [],
                username: 'user1',
                source: 'file.json'
            })
        }));
        
        sessionManager = new SessionManager(mockCookieDir);
    });

    describe('init', () => {
        it('should load sessions from cookie files', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readdirSync as jest.Mock).mockReturnValue(['session1.json', 'session2.json']);

            await sessionManager.init();

            // We can't access private 'sessions' directly, but we can check via getSessionById or hasActiveSession
            expect(sessionManager.hasActiveSession()).toBe(true);
            expect(sessionManager.getSessionById('session1')).toBeDefined();
            expect(sessionManager.getSessionById('session2')).toBeDefined();
        });

        it('should handle missing directory gracefully', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);
            
            await sessionManager.init();
            
            expect(sessionManager.hasActiveSession()).toBe(false);
        });
    });

    describe('getNextSession', () => {
        beforeEach(async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readdirSync as jest.Mock).mockReturnValue(['s1.json', 's2.json']);
            await sessionManager.init();
        });

        it('should return a session', () => {
            const session = sessionManager.getNextSession();
            expect(session).toBeDefined();
            expect(['s1', 's2']).toContain(session?.id);
        });

        it('should prioritize preferred session', () => {
            const session = sessionManager.getNextSession('s2.json');
            expect(session?.id).toBe('s2');
        });

        it('should exclude specified session', () => {
            // Assuming s1 is picked first by default sort (both 0 errors, 0 usage)
            // If we exclude s1, it should pick s2
            const session = sessionManager.getNextSession(undefined, 's1.json');
            expect(session?.id).toBe('s2');
        });

        it('should prioritize healthy sessions (fewer errors)', () => {
            // Manually modify state if possible, or use public methods to induce state
            sessionManager.markBad('s1'); // s1 has 1 error
            
            const session = sessionManager.getNextSession();
            // Should pick s2 because it has 0 errors
            expect(session?.id).toBe('s2');
        });
    });

    describe('Session Health', () => {
        beforeEach(async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readdirSync as jest.Mock).mockReturnValue(['s1.json']);
            await sessionManager.init();
        });

        it('should retire session after max errors', () => {
            const maxErrors = 3;
            for (let i = 0; i < maxErrors; i++) {
                sessionManager.markBad('s1');
            }

            expect(sessionManager.getSessionById('s1')?.isRetired).toBe(true);
            expect(sessionManager.hasActiveSession()).toBe(false);
        });

        it('should increment usage count on markGood', () => {
            sessionManager.markGood('s1');
            const session = sessionManager.getSessionById('s1');
            expect(session?.usageCount).toBe(1);
        });
    });
});
