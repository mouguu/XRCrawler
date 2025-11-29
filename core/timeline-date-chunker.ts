import type { ScraperEngine } from './scraper-engine';
import type { ScrapeTimelineConfig, ScrapeTimelineResult } from './scraper-engine.types';
import { ScraperErrors } from './errors';
import { Tweet } from '../types';
import { DateUtils } from '../utils/date-utils';
import { createRunContext } from '../utils/fileutils';
import * as markdownUtils from '../utils/markdown';
import * as exportUtils from '../utils/export';

export async function runTimelineDateChunks(
  engine: ScraperEngine,
  config: ScrapeTimelineConfig
): Promise<ScrapeTimelineResult> {
    if (!config.dateRange || !config.searchQuery) {
        throw ScraperErrors.invalidConfiguration(
            'Date range and search query are required for chunked scraping',
            { config }
        );
    }

    let runContext = config.runContext;
    if (!runContext) {
        const identifier = config.searchQuery;
        runContext = await createRunContext({
            platform: 'x',
            identifier,
            baseOutputDir: config.outputDir
        });
    }

    const ranges = DateUtils.generateDateRanges(config.dateRange.start, config.dateRange.end, 'monthly');
    // REVERSE ranges to scrape newest first (Deep Search usually implies getting latest history first)
    ranges.reverse();

    engine.eventBus.emitLog(`Generated ${ranges.length} date chunks for historical search (Newest -> Oldest).`);

    let allTweets: Tweet[] = [];
    let totalCollected = 0;
    const globalLimit = config.limit || 10000; // Default or user limit

    for (let i = 0; i < ranges.length; i++) {
        // Check if we reached the global limit
        if (totalCollected >= globalLimit) {
            engine.eventBus.emitLog(`Global limit of ${globalLimit} reached. Stopping deep search.`);
            break;
        }

        const range = ranges[i];
        const chunkQuery = `${config.searchQuery} since:${range.start} until:${range.end}`;

        engine.eventBus.emitLog(`Processing chunk ${i + 1}/${ranges.length}: ${range.start} to ${range.end}`);

        // Calculate remaining limit
        const remaining = globalLimit - totalCollected;
        // Set chunk limit to remaining needed count
        const chunkLimit = remaining;

        // Create a sub-config for this chunk
        const chunkConfig: ScrapeTimelineConfig = {
            ...config,
            searchQuery: chunkQuery,
            dateRange: undefined, // Prevent recursion
            resume: false,
            limit: chunkLimit,
            runContext,
            saveMarkdown: false,
            exportCsv: false,
            exportJson: false
        };

        const result = await engine.scrapeTimeline(chunkConfig);

        if (result.success && result.tweets) {
            const newTweets = result.tweets;
            allTweets = allTweets.concat(newTweets);
            totalCollected += newTweets.length;
            engine.eventBus.emitLog(`✅ Chunk ${i + 1}/${ranges.length} complete: ${newTweets.length} tweets collected | Global total: ${totalCollected}/${globalLimit}`);
        }
    }

    if (runContext && allTweets.length > 0) {
        if (config.saveMarkdown ?? true) {
            await markdownUtils.saveTweetsAsMarkdown(allTweets, runContext);
        }
        if (config.exportCsv) {
            await exportUtils.exportToCsv(allTweets, runContext);
        }
        if (config.exportJson) {
            await exportUtils.exportToJson(allTweets, runContext);
        }
    }

    return {
        success: allTweets.length > 0,
        tweets: allTweets,
        runContext,
        performance: engine.performanceMonitor.getStats()
    };
}
