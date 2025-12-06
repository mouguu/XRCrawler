#!/usr/bin/env bun

/**
 * Force Cancel Job Script
 *
 * 强制取消指定任务（紧急情况使用）
 * 当 UI 取消按钮无效时，可以使用此脚本强制取消任务
 *
 * Usage:
 *   bun run scripts/force-cancel-job.ts <jobId>
 *   bun run scripts/force-cancel-job.ts 14
 *   bun run scripts/force-cancel-job.ts 14 --skip-db  # 跳过数据库更新
 */

import { JobRepository } from '../core/db/job-repo';
import { redisConnection } from '../core/queue/connection';
import { scrapeQueue } from '../core/queue/scrape-queue';
import { createEnhancedLogger } from '../utils/logger';

const logger = createEnhancedLogger('ForceCancel');

const CANCELLATION_PREFIX = 'job:cancelled:';

interface CancelResult {
  success: boolean;
  steps: {
    redisMarker: boolean;
    queueRemoval: boolean;
    dbUpdate: boolean;
  };
  errors: string[];
}

async function forceCancelJob(jobId: string, skipDb: boolean = false): Promise<CancelResult> {
  const result: CancelResult = {
    success: false,
    steps: {
      redisMarker: false,
      queueRemoval: false,
      dbUpdate: false,
    },
    errors: [],
  };

  // 验证 jobId 格式
  if (!jobId || !/^\d+$/.test(jobId)) {
    throw new Error(`Invalid jobId: ${jobId}. JobId must be a numeric string.`);
  }

  logger.info(`🚨 Force cancelling job ${jobId}...`);
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. 设置取消标记（立即生效）
  try {
    const cancelledKey = `${CANCELLATION_PREFIX}${jobId}`;
    await redisConnection.set(cancelledKey, Date.now(), 'EX', 3600);
    result.steps.redisMarker = true;
    logger.info(`✓ Step 1/3: Set cancellation marker in Redis`);
  } catch (error) {
    const err = error as Error;
    result.errors.push(`Redis marker: ${err.message}`);
    logger.error(`✗ Step 1/3: Failed to set Redis marker:`, err);
  }

  // 2. 尝试从队列中移除任务
  try {
    const job = await scrapeQueue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      logger.info(`   Job state: ${state}`);

      if (state === 'active') {
        // 对于活跃任务，标记为失败（因为无法直接中断）
        try {
          await job.moveToFailed(new Error('Force cancelled by user'), '0');
          result.steps.queueRemoval = true;
          logger.info(`✓ Step 2/3: Moved active job to failed state`);
        } catch (error) {
          const err = error as Error;
          result.errors.push(`Queue removal (active): ${err.message}`);
          logger.warn(`   ⚠️  Could not move active job to failed: ${err.message}`);
          logger.info(`   ℹ️  Job will stop on next cancellation check`);
        }
      } else if (state === 'waiting' || state === 'delayed') {
        // 对于等待中的任务，直接删除
        try {
          await job.remove();
          result.steps.queueRemoval = true;
          logger.info(`✓ Step 2/3: Removed ${state} job from queue`);
        } catch (error) {
          const err = error as Error;
          result.errors.push(`Queue removal (${state}): ${err.message}`);
          logger.warn(`   ⚠️  Could not remove ${state} job: ${err.message}`);
        }
      } else if (state === 'completed' || state === 'failed') {
        logger.info(`   ℹ️  Job is already ${state}, no queue action needed`);
        result.steps.queueRemoval = true; // 标记为成功，因为不需要操作
      } else {
        logger.warn(`   ⚠️  Unknown job state: ${state}`);
        result.errors.push(`Unknown state: ${state}`);
      }
    } else {
      logger.warn(`   ⚠️  Job ${jobId} not found in queue (may have been removed)`);
      result.steps.queueRemoval = true; // 标记为成功，因为任务不在队列中
    }
  } catch (error) {
    const err = error as Error;
    result.errors.push(`Queue check: ${err.message}`);
    logger.error(`✗ Step 2/3: Failed to check/remove job from queue:`, err);
  }

  // 3. 更新 PostgreSQL 状态
  if (!skipDb) {
    try {
      await JobRepository.updateStatus(jobId, 'failed', 'Force cancelled by user');
      result.steps.dbUpdate = true;
      logger.info(`✓ Step 3/3: Updated job status in PostgreSQL`);
    } catch (error) {
      const err = error as Error;
      result.errors.push(`DB update: ${err.message}`);
      logger.warn(`✗ Step 3/3: Failed to update PostgreSQL: ${err.message}`);
      logger.info(`   ℹ️  You can manually update the job status in the database`);
    }
  } else {
    logger.info(`⊘ Step 3/3: Skipped database update (--skip-db flag)`);
    result.steps.dbUpdate = true; // 标记为成功，因为用户选择跳过
  }

  // 评估整体成功状态
  result.success = result.steps.redisMarker && result.steps.queueRemoval && result.steps.dbUpdate;

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (result.success) {
    logger.info(`✅ Job ${jobId} force cancelled successfully!`);
  } else {
    logger.warn(`⚠️  Job ${jobId} cancellation completed with warnings`);
    if (result.errors.length > 0) {
      logger.warn(`   Errors encountered: ${result.errors.length}`);
      result.errors.forEach((err) => logger.warn(`   - ${err}`));
    }
  }

  if (result.steps.redisMarker) {
    logger.info(
      `ℹ️  Note: If the job is currently running, it will stop on the next cancellation check.`,
    );
  }

  return result;
}

// Main execution
const jobId = process.argv[2];
const skipDb = process.argv.includes('--skip-db');

if (!jobId) {
  console.error('❌ Usage: bun run scripts/force-cancel-job.ts <jobId> [--skip-db]');
  console.error('');
  console.error('Examples:');
  console.error('  bun run scripts/force-cancel-job.ts 14');
  console.error('  bun run scripts/force-cancel-job.ts 14 --skip-db  # Skip database update');
  process.exit(1);
}

forceCancelJob(jobId, skipDb)
  .then((result) => {
    if (result.success) {
      logger.info('✅ Force cancel completed successfully');
      process.exit(0);
    } else {
      logger.warn('⚠️  Force cancel completed with warnings');
      process.exit(1);
    }
  })
  .catch((error) => {
    const err = error as Error;
    logger.error('❌ Force cancel failed:', err);
    process.exit(1);
  });



