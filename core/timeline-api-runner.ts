/**
 * Timeline API Runner - Main Orchestrator for Twitter Data Scraping
 *
 * **Architecture:**
 *
 * This module is the "command center" that coordinates all scraping activities:
 *
 * 1. **Mode Selection**: Determines whether to use Timeline API or Search API
 * 2. **Date Chunking**: Splits large date ranges into monthly chunks for deep historical search
 * 3. **Cursor Management**: Handles pagination and ensures correct cursor state
 * 4. **Session Rotation**: Manages account switching on rate limits
 * 5. **Error Handling**: Implements retry logic and fallback strategies
 *
 * **Key Design Decisions:**
 *
 * - **searchMode vs mode === 'search'**:
 *   - `searchMode`: Internal flag for "switched from timeline to search" (fallback scenario)
 *   - `mode === 'search'`: User's original intent (direct search request)
 *   - Date Chunking uses `mode === 'search'` but `searchMode === false`
 *
 * - **Cursor Management**:
 *   - Single `cursor` variable for normal operations
 *   - `searchCursor` only used when `searchMode === true` (fallback scenario)
 *   - Date Chunking resets `cursor` when switching chunks
 *
 * - **Date Chunking Logic**:
 *   - Automatically splits date ranges into monthly chunks
 *   - Processes chunks sequentially (parallel disabled for safety)
 *   - Each chunk uses its own cursor for pagination
 *   - When chunk exhausted (no new cursor), moves to next chunk
 *
 * **Flow:**
 * timeline-api-runner → x-api.ts → xclid-puppeteer.ts (for SearchTimeline)
 *                    → x-api.ts → Axios (for other APIs)
 */

import type { Tweet } from '../types/tweet-definitions';
import {
  extractInstructionsFromResponse,
  extractNextCursor,
  parseTweetFromRestStatus,
  parseTweetsFromInstructions,
} from '../types/tweet-definitions';
import * as fileUtils from '../utils';
import { DateChunker, processTweets, sleepOrCancel, waitOrCancel } from '../utils';
import { ScraperError, ScraperErrors } from './errors';
import type { ScraperEngine } from './scraper-engine';
import type { ScrapeTimelineConfig, ScrapeTimelineResult } from './scraper-engine.types';
import { XApiClient } from './x-api';

// Removed local sleep function in favor of sleepOrCancel

/**
 * Run timeline scraping using REST API v1.1
 *
 * ⚠️ **WARNING: This function will fail with 404 errors.**
 *
 * Twitter's REST API v1.1 requires OAuth tokens, not web cookies.
 * This function is kept for:
 * - Future OAuth implementation
 * - Reference implementation of max_id pagination (similar to Tweepy)
 * - Documentation purposes
 *
 * **For production use, use GraphQL API (default).**
 *
 * @deprecated REST API v1.1 not accessible with web cookies
 * @param engine ScraperEngine instance
 * @param config Timeline scraping configuration
 * @returns Promise with scraping results (will likely fail)
 */
async function runTimelineRestApi(
  engine: ScraperEngine,
  config: ScrapeTimelineConfig,
): Promise<ScrapeTimelineResult> {
  const { username, limit = 50 } = config;
  if (!username) {
    return {
      success: false,
      tweets: [],
      error: 'Username is required for REST timeline',
      runContext: config.runContext,
    };
  }

  // Log warning about REST API limitations
  engine.eventBus.emitLog(
    '⚠️  WARNING: REST API v1.1 requires OAuth tokens and will likely fail with web cookies.',
    'warn',
  );
  engine.eventBus.emitLog(
    'Expected error: 404 Not Found. Use GraphQL mode (default) for web-based scraping.',
    'warn',
  );

  const totalTarget = limit;
  const collectedTweets: Tweet[] = [];
  const scrapedIds = new Set<string>();
  let maxId: string | undefined;
  let consecutiveEmpty = 0;
  let lastError: string | undefined;

  const shouldStop = () => engine.shouldStop();

  while (collectedTweets.length < limit) {
    if (await engine.shouldStop()) {
      engine.eventBus.emitLog('Manual stop signal received.');
      break;
    }

    try {
      const apiClient = engine.ensureApiClient();
      const pageSize = Math.min(200, limit - collectedTweets.length);

      const response = await waitOrCancel(
        apiClient.getUserTimelineRest(username, {
          count: pageSize,
          maxId,
          includeRts: true,
          excludeReplies: config.withReplies ? false : undefined,
        }),
        shouldStop,
      );

      if (!Array.isArray(response) || response.length === 0) {
        consecutiveEmpty += 1;
        engine.eventBus.emitLog(
          `REST timeline returned empty page (${consecutiveEmpty}/2). Collected ${collectedTweets.length}/${totalTarget}`,
        );
        if (consecutiveEmpty >= 2) break;
        await sleepOrCancel(300 + Math.random() * 400, shouldStop);
        continue;
      }

      consecutiveEmpty = 0;
      let addedCount = 0;

      for (const raw of response) {
        const tweet = parseTweetFromRestStatus(raw, username);
        if (!tweet) continue;

        if (config.stopAtTweetId && tweet.id === config.stopAtTweetId) {
          engine.eventBus.emitLog(`Reached stop tweet ID: ${tweet.id}`);
          collectedTweets.push(...(scrapedIds.has(tweet.id) ? [] : [tweet]));
          scrapedIds.add(tweet.id);
          return {
            success: collectedTweets.length > 0,
            tweets: collectedTweets,
            runContext: config.runContext,
          };
        }

        if (config.sinceTimestamp && tweet.time) {
          const ts = new Date(tweet.time).getTime();
          if (ts < config.sinceTimestamp) {
            engine.eventBus.emitLog(`Reached time limit at ${tweet.time}`);
            return {
              success: collectedTweets.length > 0,
              tweets: collectedTweets,
              runContext: config.runContext,
            };
          }
        }

        if (!scrapedIds.has(tweet.id) && collectedTweets.length < limit) {
          collectedTweets.push(tweet);
          scrapedIds.add(tweet.id);
          addedCount++;
        }
      }

      engine.eventBus.emitLog(
        `REST timeline fetched ${response.length} items, added ${addedCount}. Total: ${collectedTweets.length}`,
      );
      engine.eventBus.emitProgress({
        current: collectedTweets.length,
        target: totalTarget,
        action: 'scraping (rest)',
      });

      const oldestId = response[response.length - 1]?.id_str || response[response.length - 1]?.id;
      if (!oldestId) break;

      try {
        const next = BigInt(String(oldestId)) - 1n;
        if (next <= 0) break;
        maxId = next.toString();
      } catch {
        break;
      }

      if (response.length < pageSize) {
        break;
      }

      const delay = 120 + Math.random() * 220;
      await sleepOrCancel(delay, shouldStop);
      // biome-ignore lint/suspicious/noExplicitAny: error handling
    } catch (error: any) {
      lastError = error instanceof Error ? error.message : String(error);
      engine.eventBus.emitLog(`REST timeline error: ${lastError}`, 'error');
      break;
    }
  }

  const success = collectedTweets.length > 0;
  return {
    success,
    tweets: collectedTweets,
    runContext: config.runContext,
    error: success ? undefined : lastError || 'No tweets collected',
  };
}

