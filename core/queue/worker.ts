/**
 * Worker Processor for Scraping Jobs
 * 
 * Handles execution of Twitter and Reddit scraping tasks from the queue
 */

import { Worker, Job } from 'bullmq';
import { redisConnection, redisPublisher } from './connection';
import { ScrapeJobData, ScrapeJobResult, JobProgress, JobLog } from './types';
import { ScraperEngine } from '../scraper-engine';
import { RedditApiClient } from '../reddit-api-client';
import { ScraperErrors } from '../errors';
import { getConfigManager } from '../../utils/config-manager';
import { createEnhancedLogger } from '../../utils/logger';
import { createEventBus } from '../event-bus';

const logger = createEnhancedLogger('Worker');
const config = getConfigManager();

/**
 * Job Context - encapsulates job-specific event handling
 */
class JobContext {
  constructor(private job: Job<ScrapeJobData>) {}

  /**
   * Emit progress update
   */
  async emitProgress(progress: JobProgress) {
    // Update BullMQ job progress
    const percentage = progress.target > 0 
      ? Math.round((progress.current / progress.target) * 100)
      : 0;
    
    await this.job.updateProgress({
      ...progress,
      percentage,
    });

    // Publish to Redis Pub/Sub for SSE streaming
    await redisPublisher.publish(
      `job:${this.job.id}:progress`,
      JSON.stringify({ ...progress, percentage })
    );
  }

  /**
   * Emit log message
   */
  async emitLog(log: JobLog) {
    await redisPublisher.publish(
      `job:${this.job.id}:log`,
      JSON.stringify(log)
    );
  }

  /**
   * Check if job should stop (cancelled by user)
   */
  getShouldStop(): boolean {
    // BullMQ doesn't have a built-in "isActive" check during processing
    // We'll rely on the job state being updated externally
    return false; // TODO: Implement cancellation mechanism
  }

  /**
   * Log helper
   */
  log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    this.emitLog({
      level,
      message,
      timestamp: Date.now(),
    });
  }
}

/**
 * Handle Twitter scraping job
 */
