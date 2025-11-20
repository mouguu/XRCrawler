"use strict";
/**
 * Twitter/X Scraper Module (Refactored)
 * Delegates to ScraperEngine
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeXFeed = scrapeXFeed;
exports.scrapeSearch = scrapeSearch;
exports.scrapeThread = scrapeThread;
const scraper_engine_1 = require("./core/scraper-engine");
const server_1 = require("./server");
async function scrapeXFeed(options = {}) {
    const engine = new scraper_engine_1.ScraperEngine(server_1.getShouldStopScraping);
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
    }
    catch (error) {
        console.error('Scrape failed:', error);
        return { success: false, tweets: [], error: error.message };
    }
    finally {
        await engine.close();
    }
}
async function scrapeSearch(options) {
    const engine = new scraper_engine_1.ScraperEngine(server_1.getShouldStopScraping);
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
    }
    catch (error) {
        console.error('Search scrape failed:', error);
        return { success: false, tweets: [], error: error.message };
    }
    finally {
        await engine.close();
    }
}
async function scrapeThread(options) {
    const engine = new scraper_engine_1.ScraperEngine(server_1.getShouldStopScraping);
    try {
        await engine.init();
        const cookiesLoaded = await engine.loadCookies();
        if (!cookiesLoaded) {
            throw new Error('Failed to load cookies');
        }
        return await engine.scrapeThread(options);
    }
    catch (error) {
        console.error('Thread scrape failed:', error);
        return { success: false, tweets: [], error: error.message };
    }
    finally {
        await engine.close();
    }
}