export async function runTimelineApi(
  engine: ScraperEngine,
  config: ScrapeTimelineConfig,
): Promise<ScrapeTimelineResult> {
  const { username, limit = 50, mode = 'timeline', searchQuery } = config;
  const _totalTarget = limit;
  const apiVariant = config.apiVariant || 'graphql';

  let { runContext } = config;
  if (!runContext) {
    const identifier = username || searchQuery || 'unknown';
    runContext = await fileUtils.createRunContext({
      platform: 'x',
      identifier,
      baseOutputDir: config.outputDir,
    });
    engine.eventBus.emitLog(`Created new run context: ${runContext.runId}`);
  }

  if (apiVariant === 'rest') {
    if (mode !== 'timeline' || !username || config.tab) {
      engine.eventBus.emitLog(
        `REST apiVariant only supports user timelines. Falling back to GraphQL mode for ${username || searchQuery || 'request'}.`,
        'warn',
      );
    } else {
      return runTimelineRestApi(engine, { ...config, runContext });
    }
  }

  const collectedTweets: Tweet[] = [];
  const scrapedIds = new Set<string>();
  let cursor: string | undefined;
  let userId: string | null = null;
  let wasmCleanerLogged = false;
  let timelineLimitReached = false; // Track if we've hit the timeline limit
  let searchMode = false; // Track if we've switched to search mode
  let searchCursor: string | undefined; // Cursor for search pagination
  let searchBaseDate: string | undefined; // Base date for search queries (set when switching to search mode)

  // Date chunking for search mode
  let dateChunks: Array<{ since: string; until: string; label: string }> = [];
  let currentChunkIndex = -1;
  // Store original search query without date filters (remove any existing since/until)
  let searchQueryBase = searchQuery ? searchQuery.replace(/\s+(since|until):[^\s]+/gi, '').trim() : '';

  // 关键修复：在纯搜索模式下，使用独立的 cursor 变量
  // 当 mode === 'search' 时，searchMode 是 false，但我们需要用 cursor 来跟踪搜索分页
  // 所以我们需要确保在纯搜索模式下，cursor 被正确更新

  if (mode === 'timeline' && username) {
    try {
      engine.eventBus.emitLog(`Resolving user ID for ${username}...`);
      const apiClient = engine.ensureApiClient();
      userId = await apiClient.getUserByScreenName(username);
      if (!userId) {
        throw ScraperErrors.userNotFound(username);
      }
      engine.eventBus.emitLog(`Resolved user ID: ${userId}`);
      // biome-ignore lint/suspicious/noExplicitAny: error handling
    } catch (error: any) {
      const errorMessage =
        error instanceof ScraperError ? error.message : `Failed to resolve user: ${error.message}`;
      return { success: false, tweets: [], error: errorMessage };
    }
  }

  let consecutiveErrors = 0;
  let consecutiveEmptyResponses = 0;
  const attemptedSessions = new Set<string>();
  let search404Retried = false;
  let search404Count = 0; // Track consecutive 404 errors in search mode
  const currentSession = engine.getCurrentSession();
  if (currentSession) attemptedSessions.add(currentSession.id);

  const shouldStop = () => engine.shouldStop();

  const cursorHistory: Array<{
    cursor: string;
    sessionId: string;
    hasTweets: boolean;
  }> = [];
  const emptyCursorSessions = new Map<string, Set<string>>();

  // =================================================================
  // CRITICAL FIX: Flag to signal early termination
  // =================================================================
  // When stopAtTweetId or sinceTimestamp conditions are met, we need to
  // properly exit the while loop, not just break from the inner for loop
  let shouldStopScraping = false;

  while (collectedTweets.length < limit && !shouldStopScraping) {
    if (await engine.shouldStop()) {
      engine.eventBus.emitLog('Manual stop signal received.');
      break;
    }

    try {
      const apiClient = engine.ensureApiClient();
      // biome-ignore lint/suspicious/noExplicitAny: unknown api response
      let response: any;

      const apiStartTime = Date.now();
      engine.performanceMonitor.startPhase(mode === 'search' ? 'api-search' : 'api-fetch-tweets');

      engine.eventBus.emitLog(
        `[DEBUG] Starting API request at ${new Date(apiStartTime).toISOString()}, collected: ${collectedTweets.length}/${limit}`,
      );

      // =================================================================
      // 【核心设计：被动拦截模式下的分页书签管理】
      // =================================================================
      //
      // **为什么需要这个变量？**
      // 在"被动拦截"模式下，我们使用真实浏览器来访问 Twitter。
      // 浏览器会自动处理分页，我们只需要告诉它"从哪个位置继续"。
      //
      // **cursor 的作用：**
      // - cursor === undefined: 告诉浏览器"这是第一次，给我第一页"
      // - cursor === "某个值": 告诉浏览器"从上次的位置继续，给我下一页"
      //
      // **"耐心重试"机制的关键：**
      // 当 Twitter 返回数据但没有新的 cursor 时，我们不更新 cursor。
      // 这样下次循环时，浏览器会使用相同的 cursor 再次滚动，给 Twitter 前端
      // 一个"额外机会"来加载更多数据。这就是"耐心重试"。
      //
      // **根据模式选择正确的 cursor：**
      // - searchMode === true: 使用 searchCursor（内部切换的搜索模式）
      // - searchMode === false: 使用 cursor（正常时间线或用户请求的搜索）
      let currentPaginationCursor = searchMode ? searchCursor : cursor;

      // Check if we should use search mode (after timeline limit reached)
      if (searchMode && username) {
        // Use the fixed base date set when switching to search mode
        // Don't update it during pagination - use cursor for pagination instead
        let searchQueryStr = `from:${username}`;

        if (searchBaseDate) {
          searchQueryStr += ` until:${searchBaseDate}`;
        } else {
          // Fallback: use oldest tweet if base date not set (shouldn't happen)
          const oldestTweet = collectedTweets.length > 0 ? collectedTweets[collectedTweets.length - 1] : null;
          if (oldestTweet?.time) {
            const oldestDate = new Date(oldestTweet.time);
            oldestDate.setDate(oldestDate.getDate() - 1);
            searchBaseDate = oldestDate.toISOString().split('T')[0];
            searchQueryStr += ` until:${searchBaseDate}`;
          }
        }

        engine.eventBus.emitLog(`[SEARCH MODE] Fetching older tweets with query: "${searchQueryStr}"...`);
        engine.eventBus.emitLog(`[SEARCH DEBUG] Using cursor: ${currentPaginationCursor || 'none (first page)'}`, 'debug');

        try {
          const requestPromise = apiClient.searchTweets(
            searchQueryStr,
            20,
            currentPaginationCursor
          );
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('API request timeout after 35 seconds (axios timeout is 30s)'));
            }, 35000);
          });

          engine.eventBus.emitLog(`[DEBUG] Waiting for search API response (timeout: 35s)...`);
          response = await waitOrCancel(
            Promise.race([requestPromise, timeoutPromise]),
            shouldStop,
          );
          const apiEndTime = Date.now();
          engine.eventBus.emitLog(
            `[DEBUG] Search API request completed successfully in ${apiEndTime - apiStartTime}ms`,
          );
        } catch (apiError: any) {
          const apiEndTime = Date.now();
          const errorMsg = apiError?.message || String(apiError);
          engine.eventBus.emitLog(
            `[ERROR] Search API request failed after ${apiEndTime - apiStartTime}ms: ${errorMsg}`,
            'error',
          );
          throw apiError;
        }
      } else if (mode === 'search' && searchQuery) {
        // Initialize date chunks if not already done and date range is provided
        if (dateChunks.length === 0 && config.dateRange) {
          const { start, end } = config.dateRange;
          dateChunks = DateChunker.generateDateChunks(start, end, 'month');
          currentChunkIndex = 0;
          engine.eventBus.emitLog(
            `[DATE CHUNK] Generated ${dateChunks.length} date chunks for search. Starting with chunk 1/${dateChunks.length}: ${dateChunks[0].label}`,
            'info',
          );
        }

        // Build search query with date range if using chunks
        let finalSearchQuery = searchQueryBase;
        if (dateChunks.length > 0 && currentChunkIndex >= 0 && currentChunkIndex < dateChunks.length) {
          const chunk = dateChunks[currentChunkIndex];
          finalSearchQuery = `${searchQueryBase} since:${chunk.since} until:${chunk.until}`;
          engine.eventBus.emitLog(
            `[DATE CHUNK] Using chunk ${currentChunkIndex + 1}/${dateChunks.length}: ${chunk.label}`,
            'info',
          );
        }

        engine.eventBus.emitLog(`Fetching search results for "${finalSearchQuery}"...`);

        response = await waitOrCancel(
          apiClient.searchTweets(finalSearchQuery, 20, currentPaginationCursor),
          shouldStop
        );
      } else if (userId) {
        engine.eventBus.emitLog(`Fetching tweets for user ${username}...`);
        try {
          // Add timeout wrapper to detect stuck requests
          const requestPromise = apiClient.getUserTweets(userId, 40, currentPaginationCursor);
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('API request timeout after 35 seconds (axios timeout is 30s)'));
            }, 35000); // 35 seconds to catch axios 30s timeout
          });

          engine.eventBus.emitLog(`[DEBUG] Waiting for API response (timeout: 35s)...`);
          response = await waitOrCancel(
            Promise.race([requestPromise, timeoutPromise]),
            shouldStop,
          );
          const apiEndTime = Date.now();
          engine.eventBus.emitLog(
            `[DEBUG] API request completed successfully in ${apiEndTime - apiStartTime}ms`,
          );
        } catch (apiError: any) {
          const apiEndTime = Date.now();
          const errorMsg = apiError?.message || String(apiError);
          engine.eventBus.emitLog(
            `[ERROR] API request failed after ${apiEndTime - apiStartTime}ms: ${errorMsg}`,
            'error',
          );

          // Check if it's a timeout
          if (errorMsg.includes('timeout') || errorMsg.includes('ECONNABORTED')) {
            engine.eventBus.emitLog(
              `[WARN] Request timed out. This may indicate network issues or API rate limiting. Attempting to continue...`,
              'warn',
            );
          }

          throw apiError; // Re-throw to be handled by outer catch
        }
      } else {
        throw ScraperErrors.invalidConfiguration(
          'Invalid configuration: missing username or search query',
        );
      }

      const apiLatency = Date.now() - apiStartTime;
      engine.performanceMonitor.endPhase();
      engine.performanceMonitor.recordApiRequest(apiLatency, false);

      engine.performanceMonitor.startPhase('parse-api-response');
      const { tweets, nextCursor } = parseApiResponse(response, username);
      const parseTime = Date.now() - apiStartTime - apiLatency;
      engine.performanceMonitor.endPhase();
      engine.performanceMonitor.recordApiParse(parseTime);

      // =================================================================
      // 核心修复：直接在主循环中处理分页逻辑，不再依赖 handleCursorState
      // =================================================================

      // 更新 currentPaginationCursor（在循环开始时已声明）
      currentPaginationCursor = searchMode ? searchCursor : cursor;

      engine.eventBus.emitLog(
        `[DEBUG] Parsed response: ${tweets.length} tweets, nextCursor: ${nextCursor ? 'exists' : 'none'}${searchMode ? ' [SEARCH MODE]' : ''}`,
      );
      if (searchMode) {
        if (nextCursor) {
          engine.eventBus.emitLog(`[SEARCH DEBUG] Next cursor value: ${nextCursor.substring(0, 50)}... (length: ${nextCursor.length})`, 'debug');
        } else {
          engine.eventBus.emitLog(`[SEARCH DEBUG] No next cursor - search cursor exhausted`, 'debug');
        }
      }
      logCursorDiagnostics(engine, tweets.length, currentPaginationCursor, nextCursor);

      // =================================================================
      // 核心修复 2：直接在主循环中处理分页结束判断
      // =================================================================

      // 如果没有新推文，并且没有新的、不同的 cursor，那么就认为分页结束了
      if (tweets.length === 0 && (!nextCursor || nextCursor === currentPaginationCursor)) {
          if (mode === 'search' && dateChunks.length > 0 && currentChunkIndex >= 0 && currentChunkIndex < dateChunks.length - 1) {
              // 当前 chunk 结束，移动到下一个 chunk
              currentChunkIndex++;
              cursor = undefined; // 重置 cursor 供下一个 chunk 使用
              searchCursor = undefined;
              consecutiveEmptyResponses = 0;
              engine.eventBus.emitLog(`[DATE CHUNK] Reached end of chunk. Moving to next: ${dateChunks[currentChunkIndex].label}`, 'info');
              continue; // 进入下一次 while 循环，处理新 chunk
          } else {
              // 所有 chunk 都结束了，或者不是 chunk 模式但已无数据
              engine.eventBus.emitLog(`[INFO] No new tweets and no new cursor. Scraping finished for this target.`, 'info');
              break; // <<<<< 关键！跳出 while 循环
          }
      }

      // Check if we should switch to search mode when timeline limit is reached
      // Switch if:
      // 1. Timeline API returns no new cursor (or cursor unchanged) AND we have >500 tweets collected
      // 2. OR we've tried multiple sessions and still getting 0 tweets
      // This prevents premature switching when timeline is still working
      const noNewCursor = !nextCursor || nextCursor === currentPaginationCursor;
      const hasCollectedEnough = collectedTweets.length > 500;
      const hasTriedMultipleSessions = attemptedSessions.size >= 2;

      // Check if we should switch to search mode
      const shouldSwitchCondition =
        !searchMode &&
        username &&
        collectedTweets.length < limit &&
        collectedTweets.length > 0 &&
        (
          // Case 1: No tweets returned and we've tried multiple sessions
          (tweets.length === 0 && hasTriedMultipleSessions) ||
          // Case 2: No new cursor and we've collected enough tweets (likely hit depth limit)
          (noNewCursor && hasCollectedEnough && tweets.length > 0)
        );

      if (shouldSwitchCondition) {
        // Only switch to search mode if we've tried at least 2 sessions or have collected a significant number of tweets (>500)
        // This indicates we've likely hit the timeline API depth limit
        const shouldSwitchToSearch = hasTriedMultipleSessions || hasCollectedEnough;

        if (shouldSwitchToSearch) {
          const oldestTweet = collectedTweets[collectedTweets.length - 1];
          if (oldestTweet?.time) {
            const oldestDate = new Date(oldestTweet.time);
            const searchQueryStr = `from:${username} until:${oldestDate.toISOString().split('T')[0]}`;

            engine.eventBus.emitLog(
              `[INFO] Timeline limit likely reached at ${collectedTweets.length} tweets (${attemptedSessions.size} sessions tried). Switching to search mode with query: "${searchQueryStr}" to continue scraping older tweets...`,
              'info',
            );

            timelineLimitReached = true;
            searchMode = true;
            searchCursor = undefined; // Start fresh search
            cursor = undefined; // Clear timeline cursor
            consecutiveEmptyResponses = 0; // Reset empty count
            // Save the base date for search queries (don't update it during pagination)
            searchBaseDate = oldestDate.toISOString().split('T')[0];

            // Continue with search mode
            continue;
          }
        } else {
          engine.eventBus.emitLog(
            `[DEBUG] Not switching to search mode yet. Only ${attemptedSessions.size} session(s) tried, ${collectedTweets.length} tweets collected. Timeline may still be working.`,
            'debug',
          );
        }
      }

      // 如果有新推文，就处理它们
      let cleaned: any = null;
      let addedCount = 0;

      if (tweets.length > 0) {
        cleaned = await processTweets([], tweets, limit);
        if (cleaned.usedWasm && !wasmCleanerLogged) {
          engine.eventBus.emitLog('Using Rust/WASM tweet cleaner for normalization/dedup.', 'info');
          wasmCleanerLogged = true;
        }

        for (const tweet of cleaned.tweets) {
          if (collectedTweets.length >= limit) {
            shouldStopScraping = true; // Signal to exit while loop
            break;
          }

          if (!scrapedIds.has(tweet.id)) {
            if (config.stopAtTweetId && tweet.id === config.stopAtTweetId) {
              engine.eventBus.emitLog(`Reached stop tweet ID: ${tweet.id}`);
              cursor = undefined;
              searchCursor = undefined; // Also clear search cursor
              shouldStopScraping = true; // CRITICAL FIX: Signal to exit while loop
              break;
            }
            if (config.sinceTimestamp && tweet.time) {
              const tweetTime = new Date(tweet.time).getTime();
              if (tweetTime < config.sinceTimestamp) {
                engine.eventBus.emitLog(`Reached time limit: ${tweet.time}`);
                cursor = undefined;
                searchCursor = undefined; // Also clear search cursor
                shouldStopScraping = true; // CRITICAL FIX: Signal to exit while loop
                break;
              }
            }

            collectedTweets.push(tweet);
            scrapedIds.add(tweet.id);
            addedCount++;
          } else {
            // count deduped items from API response
            cleaned.stats.deduped += 1;
          }
        }

        engine.eventBus.emitLog(
          `Fetched ${cleaned.tweets.length} cleaned tweets (raw ${tweets.length}), added ${addedCount} new. Total: ${collectedTweets.length}`,
        );

        engine.eventBus.emitProgress({
          current: collectedTweets.length,
          target: limit,
          action: 'scraping',
        });
        engine.performanceMonitor.recordTweets(collectedTweets.length);
        engine.emitPerformanceUpdate();

        // CRITICAL FIX: Check if we should stop scraping immediately after processing tweets
        // This handles stopAtTweetId and sinceTimestamp conditions
        // Similar to DOM runner which sets consecutiveNoNew = maxNoNew to signal termination
        if (shouldStopScraping) {
          engine.eventBus.emitLog(
            `[INFO] Stop condition met (stopAtTweetId or sinceTimestamp). Exiting scraping loop immediately.`,
            'info',
          );
          break; // Exit while loop immediately, skip cursor updates
        }
      } else {
        // tweets.length is 0, but there IS a new cursor. This can happen.
        engine.eventBus.emitLog(`[WARN] Received 0 tweets but a new cursor was provided. Continuing pagination.`, 'warn');
      }

      // =================================================================
      // 【回滚：恢复简单的 cursor 管理逻辑】
      // =================================================================
      //
      // **"负负得正"版本的核心：**
      // - 无条件执行 cursor = nextCursor
      // - 如果 nextCursor 是 undefined，cursor 就会变回 undefined
      // - 下次循环时，底层 performSearch 会检测到重复查询，自动转换为滚动
      //
      // **这就是"快速轮询"的秘诀：**
      // - 上层"健忘"，总是传递相同的查询（即使 cursor 丢失）
      // - 底层"智能纠错"，检测到重复查询就执行滚动
      // - 形成一个紧密的轮询循环，速度极快
      // =================================================================

      // 如果没有新增推文，并且没有新的 cursor，就认为结束了，防止死循环
      if (addedCount === 0 && (!nextCursor || nextCursor === (searchMode ? searchCursor : cursor))) {
        engine.eventBus.emitLog(`[INFO] No new tweets and no new cursor. Assuming end of chunk.`, 'info');

        // 如果是日期分块模式，就去下一个 chunk
        if (mode === 'search' && dateChunks.length > 0 && currentChunkIndex < dateChunks.length - 1) {
          currentChunkIndex++;
          cursor = undefined; // 重置 cursor
          searchCursor = undefined;
          continue; // 开始下一个 chunk
        } else {
          break; // 否则彻底结束
        }
      }

      // 更新 cursor。如果 nextCursor 是 undefined，cursor 就会被重置。
      // 这就是触发底层"智能纠错"的关键一步！
      if (searchMode) {
        searchCursor = nextCursor;
      } else {
        cursor = nextCursor;
      }

      // =================================================================
      // CRITICAL FIX: Save progress checkpoint AFTER cursor is updated
      // =================================================================
      // Use the updated cursor (searchCursor or cursor) instead of raw nextCursor
      // This ensures checkpoint accuracy, especially after session rotation or mode switching
      const finalCursor = searchMode ? searchCursor : cursor;
      if (tweets.length > 0 && cleaned) {
        engine.progressManager.updateProgress(
          collectedTweets.length,
          cleaned.tweets[cleaned.tweets.length - 1]?.id,
          finalCursor, // Use the updated cursor, not the raw nextCursor
          engine.getCurrentSession()?.id,
        );
      }

      // 更新进度和等待（保持很短的延时，恢复快速轮询的速度）
      engine.progressManager.updateProgress(
        collectedTweets.length,
        collectedTweets[collectedTweets.length - 1]?.id,
        searchMode ? searchCursor : cursor,
        engine.getCurrentSession()?.id,
      );

      consecutiveErrors = 0;
      search404Retried = false;
      search404Count = 0; // Reset search 404 count on successful request

      // 保持一个很短的延时，恢复快速轮询的速度
      await sleepOrCancel(100 + Math.random() * 200, shouldStop);
      // biome-ignore lint/suspicious/noExplicitAny: error handling
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      engine.eventBus.emitLog(
        `[ERROR] Outer catch block: ${errorMsg}`,
        'error',
      );

      // Log stack trace for debugging
      if (error?.stack) {
        engine.eventBus.emitLog(`[DEBUG] Error stack: ${error.stack.substring(0, 500)}`, 'debug');
      }

      // CRITICAL FIX: Pass the appropriate cursor based on searchMode
      // When in search mode, we need to pass searchCursor so error handler can update it correctly
      const currentCursor = searchMode ? searchCursor : cursor;

      const handled = await handleApiError({
        engine,
        error,
        mode,
        searchMode, // CRITICAL FIX: Pass searchMode flag to error handler
        cursor: currentCursor, // Pass the current cursor (searchCursor if in search mode)
        collectedTweets,
        attemptedSessions,
        consecutiveErrors,
        search404Retried,
      });

      // CRITICAL FIX: Update the correct cursor variable based on searchMode
      // When in search mode, update searchCursor; otherwise update cursor
      if (searchMode) {
        searchCursor = handled.cursor;
      } else {
        cursor = handled.cursor;
      }
      consecutiveErrors = handled.consecutiveErrors;
      search404Retried = handled.search404Retried;

      if (handled.shouldBreak) {
        // If we're in search mode and getting 404, search API is not working
        // Track consecutive 404 errors and stop after too many failures
        if (searchMode && String(error?.message || '').includes('404')) {
          search404Count++;
          engine.eventBus.emitLog(
            `[WARN] Search API returned 404 (consecutive failures: ${search404Count}). Search functionality may not be available.`,
            'warn',
          );

          // If we've had some success (collected tweets increased), but now getting 404s,
          // it might be that we've reached the end of searchable results
          // Stop after 3 consecutive 404s to avoid infinite loop
          if (search404Count >= 3) {
            engine.eventBus.emitLog(
              `[INFO] Search API returned 404 ${search404Count} times consecutively. Stopping search mode. Collected: ${collectedTweets.length}/${limit}`,
              'info',
            );
            // Disable search mode and stop
            searchMode = false;
            break; // Exit the loop
          }

          // Try to fall back to timeline mode if we haven't exhausted all options
          searchMode = false;
          timelineLimitReached = false;
          // If we have a timeline cursor, try to continue from there
          if (cursor) {
            engine.eventBus.emitLog(
              `[INFO] Attempting to continue with timeline mode using existing cursor...`,
              'info',
            );
            consecutiveErrors = 0; // Reset error count
            search404Count = 0; // Reset search 404 count
            continue; // Try timeline mode again
          }
        }

        // Before breaking, check if we should switch to search mode
        // This handles the case where all sessions are exhausted but we haven't reached the limit
        if (!searchMode && username && collectedTweets.length < limit && collectedTweets.length > 0) {
          const oldestTweet = collectedTweets[collectedTweets.length - 1];
          if (oldestTweet?.time) {
            const oldestDate = new Date(oldestTweet.time);
            const searchQueryStr = `from:${username} until:${oldestDate.toISOString().split('T')[0]}`;

            engine.eventBus.emitLog(
              `[INFO] All sessions exhausted at ${collectedTweets.length} tweets. Switching to search mode with query: "${searchQueryStr}" to continue scraping older tweets...`,
              'info',
            );

            timelineLimitReached = true;
            searchMode = true;
            searchCursor = undefined; // Start fresh search
            cursor = undefined; // Clear timeline cursor
            consecutiveEmptyResponses = 0; // Reset empty count
            consecutiveErrors = 0; // Reset error count

            // Continue with search mode instead of breaking
            continue;
          }
        }

        engine.eventBus.emitLog(
          `[DEBUG] handleApiError returned shouldBreak=true. Stopping loop. Collected: ${collectedTweets.length}/${limit}`,
        );
        break;
      }
    }
  }

  const success = collectedTweets.length > 0;
  return {
    success,
    tweets: collectedTweets,
    runContext,
    error: success ? undefined : 'No tweets collected',
  };
}

