const express = require('express');
const path = require('path');
const fs = require('fs');
const scraper = require('./scrape-unified');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Scrape
app.post('/api/scrape', async (req, res) => {
    const { type, input, limit = 50, likes = false, mergeResults = false, deleteMerged = false } = req.body;

    console.log(`Received scrape request: Type=${type}, Input=${input}, Limit=${limit}`);

    try {
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
                deleteMerged
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

            let runContext = result.runContext;
            // For profile scrape, result is an object inside an array
            if (!runContext && result.tweets) {
                // It might be the object itself
                runContext = result.runContext;
            }

            if (runContext && runContext.markdownIndexPath) {
                // Success
                res.json({
                    success: true,
                    message: 'Scraping completed successfully!',
                    downloadUrl: `/api/download?path=${encodeURIComponent(runContext.markdownIndexPath)}`,
                    stats: {
                        count: result.tweets ? result.tweets.length : 0
                    }
                });
            } else {
                res.status(500).json({ error: 'Scraping finished but output file not found.' });
            }
        } else {
            res.status(500).json({ error: result.error || 'Scraping failed.' });
        }

    } catch (error) {
        console.error('Scrape error:', error);
        res.status(500).json({ error: error.message });
    }
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
