/**
 * Dashboard API - Stats and Overview
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../core/db/prisma';
import { createEnhancedLogger } from '../utils/logger';

const logger = createEnhancedLogger('StatsAPI');
const router = Router();

// Simple in-memory cache (10 seconds TTL)
let cachedStats: any = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10000;

/**
 * GET /api/stats
 * Returns overall statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Check cache
    const now = Date.now();
    if (cachedStats && (now - cacheTimestamp) < CACHE_TTL) {
      return res.json(cachedStats);
    }

    // Query database
    const [
      totalJobs,
      totalTweets,
      totalErrors,
      activeJobs,
      todayTweets,
      uniqueUsersToday,
      errorsToday,
      recentErrors,
      runningJobs
    ] = await Promise.all([
      prisma.job.count(),
      prisma.tweet.count(),
      prisma.errorLog.count(),
      prisma.job.count({ where: { status: 'active' } }),
      
      // Today's stats
      prisma.tweet.count({
        where: {
          scrapedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      }),
      
      prisma.tweet.findMany({
        where: {
          scrapedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        },
        select: { username: true },
        distinct: ['username']
      }),
      
      prisma.errorLog.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      }),
      
      // Recent errors (last 10)
      prisma.errorLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          category: true,
          message: true,
          createdAt: true,
          severity: true
        }
      }),
      
      // Running jobs
      prisma.job.findMany({
        where: { status: 'active' },
        select: {
          id: true,
          type: true,
          config: true,
          startedAt: true,
          _count: {
            select: { tweets: true }
          }
        }
      })
    ]);

    const stats = {
      summary: {
        totalTweets,
        totalJobs,
        activeJobs,
        totalErrors
      },
      today: {
        tweetsScraped: todayTweets,
        uniqueUsers: uniqueUsersToday.length,
        errors: errorsToday
      },
      recentErrors: recentErrors.map(e => ({
        category: e.category,
        message: e.message,
        timestamp: e.createdAt,
        severity: e.severity
      })),
      runningJobs: runningJobs.map(j => ({
        id: j.id,
        type: j.type,
        username: (j.config as any)?.username || 'N/A',
        runningSince: j.startedAt,
        tweetsCollected: j._count.tweets
      }))
    };

    // Update cache
    cachedStats = stats;
    cacheTimestamp = now;

    res.json(stats);
  } catch (error: any) {
    logger.error('Stats API failed', error);
    res.status(500).json({
      error: 'Failed to fetch stats',
      message: error.message
    });
  }
});

export default router;
