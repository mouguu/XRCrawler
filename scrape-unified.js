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
const markdownUtils = require('./utils/markdown');
const exportUtils = require('./utils/export');
const screenshotUtils = require('./utils/screenshot');
const retryUtils = require('./utils/retry');
const validation = require('./utils/validation');
const constants = require('./config/constants');

// 常量定义
const X_HOME_URL = 'https://x.com/home';

// 工具函数
const throttle = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/****************************
 * TWITTER/X 相关函数
 ****************************/

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
  
  if (!username) {
    console.error(`[${platform.toUpperCase()}] 必须提供Twitter用户名`);
    return { success: false, tweets: [], error: 'Username is required' };
  }
  
  console.log(`[${platform.toUpperCase()}] 开始抓取用户 ${username} 的推文，上限=${limit}条...`);
  
  return scrapeTwitter({
    limit: limit,
    username: username,
    withReplies: options.withReplies || false,
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
    const errorMsg = `配置验证失败: ${configValidation.errors.join(', ')}`;
    console.error(`[${platform.toUpperCase()}] ${errorMsg}`);
    return { success: false, tweets: [], error: errorMsg };
  }

  // 验证用户名（如果提供）
  if (config.username) {
    const usernameValidation = validation.validateTwitterUsername(config.username);
    if (!usernameValidation.valid) {
      const errorMsg = `用户名验证失败: ${usernameValidation.error}`;
      console.error(`[${platform.toUpperCase()}] ${errorMsg}`);
      return { success: false, tweets: [], error: errorMsg };
    }
    // 使用规范化后的用户名
    config.username = usernameValidation.normalized;
  }

  console.log(`[${platform.toUpperCase()}] 开始时间线抓取，上限=${config.limit}条推文${config.withReplies ? '（with_replies）' : ''}...`);
  console.log(`[${platform.toUpperCase()}] 选项: ${JSON.stringify(config, null, 2)}`);

  const identifierForRun = config.username || 'timeline';
  let runContext = config.runContext;
  if (!runContext) {
    runContext = await fileUtils.createRunContext({
      platform: 'twitter',
      identifier: identifierForRun,
      baseOutputDir: config.outputDir
    });
  }
  const cachePlatform = runContext.platform || 'twitter';
  const cacheIdentifier = runContext.identifier || fileUtils.sanitizeSegment(identifierForRun);
  const runStartedAt = new Date().toISOString();
  
  let browserManager = null;
  let page = null;
  let collectedTweets = [];
  const scrapedUrls = new Set();
  let seenUrls = await fileUtils.loadSeenUrls(cachePlatform, cacheIdentifier);
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

    // 确定访问URL (是主页还是特定用户)
    const targetUrl = config.username ? 
      `https://x.com/${config.username}${config.withReplies ? '/with_replies' : ''}` : 
      X_HOME_URL;
    
    // 导航到Twitter页面
    console.log(`[${platform.toUpperCase()}] 正在导航到 ${targetUrl}...`);
    try {
      await retryUtils.retryPageGoto(
        page,
        targetUrl,
        { waitUntil: 'networkidle2', timeout: constants.NAVIGATION_TIMEOUT },
        {
          ...constants.NAVIGATION_RETRY_CONFIG,
          onRetry: (error, attempt) => {
            console.log(`[${platform.toUpperCase()}] 导航失败 (尝试 ${attempt}/${constants.NAVIGATION_RETRY_CONFIG.maxRetries}): ${error.message}`);
          }
        }
      );
    } catch (navError) {
      console.error(`[${platform.toUpperCase()}] 导航失败（所有重试均失败）: ${navError.message}`);
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
            console.log(`[${platform.toUpperCase()}] Waiting for tweets failed (attempt ${attempt}/${constants.SELECTOR_RETRY_CONFIG.maxRetries}): ${error.message}`);
          }
        }
      );
      console.log(`[${platform.toUpperCase()}] Tweets loaded successfully`);
    } catch (waitError) {
      console.error(`[${platform.toUpperCase()}] No tweets found (all retries failed):`, waitError.message);
      return { success: false, tweets: [], error: waitError.message };
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
    
    // 首先尝试截取时间线截图（如果启用了截图功能）
    if (config.saveScreenshots) {
      try {
        await screenshotUtils.takeTimelineScreenshot(page, { runContext });
      } catch (error) {
        console.warn('时间线截图失败:', error.message);
      }
    }
    
    while (collectedTweets.length < config.limit && scrollAttempts < maxScrollAttempts) {
      scrollAttempts++;
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
      
      console.log(`[${platform.toUpperCase()}] 尝试 ${scrollAttempts}: 页面上有 ${tweetsOnPage.length} 条推文，添加了 ${addedInAttempt} 条新推文。总计: ${collectedTweets.length}`);

      // 更新连续无新推文计数器
      if (addedInAttempt === 0) {
        noNewTweetsConsecutiveAttempts++;
        console.log(`[${platform.toUpperCase()}] 连续无新推文次数: ${noNewTweetsConsecutiveAttempts}`);
      } else {
        noNewTweetsConsecutiveAttempts = 0; 
      }

      // 检查是否需要刷新页面
      if (noNewTweetsConsecutiveAttempts >= constants.MAX_CONSECUTIVE_NO_NEW_TWEETS && collectedTweets.length < config.limit) {
        console.warn(`[${platform.toUpperCase()}] 连续 ${noNewTweetsConsecutiveAttempts} 次未抓到新推文，尝试刷新页面...`);
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
                console.log(`[${platform.toUpperCase()}] 页面刷新失败 (尝试 ${attempt}/${constants.REFRESH_RETRY_CONFIG.maxRetries}): ${error.message}`);
              }
            }
          );
          noNewTweetsConsecutiveAttempts = 0; // 刷新后重置计数器
          await throttle(constants.getRefreshWaitDelay()); // 刷新后稍作等待
          continue; // 跳过本次滚动的剩余部分，直接开始下一次抓取尝试
        } catch (reloadError) {
          console.error(`[${platform.toUpperCase()}] 页面刷新或等待推文失败（所有重试均失败）: ${reloadError.message}`);
          // 在退出前截图
          try {
            const errorScreenshotPath = path.join(runContext.screenshotDir, `error_refresh_timeout_${Date.now()}.png`);
            await page.screenshot({ path: errorScreenshotPath, fullPage: true });
            console.log(`[${platform.toUpperCase()}] 错误截图已保存到: ${errorScreenshotPath}`);
          } catch (screenshotError) {
            console.error('保存错误截图失败:', screenshotError.message);
          }
          // 刷新失败，可能页面卡死或网络问题，直接退出
          return { success: false, tweets: collectedTweets, error: `页面刷新失败: ${reloadError.message}` };
        }
      }

      // 如果目标未达成且未超最大尝试次数，则滚动页面
      if (collectedTweets.length < config.limit && scrollAttempts < maxScrollAttempts) {
        console.log(`[${platform.toUpperCase()}] Scrolling to load more tweets...`);

        // 滚动到底部
        await dataExtractor.scrollToBottom(page);

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

    console.log(`[${platform.toUpperCase()}] 抓取完成。已收集 ${collectedTweets.length} 条推文。`);

    // 保存已抓取的URL集合
    try {
      await fileUtils.saveSeenUrls(cachePlatform, cacheIdentifier, seenUrls);
    } catch (error) {
      console.warn(`[${platform.toUpperCase()}] 保存已抓取的 URL 集合失败:`, error.message);
    }

    // 保存为Markdown文件（如果启用）
    if (config.saveMarkdown && collectedTweets.length > 0) {
      await markdownUtils.saveTweetsAsMarkdown(collectedTweets, runContext);
    } else if (!config.saveMarkdown) {
      console.log(`[${platform.toUpperCase()}] Markdown保存已禁用`);
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

    const runCompletedAt = new Date().toISOString();
    const metadata = {
      platform,
      username: config.username || null,
      runId: runContext.runId,
      runTimestamp: runContext.runTimestamp,
      runStartedAt,
      runCompletedAt,
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

    try {
      await fs.promises.writeFile(runContext.metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch (metaError) {
      console.warn(`[${platform.toUpperCase()}] 写入 metadata 失败: ${metaError.message}`);
    }

    console.log(`[${platform.toUpperCase()}] 本次抓取输出目录: ${runContext.runDir}`);

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
    return { success: false, tweets: [], error: error.message, runContext };
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
    console.error('需要提供有效的Twitter用户名数组');
    return [];
  }
  
  console.log(`批量抓取 ${usernames.length} 个Twitter用户的推文`);
  
  const results = [];
  
  for (let i = 0; i < usernames.length; i++) {
    const username = usernames[i];
    console.log(`[${i+1}/${usernames.length}] 抓取用户 @${username} 的推文`);
    
    try {
      const runContext = await fileUtils.createRunContext({
        platform: 'twitter',
        identifier: username,
        baseOutputDir: options.outputDir
      });

      const userOptions = {
        ...options,
        username,
        limit: options.tweetCount || 20,
        runContext
      };
      
      const result = await scrapeXFeed(userOptions);
      
      if (result.success) {
        results.push({
          username,
          tweetCount: result.tweets.length,
          tweets: result.tweets,
          profile: result.profile || null,
          runDir: result.runContext?.runDir,
          runContext: result.runContext
        });
        
        if (result.runContext?.runDir) {
          console.log(`成功抓取 @${username} 的 ${result.tweets.length} 条推文，输出目录: ${result.runContext.runDir}`);
        } else {
          console.log(`成功抓取 @${username} 的 ${result.tweets.length} 条推文`);
        }
      } else {
        console.error(`抓取 @${username} 失败: ${result.error || '未知错误'}`);
        results.push({
          username,
          tweetCount: 0,
          tweets: [],
          error: result.error
        });
      }
    } catch (error) {
      console.error(`抓取 @${username} 出错:`, error);
      results.push({
        username,
        tweetCount: 0,
        tweets: [],
        error: error.message
      });
    }
    
    // 添加间隔，避免触发限流
    if (i < usernames.length - 1) {
      const delay = options.delay || constants.BATCH_USER_DELAY;
      console.log(`等待 ${delay/1000} 秒后继续下一个用户...`);
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

  console.log(`启动调度器，每隔 ${config.interval / 1000} 秒爬取一次`);

  // 爬取函数
  async function performScrape() {
    if (!isRunning) return;
    if (isScraping) {
      console.log('上一次爬取仍在进行中，跳过本次爬取');
      return;
    }

    isScraping = true;
    try {
      console.log(`开始定时爬取，时间: ${new Date().toLocaleString()}`);

      await scrapeTwitter({
        limit: config.limit,
        saveMarkdown: config.saveMarkdown,
        exportCsv: config.exportCsv,
        exportJson: config.exportJson,
        saveScreenshots: config.saveScreenshots,
        username: config.username
      });

      console.log(`定时爬取完成，时间: ${new Date().toLocaleString()}`);
    } catch (error) {
      console.error('定时爬取出错:', error);
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
        console.log('调度器已停止');
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

  // 调度器功能
  startScheduler,
  runScheduler
}; 