// biome-ignore lint/suspicious/noExplicitAny: complex response structure
function parseApiResponse(response: any, fallbackUsername?: string) {
  const instructions = extractInstructionsFromResponse(response);
  const tweets = parseTweetsFromInstructions(instructions, fallbackUsername);
  const nextCursor = extractNextCursor(instructions);
  return { tweets, nextCursor };
}

interface CursorStateParams {
  engine: ScraperEngine;
  tweets: Tweet[];
  nextCursor?: string;
  cursor?: string;
  collectedTweets: Tweet[];
  limit: number;
  consecutiveEmptyResponses: number;
  attemptedSessions: Set<string>;
  cursorHistory: Array<{
    cursor: string;
    sessionId: string;
    hasTweets: boolean;
  }>;
  emptyCursorSessions: Map<string, Set<string>>;
}

async function handleCursorState({
  engine,
  tweets,
  nextCursor,
  cursor,
  collectedTweets,
  limit,
  consecutiveEmptyResponses,
  attemptedSessions,
  cursorHistory,
  emptyCursorSessions,
}: CursorStateParams): Promise<{
  shouldContinue: boolean;
  updatedCursor?: string;
  updatedConsecutiveEmpty: number;
}> {
  if (!nextCursor || nextCursor === cursor) {
    if (tweets.length === 0) {
      // Even if no new cursor, try session rotation before giving up
      // This might help if it's a visibility/rate-limit issue rather than true end
      if (engine.isRotationEnabled() && attemptedSessions.size < 4 && collectedTweets.length < limit) {
        const allActiveSessions = await engine.sessionManager.getAllActiveSessions();
        const untriedSessions = allActiveSessions.filter((s) => !attemptedSessions.has(s.id));

        if (untriedSessions.length > 0) {
          const nextSession = untriedSessions[0];
          engine.eventBus.emitLog(
            `[WARN] Received 0 tweets with no new cursor at ${collectedTweets.length}/${limit} tweets. Trying different session (${nextSession.id}) to see if it can access more...`,
            'warn',
          );
          try {
            await engine.applySession(nextSession, {
              refreshFingerprint: false,
              clearExistingCookies: true,
            });
            attemptedSessions.add(nextSession.id);
            engine.performanceMonitor.recordSessionSwitch();
            engine.eventBus.emitLog(
              `[INFO] Switched to session: ${nextSession.id}. Retrying from current position...`,
              'info',
            );
            await sleepOrCancel(200 + Math.random() * 300, () => engine.shouldStop());
            // Continue with same cursor using new session
            return {
              shouldContinue: true,
              updatedCursor: cursor, // Keep same cursor, retry with new session
              updatedConsecutiveEmpty: 0,
            };
          } catch (e: any) {
            engine.eventBus.emitLog(`Session rotation failed: ${e.message}`, 'error');
            attemptedSessions.add(nextSession.id);
          }
        }
      }

      // If session rotation didn't help or not available, treat as end
      // Note: Search mode switching is handled in the main loop, not here
      engine.eventBus.emitLog(
        `No more tweets found. Reached end of timeline. (Collected: ${collectedTweets.length}/${limit})`,
      );
      return {
        shouldContinue: false,
        updatedCursor: nextCursor,
        updatedConsecutiveEmpty: 0,
      };
    }
    // If we have tweets but no new cursor, this might be the last page
    // But if we haven't reached the limit and have tried multiple sessions, consider switching to search mode
    if (tweets.length > 0 && collectedTweets.length < limit && collectedTweets.length > 500 && attemptedSessions.size >= 2) {
      engine.eventBus.emitLog(
        `[WARN] Timeline returned ${tweets.length} tweets but no new cursor at ${collectedTweets.length}/${limit}. This might indicate API depth limit. Will check for search mode fallback in main loop.`,
        'warn',
      );
    }
    engine.eventBus.emitLog(
      `Reached end of timeline (last page). (Collected: ${collectedTweets.length}/${limit})`,
    );
    return {
      shouldContinue: true,
      updatedCursor: nextCursor,
      updatedConsecutiveEmpty: 0,
    };
  }

  // Special case: 0 tweets but nextCursor exists - might be API boundary or visibility issue
  // Try session rotation before giving up
  if (tweets.length === 0 && nextCursor && nextCursor !== cursor) {
    engine.eventBus.emitLog(
      `[WARN] Received 0 tweets but nextCursor exists. This might be a visibility issue or API boundary. Attempting session rotation...`,
      'warn',
    );

    // Try session rotation if enabled and we haven't tried all sessions
    if (engine.isRotationEnabled() && attemptedSessions.size < 4) {
      const allActiveSessions = await engine.sessionManager.getAllActiveSessions();
      const untriedSessions = allActiveSessions.filter((s) => !attemptedSessions.has(s.id));

      if (untriedSessions.length > 0) {
        const nextSession = untriedSessions[0];
        engine.eventBus.emitLog(
          `[INFO] Trying different session (${nextSession.id}) to see if it can access more tweets...`,
          'info',
        );
        try {
          await engine.applySession(nextSession, {
            refreshFingerprint: false,
            clearExistingCookies: true,
          });
          attemptedSessions.add(nextSession.id);
          engine.performanceMonitor.recordSessionSwitch();
          engine.eventBus.emitLog(
            `[INFO] Switched to session: ${nextSession.id}. Retrying with same cursor...`,
            'info',
          );
          await sleepOrCancel(200 + Math.random() * 300, () => engine.shouldStop());
          // Return true to continue with the same cursor using new session
          return {
            shouldContinue: true,
            updatedCursor: cursor, // Keep same cursor, retry with new session
            updatedConsecutiveEmpty: 0, // Reset empty count
          };
        } catch (e: any) {
          engine.eventBus.emitLog(`Session rotation failed: ${e.message}`, 'error');
          attemptedSessions.add(nextSession.id);
        }
      }
    }

    // If session rotation didn't help or not enabled, fall through to handleEmptyCursor
    engine.eventBus.emitLog(
      `[INFO] Session rotation not available or didn't help. Treating as empty response...`,
      'info',
    );
    return await handleEmptyCursor({
      engine,
      nextCursor,
      cursor,
      collectedTweets,
      limit,
      consecutiveEmptyResponses,
      attemptedSessions,
      cursorHistory,
      emptyCursorSessions,
    });
  }

  if (tweets.length === 0) {
    return await handleEmptyCursor({
      engine,
      nextCursor,
      cursor,
      collectedTweets,
      limit,
      consecutiveEmptyResponses,
      attemptedSessions,
      cursorHistory,
      emptyCursorSessions,
    });
  }

  return {
    shouldContinue: true,
    updatedCursor: nextCursor,
    updatedConsecutiveEmpty: 0,
  };
}

