import { createEnhancedLogger } from '../../utils/logger';
import { prisma } from './prisma';

const logger = createEnhancedLogger('CheckpointRepo');

export class CheckpointRepository {
  /**
   * Save a checkpoint (upsert)
   */
  static async saveCheckpoint(
    jobId: string,
    key: string,
    value: string,
    metadata?: any,
  ): Promise<void> {
    try {
      await prisma.checkpoint.upsert({
        where: {
          jobId_key: {
            jobId,
            key,
          },
        },
        update: {
          value,
          metadata,
        },
        create: {
          jobId,
          key,
          value,
          metadata,
        },
      });
    } catch (error: any) {
      logger.error(`Failed to save checkpoint ${key} for job ${jobId}`, error);
    }
  }

  /**
   * Get a checkpoint value
   */
  static async getCheckpoint(jobId: string, key: string): Promise<string | null> {
    const cp = await prisma.checkpoint.findUnique({
      where: {
        jobId_key: {
          jobId,
          key,
        },
      },
    });
    return cp?.value || null;
  }

  /**
   * Get full checkpoint object
   */
  static async getCheckpointFull(jobId: string, key: string) {
    return prisma.checkpoint.findUnique({
      where: {
        jobId_key: {
          jobId,
          key,
        },
      },
    });
  }
}
