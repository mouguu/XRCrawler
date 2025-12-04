import { PrismaClient } from '@prisma/client';
import { createEnhancedLogger } from '../../utils/logger';

const logger = createEnhancedLogger('Prisma');

// Prevent multiple instances in development due to hot reloading
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Only use mock in test environment WITHOUT DATABASE_URL
const isTestWithoutDb = process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL;

// Create mock PrismaClient for tests without database
const createMockPrismaClient = (): PrismaClient => {
  return {
    $on: () => {},
    $connect: async () => {},
    $disconnect: async () => {},
    $use: () => {},
    $executeRaw: async () => 0,
    $queryRaw: async () => [],
    $transaction: async (fn: any) => fn,
  } as any;
};

let prismaInstance: PrismaClient;
try {
  console.log('DEBUG: Initializing Prisma Client...');
  prismaInstance = globalForPrisma.prisma || (isTestWithoutDb ? createMockPrismaClient() : new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'info' },
      { emit: 'event', level: 'warn' },
    ],
  }));
  console.log('DEBUG: Prisma Client initialized successfully');
} catch (e: any) {
  console.error('CRITICAL ERROR: Prisma Client initialization failed:', e);
  process.exit(1);
}

export const prisma = prismaInstance!;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Log queries in debug mode (only if real Prisma instance, not mock)
if (!isTestWithoutDb) {
  // @ts-ignore
  prisma.$on('query', (e: any) => {
    // logger.debug(`Query: ${e.query} Duration: ${e.duration}ms`);
  });

  // @ts-ignore
  prisma.$on('error', (e: any) => {
    logger.error(`Prisma Error: ${e.message}`);
  });
}

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
