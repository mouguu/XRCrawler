import type { ScraperEngine } from './scraper-engine';
import type { ScrapeTimelineConfig, ScrapeTimelineResult } from './scraper-engine.types';
import { ScraperErrors } from './errors';
import { Tweet } from '../types';
import { DateUtils } from '../utils/date-utils';
import { createRunContext } from '../utils/fileutils';
import * as markdownUtils from '../utils/markdown';
import * as exportUtils from '../utils/export';
import { CHUNK_RETRY_CONFIG } from '../config/constants';

interface FailedChunk {
    index: number;
    range: { start: string; end: string };
    query: string;
    retryCount: number;
    error?: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Attempt to scrape a single chunk with retry logic
 */
async function scrapeChunkWithRetry(
    engine: ScraperEngine,
    chunkConfig: ScrapeTimelineConfig,
    chunkIndex: number,
    totalChunks: number,
    range: { start: string; end: string }
): Promise<{ success: boolean; tweets: Tweet[]; error?: string }> {
    let retryCount = 0;
    const attemptedSessions = new Set<string>();
    const currentSession = engine.getCurrentSession();
    if (currentSession) {
        attemptedSessions.add(currentSession.id);
    }

    while (retryCount <= CHUNK_RETRY_CONFIG.maxChunkRetries) {
        if (engine.shouldStop()) {
            return { success: false, tweets: [], error: 'Manual stop signal received' };
        }

        try {
            const result = await engine.scrapeTimeline(chunkConfig);

            if (result.success && result.tweets && result.tweets.length > 0) {
                return { success: true, tweets: result.tweets };
            }

            // If result is not successful or has no tweets, try session rotation
            if (!result.success || !result.tweets || result.tweets.length === 0) {
                const errorMsg = result.error || 'No tweets collected';
                
                // Check if we should retry with session rotation
                if (retryCount < CHUNK_RETRY_CONFIG.maxChunkRetries && engine.isRotationEnabled()) {
                    const allActiveSessions = engine.sessionManager.getAllActiveSessions();
                    const untriedSessions = allActiveSessions.filter(s => !attemptedSessions.has(s.id));

                    if (untriedSessions.length > 0) {
                        const nextSession = untriedSessions[0];
                        engine.eventBus.emitLog(
                            `[Chunk Retry] Chunk ${chunkIndex + 1}/${totalChunks} (${range.start} to ${range.end}) failed: ${errorMsg}. ` +
                            `Rotating to session ${nextSession.id} and retrying immediately...`,
                            'warn'
                        );

                        try {
                            await engine.applySession(nextSession, {
                                refreshFingerprint: false,
                                clearExistingCookies: true,
                            });
                            attemptedSessions.add(nextSession.id);
                            retryCount++;
                            await sleep(
                                CHUNK_RETRY_CONFIG.chunkRetryDelayBase + 
                                Math.random() * CHUNK_RETRY_CONFIG.chunkRetryDelayJitter
                            );
                            continue; // Retry the same chunk
                        } catch (sessionError: any) {
                            engine.eventBus.emitLog(
                                `[Chunk Retry] Session rotation failed: ${sessionError.message}`,
                                'error'
                            );
                            attemptedSessions.add(nextSession.id);
                            retryCount++;
                            continue;
                        }
                    } else {
                        engine.eventBus.emitLog(
                            `[Chunk Retry] All sessions exhausted for chunk ${chunkIndex + 1}. ` +
                            `Marking as failed after ${retryCount} retries.`,
                            'warn'
                        );
                        return { success: false, tweets: [], error: errorMsg };
                    }
                } else {
                    // No more retries or rotation disabled
                    return { success: false, tweets: [], error: errorMsg };
                }
            }

            return { success: true, tweets: result.tweets || [] };
        } catch (error: any) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            engine.eventBus.emitLog(
                `[Chunk Retry] Error scraping chunk ${chunkIndex + 1}: ${errorMsg}`,
                'error'
            );

            // Check if we should retry with session rotation
            if (retryCount < CHUNK_RETRY_CONFIG.maxChunkRetries && engine.isRotationEnabled()) {
                const allActiveSessions = engine.sessionManager.getAllActiveSessions();
                const untriedSessions = allActiveSessions.filter(s => !attemptedSessions.has(s.id));

                if (untriedSessions.length > 0) {
                    const nextSession = untriedSessions[0];
                    engine.eventBus.emitLog(
                        `[Chunk Retry] Rotating to session ${nextSession.id} and retrying chunk ${chunkIndex + 1}...`,
                        'warn'
                    );

                    try {
                        await engine.applySession(nextSession, {
                            refreshFingerprint: false,
                            clearExistingCookies: true,
                        });
                        attemptedSessions.add(nextSession.id);
                        retryCount++;
                        await sleep(
                            CHUNK_RETRY_CONFIG.chunkRetryDelayBase + 
                            Math.random() * CHUNK_RETRY_CONFIG.chunkRetryDelayJitter
                        );
                        continue;
                    } catch (sessionError: any) {
                        engine.eventBus.emitLog(
                            `[Chunk Retry] Session rotation failed: ${sessionError.message}`,
                            'error'
                        );
                        attemptedSessions.add(nextSession.id);
                        retryCount++;
                        continue;
                    }
                } else {
                    return { success: false, tweets: [], error: errorMsg };
                }
            } else {
                return { success: false, tweets: [], error: errorMsg };
            }
        }
    }

