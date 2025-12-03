/**
 * Scrape Queue Definition
 * 
 * BullMQ queue for managing scraping tasks
 */

import { Queue, QueueEvents } from 'bullmq';
import { redisConnection } from './connection';
import { ScrapeJobData, ScrapeJobResult } from './types';
import { createEnhancedLogger } from '../../utils/logger';

const logger = createEnhancedLogger('ScrapeQueue');

/**
 * Main scraping queue
 */
export const scrapeQueue = new Queue<ScrapeJobData, ScrapeJobResult>('scraper', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential',
      delay: 5000, // Start with 5 seconds
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 100, // Keep max 100 completed jobs
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours for debugging
    },
  },
});

/**
 * Queue events for monitoring
 */
export const scrapeQueueEvents = new QueueEvents('scraper', {
  connection: redisConnection,
});

// Event listeners for monitoring
scrapeQueueEvents.on('completed', ({ jobId, returnvalue }) => {
  const stats = (returnvalue as any)?.stats;
  logger.info('Job completed', { jobId, stats });
});

scrapeQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error('Job failed', new Error(failedReason || 'Unknown error'), { jobId });
});

scrapeQueueEvents.on('progress', ({ jobId, data }) => {
  logger.debug('Job progress', { jobId, progress: data });
});

/**
 * Graceful shutdown
 */
export async function closeScrapeQueue(): Promise<void> {
  logger.info('Closing scrape queue...');
  await scrapeQueue.close();
  await scrapeQueueEvents.close();
  logger.info('Scrape queue closed');
}
