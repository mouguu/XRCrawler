import { PrismaClient } from '@prisma/client';
import { createEnhancedLogger } from '../../utils/logger';

const logger = createEnhancedLogger('Prisma');

// Prevent multiple instances in development due to hot reloading
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
  ],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Log queries in debug mode
// @ts-ignore
prisma.$on('query', (e: any) => {
  // logger.debug(`Query: ${e.query} Duration: ${e.duration}ms`);
});

// @ts-ignore
prisma.$on('error', (e: any) => {
  logger.error(`Prisma Error: ${e.message}`);
});

export async function checkDatabaseConnection() {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
    return true;
  } catch (error: any) {
    logger.error('Database connection failed', error);
    return false;
  }
}
