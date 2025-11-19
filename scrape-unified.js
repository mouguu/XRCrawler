/**
 * Twitter/X 爬虫模块
 * 专注于抓取 Twitter/X 用户主页与时间线内容
 */

// 导入依赖
const path = require('path');
const fs = require('fs');

// 核心模块
const { BrowserManager } = require('./core/browser-manager');
const { CookieManager } = require('./core/cookie-manager');
const dataExtractor = require('./core/data-extractor');

// 工具模块
const fileUtils = require('./utils/fileutils');
const mergeUtils = require('./utils/merge');
const markdownUtils = require('./utils/markdown');
const exportUtils = require('./utils/export');
const screenshotUtils = require('./utils/screenshot');
const retryUtils = require('./utils/retry');
const validation = require('./utils/validation');
const timeUtils = require('./utils/time');
const constants = require('./config/constants');

// 常量定义
const X_HOME_URL = 'https://x.com/home';

// 工具函数
const throttle = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/****************************
 * TWITTER/X 相关函数
 ****************************/

/**
 * 抓取单条推文的完整线程（Thread）
 * @param {Object} options - 配置选项
 * @param {string} options.tweetUrl - 推文 URL (e.g., https://x.com/username/status/123456)
 * @param {number} options.maxReplies - 最多抓取的回复数量（默认：100）
 * @returns {Promise<{success: boolean, tweets: Array, originalTweet: Object}>}
 */
async function scrapeThread(options = {}) {
  const platform = constants.PLATFORM_NAME;
  const tweetUrl = options.tweetUrl;
  const maxReplies = options.maxReplies || 100;

  if (!tweetUrl || !tweetUrl.includes('/status/')) {
    console.error(`[${platform.toUpperCase()}] Invalid tweet URL. Must contain '/status/'`);
    return { success: false, tweets: [], error: 'Invalid tweet URL' };
  }

  // 从 URL 中提取推文 ID 和用户名
  const urlMatch = tweetUrl.match(/x\.com\/([^\/]+)\/status\/(\d+)/);
  if (!urlMatch) {
    console.error(`[${platform.toUpperCase()}] Could not parse tweet URL: ${tweetUrl}`);
    return { success: false, tweets: [], error: 'Could not parse tweet URL' };
  }

  const username = urlMatch[1];
  const tweetId = urlMatch[2];
  const identifier = `thread_${username}_${tweetId}`;

  console.log(`[${platform.toUpperCase()}] Starting to scrape thread: ${tweetUrl}`);
  console.log(`[${platform.toUpperCase()}] Max replies to scrape: ${maxReplies}`);

  // 创建运行上下文
  let runContext = options.runContext;
  if (!runContext) {
    runContext = await fileUtils.createRunContext({
      platform: 'twitter',
      identifier: identifier,
      baseOutputDir: options.outputDir || './output',
      timezone: options.timezone
    });
  }

  let browserManager = null;
  let page = null;
  let originalTweet = null;
  let allReplies = [];
  const scrapedReplyIds = new Set();

  try {
    // 启动浏览器
    browserManager = new BrowserManager();
    await browserManager.launch({ headless: true });
    page = await browserManager.createPage();
    console.log(`[${platform.toUpperCase()}] Browser launched`);

    // 加载 Cookies
    try {
      const cookieManager = new CookieManager();
      const cookieInfo = await cookieManager.loadAndInject(page);
      console.log(`[${platform.toUpperCase()}] Loaded ${cookieInfo.cookies.length} cookies`);
    } catch (error) {
      console.error(`[${platform.toUpperCase()}] Cookie error: ${error.message}`);
      return { success: false, tweets: [], error: error.message };
    }

    // 导航到推文页面
    console.log(`[${platform.toUpperCase()}] Navigating to ${tweetUrl}...`);
    try {
      await retryUtils.retryPageGoto(
        page,
        tweetUrl,
        { waitUntil: 'networkidle2', timeout: constants.NAVIGATION_TIMEOUT },
        {
          ...constants.NAVIGATION_RETRY_CONFIG,
          onRetry: (error, attempt) => {
            console.log(`[${platform.toUpperCase()}] Navigation failed (attempt ${attempt}): ${error.message}`);
          }
        }
      );
    } catch (navError) {
      console.error(`[${platform.toUpperCase()}] Navigation failed: ${navError.message}`);
      return { success: false, tweets: [], error: navError.message };
    }

    // 等待推文加载
    try {
      await retryUtils.retryWaitForSelector(
        page,
        dataExtractor.X_SELECTORS.TWEET,
        { timeout: constants.WAIT_FOR_TWEETS_TIMEOUT },
        {
          ...constants.SELECTOR_RETRY_CONFIG,
          onRetry: (error, attempt) => {
            console.log(`[${platform.toUpperCase()}] Waiting for tweet failed (attempt ${attempt}): ${error.message}`);
          }
        }
      );
      console.log(`[${platform.toUpperCase()}] Tweet loaded`);
    } catch (waitError) {
      console.error(`[${platform.toUpperCase()}] No tweet found: ${waitError.message}`);
      return { success: false, tweets: [], error: waitError.message };
    }

    // 提取原推文（第一条推文通常是原推）
    const tweetsOnPage = await dataExtractor.extractTweetsFromPage(page);
    if (tweetsOnPage.length > 0) {
      // 找到包含指定 tweetId 的推文（原推）
      originalTweet = tweetsOnPage.find(t => t.id === tweetId || t.url.includes(tweetId));
      if (!originalTweet && tweetsOnPage.length > 0) {
        // 如果找不到，使用第一条作为原推
        originalTweet = tweetsOnPage[0];
      }
      console.log(`[${platform.toUpperCase()}] Found original tweet: ${originalTweet?.text?.substring(0, 50)}...`);

      // 其他推文可能是回复
      tweetsOnPage.forEach(tweet => {
        if (tweet.id !== originalTweet?.id && !scrapedReplyIds.has(tweet.id)) {
          allReplies.push(tweet);
          scrapedReplyIds.add(tweet.id);
        }
      });
    }

    // 滚动并抓取更多回复
    let scrollAttempts = 0;
    const maxScrollAttempts = Math.max(50, Math.ceil(maxReplies / 5));
    let noNewRepliesCount = 0;
    let previousTweetCount = tweetsOnPage.length;

    while (allReplies.length < maxReplies && scrollAttempts < maxScrollAttempts) {
      scrollAttempts++;
      console.log(`[${platform.toUpperCase()}] Scraping replies attempt ${scrollAttempts}... (found ${allReplies.length} replies)`);

      // 滚动到底部
      await dataExtractor.scrollToBottom(page);
      await throttle(constants.getScrollDelay());

      // 等待新回复加载
      const hasNewTweets = await dataExtractor.waitForNewTweets(
        page,
        previousTweetCount,
        constants.WAIT_FOR_NEW_TWEETS_TIMEOUT
      );

      // 提取新回复
      const newTweets = await dataExtractor.extractTweetsFromPage(page);
      previousTweetCount = newTweets.length; // 更新计数
      let addedCount = 0;

      for (const tweet of newTweets) {
        if (allReplies.length >= maxReplies) break;
        if (tweet.id === originalTweet?.id) continue; // 跳过原推
        if (!scrapedReplyIds.has(tweet.id)) {
          allReplies.push(tweet);
          scrapedReplyIds.add(tweet.id);
          addedCount++;
        }
      }

      if (addedCount === 0) {
        noNewRepliesCount++;
        if (noNewRepliesCount >= 3) {
          console.log(`[${platform.toUpperCase()}] No new replies found after ${noNewRepliesCount} attempts, stopping...`);
          break;
        }
      } else {
        noNewRepliesCount = 0;
      }

      console.log(`[${platform.toUpperCase()}] Added ${addedCount} new replies. Total: ${allReplies.length}`);
    }

    console.log(`[${platform.toUpperCase()}] Thread scraping completed. Found ${allReplies.length} replies.`);

    // 合并原推和回复
    const allTweets = originalTweet ? [originalTweet, ...allReplies] : allReplies;

    // 保存为 Markdown
    if (options.saveMarkdown !== false && allTweets.length > 0) {
      await markdownUtils.saveTweetsAsMarkdown(allTweets, runContext);
    }

    // 导出 JSON/CSV（如果启用）
    if (options.exportJson && allTweets.length > 0) {
      await exportUtils.exportToJson(allTweets, runContext);
    }
    if (options.exportCsv && allTweets.length > 0) {
      await exportUtils.exportToCsv(allTweets, runContext);
    }

    // 生成 AI 分析文件（线程分析）
    if (allTweets.length > 0 && options.generateAnalysis !== false) {
      const aiExportUtils = require('./utils/ai-export');
      await aiExportUtils.generateThreadAnalysis(allTweets, originalTweet, runContext);
    }

    return {
      success: true,
      tweets: allTweets,
      originalTweet: originalTweet,
      replies: allReplies,
      replyCount: allReplies.length,
      runContext
    };

  } catch (error) {
    console.error(`[${platform.toUpperCase()}] Thread scraping failed:`, error.message);
    return { success: false, tweets: [], error: error.message, runContext };
  } finally {
    if (browserManager) {
      await browserManager.close();
    }
  }
}

