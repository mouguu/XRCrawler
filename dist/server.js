"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastProgress = broadcastProgress;
exports.getShouldStopScraping = getShouldStopScraping;
const express_1 = __importDefault(require("express"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const scraper = __importStar(require("./scrape-unified"));
const event_bus_1 = __importDefault(require("./core/event-bus"));
const app = (0, express_1.default)();
const PORT = 3000;
// Global state for manual stop
let isScrapingActive = false;
let shouldStopScraping = false;
let lastDownloadUrl = null;
// Middleware
app.use(express_1.default.json());
app.use(express_1.default.static(path.join(__dirname, 'public')));
// API: Scrape
app.post('/api/scrape', async (req, res) => {
    try {
        const { type, input, limit = 50, likes = false, mergeResults = false, deleteMerged = false, clearCache = false } = req.body;
        console.log(`Received scrape request: Type=${type}, Input=${input}, Limit=${limit}, ClearCache=${clearCache}`);
        // Handle cache clearing for specific target
        if (clearCache) {
            // Extract username from input
            let targetIdentifier = input;
            if (input.includes('x.com/') || input.includes('twitter.com/')) {
                const urlMatch = input.match(/(?:x\.com|twitter\.com)\/([^/\?]+)/);
                if (urlMatch)
                    targetIdentifier = urlMatch[1];
            }
            // Remove status URL part if it's a thread
            if (targetIdentifier.includes('/status/')) {
                targetIdentifier = targetIdentifier.split('/status/')[0];
            }
            const cacheFile = path.join(__dirname, '.cache', `${targetIdentifier}.json`);
            if (fs.existsSync(cacheFile)) {
                fs.unlinkSync(cacheFile);
                console.log(`[Cache] Cleared cache for: ${targetIdentifier}`);
            }
            else {
                console.log(`[Cache] No cache file found for: ${targetIdentifier}`);
            }
        }
        // Reset stop flag and set active state
        shouldStopScraping = false;
        isScrapingActive = true;
        lastDownloadUrl = null; // Clear previous result
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
                clearCache
            });
        }
        else if (type === 'thread') {
            // Thread Scrape
            result = await scraper.scrapeThread({
                tweetUrl: input,
                maxReplies: parseInt(limit),
                saveMarkdown: true
            });
        }
        else if (type === 'search') {
            // Search Scrape
            result = await scraper.scrapeSearch({
                query: input,
                limit: parseInt(limit),
                saveMarkdown: true,
                mergeResults,
                deleteMerged
            });
        }
        else {
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
            }
            else {
                // No file path found
                console.error('[DEBUG] No markdownIndexPath found in runContext');
                return res.status(500).json({
                    success: false,
                    error: 'Scraping finished but output file not found.'
                });
            }
        }
        else {
            // Error
            console.error('Scraping failed:', result?.error || 'Unknown error');
            return res.status(500).json({
                success: false,
                error: result?.error || 'Scraping failed'
            });
        }
    }
    catch (error) {
        console.error('Server error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
    finally {
        // Reset scraping state
        isScrapingActive = false;
        shouldStopScraping = false;
    }
});
// API:// Account Management APIs
app.get('/api/accounts', (req, res) => {
    try {
        const cookiesDir = path.join(process.cwd(), 'cookies');
        if (!fs.existsSync(cookiesDir)) {
            return res.json({ accounts: [] });
        }
        const files = fs.readdirSync(cookiesDir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
            const filePath = path.join(cookiesDir, f);
            const stats = fs.statSync(filePath);
            return {
                id: f.replace('.json', ''),
                name: f.replace('.json', ''),
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime
            };
        });
        res.json({ accounts: files });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.delete('/api/accounts/:id', (req, res) => {
    try {
        const { id } = req.params;
        const cookieFile = path.join(process.cwd(), 'cookies', `${id}.json`);
        if (!fs.existsSync(cookieFile)) {
            return res.status(404).json({ error: 'Account not found' });
        }
        fs.unlinkSync(cookieFile);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/login', async (req, res) => {
    const { accountName } = req.body;
    if (!accountName || accountName.trim() === '') {
        return res.status(400).json({ error: 'Account name is required' });
    }
    try {
        // 打开有头浏览器 - 增强版
        const puppeteer = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        puppeteer.use(StealthPlugin());
        // 尝试找到系统安装的 Chrome（macOS）
        let executablePath;
        try {
            const { execSync } = require('child_process');
            // 尝试找到 Chrome 的路径
            const chromePaths = [
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Chromium.app/Contents/MacOS/Chromium',
                process.env.CHROME_PATH
            ];
            for (const chromePath of chromePaths) {
                if (chromePath && fs.existsSync(chromePath)) {
                    executablePath = chromePath;
                    console.log(`[Login] Using Chrome at: ${executablePath}`);
                    break;
                }
            }
        }
        catch (e) {
            console.log('[Login] Could not find system Chrome, using bundled Chromium');
        }
        const launchOptions = {
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--allow-running-insecure-content',
                '--disable-infobars',
                '--window-size=1280,960',
                '--start-maximized'
            ],
            defaultViewport: null
        };
        if (executablePath) {
            launchOptions.executablePath = executablePath;
        }
        const browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        // 设置真实的 User Agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        // 设置额外的 headers 来模拟真实浏览器
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        });
        // 注入一些随机的人类行为
        await page.evaluateOnNewDocument(() => {
            // 覆盖 navigator.webdriver
            Object.defineProperty(navigator, '웹driver', {
                get: () => undefined
            });
            // 添加一些随机的鼠标移动
            window.addEventListener('DOMContentLoaded', () => {
                const randomMove = () => {
                    const event = new MouseEvent('mousemove', {
                        clientX: Math.random() * window.innerWidth,
                        clientY: Math.random() * window.innerHeight
                    });
                    document.dispatchEvent(event);
                };
                setInterval(randomMove, 1000 + Math.random() * 2000);
            });
        });
        console.log('[Login] Opening Twitter login page...');
        // 随机延迟一下，模拟人类
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
        await page.goto('https://x.com/i/flow/login', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        // 等待用户登录（检测是否到达首页或任何非登录页面）
        console.log('[Login] Waiting for user to complete login...');
        console.log('[Login] Please log in manually in the browser window...');
        // 等待 URL 变化，表示登录成功
        await page.waitForFunction(() => {
            const url = window.location.href;
            return !url.includes('/login') && !url.includes('/flow/');
        }, { timeout: 300000 } // 5分钟超时
        );
        console.log('[Login] Login detected, extracting cookies...');
        // 等待一下确保 Cookie 完全设置
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
        // 提取 Cookie
        const cookies = await page.cookies();
        // 保存到文件
        const cookiesDir = path.join(process.cwd(), 'cookies');
        if (!fs.existsSync(cookiesDir)) {
            fs.mkdirSync(cookiesDir, { recursive: true });
        }
        const cookieFilePath = path.join(cookiesDir, `${accountName}.json`);
        fs.writeFileSync(cookieFilePath, JSON.stringify({ cookies }, null, 2));
        console.log(`[Login] Cookies saved to ${cookieFilePath}`);
        await browser.close();
        res.json({
            success: true,
            message: `Account "${accountName}" added successfully`,
            cookieCount: cookies.length
        });
    }
    catch (error) {
        console.error('[Login] Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// API: Import cookies from existing browser profile
app.post('/api/import-from-browser', async (req, res) => {
    const { accountName } = req.body;
    if (!accountName || accountName.trim() === '') {
        return res.status(400).json({ error: 'Account name is required' });
    }
    try {
        const os = require('os');
        const puppeteer = require('puppeteer-extra');
        const StealthPlugin = require('puppeteer-extra-plugin-stealth');
        puppeteer.use(StealthPlugin());
        // 获取 Chrome 用户数据目录（macOS）
        const userDataDir = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
        if (!fs.existsSync(userDataDir)) {
            return res.status(400).json({
                error: 'Chrome user data directory not found. Please make sure Chrome is installed and you have logged in to Twitter in Chrome.'
            });
        }
        console.log(`[Import] Using Chrome profile at: ${userDataDir}`);
        const launchOptions = {
            headless: false,
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            userDataDir: userDataDir,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1280,960'
            ],
            defaultViewport: null
        };
        console.log('[Import] Launching Chrome with your profile...');
        const browser = await puppeteer.launch(launchOptions);
        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();
        console.log('[Import] Navigating to Twitter...');
        await page.goto('https://x.com', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        // 等待一下确保页面加载完成
        await new Promise(resolve => setTimeout(resolve, 2000));
        // 提取 Cookie
        const cookies = await page.cookies();
        if (cookies.length === 0) {
            await browser.close();
            return res.status(400).json({
                error: 'No cookies found. Please make sure you are logged in to Twitter in Chrome.'
            });
        }
        // 检查是否有 Twitter 的关键 Cookie（如 auth_token）
        const hasAuthToken = cookies.some(c => c.name === 'auth_token');
        if (!hasAuthToken) {
            await browser.close();
            return res.status(400).json({
                error: 'Twitter auth_token not found. Please log in to Twitter in Chrome first.'
            });
        }
        // 保存到文件
        const cookiesDir = path.join(process.cwd(), 'cookies');
        if (!fs.existsSync(cookiesDir)) {
            fs.mkdirSync(cookiesDir, { recursive: true });
        }
        const cookieFilePath = path.join(cookiesDir, `${accountName}.json`);
        fs.writeFileSync(cookieFilePath, JSON.stringify({ cookies }, null, 2));
        console.log(`[Import] Cookies saved to ${cookieFilePath}`);
        await browser.close();
        res.json({
            success: true,
            message: `Account "${accountName}" imported successfully`,
            cookieCount: cookies.length
        });
    }
    catch (error) {
        console.error('[Import] Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// API: Monitor
app.post('/api/monitor', async (req, res) => {
    try {
        const { users, lookbackHours, keywords } = req.body;
        if (!users || !Array.isArray(users) || users.length === 0) {
            return res.status(400).json({ error: 'Invalid users list' });
        }
        console.log(`Received monitor request for: ${users.join(', ')}`);
        isScrapingActive = true;
        shouldStopScraping = false;
        // Dynamic import to avoid circular dependencies or initialization issues
        const { ScraperEngine } = require('./core/scraper-engine');
        const { MonitorService } = require('./core/monitor-service');
        const engine = new ScraperEngine(() => shouldStopScraping);
        await engine.init();
        const success = await engine.loadCookies();
        if (!success) {
            await engine.close();
            return res.status(500).json({ error: 'Failed to load cookies' });
        }
        const monitor = new MonitorService(engine);
        await monitor.runMonitor(users, {
            lookbackHours: lookbackHours ? parseFloat(lookbackHours) : undefined,
            keywords: keywords ? keywords.split(',').map((k) => k.trim()).filter(Boolean) : undefined
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
    }
    catch (error) {
        console.error('Monitor error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
    finally {
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
    // Send initial message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Progress stream connected' })}\n\n`);
    // Listener for progress events
    const onProgress = (data) => {
        res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`);
    };
    const onLog = (data) => {
        res.write(`data: ${JSON.stringify({ type: 'log', ...data })}\n\n`);
    };
    const onError = (error) => {
        console.error('[Scraper Error]', error);
        res.write(`data: ${JSON.stringify({ type: 'log', level: 'error', message: error.message })}\n\n`);
    };
    event_bus_1.default.on('scrape:progress', onProgress);
    event_bus_1.default.on('log:message', onLog);
    event_bus_1.default.on('scrape:error', onError);
    // Remove listeners on disconnect
    req.on('close', () => {
        event_bus_1.default.off('scrape:progress', onProgress);
        event_bus_1.default.off('log:message', onLog);
        event_bus_1.default.off('scrape:error', onError);
        console.log('[SSE] Client disconnected');
    });
});
// Helper function to broadcast progress (Deprecated, kept for compatibility)
function broadcastProgress(data) {
    event_bus_1.default.emitProgress(data);
}
// API: Get scraping status
app.get('/api/status', (req, res) => {
    res.json({
        isActive: isScrapingActive,
        shouldStop: shouldStopScraping
    });
});
// API: Get result (download URL after scraping completes)
app.get('/api/result', (req, res) => {
    res.json({
        isActive: isScrapingActive,
        downloadUrl: lastDownloadUrl
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
function getShouldStopScraping() {
    return shouldStopScraping;
}