interface EmptyCursorParams {
  engine: ScraperEngine;
  nextCursor?: string;
  cursor?: string;
  collectedTweets: Tweet[];
  limit: number;
  consecutiveEmptyResponses: number;
  attemptedSessions: Set<string>;
  cursorHistory: Array<{
    cursor: string;
    sessionId: string;
    hasTweets: boolean;
  }>;
  emptyCursorSessions: Map<string, Set<string>>;
}

async function handleEmptyCursor({
  engine,
  nextCursor,
  cursor,
  collectedTweets,
  limit,
  consecutiveEmptyResponses,
  attemptedSessions,
  cursorHistory,
  emptyCursorSessions,
}: EmptyCursorParams) {
  const updatedConsecutive = consecutiveEmptyResponses + 1;
  const currentSessionId = engine.getCurrentSession()?.id || 'unknown';
  const cursorValue = nextCursor || '';
  const cursorNumMatch = cursorValue.match(/\d+/);
  const cursorNum = cursorNumMatch ? BigInt(cursorNumMatch[0]) : null;

  if (cursorHistory.length > 0) {
    const lastCursor = cursorHistory[cursorHistory.length - 1]?.cursor;
    const lastCursorMatch = lastCursor?.match(/\d+/);
    const lastCursorNum = lastCursorMatch ? BigInt(lastCursorMatch[0]) : null;

    if (cursorNum && lastCursorNum && cursorNum === lastCursorNum) {
      engine.eventBus.emitLog(
        `[DIAGNOSIS] Cursor value unchanged (${cursorValue}), may have reached API boundary`,
        'warn',
      );
    } else if (cursorNum && lastCursorNum && cursorNum < lastCursorNum) {
      const diff = Number(lastCursorNum - cursorNum);
      if (diff < 10) {
        engine.eventBus.emitLog(
          `[DIAGNOSIS] Cursor decreasing very slowly (diff: ${diff}), may be near API limit`,
          'warn',
        );
      }
    }
  }

  if (!emptyCursorSessions.has(nextCursor || '')) {
    emptyCursorSessions.set(nextCursor || '', new Set());
  }
  emptyCursorSessions.get(nextCursor || '')?.add(currentSessionId);
  cursorHistory.push({
    cursor: nextCursor || '',
    sessionId: currentSessionId,
    hasTweets: false,
  });

  if (updatedConsecutive === 1) {
    engine.eventBus.emitLog(
      `[DIAGNOSIS] First empty response at cursor ${cursorValue}. Collected: ${collectedTweets.length}/${limit}. Possible reasons: API limit (~800-900 tweets), rate limit, or timeline end.`,
      'info',
    );
  }

  engine.eventBus.emitLog(
    `[DEBUG] handleEmptyCursor: consecutive=${updatedConsecutive}, collected=${collectedTweets.length}/${limit}, attemptedSessions=${attemptedSessions.size}`,
  );

  const sessionsAtThisCursor = emptyCursorSessions.get(nextCursor || '')?.size || 0;
  const allActiveSessions = await engine.sessionManager.getAllActiveSessions();
  const hasMoreSessions = allActiveSessions.some((s) => !attemptedSessions.has(s.id));
  const likelyRealEnd = sessionsAtThisCursor >= 3 || !hasMoreSessions;

  if (!engine.isRotationEnabled()) {
    engine.eventBus.emitLog(
      `Auto-rotation disabled. Stopping at cursor ${cursorValue} after empty response. Collected: ${collectedTweets.length}/${limit}`,
      'warn',
    );
    return {
      shouldContinue: false,
      updatedCursor: nextCursor,
      updatedConsecutiveEmpty: updatedConsecutive,
    };
  }

  if (updatedConsecutive >= 2 && attemptedSessions.size < 4 && !likelyRealEnd) {
    const untriedSessions = allActiveSessions.filter((s) => !attemptedSessions.has(s.id));

    if (untriedSessions.length > 0) {
      const nextSession = untriedSessions[0];
      engine.eventBus.emitLog(
        `Found ${untriedSessions.length} untried session(s): ${untriedSessions
          .map((s) => s.id)
          .join(', ')}`,
        'debug',
      );
      try {
        await engine.applySession(nextSession, {
          refreshFingerprint: false,
          clearExistingCookies: true,
        });
        attemptedSessions.add(nextSession.id);
        engine.performanceMonitor.recordSessionSwitch();
        engine.eventBus.emitLog(
          `Switched to session: ${nextSession.id} (${attemptedSessions.size} session(s) tried). Retrying same cursor...`,
          'info',
        );
        await sleepOrCancel(200 + Math.random() * 300, () => engine.shouldStop());
        return {
          shouldContinue: true,
          updatedCursor: cursor,
          updatedConsecutiveEmpty: 0,
        };
        // biome-ignore lint/suspicious/noExplicitAny: error handling
      } catch (e: any) {
        engine.eventBus.emitLog(`Session rotation failed: ${e.message}`, 'error');
        attemptedSessions.add(nextSession.id);
      }
    } else {
      engine.eventBus.emitLog(
        `No more untried sessions available. All sessions have been tested: ${Array.from(
          attemptedSessions,
        ).join(', ')}`,
      );
    }
  }

  const allSessionsTried = attemptedSessions.size >= 4;
  const shouldStop =
    (updatedConsecutive >= 3 && likelyRealEnd) ||
    (allSessionsTried && sessionsAtThisCursor >= attemptedSessions.size) ||
    updatedConsecutive >= 5;

  if (shouldStop) {
    const triedSessionsList = Array.from(attemptedSessions).join(', ');
    const reason = allSessionsTried
      ? `All ${attemptedSessions.size} sessions (${triedSessionsList}) confirmed empty at this cursor - likely reached Twitter/X API limit (~${collectedTweets.length} tweets)`
      : likelyRealEnd
        ? `Multiple sessions (${sessionsAtThisCursor}) confirmed empty at this cursor position - likely reached timeline end`
        : `Maximum retry attempts (${updatedConsecutive}) reached`;
    engine.eventBus.emitLog(
      `${reason}. Stopping. (Collected: ${collectedTweets.length}/${limit})`,
      'warn',
    );
    if (collectedTweets.length < limit) {
      engine.eventBus.emitLog(
        `Analysis: Twitter/X GraphQL API appears to have a limit of ~${collectedTweets.length} tweets per request chain.`,
        'info',
      );
      engine.eventBus.emitLog(
        `Recommendation: Use 'puppeteer' mode (DOM scraping) for deeper timeline access beyond API limits.`,
        'info',
      );
    }
    return {
      shouldContinue: false,
      updatedCursor: nextCursor,
      updatedConsecutiveEmpty: updatedConsecutive,
    };
  }

  const retryDelay = 500 + Math.random() * 500;
  engine.eventBus.emitLog(
    `Empty response (${sessionsAtThisCursor} session(s) tried at this cursor, attempt ${updatedConsecutive}). Retrying in ${Math.round(
      retryDelay,
    )}ms...`,
    'warn',
  );
  await sleepOrCancel(retryDelay, () => engine.shouldStop());

  return {
    shouldContinue: true,
    updatedCursor: nextCursor,
    updatedConsecutiveEmpty: updatedConsecutive,
  };
}

