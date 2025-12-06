/**
 * Consolidated Database Repositories
 * Contains Prisma client instance and all data access logic.
 */

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { ErrorLog, Job, Task, Tweet } from '../../generated/prisma/client';
import { createEnhancedLogger } from '../../utils/logger';

const logger = createEnhancedLogger('DB');

// ==========================================
// Part 1: Prisma Client Instance (Prisma v7 with Driver Adapter)
// ==========================================

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

// Initialize PostgreSQL connection pool
const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.pool = pool;
}

// Create Prisma adapter
const adapter = new PrismaPg(pool);

// Initialize Prisma Client with adapter (Prisma v7 requirement)
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.LOG_LEVEL === 'debug'
        ? ['query', 'error', 'warn']
        : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// ==========================================
// Part 2: Checkpoint Repository
// ==========================================

export class CheckpointRepository {
  static async saveCheckpoint(
    jobId: string,
    key: string,
    value: string,
    metadata?: any,
  ): Promise<void> {
    try {
      await prisma.checkpoint.upsert({
        where: { jobId_key: { jobId, key } },
        update: { value, metadata },
        create: { jobId, key, value, metadata },
      });
    } catch (error: any) {
      logger.error(`Failed to save checkpoint ${key} for job ${jobId}`, error);
    }
  }

  static async getCheckpoint(jobId: string, key: string): Promise<string | null> {
    const cp = await prisma.checkpoint.findUnique({
      where: { jobId_key: { jobId, key } },
    });
    return cp?.value || null;
  }

  static async getCheckpointFull(jobId: string, key: string) {
    return prisma.checkpoint.findUnique({
      where: { jobId_key: { jobId, key } },
    });
  }
}

// ==========================================
// Part 3: Job Repository
// ==========================================

export class JobRepository {
  static async createJob(data: {
    bullJobId?: string;
    type: string;
    config: any;
    priority?: number;
  }): Promise<Job> {
    try {
      return await prisma.job.create({
        data: {
          bullJobId: data.bullJobId,
          type: data.type,
          config: data.config,
          priority: data.priority || 0,
          status: 'pending',
        },
      });
    } catch (error: any) {
      logger.error('Failed to create job', error);
      throw error;
    }
  }

  static async updateStatus(id: string, status: string, error?: string): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: {
        status,
        error,
        startedAt: status === 'active' ? new Date() : undefined,
        completedAt: ['completed', 'failed'].includes(status) ? new Date() : undefined,
      },
    });
  }

  static async findByBullId(bullJobId: string): Promise<Job | null> {
    return prisma.job.findFirst({ where: { bullJobId } });
  }

  static async updateBullJobId(id: string, bullJobId: string): Promise<Job> {
    return prisma.job.update({
      where: { id },
      data: { bullJobId },
    });
  }

  static async createTask(data: { jobId: string; type: string; config: any }): Promise<Task> {
    return prisma.task.create({
      data: {
        jobId: data.jobId,
        type: data.type,
        config: data.config,
        status: 'pending',
      },
    });
  }

  static async updateTaskStatus(
    id: string,
    status: string,
    result?: any,
    error?: string,
  ): Promise<Task> {
    return prisma.task.update({
      where: { id },
      data: {
        status,
        result,
        error,
        startedAt: status === 'active' ? new Date() : undefined,
        completedAt: ['completed', 'failed'].includes(status) ? new Date() : undefined,
      },
    });
  }

  static async logError(data: {
    jobId?: string;
    severity: 'fatal' | 'error' | 'warn';
    category: string;
    message: string;
    stack?: string;
    context?: any;
  }): Promise<ErrorLog> {
    return prisma.errorLog.create({
      data: {
        jobId: data.jobId,
        severity: data.severity,
        category: data.category,
        message: data.message,
        stack: data.stack,
        context: data.context,
      },
    });
  }
}

// ==========================================
// Part 4: Tweet Repository
// ==========================================

export class TweetRepository {
  private static async validateJobId(jobId: string | undefined): Promise<string | undefined> {
    if (!jobId || typeof jobId !== 'string') return undefined;
    try {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        select: { id: true },
      });
      if (!job) {
        // Soft fail: log but return undefined so tweet is saved without job association
        return undefined;
      }
      return jobId;
    } catch (error) {
      return undefined;
    }
  }

  static async saveTweet(data: { tweet: any; jobId?: string }): Promise<Tweet | null> {
    try {
      const { tweet, jobId } = data;
      const tweetId = tweet.id || tweet.rest_id;

      if (!tweetId) {
        logger.warn('Cannot save tweet without ID', { tweet });
        return null;
      }

      const validatedJobId = await TweetRepository.validateJobId(jobId);

      return await prisma.tweet.upsert({
        where: { id: tweetId },
        update: {
          jobId: validatedJobId,
          scrapedAt: new Date(),
          metrics: tweet.metrics || {},
        },
        create: {
          id: tweetId,
          jobId: validatedJobId,
          text: tweet.text || tweet.full_text,
          username: tweet.username || tweet.core?.user_results?.result?.legacy?.screen_name || 'unknown',
          userId: tweet.userId || tweet.core?.user_results?.result?.rest_id,
          createdAt: tweet.createdAt ? new Date(tweet.createdAt) : new Date(),
          scrapedAt: new Date(),
          metrics: tweet.metrics || {},
          media: tweet.media || [],
          raw: tweet as any,
        },
      });
    } catch (error: any) {
      logger.error(`Failed to save tweet ${data.tweet?.id}`, error);
      return null;
    }
  }

  static async saveTweets(data: { tweets: any[]; jobId?: string }): Promise<number> {
    let savedCount = 0;
    const { tweets, jobId } = data;
    const chunkSize = 50;

    for (let i = 0; i < tweets.length; i += chunkSize) {
      const chunk = tweets.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (tweet) => {
          const result = await TweetRepository.saveTweet({ tweet, jobId });
          if (result) savedCount++;
        }),
      );
    }
    return savedCount;
  }

  static async getExistingIds(ids: string[]): Promise<Set<string>> {
    const found = await prisma.tweet.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return new Set(found.map((t) => t.id));
  }
}
