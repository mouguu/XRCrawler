const express = require('express');
const path = require('path');
const fs = require('fs');
const scraper = require('./scrape-unified');

const app = express();
const PORT = 3000;

// Global state for manual stop
let isScrapingActive = false;
let shouldStopScraping = false;
let currentScrapingData = null;
let progressClients = []; // SSE clients for progress updates

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Scrape
app.post('/api/scrape', async (req, res) => {
    try {
        const { type, input, limit = 50, likes = false, mergeResults = false, deleteMerged = false, clearCache = false } = req.body;

        console.log(`Received scrape request: Type=${type}, Input=${input}, Limit=${limit}, ClearCache=${clearCache}`);

        // Handle cache clearing for specific target
        if (clearCache) {
            // fs and path are already required at the top, but keeping these here as per instruction
            const fs = require('fs');
            const path = require('path');

            // Extract username from input
            let targetIdentifier = input;
            if (input.includes('x.com/') || input.includes('twitter.com/')) {
                const urlMatch = input.match(/(?:x\.com|twitter\.com)\/([^/\?]+)/);
                if (urlMatch) targetIdentifier = urlMatch[1];
            }

            // Remove status URL part if it's a thread
            if (targetIdentifier.includes('/status/')) {
                targetIdentifier = targetIdentifier.split('/status/')[0];
            }

            const cacheFile = path.join(__dirname, '.cache', `${targetIdentifier}.json`);

            if (fs.existsSync(cacheFile)) {
                fs.unlinkSync(cacheFile);
                console.log(`[Cache] Cleared cache for: ${targetIdentifier}`);
            } else {
                console.log(`[Cache] No cache file found for: ${targetIdentifier}`);
            }
        }

        // Reset stop flag and set active state
        shouldStopScraping = false;
        isScrapingActive = true;
        currentScrapingData = null;

        let result;

        if (type === 'profile') {
            // Profile Scrape
            const username = input.replace('@', '').replace('https://x.com/', '').replace('/', '');
            result = await scraper.scrapeXFeed({
                username,
                limit: parseInt(limit),
                scrapeLikes: likes,
                saveMarkdown: true,
                mergeResults,
                deleteMerged,
                clearCache  // ← 添加 clearCache 参数
            });
            // scrapeXFeed returns an array of results (one per user)
            if (Array.isArray(result) && result.length > 0) {
                result = result[0]; // Take the first result
            }

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

        if (result && (result.success || (Array.isArray(result) && result.length > 0))) {
            // Determine the output file path
            // The scraper logic puts files in ./output/twitter/<id>/run-XXX/
            // We need to find the generated markdown file to send back to the frontend

            console.log('[DEBUG] Scrape result:', JSON.stringify({
                success: result.success,
                hasRunContext: !!result.runContext,
                hasTweets: !!result.tweets,
                tweetsCount: result.tweets?.length,
                runContextKeys: result.runContext ? Object.keys(result.runContext) : [],
                markdownIndexPath: result.runContext?.markdownIndexPath
            }, null, 2));

            let runContext = result.runContext;
            // For profile scrape, result is an object inside an array
            if (!runContext && result.tweets) {
                // It might be the object itself
                runContext = result.runContext;
            }

            if (runContext && runContext.markdownIndexPath) {
                // Success
                console.log('[DEBUG] Sending success response with downloadUrl:', runContext.markdownIndexPath);
                return res.json({
                    success: true,
                    message: 'Scraping completed successfully!',
                    downloadUrl: `/api/download?path=${encodeURIComponent(runContext.markdownIndexPath)}`,
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
            console.error('Scraping failed:', result.error || 'Unknown error');
            return res.status(500).json({
                success: false,
                error: result.error || 'Scraping failed'
            });
        }

    } catch (error) {
        console.error('Server error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        // Reset scraping state
        isScrapingActive = false;
        shouldStopScraping = false;
    }
});

// API: Manual Stop
app.post('/api/stop', (req, res) => {
    console.log('Received manual stop request');

    if (!isScrapingActive) {
        return res.json({
            success: false,
            message: 'No active scraping session'
        });
    }

    shouldStopScraping = true;
    console.log('Stop flag set. Waiting for scraper to terminate gracefully...');

    res.json({
        success: true,
        message: 'Stop signal sent. Scraper will terminate after current batch.'
    });
});

// API: Progress Stream (SSE)
app.get('/api/progress', (req, res) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Add client to tracking list
    progressClients.push(res);
    console.log(`[SSE] Client connected. Total clients: ${progressClients.length}`);

    // Send initial message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Progress stream connected' })}\n\n`);

    // Remove client on disconnect
    req.on('close', () => {
        progressClients = progressClients.filter(client => client !== res);
        console.log(`[SSE] Client disconnected. Total clients: ${progressClients.length}`);
    });
});

// Helper function to broadcast progress
function broadcastProgress(data) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    progressClients.forEach(client => {
        try {
            client.write(message);
        } catch (error) {
            console.error('[SSE] Error sending to client:', error.message);
        }
    });
}

// Export for use in scraper
module.exports.broadcastProgress = broadcastProgress;

// API: Get scraping status
app.get('/api/status', (req, res) => {
    res.json({
        isActive: isScrapingActive,
        shouldStop: shouldStopScraping
    });
});

// API: Download
app.get('/api/download', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    // Generate a better filename
    const basename = path.basename(filePath);
    // If it's a merged file, it already has a good name (merged-x-date-time.md)
    // But user wants to avoid "index".
    // If the file is "tweets.md" (default from saveTweetsAsMarkdown), we should rename it.

    let downloadName = basename;
    if (basename === 'tweets.md' || basename === 'index.md') {
        const timestamp = new Date().toISOString().split('T')[0];
        downloadName = `twitter-scrape-${timestamp}.md`;
    }

    res.download(filePath, downloadName);
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

// Export stop flag for scraper to check
module.exports = {
    getShouldStopScraping: () => shouldStopScraping
};