    return { success: false, tweets: [], error: 'Maximum retry attempts reached' };
}

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
    const failedChunks: FailedChunk[] = [];

    // First pass: process all chunks with retry
    for (let i = 0; i < ranges.length; i++) {
        // Check if we reached the global limit
        if (totalCollected >= globalLimit) {
            engine.eventBus.emitLog(`Global limit of ${globalLimit} reached. Stopping deep search.`);
            break;
        }

        if (engine.shouldStop()) {
            engine.eventBus.emitLog('Manual stop signal received. Stopping chunk processing.');
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

        const result = await scrapeChunkWithRetry(engine, chunkConfig, i, ranges.length, range);

        if (result.success && result.tweets && result.tweets.length > 0) {
            const newTweets = result.tweets;
            allTweets = allTweets.concat(newTweets);
            totalCollected += newTweets.length;
            engine.eventBus.emitLog(`✅ Chunk ${i + 1}/${ranges.length} complete: ${newTweets.length} tweets collected | Global total: ${totalCollected}/${globalLimit}`);
        } else {
            // Record failed chunk for global retry
            failedChunks.push({
                index: i,
                range,
                query: chunkQuery,
                retryCount: 0,
                error: result.error
            });
            engine.eventBus.emitLog(
                `❌ Chunk ${i + 1}/${ranges.length} failed: ${result.error || 'Unknown error'}. ` +
                `Will retry in global retry phase.`,
                'warn'
            );
        }
    }

    // Global retry phase: retry failed chunks
    if (failedChunks.length > 0 && engine.isRotationEnabled()) {
        engine.eventBus.emitLog(
            `\n[Global Retry] Starting global retry phase for ${failedChunks.length} failed chunk(s)...`,
            'info'
        );

        for (let globalRetryPass = 0; globalRetryPass < CHUNK_RETRY_CONFIG.maxGlobalRetries; globalRetryPass++) {
            if (engine.shouldStop()) {
                break;
            }

            const chunksToRetry = failedChunks.filter(chunk => chunk.retryCount <= globalRetryPass);
            if (chunksToRetry.length === 0) {
                break;
            }

            engine.eventBus.emitLog(
                `[Global Retry] Pass ${globalRetryPass + 1}/${CHUNK_RETRY_CONFIG.maxGlobalRetries}: Retrying ${chunksToRetry.length} chunk(s)...`,
                'info'
            );

            // Reset session manager to allow reusing sessions
            const allActiveSessions = engine.sessionManager.getAllActiveSessions();
            if (allActiveSessions.length > 0) {
                // Try to use a different session for global retry
                // 使用更智能的session选择：优先选择未尝试过的session，如果都尝试过则轮换
                const sessionIndex = globalRetryPass % allActiveSessions.length;
                const nextSession = allActiveSessions[sessionIndex];
                
                // 检查这个session是否在之前的chunk retry中已经尝试过
                // 如果所有session都尝试过，则使用轮换策略
                try {
                    await engine.applySession(nextSession, {
                        refreshFingerprint: false,
                        clearExistingCookies: true,
                    });
                    engine.eventBus.emitLog(
                        `[Global Retry] Switched to session ${nextSession.id} for retry pass ${globalRetryPass + 1} (${sessionIndex + 1}/${allActiveSessions.length})`,
                        'info'
                    );
                } catch (sessionError: any) {
                    engine.eventBus.emitLog(
                        `[Global Retry] Failed to switch session: ${sessionError.message}`,
                        'warn'
                    );
                    // 如果session切换失败，继续尝试下一个
                    if (allActiveSessions.length > 1) {
                        const nextIndex = (sessionIndex + 1) % allActiveSessions.length;
                        const fallbackSession = allActiveSessions[nextIndex];
                        try {
                            await engine.applySession(fallbackSession, {
                                refreshFingerprint: false,
                                clearExistingCookies: true,
                            });
                            engine.eventBus.emitLog(
                                `[Global Retry] Fallback: Switched to session ${fallbackSession.id}`,
                                'info'
                            );
                        } catch (fallbackError: any) {
                            engine.eventBus.emitLog(
                                `[Global Retry] Fallback session also failed: ${fallbackError.message}`,
                                'warn'
                            );
                        }
                    }
                }
            }

            for (const failedChunk of chunksToRetry) {
                if (engine.shouldStop() || totalCollected >= globalLimit) {
                    break;
                }

                const remaining = globalLimit - totalCollected;
                const chunkLimit = remaining;

                const chunkConfig: ScrapeTimelineConfig = {
                    ...config,
                    searchQuery: failedChunk.query,
                    dateRange: undefined,
                    resume: false,
                    limit: chunkLimit,
                    runContext,
                    saveMarkdown: false,
                    exportCsv: false,
                    exportJson: false
                };

                engine.eventBus.emitLog(
                    `[Global Retry] Retrying chunk ${failedChunk.index + 1}/${ranges.length}: ` +
                    `${failedChunk.range.start} to ${failedChunk.range.end}...`,
                    'info'
                );

                const result = await scrapeChunkWithRetry(
                    engine,
                    chunkConfig,
                    failedChunk.index,
                    ranges.length,
                    failedChunk.range
                );

                if (result.success && result.tweets && result.tweets.length > 0) {
                    const newTweets = result.tweets;
                    allTweets = allTweets.concat(newTweets);
                    totalCollected += newTweets.length;
                    failedChunk.retryCount = CHUNK_RETRY_CONFIG.maxGlobalRetries + 1; // Mark as successfully retried
                    engine.eventBus.emitLog(
                        `✅ [Global Retry] Chunk ${failedChunk.index + 1} recovered: ${newTweets.length} tweets collected | Global total: ${totalCollected}/${globalLimit}`,
                        'info'
                    );
                } else {
                    failedChunk.retryCount++;
                    engine.eventBus.emitLog(
                        `❌ [Global Retry] Chunk ${failedChunk.index + 1} still failed: ${result.error || 'Unknown error'}`,
                        'warn'
                    );
                }
            }
        }

        // Report final status of failed chunks
        const stillFailed = failedChunks.filter(chunk => chunk.retryCount <= CHUNK_RETRY_CONFIG.maxGlobalRetries);
        if (stillFailed.length > 0) {
            engine.eventBus.emitLog(
                `\n[Global Retry] ${stillFailed.length} chunk(s) still failed after all retry attempts:`,
                'warn'
            );
            for (const chunk of stillFailed) {
                engine.eventBus.emitLog(
                    `  - Chunk ${chunk.index + 1}: ${chunk.range.start} to ${chunk.range.end} (Error: ${chunk.error || 'Unknown'})`,
                    'warn'
                );
            }
        } else {
            engine.eventBus.emitLog(`\n[Global Retry] All failed chunks successfully recovered!`, 'info');
        }
    } else if (failedChunks.length > 0 && !engine.isRotationEnabled()) {
        engine.eventBus.emitLog(
            `\n[Warning] ${failedChunks.length} chunk(s) failed, but auto-rotation is disabled. Skipping global retry.`,
            'warn'
        );
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
