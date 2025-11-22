import express, { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as scraper from './scrape-unified';
import eventBusInstance from './core/event-bus';
import { ScrapeProgressData, LogMessageData } from './core/event-bus';
import { getShouldStopScraping, resetShouldStopScraping, setShouldStopScraping } from './core/stop-signal';
import { isPathInsideBase } from './utils/path-utils';
import { apiKeyMiddleware } from './middleware/api-key';

const app = express();
const PORT = 3000;
// Align with utils/fileutils (dist/output) while keeping legacy root/output compatibility
const OUTPUT_ROOT = path.resolve(__dirname, 'output');
const LEGACY_OUTPUT_ROOT = path.resolve(process.cwd(), 'output');
const STATIC_DIR = path.resolve(process.cwd(), 'public');

// Global state for manual stop
let isScrapingActive = false;
let lastDownloadUrl: string | null = null;

// Middleware
app.use(express.json());
app.use(express.static(STATIC_DIR));
app.use('/api', apiKeyMiddleware);

function getSafePathInfo(resolvedPath: string): { identifier?: string; runTimestamp?: string; tweetCount?: number } {
    // Determine which output root this path belongs to
    const relPrimary = path.relative(OUTPUT_ROOT, resolvedPath);
    const relLegacy = path.relative(LEGACY_OUTPUT_ROOT, resolvedPath);

    let relPath = relPrimary.startsWith('..') ? relLegacy : relPrimary;
    if (relPath.startsWith('..')) return {};

    const parts = relPath.split(path.sep).filter(Boolean);
    // expected: platform / identifier / run-xxxx / file
    if (parts.length < 3) return {};

    const identifier = parts[1];
    const runId = parts[2];

    let runTimestamp: string | undefined;
    const match = runId.match(/run-(.+)/);
    if (match && match[1]) {
        runTimestamp = match[1];
    }

    // Try to read tweet count from sibling tweets.json
    try {
        const dir = path.dirname(resolvedPath);
        const tweetsJsonPath = path.join(dir, 'tweets.json');
        if (fs.existsSync(tweetsJsonPath)) {
            const data = JSON.parse(fs.readFileSync(tweetsJsonPath, 'utf-8'));
            if (Array.isArray(data)) {
                return { identifier, runTimestamp, tweetCount: data.length };
            }
        }
    } catch {
        // ignore parse errors
    }

    return { identifier, runTimestamp };
}

// API: Scrape
app.post('/api/scrape', async (req: Request, res: Response) => {
    try {
        const { type, input, limit = 50, likes = false, mergeResults = false, deleteMerged = false } = req.body;

        console.log(`Received scrape request: Type=${type}, Input=${input}, Limit=${limit}`);

        // Reset stop flag and set active state
        resetShouldStopScraping();
        isScrapingActive = true;
        lastDownloadUrl = null; // Clear previous result

        let result: any;

        if (type === 'profile') {
            // Profile Scrape
            const username = input.replace('@', '').replace('https://x.com/', '').replace('/', '');
            result = await scraper.scrapeXFeed({
                username,
                limit: parseInt(limit),
                scrapeLikes: likes,
                saveMarkdown: true,
                mergeResults,
                deleteMerged
            });

        } else if (type === 'thread') {
            // Thread Scrape
            result = await scraper.scrapeThread({
                tweetUrl: input,
                maxReplies: parseInt(limit),
                saveMarkdown: true
            });

        } else if (type === 'search') {
            // Search Scrape
            result = await scraper.scrapeSearch({
                query: input,
                limit: parseInt(limit),
                saveMarkdown: true,
                mergeResults,
                deleteMerged
            });
        } else {
            return res.status(400).json({ error: 'Invalid scrape type' });
        }

        if (result && result.success) {
            console.log('[DEBUG] Scrape result:', JSON.stringify({
                success: result.success,
                hasRunContext: !!result.runContext,
                hasTweets: !!result.tweets,
                tweetsCount: result.tweets?.length,
                runContextKeys: result.runContext ? Object.keys(result.runContext) : [],
                markdownIndexPath: result.runContext?.markdownIndexPath
            }, null, 2));

            const runContext = result.runContext;

            if (runContext && runContext.markdownIndexPath) {
                // Success
                const downloadUrl = `/api/download?path=${encodeURIComponent(runContext.markdownIndexPath)}`;
                lastDownloadUrl = downloadUrl; // Save for later retrieval
                console.log('[DEBUG] Sending success response with downloadUrl:', runContext.markdownIndexPath);
                return res.json({
                    success: true,
                    message: 'Scraping completed successfully!',
                    downloadUrl,
                    stats: {
                        count: result.tweets ? result.tweets.length : 0
                    }
                });
            } else {
                // No file path found
                console.error('[DEBUG] No markdownIndexPath found in runContext');
                return res.status(500).json({
                    success: false,
                    error: 'Scraping finished but output file not found.'
                });
            }

        } else {
            // Error
            console.error('Scraping failed:', result?.error || 'Unknown error');
            return res.status(500).json({
                success: false,
                error: result?.error || 'Scraping failed'
            });
        }

    } catch (error: any) {
        console.error('Server error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        // Reset scraping state
        isScrapingActive = false;
        resetShouldStopScraping();
    }
});

// API: Monitor
app.post('/api/monitor', async (req: Request, res: Response) => {
    try {
        const { users, lookbackHours, keywords } = req.body;
        if (!users || !Array.isArray(users) || users.length === 0) {
            return res.status(400).json({ error: 'Invalid users list' });
        }

        console.log(`Received monitor request for: ${users.join(', ')}`);

        isScrapingActive = true;
        resetShouldStopScraping();

        // Dynamic import to avoid circular dependencies or initialization issues
        const { ScraperEngine } = require('./core/scraper-engine');
        const { MonitorService } = require('./core/monitor-service');

        const engine = new ScraperEngine(() => getShouldStopScraping());
        await engine.init();
        const success = await engine.loadCookies();

        if (!success) {
            await engine.close();
            return res.status(500).json({ error: 'Failed to load cookies' });
        }

        const monitor = new MonitorService(engine);
        await monitor.runMonitor(users, {
            lookbackHours: lookbackHours ? parseFloat(lookbackHours) : undefined,
            keywords: keywords ? keywords.split(',').map((k: string) => k.trim()).filter(Boolean) : undefined
        });

        await engine.close();

        // Check for report file
        const dateStr = new Date().toISOString().split('T')[0];
        const reportPath = path.join(process.cwd(), 'output', 'reports', `daily_report_${dateStr}.md`);
        let downloadUrl = null;

        if (fs.existsSync(reportPath)) {
            downloadUrl = `/api/download?path=${encodeURIComponent(reportPath)}`;
        }

        res.json({
            success: true,
            message: 'Monitor run completed',
            downloadUrl
        });

    } catch (error: any) {
        console.error('Monitor error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        isScrapingActive = false;
        resetShouldStopScraping();
    }
});

// API: Manual Stop
app.post('/api/stop', (req: Request, res: Response) => {
    console.log('Received manual stop request');

    if (!isScrapingActive) {
        return res.json({
            success: false,
            message: 'No active scraping session'
        });
    }

    setShouldStopScraping(true);
    console.log('Stop flag set. Waiting for scraper to terminate gracefully...');

    res.json({
        success: true,
        message: 'Stop signal sent. Scraper will terminate after current batch.'
    });
});

// API: Progress Stream (SSE)
app.get('/api/progress', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Progress stream connected' })}\n\n`);

    // Listener for progress events
    const onProgress = (data: ScrapeProgressData) => {
        res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`);
    };

    const onLog = (data: LogMessageData) => {
        res.write(`data: ${JSON.stringify({ type: 'log', ...data })}\n\n`);
    };

    const onError = (error: Error) => {
        console.error('[Scraper Error]', error);
        res.write(`data: ${JSON.stringify({ type: 'log', level: 'error', message: error.message })}\n\n`);
    };

    eventBusInstance.on('scrape:progress', onProgress);
    eventBusInstance.on('log:message', onLog);
    eventBusInstance.on('scrape:error', onError);

    // Remove listeners on disconnect
    req.on('close', () => {
        eventBusInstance.off('scrape:progress', onProgress);
        eventBusInstance.off('log:message', onLog);
        eventBusInstance.off('scrape:error', onError);
        console.log('[SSE] Client disconnected');
    });
});

// Helper function to broadcast progress (Deprecated, kept for compatibility)
export function broadcastProgress(data: ScrapeProgressData): void {
    eventBusInstance.emitProgress(data);
}

// API: Get scraping status
app.get('/api/status', (req: Request, res: Response) => {
    res.json({
        isActive: isScrapingActive,
        shouldStop: getShouldStopScraping()
    });
});

// API: Get result (download URL after scraping completes)
app.get('/api/result', (req: Request, res: Response) => {
    res.json({
        isActive: isScrapingActive,
        downloadUrl: lastDownloadUrl
    });
});

// API: Download
app.get('/api/download', (req: Request, res: Response) => {
    const filePathParam = typeof req.query.path === 'string' ? req.query.path : '';
    const resolvedPath = path.resolve(filePathParam);

    const inPrimary = isPathInsideBase(resolvedPath, OUTPUT_ROOT);
    const inLegacy = isPathInsideBase(resolvedPath, LEGACY_OUTPUT_ROOT);

    if (!filePathParam || (!inPrimary && !inLegacy)) {
        return res.status(400).send('Invalid file path');
    }

    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).send('File not found');
    }

    // Generate a better filename
    const basename = path.basename(resolvedPath);

    let downloadName = basename;
    if (basename === 'tweets.md' || basename === 'index.md') {
        const { identifier, runTimestamp, tweetCount } = getSafePathInfo(resolvedPath);
        const timestamp = runTimestamp || new Date().toISOString().split('T')[0];
        const countSegment = typeof tweetCount === 'number' ? `-${tweetCount}tweets` : '';
        const idSegment = identifier || 'twitter';
        downloadName = `${idSegment}-timeline-${timestamp}${countSegment}.md`;
    }

    res.download(resolvedPath, downloadName);
});

// Frontend entry (allows visiting "/" directly). Exclude /api routes.
app.get(/^(?!\/api).*/, (req: Request, res: Response) => {
    const indexPath = path.join(STATIC_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }
    res.status(404).send('Not found');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