async function handleTwitterJob(
  ctx: JobContext,
  data: ScrapeJobData
): Promise<ScrapeJobResult> {
  const { config: jobConfig } = data;
  const startTime = Date.now();

  // Bridge ScraperEngine event bus to queue SSE (Redis)
  const jobEventBus = createEventBus();
  jobEventBus.on(jobEventBus.events.SCRAPE_PROGRESS, (progress: any) => {
    ctx.emitProgress({
      current: progress.current ?? 0,
      target: progress.target ?? jobConfig.limit ?? 0,
      action: progress.action || 'scraping',
    });
  });
  jobEventBus.on(jobEventBus.events.LOG_MESSAGE, (log: any) => {
    ctx.emitLog({
      level: (log.level || 'info') as any,
      message: log.message,
      timestamp: log.timestamp ? new Date(log.timestamp).getTime() : Date.now(),
    });
  });

  await ctx.log(`Starting Twitter scrape: ${jobConfig.username || jobConfig.tweetUrl || jobConfig.searchQuery}`);

  const engine = new ScraperEngine(
    () => ctx.getShouldStop(),
    { apiOnly: jobConfig.mode === 'graphql', eventBus: jobEventBus }
  );

  try {
    await engine.init();
    engine.proxyManager.setEnabled(jobConfig.enableProxy || false);

    // Load cookies
    const cookiesLoaded = await engine.loadCookies(jobConfig.enableRotation !== false);
    if (!cookiesLoaded) {
      throw ScraperErrors.cookieLoadFailed('Failed to load cookies');
    }

    let result;

    // Determine scraping type and execute
    if (jobConfig.username) {
      // Profile timeline
      await ctx.log(`Scraping @${jobConfig.username}'s ${jobConfig.tab || 'posts'}...`);
      
      const timelineConfig: any = {
        username: jobConfig.username,
        limit: jobConfig.limit || 50,
        saveMarkdown: true,
        scrapeMode: (jobConfig.mode || 'puppeteer') as 'puppeteer' | 'graphql',
        dateRange: jobConfig.dateRange,
      };

      // Only include tab for likes/replies, not for default posts
      if (jobConfig.tab === 'likes' || jobConfig.tab === 'replies') {
        timelineConfig.tab = jobConfig.tab;
      }

      result = await engine.scrapeTimeline(timelineConfig);

      // Update progress as tweets are collected
      if (result?.tweets) {
        await ctx.emitProgress({
          current: result.tweets.length,
          target: jobConfig.limit || 50,
          action: `Scraped ${result.tweets.length} tweets`,
        });
      }

      // Handle likes if requested
      if (jobConfig.likes && jobConfig.mode !== 'graphql') {
        await ctx.log('Fetching liked tweets...');
        const likesResult = await engine.scrapeTimeline({
          username: jobConfig.username,
          tab: 'likes',
          limit: jobConfig.limit || 50,
          saveMarkdown: false,
          scrapeMode: 'puppeteer',
        });

        if (likesResult.success && likesResult.tweets) {
          const likedTweets = likesResult.tweets.map((t: any) => ({
            ...t,
            isLiked: true,
          }));
          result.tweets = [...(result.tweets || []), ...likedTweets];
          await ctx.log(`Added ${likedTweets.length} liked tweets`);
        }
      }
    } else if (jobConfig.tweetUrl) {
      // Thread scraping
      await ctx.log(`Scraping thread: ${jobConfig.tweetUrl}`);
      
      result = await engine.scrapeThread({
        tweetUrl: jobConfig.tweetUrl,
        maxReplies: jobConfig.limit || 50,
        saveMarkdown: true,
        scrapeMode: (jobConfig.mode || 'puppeteer') as 'puppeteer' | 'graphql',
      });

      if (result?.tweets) {
        await ctx.emitProgress({
          current: result.tweets.length,
          target: jobConfig.limit || 50,
          action: `Scraped ${result.tweets.length} replies`,
        });
      }
    } else if (jobConfig.searchQuery) {
      // Search scraping
      await ctx.log(`Searching: "${jobConfig.searchQuery}"`);
      
      result = await engine.scrapeTimeline({
        mode: 'search',
        searchQuery: jobConfig.searchQuery,
        limit: jobConfig.limit || 50,
        saveMarkdown: true,
        scrapeMode: jobConfig.mode || 'puppeteer',
        dateRange: jobConfig.dateRange,
      });

      if (result?.tweets) {
        await ctx.emitProgress({
          current: result.tweets.length,
          target: jobConfig.limit || 50,
          action: `Found ${result.tweets.length} tweets`,
        });
      }
    } else {
      throw new Error('Invalid Twitter job configuration: missing username, tweetUrl, or searchQuery');
    }

    await engine.close();

    // Process result
    if (result?.success && result.runContext?.markdownIndexPath) {
      const duration = Date.now() - startTime;
      await ctx.log(`Scraping completed successfully! (${(duration / 1000).toFixed(1)}s)`, 'info');

      return {
        success: true,
        downloadUrl: `/api/download?path=${encodeURIComponent(result.runContext.markdownIndexPath)}`,
        stats: {
          count: result.tweets?.length || 0,
          duration,
        },
        performance: result.performance,
      };
    }

    throw new Error(result?.error || 'Scraping failed with unknown error');
  } catch (error: any) {
    await ctx.log(`Error: ${error.message}`, 'error');
    logger.error('Twitter scraping failed', error);
    throw error;
  } finally {
    await engine.close();
  }
}

/**
 * Handle Reddit scraping job
 */
