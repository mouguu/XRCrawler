import * as path from 'path';
import { Page } from 'puppeteer';
import { CookieManager } from './cookie-manager';
import { ScraperEventBus } from './event-bus';

const throttle = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export class RateLimitManager {
    private eventBus: ScraperEventBus | undefined;
    private cookieManager: CookieManager;
    private maxRotationAttempts: number;

    constructor(eventBus?: ScraperEventBus) {
        this.eventBus = eventBus;
        this.cookieManager = new CookieManager();
        this.maxRotationAttempts = 3;
    }

    async handleRateLimit(page: Page, currentAttempt: number, error: Error, currentSessionId?: string): Promise<boolean> {
        if (currentAttempt >= this.maxRotationAttempts) {
            this._log(`Rate limit handling failed after ${currentAttempt} attempts: ${error.message}`, 'error');
            return false;
        }

        this._log(`⚠️ Rate limit detected! Rotating to next cookie account (attempt ${currentAttempt + 1}/${this.maxRotationAttempts})...`, 'warn');

        try {
            // Create a new instance to ensure fresh state or use existing one if designed to handle rotation
            // Assuming CookieManager has logic to pick a *different* cookie or we need to implement that logic.
            // For now, we'll reload and inject. In a real scenario, CookieManager should track used cookies.
            // The original code just did `new CookieManager().load()`.

            const newCookieManager = new CookieManager();
            let cookieData = await newCookieManager.load(); // This needs to be smart enough to load a *different* one if possible, or just next one

            // If we picked the same cookie as current, try the next one (avoid rotating to self)
            if (currentSessionId && cookieData.source && cookieData.source.includes(currentSessionId)) {
                this._log(`Selected same session (${currentSessionId}), trying next cookie...`, 'warn');
                cookieData = await newCookieManager.load();
            }

            await newCookieManager.injectIntoPage(page);
            this._log(`✅ Switched to cookie: ${path.basename(cookieData.source || 'unknown')}`);

            await throttle(2000);
            return true;
        } catch (err: any) {
            this._log(`Failed to rotate cookie: ${err.message}`, 'error');
            return false;
        }
    }

    isRateLimitError(error: Error): boolean {
        const msg = error.message || '';
        return msg.includes('Waiting failed') ||
            msg.includes('timeout') ||
            msg.includes('exceeded') ||
            msg.includes('Waiting for selector') ||
            msg.includes('Navigation timeout');
    }

    private _log(message: string, level: string = 'info'): void {
        if (this.eventBus) {
            this.eventBus.emitLog(message, level);
        } else {
            console.log(`[RateLimitManager] ${message}`);
        }
    }
}