/**
 * 抓取Twitter/X Feed
 * @param {Object} options - 配置选项
 * @param {string} options.username - Twitter用户名
 * @param {number} options.limit - 最多抓取的推文数量（默认：50）
 * @returns {Promise<{success: boolean, tweets: Array}>}
 */
async function scrapeXFeed(options = {}) {
  const username = options.username;
  const limit = options.limit || 50;
  const platform = 'x';

  // 只有在非 Home 模式下才强制需要 username
  // 我们通过判断 username 是否存在来决定
  // 但调用者可能会传入 null
  // 让我们放宽这个检查，具体的 URL 构造逻辑在 scrapeTwitter 里处理
  // if (!username) {
  //   console.error(`[${platform.toUpperCase()}] Twitter username is required`);
  //   return { success: false, tweets: [], error: 'Username is required' };
  // }

  console.log(`[${platform.toUpperCase()}] Starting to scrape tweets for user ${username}, limit=${limit}...`);

  return scrapeTwitter({
    limit: limit,
    username: username,
    withReplies: options.withReplies || false,
    exportCsv: options.exportCsv || false,
    exportJson: options.exportJson || false,
    saveMarkdown: options.saveMarkdown !== false,
    saveScreenshots: options.saveScreenshots || false,
    runContext: options.runContext,
    outputDir: options.outputDir,
    mergeResults: options.mergeResults, // 传递合并选项
    deleteMerged: options.deleteMerged, // 传递删除选项
    clearCache: options.clearCache      // ← 传递清除缓存选项
  });
}

/**
 * 抓取 Twitter 搜索结果 (Hashtag/Keywords)
 * @param {Object} options
 * @param {string} options.query - 搜索关键词 (e.g. "#AI", "Elon Musk")
 * @param {number} options.limit - 数量
 */