async function handleRedditJob(
  ctx: JobContext,
  data: ScrapeJobData
): Promise<ScrapeJobResult> {
  const { config: jobConfig } = data;
  const redditConfig = config.getRedditConfig();
  const startTime = Date.now();

  await ctx.log(`Starting Reddit scrape: ${jobConfig.subreddit || jobConfig.postUrl}`);

  const client = new RedditApiClient(
    redditConfig.apiUrl,
    redditConfig.apiTimeout
  );

  // Health check
  const isHealthy = await client.healthCheck();
  if (!isHealthy) {
    throw ScraperErrors.apiRequestFailed(
      'Reddit API server is not available. Please start it with: pnpm run dev:reddit',
      undefined,
      { type: 'reddit', service: 'health_check_failed' }
    );
  }

  // Determine if it's a post URL or subreddit
  const isPostUrl = jobConfig.postUrl !== undefined;
  let result;

  try {
    if (isPostUrl) {
      await ctx.log(`Scraping post: ${jobConfig.postUrl}`);
      result = await client.scrapePost(jobConfig.postUrl!);
    } else {
      await ctx.log(`Scraping r/${jobConfig.subreddit}`);
      result = await client.scrapeSubreddit({
        subreddit: jobConfig.subreddit || 'UofT',
        maxPosts: jobConfig.limit || 500,
        strategy: (jobConfig.strategy || redditConfig.defaultStrategy) as 'auto' | 'super_full' | 'super_recent' | 'new',
        saveJson: true,
        onProgress: (current, total, message) => {
          ctx.emitProgress({ current, target: total, action: message });
        },
        onLog: (message, level = 'info') => {
          ctx.log(message, level as any);
        },
      });
    }

    if (result.success && result.data?.file_path) {
      const duration = Date.now() - startTime;
      const count = result.data.scraped_count || result.data.comment_count || 0;

      await ctx.log(`Reddit scraping completed! ${count} items scraped (${(duration / 1000).toFixed(1)}s)`, 'info');

      return {
        success: true,
        downloadUrl: `/api/download?path=${encodeURIComponent(result.data.file_path)}`,
        stats: {
          count,
          duration,
        },
      };
    }

    throw new Error(result.error || 'Reddit scraping failed');
  } catch (error: any) {
    await ctx.log(`Error: ${error.message}`, 'error');
    logger.error('Reddit scraping failed', error);
    throw error;
  }
}

/**
 * Create and configure the worker
 */
export function createScrapeWorker(concurrency?: number) {
  const queueConfig = config.getQueueConfig();
  const workerConcurrency = concurrency || queueConfig.concurrency;

  logger.info('Creating scrape worker', { concurrency: workerConcurrency });

  const worker = new Worker<ScrapeJobData, ScrapeJobResult>(
    'scraper',
    async (job) => {
      const ctx = new JobContext(job);
      const { type, jobId } = job.data;

      logger.info(`Processing job ${job.id}`, { type, jobId });

      try {
        if (type === 'twitter') {
          return await handleTwitterJob(ctx, job.data);
        } else if (type === 'reddit') {
          return await handleRedditJob(ctx, job.data);
        } else {
          throw new Error(`Unknown job type: ${type}`);
        }
      } catch (error: any) {
        logger.error(`Job ${job.id} failed`, error);
        throw error; // BullMQ will handle retries
      }
    },
    {
      connection: redisConnection,
      concurrency: workerConcurrency, // 🔥 Key: Control parallelism
      limiter: {
        max: queueConfig.rateLimit.max,
        duration: queueConfig.rateLimit.duration,
      },
    }
  );

  // Worker event handlers
  worker.on('completed', (job) => {
    logger.info(`Job ${job.id} completed`, { 
      type: job.data.type,
      stats: job.returnvalue?.stats 
    });
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed`, err, {
      type: job?.data?.type,
      attempts: job?.attemptsMade,
    });
  });

  worker.on('error', (err) => {
    logger.error('Worker error', err);
  });

  worker.on('active', (job) => {
    logger.info(`Job ${job.id} started`, { type: job.data.type });
  });

  return worker;
}

/**
 * Graceful worker shutdown
 */
export async function shutdownWorker(worker: Worker): Promise<void> {
  logger.info('Shutting down worker...');
  await worker.close();
  logger.info('Worker shut down');
}
