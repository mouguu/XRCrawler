/**
 * Twitter/X Scraper Module (Refactored)
 * Delegates to ScraperEngine
 */

import { ScraperEngine, ScrapeTimelineConfig, ScrapeTimelineResult, ScrapeThreadOptions, ScrapeThreadResult } from './core/scraper-engine';
import { getShouldStopScraping } from './server';

export interface ScrapeXFeedOptions extends Omit<ScrapeTimelineConfig, 'mode'> {
    scrapeLikes?: boolean;
    mergeResults?: boolean;
    deleteMerged?: boolean;
    clearCache?: boolean;
}

export interface ScrapeSearchOptions extends Omit<ScrapeTimelineConfig, 'mode' | 'searchQuery'> {
    query: string;
    mergeResults?: boolean;
    deleteMerged?: boolean;
}

export async function scrapeXFeed(options: ScrapeXFeedOptions = {}): Promise<ScrapeTimelineResult> {
    const engine = new ScraperEngine(getShouldStopScraping);
    try {
        await engine.init();
        const cookiesLoaded = await engine.loadCookies();
        if (!cookiesLoaded) {
            throw new Error('Failed to load cookies');
        }
        return await engine.scrapeTimeline({
            ...options,
            mode: 'timeline'
        });
    } catch (error: any) {
        console.error('Scrape failed:', error);
        return { success: false, tweets: [], error: error.message };
    } finally {
        await engine.close();
    }
}

export async function scrapeSearch(options: ScrapeSearchOptions): Promise<ScrapeTimelineResult> {
    const engine = new ScraperEngine(getShouldStopScraping);
    try {
        await engine.init();
        const cookiesLoaded = await engine.loadCookies();
        if (!cookiesLoaded) {
            throw new Error('Failed to load cookies');
        }
        return await engine.scrapeTimeline({
            ...options,
            mode: 'search',
            searchQuery: options.query
        });
    } catch (error: any) {
        console.error('Search scrape failed:', error);
        return { success: false, tweets: [], error: error.message };
    } finally {
        await engine.close();
    }
}

export async function scrapeThread(options: ScrapeThreadOptions): Promise<ScrapeThreadResult> {
    const engine = new ScraperEngine(getShouldStopScraping);
    try {
        await engine.init();
        const cookiesLoaded = await engine.loadCookies();
        if (!cookiesLoaded) {
            throw new Error('Failed to load cookies');
        }
        return await engine.scrapeThread(options);
    } catch (error: any) {
        console.error('Thread scrape failed:', error);
        return { success: false, tweets: [], error: error.message };
    } finally {
        await engine.close();
    }
}