async function scrapeSearch(options = {}) {
  const query = options.query;
  const limit = options.limit || 50;
  const platform = 'x';

  if (!query) {
    return { success: false, tweets: [], error: 'Search query is required' };
  }

  console.log(`[${platform.toUpperCase()}] Starting search scrape for "${query}", limit=${limit}...`);

  // 复用 scrapeTwitter，但需要它支持 search 模式
  // 我们通过传入特殊的 username 或者增加一个 mode 参数来实现
  // 这里我们增加一个 searchMode 参数给 scrapeTwitter

  return scrapeTwitter({
    limit: limit,
    searchQuery: query, // 传递搜索词
    mode: 'search',     // 标记为搜索模式
    mergeResults: options.mergeResults, // 传递合并选项
    deleteMerged: options.deleteMerged, // 传递删除选项
    exportCsv: options.exportCsv || false,
    exportJson: options.exportJson || false,
    saveMarkdown: options.saveMarkdown !== false,
    saveScreenshots: options.saveScreenshots || false,
    runContext: options.runContext,
    outputDir: options.outputDir
  });
}

/**
 * 主要的Twitter/X抓取功能
 * @param {Object} options - 配置选项
 * @param {number} options.limit - 最多抓取的推文数量（默认：50）
 * @param {string} options.username - 可选的Twitter用户名
 * @param {boolean} options.saveMarkdown - 是否保存单独的Markdown文件（默认：true）
 * @param {boolean} options.saveScreenshots - 是否保存推文截图（默认：false）
 * @param {boolean} options.exportCsv - 是否导出CSV文件（默认：false）
 * @param {boolean} options.exportJson - 是否导出JSON文件（默认：false）
 * @returns {Promise<{success: boolean, tweets: Array}>}
 */
