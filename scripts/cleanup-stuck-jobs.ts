#!/usr/bin/env bun

/**
 * Cleanup Stuck Jobs Script
 *
 * 清理卡住或已取消的任务（批量处理）
 * 用于清理系统异常后残留的任务
 *
 * Usage:
 *   bun run scripts/cleanup-stuck-jobs.ts                    # 只清理已标记为取消的任务
 *   bun run scripts/cleanup-stuck-jobs.ts --force           # 强制清理所有活跃任务
 *   bun run scripts/cleanup-stuck-jobs.ts --dry-run         # 仅预览，不执行清理
 *   bun run scripts/cleanup-stuck-jobs.ts --skip-db         # 跳过数据库更新
 */

import * as readline from 'readline';
import { JobRepository } from '../core/db/job-repo';
import { redisConnection } from '../core/queue/connection';
import { scrapeQueue } from '../core/queue/scrape-queue';
import { createEnhancedLogger } from '../utils/logger';

const logger = createEnhancedLogger('CleanupScript');

const CANCELLATION_PREFIX = 'job:cancelled:';

interface CleanupStats {
  totalFound: number;
  cancelled: number;
  active: number;
  removed: number;
  markersCleaned: number;
  dbUpdated: number;
  errors: number;
}

function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function cleanupStuckJobs(
  force: boolean = false,
  dryRun: boolean = false,
  skipDb: boolean = false,
) {
  const stats: CleanupStats = {
    totalFound: 0,
    cancelled: 0,
    active: 0,
    removed: 0,
    markersCleaned: 0,
    dbUpdated: 0,
    errors: 0,
  };

  try {
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('🧹 Cleanup Stuck Jobs Script');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('');

    if (dryRun) {
      logger.info('🔍 DRY RUN MODE: Preview only, no changes will be made');
      logger.info('');
    }

    if (force) {
      logger.warn('⚠️  FORCE MODE: Will clean up ALL active jobs');
      logger.info('');
    }

    // 1. Get all active jobs from Redis
    logger.info('📊 Step 1/4: Scanning Redis for active jobs...');
    const activeJobs = await scrapeQueue.getActive(0, 100);
    stats.totalFound = activeJobs.length;
    logger.info(`   Found ${activeJobs.length} active job(s) in Redis`);
    logger.info('');

    if (activeJobs.length === 0) {
      logger.info('✅ No active jobs found. Nothing to clean up.');
      return stats;
    }

    // 2. Check each active job
    logger.info('🔍 Step 2/4: Analyzing jobs...');
    const stuckJobs: Array<{ jobId: string; state: string; isCancelled: boolean }> = [];

    for (const job of activeJobs) {
      const jobId = job.id || '';
      if (!jobId) continue;

      try {
        const state = await job.getState();
        const cancelledKey = `${CANCELLATION_PREFIX}${jobId}`;
        const isCancelled = (await redisConnection.exists(cancelledKey)) === 1;

        if (isCancelled) {
          stats.cancelled++;
        } else if (force) {
          stats.active++;
        }

        if (isCancelled || force) {
          stuckJobs.push({ jobId, state, isCancelled });
          logger.info(
            `   ${isCancelled ? '🚫' : '⚡'} Job ${jobId}: ${state} ${isCancelled ? '(cancelled)' : '(active)'}`,
          );
        }
      } catch (error) {
        const err = error as Error;
        logger.warn(`   ⚠️  Failed to check job ${jobId}: ${err.message}`);
        stats.errors++;
      }
    }

    logger.info('');
    logger.info(`   Summary: ${stats.cancelled} cancelled, ${stats.active} active (force mode)`);
    logger.info('');

    if (stuckJobs.length === 0) {
      logger.info('✅ No stuck jobs found. Nothing to clean up.');
      return stats;
    }

    // 3. Confirmation (unless force or dry-run)
    if (!dryRun && !force) {
      logger.info(`⚠️  About to clean up ${stuckJobs.length} job(s)`);
      const confirmed = await askConfirmation('Do you want to continue?');
      if (!confirmed) {
        logger.info('❌ Cleanup cancelled by user');
        return stats;
      }
      logger.info('');
    }

    // 4. Remove jobs from Redis queue
    logger.info(`🗑️  Step 3/4: Removing ${stuckJobs.length} job(s) from Redis queue...`);
    for (const { jobId, state } of stuckJobs) {
      try {
        if (!dryRun) {
          const job = await scrapeQueue.getJob(jobId);
          if (job) {
            const currentState = await job.getState();
            if (currentState === 'active' || currentState === 'waiting' || currentState === 'delayed') {
              await job.remove();
              stats.removed++;
              logger.info(`   ✓ Removed job ${jobId} (was ${currentState})`);
            } else {
              logger.info(`   ⊘ Job ${jobId} is ${currentState}, no removal needed`);
            }
          } else {
            logger.info(`   ⊘ Job ${jobId} not found in queue (may have been removed)`);
          }
        } else {
          logger.info(`   [DRY RUN] Would remove job ${jobId} (${state})`);
        }
      } catch (error) {
        const err = error as Error;
        logger.warn(`   ✗ Failed to remove job ${jobId}: ${err.message}`);
        stats.errors++;
      }
    }
    logger.info('');

    // 5. Clean up cancellation markers
    logger.info(`🧹 Step 4/4: Cleaning up cancellation markers...`);
    for (const { jobId } of stuckJobs) {
      try {
        if (!dryRun) {
          const cancelledKey = `${CANCELLATION_PREFIX}${jobId}`;
          const deleted = await redisConnection.del(cancelledKey);
          if (deleted > 0) {
            stats.markersCleaned++;
            logger.info(`   ✓ Cleaned marker for job ${jobId}`);
          }
        } else {
          logger.info(`   [DRY RUN] Would clean marker for job ${jobId}`);
        }
      } catch (error) {
        const err = error as Error;
        logger.warn(`   ✗ Failed to clean marker for ${jobId}: ${err.message}`);
        stats.errors++;
      }
    }
    logger.info('');

    // 6. Update PostgreSQL job status
    if (!skipDb && !dryRun) {
      logger.info(`💾 Updating PostgreSQL job statuses...`);
      for (const { jobId } of stuckJobs) {
        try {
          await JobRepository.updateStatus(jobId, 'failed', 'Job cancelled and cleaned up');
          stats.dbUpdated++;
          logger.info(`   ✓ Updated job ${jobId} status in PostgreSQL`);
        } catch (error) {
          const err = error as Error;
          logger.warn(`   ✗ Failed to update job ${jobId} in PostgreSQL: ${err.message}`);
          stats.errors++;
        }
      }
      logger.info('');
    } else if (skipDb) {
      logger.info(`⊘ Skipped database update (--skip-db flag)`);
      logger.info('');
    }

    // Final summary
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (dryRun) {
      logger.info('🔍 DRY RUN COMPLETE - No changes were made');
    } else {
      logger.info('✅ CLEANUP COMPLETE');
    }
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('');
    logger.info('📊 Statistics:');
    logger.info(`   Total found:        ${stats.totalFound}`);
    logger.info(`   Cancelled jobs:     ${stats.cancelled}`);
    logger.info(`   Active jobs:        ${stats.active} (force mode)`);
    logger.info(`   Removed from queue: ${stats.removed}`);
    logger.info(`   Markers cleaned:    ${stats.markersCleaned}`);
    logger.info(`   DB updated:         ${stats.dbUpdated}`);
    if (stats.errors > 0) {
      logger.warn(`   Errors:             ${stats.errors}`);
    }
    logger.info('');

    return stats;
  } catch (error) {
    logger.error('❌ Cleanup failed:', error);
    throw error;
  }
}

// Main execution
const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');
const skipDb = process.argv.includes('--skip-db');

if (force && dryRun) {
  logger.warn('⚠️  Warning: --force and --dry-run are both set. Dry run will take precedence.');
}

cleanupStuckJobs(force, dryRun, skipDb)
  .then((stats) => {
    if (stats.errors > 0) {
      logger.warn('⚠️  Cleanup completed with some errors');
      process.exit(1);
    } else {
      logger.info('✅ Cleanup script completed successfully');
      process.exit(0);
    }
  })
  .catch((error) => {
    const err = error as Error;
    logger.error('❌ Cleanup script failed:', err);
    process.exit(1);
  });



