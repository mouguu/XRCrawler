/**
 * Worker Processor for Scraping Jobs
 *
 * Uses platform adapters to execute scraping tasks from the queue
 */

import { Worker, Job } from 'bullmq';
import { redisConnection, redisPublisher } from './connection';
import { JobLog, JobProgress, ScrapeJobData, ScrapeJobResult } from './types';
import { getConfigManager } from '../../utils/config-manager';
import { createEnhancedLogger } from '../../utils/logger';
import { AdapterJobContext } from '../platforms/types';
import { getAdapter, registerAdapter } from '../platforms/registry';
import { twitterAdapter } from '../platforms/twitter-adapter';
import { redditAdapter } from '../platforms/reddit-adapter';

const logger = createEnhancedLogger('Worker');
const config = getConfigManager();

// Register built-in adapters at startup
registerAdapter(twitterAdapter);
registerAdapter(redditAdapter);

/**
 * Job Context - encapsulates job-specific event handling
 */
class JobContext implements AdapterJobContext {
  constructor(private job: Job<ScrapeJobData>) {}

  /**
   * Emit progress update
   */
  async emitProgress(progress: JobProgress) {
    const percentage = progress.target > 0
      ? Math.round((progress.current / progress.target) * 100)
      : 0;

    await this.job.updateProgress({
      ...progress,
      percentage,
    });

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
    return false; // TODO: Implement cancellation mechanism
  }

  /**
   * Log helper
   */
  async log(message: string, level: JobLog['level'] = 'info') {
    return this.emitLog({
      level,
      message,
      timestamp: Date.now(),
    });
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
        const adapter = getAdapter(type);
        if (adapter.init) {
          await adapter.init();
        }
        return await adapter.process(job.data, ctx);
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
      stats: job.returnvalue?.stats,
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