async function scrapeTwitter(options = {}) {
  const platform = constants.PLATFORM_NAME;
  // 默认选项
  const config = {
    ...constants.DEFAULT_SCRAPER_OPTIONS,
    ...options // 用传入的 options 覆盖默认值
  };

  // 验证配置
  const configValidation = validation.validateScraperConfig(config);
  if (!configValidation.valid) {
    const errorMsg = `Configuration validation failed: ${configValidation.errors.join(', ')}`;
    console.error(`[${platform.toUpperCase()}] ${errorMsg}`);
    return { success: false, tweets: [], error: errorMsg };
  }

  // 验证用户名（如果提供）
  if (config.username) {
    const usernameValidation = validation.validateTwitterUsername(config.username);
    if (!usernameValidation.valid) {
      const errorMsg = `Username validation failed: ${usernameValidation.error}`;
      console.error(`[${platform.toUpperCase()}] ${errorMsg}`);
      return { success: false, tweets: [], error: errorMsg };
    }
    // 使用规范化后的用户名
    config.username = usernameValidation.normalized;
  }

  console.log(`[${platform.toUpperCase()}] Starting timeline scrape, limit=${config.limit} tweets${config.withReplies ? ' (with_replies)' : ''}...`);
  console.log(`[${platform.toUpperCase()}] Options: ${JSON.stringify(config, null, 2)}`);

  const identifierForRun = config.mode === 'search' ? `search_${config.searchQuery}` : (config.username || 'timeline');
  let runContext = config.runContext;
  if (!runContext) {
    runContext = await fileUtils.createRunContext({
      platform: 'twitter',
      identifier: identifierForRun,
      baseOutputDir: config.outputDir,
      timezone: config.timezone
    });
  } else if (!runContext.timezone) {
    runContext.timezone = timeUtils.resolveTimezone(config.timezone);
  }

  const timezone = runContext.timezone || timeUtils.getDefaultTimezone();
  const cachePlatform = runContext.platform || 'twitter';
  const cacheIdentifier = runContext.identifier || fileUtils.sanitizeSegment(identifierForRun);
  const runStartedDate = new Date();
  const runStartedAt = runStartedDate.toISOString();
  const runStartedAtLocal = timeUtils.formatZonedTimestamp(runStartedDate, timezone, {
    includeMilliseconds: true,
    includeOffset: true
  }).iso;

  let browserManager = null;
  let page = null;
  let collectedTweets = [];
  const scrapedUrls = new Set(); // URLs collected in the current session
  let seenUrls; // This will hold the file-based cache

  // 如果设置了 clearCache，先删除缓存文件
  if (config.clearCache) {
    const fs = require('fs');
    // 使用 fileUtils 的统一路径函数，避免硬编码
    const cacheFilePath = fileUtils.getCacheFilePath(cachePlatform, cacheIdentifier);
    try {
      if (fs.existsSync(cacheFilePath)) {
        fs.unlinkSync(cacheFilePath);
        console.log(`[${platform.toUpperCase()}] ✅ Cleared URL cache: ${cacheFilePath}`);
      } else {
        console.log(`[${platform.toUpperCase()}] ℹ️  No cache file found at: ${cacheFilePath}`);
      }
    } catch (err) {
      console.warn(`[${platform.toUpperCase()}] Failed to clear cache: ${err.message}`);
    }
  }

  // 加载缓存（如果没被清除）
  seenUrls = await fileUtils.loadSeenUrls(cachePlatform, cacheIdentifier);
  let noNewTweetsConsecutiveAttempts = 0;
  let profileInfo = null;

  try {
    // 启动浏览器并配置页面
    browserManager = new BrowserManager();
    await browserManager.launch({ headless: true });
    page = await browserManager.createPage();
    console.log(`[${platform.toUpperCase()}] Browser launched and configured`);

    // 加载并注入 Cookie
    try {
      const cookieManager = new CookieManager();
      const cookieInfo = await cookieManager.loadAndInject(page);
      console.log(`[${platform.toUpperCase()}] Loaded ${cookieInfo.cookies.length} cookies from ${cookieInfo.source}`);
    } catch (error) {
      console.error(`[${platform.toUpperCase()}] Cookie error: ${error.message}`);
      return { success: false, tweets: [], error: error.message };
    }

    // 确定访问URL (是主页还是特定用户还是搜索)
    let targetUrl = X_HOME_URL;
    if (config.mode === 'search' && config.searchQuery) {
      // 构造搜索 URL
      // src=typed_query&f=live 表示搜索最新推文 (Live)，如果想要热门可以去掉 &f=live
      const encodedQuery = encodeURIComponent(config.searchQuery);
      targetUrl = `https://x.com/search?q=${encodedQuery}&src=typed_query&f=live`;
      // 搜索模式下的 identifier
      if (!config.username) {
        // 如果没有指定 username (通常搜索模式没有)，我们需要更新 runContext 的 identifier
        // 但 runContext 可能已经创建了。
        // 实际上 identifierForRun 在上面已经决定了。
        // 如果是 search 模式，调用者应该在外面处理好 runContext 或者 identifier
      }
    } else if (config.username) {
      if (config.tab === 'likes') {
        targetUrl = `https://x.com/${config.username}/likes`;
      } else if (config.withReplies || config.tab === 'replies') {
        targetUrl = `https://x.com/${config.username}/with_replies`;
      } else {
        targetUrl = `https://x.com/${config.username}`;
      }
    }

    // 导航到Twitter页面 - 带限流检测和 Cookie 轮换
    console.log(`[${platform.toUpperCase()}] Navigating to ${targetUrl}...`);

    let navigationSuccess = false;
    let cookieRotationAttempts = 0;
    const maxCookieRotationAttempts = 3;

    while (!navigationSuccess && cookieRotationAttempts < maxCookieRotationAttempts) {
      try {
        // 尝试导航 - 使用更短的重试次数以快速检测限流
        await retryUtils.retryPageGoto(
          page,
          targetUrl,
          { waitUntil: 'networkidle2', timeout: 30000 }, // 缩短超时到 30 秒
          {
            maxRetries: 1, // 只重试 1 次，快速失败
            baseDelay: 1000,
            onRetry: (error, attempt) => {
              console.log(`[${platform.toUpperCase()}] Navigation failed (attempt ${attempt}/1): ${error.message}`);
            }
          }
        );

        // 等待推文加载 - 同样缩短时间
        await retryUtils.retryWaitForSelector(
          page,
          dataExtractor.X_SELECTORS.TWEET,
          { timeout: 25000 }, // 缩短到 25 秒
          {
            maxRetries: 1, // 只重试 1 次
            baseDelay: 1000,
            onRetry: (error, attempt) => {
              console.log(`[${platform.toUpperCase()}] Waiting for tweets failed (attempt ${attempt}/1): ${error.message}`);
            }
          }
        );

        console.log(`[${platform.toUpperCase()}] Tweets loaded successfully`);
        navigationSuccess = true;

      } catch (error) {
        // 检测是否是限流错误
        const isRateLimited = error.message.includes('Waiting failed') ||
          error.message.includes('timeout') ||
          error.message.includes('exceeded') ||
          error.message.includes('Waiting for selector') ||
          error.message.includes('Navigation timeout');

        if (isRateLimited && cookieRotationAttempts < maxCookieRotationAttempts - 1) {
          cookieRotationAttempts++;
          console.warn(`[${platform.toUpperCase()}] ⚠️  Rate limit detected! Rotating to next cookie account (attempt ${cookieRotationAttempts}/${maxCookieRotationAttempts})...`);

          // 创建新的 CookieManager 实例并重新加载 cookie
          const CookieManager = require('./core/cookie-manager');
          const newCookieManager = new CookieManager();
          const cookieData = await newCookieManager.load();
          await newCookieManager.injectIntoPage(page);
          console.log(`[${platform.toUpperCase()}] ✅ Switched to cookie: ${path.basename(cookieData.source)}`);

          // 等待一小段时间再重试
          await throttle(2000); // 缩短到 2 秒
        } else {
          // 不是限流错误，或者已经尝试了所有 cookie
          console.error(`[${platform.toUpperCase()}] Navigation/loading failed after trying ${cookieRotationAttempts + 1} cookie accounts: ${error.message}`);
          return { success: false, tweets: [], error: `All cookie accounts may be rate limited: ${error.message}` };
        }
      }
    }

    if (!navigationSuccess) {
      return { success: false, tweets: [], error: 'Failed to navigate after trying all available cookie accounts' };
    }

    // 提取用户资料信息（如果是访问特定用户）
    if (config.username) {
      profileInfo = await dataExtractor.extractProfileInfo(page);
      if (profileInfo) {
        console.log(`[${platform.toUpperCase()}] Profile: ${JSON.stringify(profileInfo)}`);
      }
    }

    // 滚动和抓取逻辑
    let scrollAttempts = 0;
    const maxScrollAttempts = Math.max(50, Math.ceil(config.limit / 5));
    let refreshAttempts = 0; // 新增：刷新计数器
    const maxRefreshAttempts = 3; // 新增：最大刷新次数

    // 首先尝试截取时间线截图（如果启用了截图功能）
    if (config.saveScreenshots) {
      try {
        await screenshotUtils.takeTimelineScreenshot(page, { runContext });
      } catch (error) {
        console.warn('Timeline screenshot failed:', error.message);
      }
    }

    while (collectedTweets.length < config.limit && scrollAttempts < maxScrollAttempts) {
      scrollAttempts++;

      // Check for manual stop signal
      try {
        const server = require('./server');
        if (server.getShouldStopScraping && server.getShouldStopScraping()) {
          console.warn(`[${platform.toUpperCase()}] Manual stop signal received. Terminating scrape gracefully...`);
          console.log(`[${platform.toUpperCase()}] Successfully collected ${collectedTweets.length} tweets before manual stop.`);
          break; // Exit loop and save collected data
        }
      } catch (err) {
        // Server module not available or function doesn't exist, continue normally
      }

      console.log(`[${platform.toUpperCase()}] Scraping attempt ${scrollAttempts}...`);

      // 提取推文数据
      const tweetsOnPage = await dataExtractor.extractTweetsFromPage(page);

      // 添加唯一推文到集合
      let addedInAttempt = 0;
      for (const tweet of tweetsOnPage) {
        if (collectedTweets.length < config.limit &&
          !scrapedUrls.has(tweet.url) &&
          !seenUrls.has(tweet.url)) {

          collectedTweets.push(tweet);
          scrapedUrls.add(tweet.url);
          seenUrls.add(tweet.url);
          addedInAttempt++;
        }
        if (collectedTweets.length >= config.limit) break;
      }

      console.log(`[${platform.toUpperCase()}] Attempt ${scrollAttempts}: Found ${tweetsOnPage.length} tweets on page, added ${addedInAttempt} new tweets. Total: ${collectedTweets.length}`);

      // 广播进度到前端（每5次尝试或有新推文时）
      if (scrollAttempts % 5 === 0 || addedInAttempt > 0) {
        try {
          const server = require('./server');
          if (server.broadcastProgress) {
            server.broadcastProgress({
              type: 'progress',
              current: collectedTweets.length,
              target: config.limit,
              attempts: scrollAttempts
            });
          }
        } catch (err) {
          // Server module not available, ignore
        }
      }

      // 更新连续无新推文计数器
      if (addedInAttempt === 0) {
        noNewTweetsConsecutiveAttempts++;
        console.log(`[${platform.toUpperCase()}] Consecutive attempts with no new tweets: ${noNewTweetsConsecutiveAttempts}`);

        // 早期退出机制：如果页面上推文很少（< 10）且连续2次无新推文，说明到底了
        if (tweetsOnPage.length < 10 && noNewTweetsConsecutiveAttempts >= 2) {
          console.warn(`[${platform.toUpperCase()}] ⚡ Early exit: Detected end of timeline (only ${tweetsOnPage.length} tweets visible + ${noNewTweetsConsecutiveAttempts} attempts with no new content)`);
          console.log(`[${platform.toUpperCase()}] Successfully collected ${collectedTweets.length} tweets (target was ${config.limit}).`);
          break; // 直接退出，不再刷新
        }
      } else {
        noNewTweetsConsecutiveAttempts = 0;
        refreshAttempts = 0; // 新增：如果有新推文，重置刷新计数器
      }

      // 检查是否需要刷新页面
      if (noNewTweetsConsecutiveAttempts >= constants.MAX_CONSECUTIVE_NO_NEW_TWEETS && collectedTweets.length < config.limit) {
        // 新增：检查是否已经刷新太多次
        if (refreshAttempts >= maxRefreshAttempts) {
          console.warn(`[${platform.toUpperCase()}] Reached maximum refresh attempts (${maxRefreshAttempts}). No more tweets available. Stopping scrape.`);
          console.log(`[${platform.toUpperCase()}] Successfully collected ${collectedTweets.length} tweets (target was ${config.limit}).`);
          break; // 退出循环，保存已抓取的数据
        }

        refreshAttempts++;
        console.warn(`[${platform.toUpperCase()}] ${noNewTweetsConsecutiveAttempts} consecutive attempts with no new tweets, refreshing page (attempt ${refreshAttempts}/${maxRefreshAttempts})...`);
        try {
          // 使用重试机制刷新页面
          await retryUtils.retryWithBackoff(
            async () => {
              await page.reload({ waitUntil: 'networkidle2', timeout: constants.NAVIGATION_TIMEOUT });
              console.log(`[${platform.toUpperCase()}] Page refreshed, waiting for tweets to reload...`);
              // 增加刷新后的等待超时时间
              await page.waitForSelector(dataExtractor.X_SELECTORS.TWEET, { timeout: constants.WAIT_FOR_TWEETS_AFTER_REFRESH_TIMEOUT });
              console.log(`[${platform.toUpperCase()}] Tweets reloaded successfully`);
            },
            {
              ...constants.REFRESH_RETRY_CONFIG,
              onRetry: (error, attempt) => {
                console.log(`[${platform.toUpperCase()}] Page refresh failed (attempt ${attempt}/${constants.REFRESH_RETRY_CONFIG.maxRetries}): ${error.message}`);
              }
            }
          );
          noNewTweetsConsecutiveAttempts = 0; // 刷新后重置计数器
          await throttle(constants.getRefreshWaitDelay()); // 刷新后稍作等待
          continue; // 跳过本次滚动的剩余部分，直接开始下一次抓取尝试
        } catch (reloadError) {
          console.error(`[${platform.toUpperCase()}] Page refresh or wait for tweets failed (all retries failed): ${reloadError.message}`);
          // 在退出前截图
          try {
            const errorScreenshotPath = path.join(runContext.screenshotDir, `error_refresh_timeout_${Date.now()}.png`);
            await page.screenshot({ path: errorScreenshotPath, fullPage: true });
            console.log(`[${platform.toUpperCase()}] Error screenshot saved to: ${errorScreenshotPath}`);
          } catch (screenshotError) {
            console.error('Failed to save error screenshot:', screenshotError.message);
          }
          // 刷新失败，可能页面卡死或网络问题，直接退出
          return { success: false, tweets: collectedTweets, error: `Page refresh failed: ${reloadError.message}` };
        }
      }

      // 如果目标未达成且未超最大尝试次数，则滚动页面
      if (collectedTweets.length < config.limit && scrollAttempts < maxScrollAttempts) {
        // 只在每 3 次尝试时打印一次滚动日志，减少冗余
        if (scrollAttempts % 3 === 1 || addedInAttempt > 0) {
          console.log(`[${platform.toUpperCase()}] Scrolling to load more tweets...`);
        }

        await dataExtractor.scrollToBottom(page); // scrollToBottom does not return a boolean, so scrollSuccess check is removed.

        // 随机延迟，避免被检测
        await throttle(constants.getScrollDelay());

        // 等待新推文加载
        const hasNewTweets = await dataExtractor.waitForNewTweets(
          page,
          tweetsOnPage.length,
          constants.WAIT_FOR_NEW_TWEETS_TIMEOUT
        );

        if (!hasNewTweets) {
          console.log(`[${platform.toUpperCase()}] No new tweets detected after scroll (might be no more content or slow loading)`);
        }
      }
    }

    console.log(`[${platform.toUpperCase()}] Scraping completed. Collected ${collectedTweets.length} tweets.`);

    // 保存已抓取的URL集合
    try {
      await fileUtils.saveSeenUrls(cachePlatform, cacheIdentifier, seenUrls);
    } catch (error) {
      console.warn(`[${platform.toUpperCase()}] Failed to save seen URLs:`, error.message);
    }

    // 保存为Markdown文件（如果启用）
    if (config.saveMarkdown && collectedTweets.length > 0) {
      await markdownUtils.saveTweetsAsMarkdown(collectedTweets, runContext);
    } else if (!config.saveMarkdown) {
      console.log(`[${platform.toUpperCase()}] Markdown saving is disabled`);
    }

    // 导出为CSV（如果启用）
    if (config.exportCsv && collectedTweets.length > 0) {
      await exportUtils.exportToCsv(collectedTweets, runContext);
    }

    // 导出为JSON（如果启用）
    if (config.exportJson && collectedTweets.length > 0) {
      await exportUtils.exportToJson(collectedTweets, runContext);
    }

    // 截图（如果启用）
    let screenshotPaths = [];
    if (config.saveScreenshots && collectedTweets.length > 0) {
      screenshotPaths = await screenshotUtils.takeScreenshotsOfTweets(page, collectedTweets, { runContext });
    }

    const runCompletedDate = new Date();
    const runCompletedAt = runCompletedDate.toISOString();
    const runCompletedAtLocal = timeUtils.formatZonedTimestamp(runCompletedDate, timezone, {
      includeMilliseconds: true,
      includeOffset: true
    }).iso;
    const metadata = {
      platform,
      username: config.username || null,
      runId: runContext.runId,
      runTimestamp: runContext.runTimestamp,
      runTimestampIso: runContext.runTimestampIso,
      runTimestampUtc: runContext.runTimestampUtc,
      timezone,
      runStartedAt,
      runStartedAtLocal,
      runCompletedAt,
      runCompletedAtLocal,
      tweetCount: collectedTweets.length,
      withReplies: !!config.withReplies,
      exportCsv: !!config.exportCsv,
      exportJson: !!config.exportJson,
      saveMarkdown: !!config.saveMarkdown,
      saveScreenshots: !!config.saveScreenshots,
      profile: profileInfo || null,
      output: {
        runDir: runContext.runDir,
        markdownDir: runContext.markdownDir,
        csvPath: config.exportCsv ? (runContext.csvPath || path.join(runContext.runDir, 'tweets.csv')) : null,
        jsonPath: config.exportJson ? (runContext.jsonPath || path.join(runContext.runDir, 'tweets.json')) : null,
        indexPath: runContext.markdownIndexPath,
        screenshotDir: runContext.screenshotDir
      }
    };

    // 处理合并逻辑 (如果是单次运行且要求合并)
    // 注意：通常 merge 是在 scrapeTwitterUsers 批量结束后做的
    // 但如果用户只想跑这一个并且要合并（虽然只有一个文件合并没意义，但为了统一逻辑）
    // 或者，我们只在 scrapeTwitterUsers 里做合并。
    // 让我们看看 scrapeTwitterUsers。

    // 实际上，scrapeTwitter 是针对单个用户的。
    // 如果我们在 scrapeTwitterUsers 里循环调用 scrapeTwitter，
    // 那么每个 scrapeTwitter 都会生成一个 runDir。
    // 如果我们要合并，应该是合并这个 runDir 下的所有 markdown？
    // 不，通常是把多个用户的推文合并到一个文件。

    // 但是，根据用户的需求 "删除单个的md文件"，这通常是指：
    // 抓取了一个用户 -> 生成了 tweets.md (或者多个分片) -> 合并成一个 -> 删除分片？
    // 或者是：抓取了多个用户 -> 每个用户有自己的 md -> 合并所有用户 -> 删除每个用户的 md？

    // 让我们看 mergeUtils.mergeMarkdownFiles 的定义：
    // 它合并 sourceDir 下的所有 md 文件。

    // 如果 config.mergeResults 为 true，且我们在 scrapeTwitter 内部：
    // 这里的 collectedTweets 已经被 saveTweetsAsMarkdown 保存到了 runContext.markdownDir 下。
    // 如果 saveTweetsAsMarkdown 生成了多个文件（比如按月分片），那么合并是有意义的。
    // 如果只生成了一个 tweets.md，那合并就是复制一遍。

    // 假设用户意图是：在 Web UI 上点 "Scrape"，抓取完后，得到一个 MD 文件。
    // 现有的逻辑是：saveTweetsAsMarkdown 会生成 `tweets.md` (或者 `tweets_01.md` 等)。
    // 如果我们启用了 merge，我们应该调用 mergeUtils。

    if (config.mergeResults) {
      console.log(`[DEBUG] scrapeTwitter: Calling mergeMarkdownFiles with deleteMerged=${config.deleteMerged}`);
      const mergedPath = await mergeUtils.mergeMarkdownFiles(
        runContext.markdownDir,
        runContext.runDir,
        platform,
        config.deleteMerged // 传递删除标志
      );
      if (mergedPath) {
        // 更新 metadata 指向合并后的文件
        metadata.output.mergedPath = mergedPath;
        // 如果删除了源文件，更新 metadata
        if (config.deleteMerged) {
          metadata.output.markdownDir = null; // 标记为已清理
        }
        // 让前端知道下载哪个文件
        runContext.markdownIndexPath = mergedPath;
      }
    }

    try {
      await fs.promises.writeFile(runContext.metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch (metaError) {
      console.warn(`[${platform.toUpperCase()}] Failed to write metadata: ${metaError.message}`);
    }

    console.log(`[${platform.toUpperCase()}] Output directory for this scraping run: ${runContext.runDir}`);

    return {
      success: true,
      tweets: collectedTweets,
      count: collectedTweets.length,
      screenshotPaths,
      profile: profileInfo || null,
      runContext
    };

  } catch (error) {
    console.error(`[${platform.toUpperCase()}] Scraping failed:`, error.message);

    // 即使失败，如果已经抓取了数据，也尝试保存
    if (collectedTweets && collectedTweets.length > 0) {
      console.log(`[${platform.toUpperCase()}] Attempting to save ${collectedTweets.length} collected tweets before exiting...`);
      try {
        // 保存为Markdown
        if (config.saveMarkdown) {
          await markdownUtils.saveTweetsAsMarkdown(collectedTweets, runContext);
        }
        // 导出为CSV
        if (config.exportCsv) {
          await exportUtils.exportToCsv(collectedTweets, runContext);
        }
        // 导出为JSON
        if (config.exportJson) {
          await exportUtils.exportToJson(collectedTweets, runContext);
        }

        // 生成元数据
        const metadata = {
          platform,
          username: config.username || null,
          runId: runContext.runId,
          runTimestamp: runContext.runTimestamp,
          tweetCount: collectedTweets.length,
          error: error.message,
          status: 'failed_partial'
        };
        await fs.promises.writeFile(runContext.metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

      } catch (saveError) {
        console.error(`[${platform.toUpperCase()}] Failed to save partial data:`, saveError.message);
      }
    }

    return { success: false, tweets: collectedTweets || [], error: error.message, runContext };
  } finally {
    // 关闭浏览器
    if (browserManager) {
      await browserManager.close();
    }
    console.log(`[${platform.toUpperCase()}] Scraping cycle completed`);
  }
}

/**
 * 抓取多个Twitter用户的推文
 * @param {Array} usernames - 用户名数组
 * @param {Object} options - 抓取选项
 * @returns {Promise<Array>} 结果数组
 */
async function scrapeTwitterUsers(usernames, options = {}) {
  if (!Array.isArray(usernames) || usernames.length === 0) {
    console.error('Valid Twitter username array is required');
    return [];
  }

  console.log(`Batch scraping tweets from ${usernames.length} Twitter users`);

  const results = [];
  const resolvedTimezone = timeUtils.resolveTimezone(options.timezone);

  for (let i = 0; i < usernames.length; i++) {
    const username = usernames[i];
    const displayName = username || 'home_timeline';
    console.log(`[${i + 1}/${usernames.length}] Scraping tweets from ${displayName}`);

    try {
      const runContext = await fileUtils.createRunContext({
        platform: 'twitter',
        identifier: displayName,
        baseOutputDir: options.outputDir,
        timezone: resolvedTimezone
      });

      const userOptions = {
        ...options,
        timezone: resolvedTimezone,
        username: username, // 这里保留 null
        limit: options.tweetCount || 20,
        mergeResults: options.mergeResults, // 传递合并选项
        deleteMerged: options.deleteMerged, // 传递删除选项
        runContext
      };

      // 1. 抓取主页/回复
      const result = await scrapeXFeed(userOptions);

      // 2. 如果启用了 Likes 抓取，额外抓取 Likes
      let likesResult = null;
      if (options.scrapeLikes && username) { // 只有指定了用户才能抓 Like
        console.log(`[Likes] Starting to scrape likes for user @${username}...`);
        // 复用同一个 runContext，但可能需要区分文件？
        // 为了简单，我们把 Likes 放在同一个 run 目录下，但文件名不同
        // 或者，我们可以把 Likes 视为一种特殊的 "tweets"

        // 我们需要稍微修改 scrapeTwitter 让他知道这是 Likes
        // 但目前的架构是把所有东西都存为 tweets.json/md
        // 我们可以创建一个子目录或者前缀

        // 实际上，为了 AI 分析方便，我们最好把 Likes 存到一个单独的变量里，最后合并
        // 但 scrapeXFeed 是直接写文件的。

        // 方案：再次调用 scrapeXFeed，但是传入 tab='likes'
        // 并且修改 runContext 或者 output 路径，以免覆盖？
        // 不，我们可以让 scrapeTwitter 支持追加模式，或者我们接受覆盖（不推荐）

        // 更好的方案：
        // 我们让 scrapeTwitter 返回 tweets 数组，我们在这一层做合并？
        // 不行，因为 scrapeTwitter 内部已经写文件了。

        // 让我们简单点：
        // 如果抓取 Likes，我们生成一个单独的 markdown 文件 "likes.md"
        // 我们需要修改 scrapeTwitter 让它支持自定义输出文件名吗？
        // 或者我们只是把 Likes 的结果拿回来，手动处理 AI Export。

        const likesOptions = {
          ...userOptions,
          tab: 'likes',
          saveMarkdown: false, // 我们自己处理 Likes 的 Markdown
          saveScreenshots: false,
          exportCsv: false,
          exportJson: false
        };

        likesResult = await scrapeXFeed(likesOptions);
        if (likesResult.success) {
          console.log(`[Likes] Successfully scraped ${likesResult.tweets.length} liked tweets.`);
          // 标记这些推文为 [LIKED]
          likesResult.tweets.forEach(t => t.isLiked = true);
        }
      }

      if (result.success) {
        // 合并 Likes 到结果中，以便 AI Export 使用
        const allTweets = [...result.tweets];
        if (likesResult && likesResult.success) {
          allTweets.push(...likesResult.tweets);
        }

        results.push({
          username: username || 'home_timeline', // 确保不为 null
          tweetCount: result.tweets.length,
          likedCount: likesResult?.tweets?.length || 0,
          tweets: allTweets, // 包含主页推文和点赞推文
          profile: result.profile || null,
          runDir: result.runContext?.runDir,
          runContext: result.runContext
        });

        if (result.runContext?.runDir) {
          console.log(`Successfully scraped ${result.tweets.length} tweets from ${username ? '@' + username : 'Home Timeline'}, output directory: ${result.runContext.runDir}`);
        } else {
          console.log(`Successfully scraped ${result.tweets.length} tweets from ${username ? '@' + username : 'Home Timeline'}`);
        }
      } else {
        console.error(`Failed to scrape ${username ? '@' + username : 'Home Timeline'}: ${result.error || 'Unknown error'}`);
        results.push({
          username: username || 'home_timeline',
          tweetCount: 0,
          tweets: [],
          error: result.error
        });
      }
    } catch (error) {
      console.error(`Error scraping ${username ? '@' + username : 'Home Timeline'}:`, error);
      results.push({
        username: username || 'home_timeline',
        tweetCount: 0,
        tweets: [],
        error: error.message
      });
    }

    // 添加间隔，避免触发限流
    if (i < usernames.length - 1) {
      const delay = options.delay || constants.BATCH_USER_DELAY;
      console.log(`Waiting ${delay / 1000} seconds before continuing to next user...`);
      await throttle(delay);
    }
  }

  return results;
}

/****************************
 * 调度器功能
 ****************************/

/**
 * 启动周期性爬虫调度器
 * @param {Object} options - 配置选项
 * @param {number} options.interval - 爬取间隔，单位毫秒，默认30秒
 * @param {number} options.limit - 每次爬取的数量限制，默认10
 * @param {boolean} options.saveMarkdown - 是否保存为Markdown，默认true
 * @param {boolean} options.exportCsv - 是否导出CSV，默认false
 * @param {boolean} options.exportJson - 是否导出JSON，默认false
 * @param {boolean} options.saveScreenshots - 是否保存截图，默认false
 * @returns {Object} - 调度器控制对象，包含stop方法
 */
function startScheduler(options = {}) {
  const config = {
    ...constants.DEFAULT_SCHEDULER_OPTIONS,
    ...options
  };

  let isScraping = false; // 防止爬取重叠
  let intervalId = null;
  let isRunning = true;

  console.log(`Scheduler started, scraping every ${config.interval / 1000} seconds`);

  // 爬取函数
  async function performScrape() {
    if (!isRunning) return;
    if (isScraping) {
      console.log('Previous scraping still in progress, skipping this run');
      return;
    }

    isScraping = true;
    try {
      console.log(`Starting scheduled scrape at: ${new Date().toLocaleString()}`);

      await scrapeTwitter({
        limit: config.limit,
        saveMarkdown: config.saveMarkdown,
        exportCsv: config.exportCsv,
        exportJson: config.exportJson,
        saveScreenshots: config.saveScreenshots,
        username: config.username
      });

      console.log(`Scheduled scrape completed at: ${new Date().toLocaleString()}`);
    } catch (error) {
      console.error('Scheduled scrape error:', error);
    } finally {
      isScraping = false;
    }
  }

  // 立即执行一次
  performScrape();

  // 设置定时器
  intervalId = setInterval(performScrape, config.interval);

  // 返回控制对象
  return {
    stop: () => {
      isRunning = false;
      if (intervalId) {
        clearInterval(intervalId);
        console.log('Scheduler stopped');
      }
    },
    isRunning: () => isRunning,
    config
  };
}

/**
 * 运行爬虫调度器（直接执行版本）
 * @param {Object} options - 配置选项
 */
function runScheduler(options = {}) {
  return startScheduler(options);
}

// 导出所有函数
module.exports = {
  // Twitter/X相关
  scrapeTwitter,
  scrapeXFeed,
  scrapeTwitterUsers,
  scrapeSearch,
  scrapeThread, // 新增：线程抓取

  // 调度器功能
  startScheduler,
  runScheduler
};
