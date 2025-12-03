/**
 * Job Management API Routes
 * 
 * Endpoints for querying job status, streaming progress, and cancelling jobs
 */

import express, { Request, Response } from 'express';
import { scrapeQueue } from '../../core/queue/scrape-queue';
import { redisSubscriber } from '../../core/queue/connection';
import { createEnhancedLogger } from '../../utils/logger';

const router = express.Router();
const logger = createEnhancedLogger('JobRoutes');

/**
 * GET /api/job/:jobId
 * Get job status and result
 */
router.get('/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    const job = await scrapeQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();
    const progress = job.progress;
    const returnvalue = job.returnvalue;

    res.json({
      id: job.id,
      type: job.data.type,
      state, // 'waiting', 'active', 'completed', 'failed', 'delayed'
      progress,
      result: returnvalue,
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      finishedAt: job.finishedOn,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
    });
  } catch (error: any) {
    logger.error('Failed to get job status', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/job/:jobId/stream
 * Server-Sent Events stream for job progress and logs
 */
router.get('/:jobId/stream', async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    // Verify job exists
    const job = await scrapeQueue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send initial connection event with job state
    const initialState = await job.getState();
    sendEvent('connected', {
      jobId,
      type: job.data.type,
      state: initialState,
      progress: job.progress,
      createdAt: job.timestamp,
    });

    // Subscribe to job-specific Redis channels
    const progressChannel = `job:${jobId}:progress`;
    const logChannel = `job:${jobId}:log`;

    await redisSubscriber.subscribe(progressChannel, logChannel);

    // Message handler for Redis Pub/Sub
    const messageHandler = (channel: string, message: string) => {
      try {
        const data = JSON.parse(message);

        if (channel === progressChannel) {
          sendEvent('progress', data);
        } else if (channel === logChannel) {
          sendEvent('log', data);
        }
      } catch (error) {
        logger.error('Failed to parse Redis message', error as Error);
      }
    };

    redisSubscriber.on('message', messageHandler);

    // Poll job state for completion/failure
    const pollInterval = setInterval(async () => {
      try {
        const currentState = await job.getState();

        if (currentState === 'completed') {
          sendEvent('completed', {
            result: job.returnvalue,
            finishedAt: job.finishedOn,
          });
          clearInterval(pollInterval);
        } else if (currentState === 'failed') {
          sendEvent('failed', {
            error: job.failedReason,
            finishedAt: job.finishedOn,
          });
          clearInterval(pollInterval);
        }
      } catch (error) {
        logger.error('Failed to poll job state', error as Error);
      }
    }, 1000);

    // Cleanup on client disconnect
    req.on('close', () => {
      clearInterval(pollInterval);
      redisSubscriber.off('message', messageHandler);
      redisSubscriber.unsubscribe(progressChannel, logChannel);
      logger.debug('SSE client disconnected', { jobId });
    });
  } catch (error: any) {
    logger.error('Failed to create SSE stream', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/job/:jobId/cancel
 * Cancel a job
 */
router.post('/:jobId/cancel', async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    const job = await scrapeQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();

    if (state === 'completed' || state === 'failed') {
      return res.status(400).json({
        error: `Cannot cancel job in ${state} state`,
      });
    }

    // Remove the job from queue
    await job.remove();

    logger.info('Job cancelled', { jobId });

    res.json({
      success: true,
      message: 'Job cancelled successfully',
    });
  } catch (error: any) {
    logger.error('Failed to cancel job', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/job/:jobId
 * Delete a completed/failed job
 */
router.delete('/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    const job = await scrapeQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    await job.remove();

    res.json({
      success: true,
      message: 'Job deleted successfully',
    });
  } catch (error: any) {
    logger.error('Failed to delete job', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/jobs
 * List all jobs (with pagination and filtering)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { state, type, start = '0', count = '10' } = req.query;

    const startIdx = parseInt(start as string, 10);
    const countNum = Math.min(parseInt(count as string, 10), 100); // Max 100

    let jobs;

    // Filter by state
    if (state === 'completed') {
      jobs = await scrapeQueue.getCompleted(startIdx, startIdx + countNum - 1);
    } else if (state === 'failed') {
      jobs = await scrapeQueue.getFailed(startIdx, startIdx + countNum - 1);
    } else if (state === 'active') {
      jobs = await scrapeQueue.getActive(startIdx, startIdx + countNum - 1);
    } else if (state === 'waiting') {
      jobs = await scrapeQueue.getWaiting(startIdx, startIdx + countNum - 1);
    } else if (state === 'delayed') {
      jobs = await scrapeQueue.getDelayed(startIdx, startIdx + countNum - 1);
    } else {
      // Get all jobs (this can be expensive, use with caution)
      const [waiting, active, completed, failed] = await Promise.all([
        scrapeQueue.getWaiting(0, 9),
        scrapeQueue.getActive(0, 9),
        scrapeQueue.getCompleted(0, 9),
        scrapeQueue.getFailed(0, 9),
      ]);
      jobs = [...waiting, ...active, ...completed, ...failed];
    }

    // Filter by type if specified
    if (type) {
      jobs = jobs.filter((job) => job.data.type === type);
    }

    // Map to response format
    const jobList = await Promise.all(
      jobs.map(async (job) => ({
        id: job.id,
        type: job.data.type,
        state: await job.getState(),
        progress: job.progress,
        createdAt: job.timestamp,
        processedAt: job.processedOn,
        finishedAt: job.finishedOn,
      }))
    );

    res.json({
      jobs: jobList,
      total: jobList.length,
    });
  } catch (error: any) {
    logger.error('Failed to list jobs', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
