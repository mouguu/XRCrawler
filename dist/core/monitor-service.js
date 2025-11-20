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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitorService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class MonitorService {
    constructor(scraperEngine) {
        this.state = {};
        this.scraperEngine = scraperEngine;
        this.stateFilePath = path.join(process.cwd(), 'monitor_state.json');
        this.loadState();
    }
    loadState() {
        if (fs.existsSync(this.stateFilePath)) {
            try {
                this.state = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf-8'));
            }
            catch (e) {
                console.error('Failed to load monitor state:', e);
                this.state = {};
            }
        }
    }
    saveState() {
        try {
            fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2));
        }
        catch (e) {
            console.error('Failed to save monitor state:', e);
        }
    }
    async runMonitor(usernames, options = {}) {
        console.log(`[Monitor] Starting batch job for: ${usernames.join(', ')}`);
        const allNewTweets = [];
        const { lookbackHours, keywords } = options;
        let sinceTimestamp;
        if (lookbackHours) {
            sinceTimestamp = Date.now() - (lookbackHours * 60 * 60 * 1000);
            console.log(`[Monitor] Lookback set to ${lookbackHours} hours (Since: ${new Date(sinceTimestamp).toISOString()})`);
        }
        for (const username of usernames) {
            console.log(`[Monitor] Checking updates for @${username}...`);
            const lastState = this.state[username];
            const stopAtTweetId = lastState ? lastState.lastTweetId : undefined;
            const result = await this.scraperEngine.scrapeTimeline({
                username,
                limit: 50, // Check last 50 tweets for updates
                stopAtTweetId,
                sinceTimestamp, // Pass time limit
                saveMarkdown: false, // We will aggregate them later
                saveScreenshots: false
            });
            if (result.success && result.tweets.length > 0) {
                let newTweets = result.tweets;
                // Filter by Keywords
                if (keywords && keywords.length > 0) {
                    const lowerKeywords = keywords.map(k => k.toLowerCase());
                    newTweets = newTweets.filter(t => {
                        const text = (t.text || '').toLowerCase();
                        return lowerKeywords.some(k => text.includes(k));
                    });
                    console.log(`[Monitor] Filtered ${result.tweets.length} -> ${newTweets.length} tweets using keywords: ${keywords.join(', ')}`);
                }
                if (newTweets.length > 0) {
                    console.log(`[Monitor] Found ${newTweets.length} relevant new tweets for @${username}`);
                    // Update state with the latest tweet from the ORIGINAL result (to avoid re-scanning even if filtered out)
                    // We track progress based on the timeline, not the filtered results.
                    const newestTweet = result.tweets[0];
                    this.state[username] = {
                        lastTweetId: newestTweet.id,
                        lastScrapedAt: new Date().toISOString()
                    };
                    this.saveState();
                    allNewTweets.push({ username, tweets: newTweets });
                }
                else {
                    console.log(`[Monitor] No tweets matched keywords for @${username}`);
                    // Still update state to avoid re-scanning these non-matching tweets
                    const newestTweet = result.tweets[0];
                    this.state[username] = {
                        lastTweetId: newestTweet.id,
                        lastScrapedAt: new Date().toISOString()
                    };
                    this.saveState();
                }
            }
            else {
                console.log(`[Monitor] No new tweets for @${username}`);
            }
        }
        if (allNewTweets.length > 0) {
            await this.generateDailyReport(allNewTweets, options);
        }
        else {
            console.log('[Monitor] No new tweets found for any user.');
        }
    }
    async generateDailyReport(data, options) {
        const dateStr = new Date().toISOString().split('T')[0];
        const reportDir = path.join(process.cwd(), 'output', 'reports');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }
        const filename = path.join(reportDir, `daily_report_${dateStr}.md`);
        let content = `# Daily Twitter Monitor Report - ${dateStr}\n\n`;
        if (options.lookbackHours)
            content += `**Lookback:** Last ${options.lookbackHours} hours\n`;
        if (options.keywords && options.keywords.length > 0)
            content += `**Keywords:** ${options.keywords.join(', ')}\n`;
        content += `\n---\n\n`;
        for (const item of data) {
            content += `## @${item.username} (${item.tweets.length} new)\n\n`;
            for (const tweet of item.tweets) {
                content += `### ${tweet.createdAt}\n`;
                content += `${tweet.text}\n\n`;
                if (tweet.images && tweet.images.length > 0) {
                    content += `> Images: ${tweet.images.length}\n\n`;
                }
                content += `[View Tweet](${tweet.url})\n`;
                content += `---\n`;
            }
            content += `\n`;
        }
        fs.writeFileSync(filename, content, 'utf-8');
        console.log(`[Monitor] Report generated: ${filename}`);
    }
}
exports.MonitorService = MonitorService;