interface ErrorHandlingResult {
  cursor?: string;
  consecutiveErrors: number;
  search404Retried: boolean;
  shouldBreak: boolean;
}

interface ApiErrorParams {
  engine: ScraperEngine;
  // biome-ignore lint/suspicious/noExplicitAny: generic error
  error: any;
  mode: string;
  searchMode: boolean; // CRITICAL FIX: Add searchMode flag to track internal mode switching
  cursor?: string;
  collectedTweets: Tweet[];
  attemptedSessions: Set<string>;
  consecutiveErrors: number;
  search404Retried: boolean;
}

async function handleApiError({
  engine,
  error,
  mode,
  searchMode, // CRITICAL FIX: Use searchMode flag to detect internal mode switching
  cursor,
  collectedTweets,
  attemptedSessions,
  consecutiveErrors,
  search404Retried,
}: ApiErrorParams): Promise<ErrorHandlingResult> {
  engine.performanceMonitor.endPhase();

  // Check error type for better logging
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode = (error as any)?.code || '';
  const isTimeout =
    errorMessage.includes('timeout') ||
    errorMessage.includes('ECONNABORTED') ||
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('timed out') ||
    errorCode === 'ECONNABORTED' ||
    errorCode === 'ETIMEDOUT' ||
    errorCode === 'TIMEOUT' ||
    (error as any)?.code?.startsWith('SCRAPER_TIMEOUT');

  engine.eventBus.emitLog(
    `API Error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ''}${isTimeout ? ' [TIMEOUT]' : ''}`,
    'error',
  );

  // Handle 404 errors in search mode - search API may not be available or query format may be wrong
  // CRITICAL FIX: Check searchMode flag (internal fallback) OR mode === 'search' (user's original intent)
  // This ensures 404s are properly recognized when algorithm switches from timeline to search fallback
  if (String(error.message || '').includes('404')) {
    // Check both the original mode parameter AND the internal searchMode flag
    // searchMode === true means we've switched from timeline to search fallback
    // mode === 'search' means user originally requested search mode
    const isInSearchMode = searchMode || mode === 'search';

    if (isInSearchMode) {
      engine.eventBus.emitLog(
        `[WARN] Search API returned 404${searchMode ? ' (internal fallback mode)' : ' (user-requested search mode)'}. Search functionality may not be available for this account or query format. This is likely a permanent issue.`,
        'warn',
      );
      // If we're in search mode and getting 404, it means search API is not working
      // We should stop rather than retry, as this is likely a permanent issue
      return {
        cursor,
        consecutiveErrors,
        search404Retried: true,
        shouldBreak: true,
      };
    }
    // For timeline mode, 404 might be a transient error, but we should still try session rotation
    engine.eventBus.emitLog(
      `404 error in timeline mode. This may indicate the user timeline is not accessible.`,
      'warn',
    );
  }

  let updatedConsecutiveErrors = consecutiveErrors + 1;

  // Check if it's a proxy-related error (should trigger proxy rotation)
  const isProxyError =
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('proxy') ||
    errorMessage.includes('Proxy') ||
    errorCode === 'ECONNREFUSED' ||
    (isTimeout && engine.proxyManager.hasProxies()); // Timeout with proxy might be proxy issue

  // If proxy error detected, mark current proxy as failed and rotate
  if (isProxyError && engine.proxyManager.hasProxies()) {
    const currentProxy = (engine.ensureApiClient() as any).proxy;
    if (currentProxy) {
      engine.proxyManager.markProxyFailed(currentProxy.id, `Proxy error: ${errorMessage}`);
      engine.eventBus.emitLog(
        `[ProxyManager] Marked proxy ${currentProxy.host}:${currentProxy.port} as failed: ${errorMessage}`,
        'warn',
      );

      // Get new proxy and recreate XApiClient
      const newProxy = engine.proxyManager.getNextProxy();
      const session = engine.getCurrentSession();
      if (session && newProxy) {
        // Recreate XApiClient with new proxy
        (engine as any).xApiClient = new XApiClient(session.cookies, newProxy);
        engine.eventBus.emitLog(
          `[ProxyManager] Switched to new proxy: ${newProxy.host}:${newProxy.port}`,
          'info',
        );
      }
    }
  }

  // Check if it's a timeout or network error that should trigger session rotation
  // Note: errorMessage, errorCode, and isTimeout are already declared above (lines 760-768)
  const isRateLimit = errorMessage.includes('429');
  const isAuthError = errorMessage.includes('Authentication failed') || errorMessage.includes('401') || errorMessage.includes('403');
  const isNetworkError =
    errorMessage.includes('network') ||
    errorMessage.includes('ECONNRESET') ||
    errorMessage.includes('socket hang up') ||
    errorCode === 'ECONNRESET';

  // Trigger session rotation for: rate limits, auth errors, timeouts, network errors, or after 3 consecutive errors
  if (
    isRateLimit ||
    isAuthError ||
    isTimeout ||
    isNetworkError ||
    updatedConsecutiveErrors >= 3
  ) {
    engine.performanceMonitor.recordRateLimit();
    const waitStartTime = Date.now();

    if (!engine.isRotationEnabled()) {
      engine.eventBus.emitLog(
        `Auto-rotation disabled. Stopping after error: ${error.message}`,
        'warn',
      );
      return {
        cursor,
        consecutiveErrors: updatedConsecutiveErrors,
        search404Retried: false,
        shouldBreak: true,
      };
    }

    const errorType = isTimeout
      ? 'timeout'
      : isRateLimit
        ? 'rate limit'
        : isAuthError
          ? 'authentication'
          : isNetworkError
            ? 'network'
            : 'error';
    engine.eventBus.emitLog(
      `API Error (${errorType}): ${error.message}. Attempting session rotation...`,
      'warn',
    );
    const allActiveSessions = await engine.sessionManager.getAllActiveSessions();
    const untriedSessions = allActiveSessions.filter((s) => !attemptedSessions.has(s.id));

    if (untriedSessions.length > 0) {
      const nextSession = untriedSessions[0];
      engine.eventBus.emitLog(
        `Found ${untriedSessions.length} untried session(s) for rotation: ${untriedSessions
          .map((s) => s.id)
          .join(', ')}`,
        'debug',
      );
      try {
        await engine.applySession(nextSession, {
          refreshFingerprint: false,
          clearExistingCookies: true,
        });
        attemptedSessions.add(nextSession.id);
        updatedConsecutiveErrors = 0;
        engine.performanceMonitor.recordSessionSwitch();
        const waitTime = Date.now() - waitStartTime;
        engine.performanceMonitor.recordRateLimitWait(waitTime);
        engine.performanceMonitor.recordTweets(collectedTweets.length);
        engine.emitPerformanceUpdate();
        engine.eventBus.emitLog(
          `Switched to session: ${nextSession.id} (${
            attemptedSessions.size
          } session(s) tried: ${Array.from(attemptedSessions).join(', ')}). Retrying...`,
          'info',
        );
        return {
          cursor,
          consecutiveErrors: updatedConsecutiveErrors,
          search404Retried: false,
          shouldBreak: false,
        };
        // biome-ignore lint/suspicious/noExplicitAny: error handling
      } catch (e: any) {
        engine.eventBus.emitLog(`Session rotation failed: ${e.message}`, 'error');
        attemptedSessions.add(nextSession.id);
      }
    }

    if (untriedSessions.length === 0) {
      engine.eventBus.emitLog(
        `All ${attemptedSessions.size} session(s) (${Array.from(attemptedSessions).join(
          ', ',
        )}) have been tried. Rate limit may be account-wide or IP-based. Stopping.`,
        'error',
      );
      return {
        cursor,
        consecutiveErrors: updatedConsecutiveErrors,
        search404Retried: false,
        shouldBreak: true,
      };
    }
  } else {
    engine.performanceMonitor.recordApiRequest(0, true);
    engine.eventBus.emitLog(`Transient error: ${error.message}. Retrying...`, 'warn');
    const waitTime = 500 + Math.random() * 500;
    await sleepOrCancel(waitTime, () => engine.shouldStop());
    engine.performanceMonitor.recordRateLimitWait(waitTime);
    engine.performanceMonitor.recordTweets(collectedTweets.length);
    engine.emitPerformanceUpdate();
    return {
      cursor,
      consecutiveErrors: updatedConsecutiveErrors,
      search404Retried: false,
      shouldBreak: false,
    };
  }

  return {
    cursor,
    consecutiveErrors: updatedConsecutiveErrors,
    search404Retried: false,
    shouldBreak: false,
  };
}

function logCursorDiagnostics(
  engine: ScraperEngine,
  tweetCount: number,
  cursor?: string,
  nextCursor?: string,
) {
  if (!nextCursor || nextCursor === cursor) {
    if (tweetCount === 0) {
      engine.eventBus.emitLog(
        `[DEBUG] API returned ${tweetCount} tweets, no cursor (prev cursor: ${
          cursor ? 'exists' : 'none'
        })`,
      );
    } else {
      engine.eventBus.emitLog(
        `[DEBUG] API returned ${tweetCount} tweets, no new cursor (prev cursor: ${
          cursor ? 'exists' : 'none'
        }) - likely last page`,
      );
    }
  } else {
    engine.eventBus.emitLog(`[DEBUG] API returned ${tweetCount} tweets, new cursor exists`);
  }
}
