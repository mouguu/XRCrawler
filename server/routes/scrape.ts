/**
 * Scrape Execution Routes
 * Handles scraping task submission
 */
import { Hono } from 'hono';
import { scrapeQueue } from '../../core/queue/scrape-queue';
import { JobRepository } from '../../core/db/repositories';
import { createEnhancedLogger } from '../../utils/logger';

const logger = createEnhancedLogger('ScrapeRoutes');
const scrapeRoutes = new Hono();

// Global state for shutdown (imported or passed via context ideally, keeping simple for now)
let isShuttingDown = false;
export const setScrapeShutdown = (val: boolean) => { isShuttingDown = val; };

function normalizeUsername(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  const withoutDomain = trimmed.replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i, '');
  const cleaned = withoutDomain.replace(/^@/, '').split(/[/?#]/)[0];
  return cleaned || undefined;
}

function parseRedditInput(input: string): { subreddit?: string; postUrl?: string } {
  if (!input) return {};
  const trimmed = input.trim();
  if (trimmed.includes('/comments/') || trimmed.includes('redd.it/')) {
    return { postUrl: trimmed };
  }
  const subredditMatch = trimmed.match(/reddit\.com\/r\/([^/?#]+)/i);
  if (subredditMatch) return { subreddit: subredditMatch[1] };
  return { subreddit: trimmed };
}

scrapeRoutes.post('/scrape-v2', async (c) => {
  if (isShuttingDown) {
    return c.json({ error: 'Server is shutting down' }, 503);
  }

  try {
    const body = await c.req.json();
    const {
      type, input, limit, likes, mode, dateRange,
      enableRotation, enableProxy, strategy, antiDetectionLevel,
    } = body;

    logger.info('Received scrape request', { type, input, limit });

    const isTwitter = type === 'profile' || type === 'thread' || type === 'search';
    const isReddit = type === 'reddit';

    if (!isTwitter && !isReddit) {
      return c.json({ success: false, error: 'Invalid scrape type' }, 400);
    }

    let config: Record<string, unknown> = {};

    if (isTwitter) {
      const normalizedUsername = type === 'profile' ? normalizeUsername(input) : undefined;
      config = {
        username: normalizedUsername,
        tweetUrl: type === 'thread' ? input : undefined,
        searchQuery: type === 'search' ? input : undefined,
        limit: limit || 50,
        mode: mode || 'puppeteer',
        likes: likes || false,
        enableRotation: enableRotation !== false,
        enableProxy: enableProxy || false,
        dateRange,
        antiDetectionLevel,
      };
    } else if (isReddit) {
      const parsed = parseRedditInput(input);
      config = {
        subreddit: parsed.subreddit,
        postUrl: parsed.postUrl,
        limit: limit || 500,
        strategy: strategy || 'auto',
        enableProxy: enableProxy || false,
      };
    }

    const dbJob = await JobRepository.createJob({
      type: isTwitter ? `twitter-${type}` : 'reddit',
      config,
      priority: type === 'thread' ? 10 : 5,
    });

    logger.info('Job created', { dbJobId: dbJob.id, type });

    const jobData = {
      jobId: dbJob.id,
      type: isTwitter ? 'twitter' : 'reddit',
      config,
    };

    const bullJob = await scrapeQueue.add(dbJob.id, jobData, {
      priority: type === 'thread' ? 10 : 5,
    });

    if (!bullJob.id) throw new Error('Failed to get BullMQ job ID');

    await JobRepository.updateBullJobId(dbJob.id, bullJob.id);

    return c.json({
      success: true,
      jobId: bullJob.id,
      dbJobId: dbJob.id,
      message: 'Task queued successfully',
      statusUrl: `/api/jobs/${bullJob.id}`,
      progressUrl: `/api/jobs/${bullJob.id}/stream`,
    });
  } catch (err) {
    const error = err as Error;
    logger.error('Queue failed', error);
    return c.json({ success: false, error: error.message || 'Failed to queue task' }, 500);
  }
});

export default scrapeRoutes;
