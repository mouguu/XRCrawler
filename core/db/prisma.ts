import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { createEnhancedLogger } from '../../utils/logger';

const logger = createEnhancedLogger('Prisma');

// 调试日志：检查环境变量是否存在
console.log('[Prisma Init] Checking DATABASE_URL:', process.env.DATABASE_URL ? 'Present' : 'MISSING');

// Prevent multiple instances in development due to hot reloading
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Only use mock in test environment WITHOUT DATABASE_URL
const isTestWithoutDb = process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL;

// Create mock PrismaClient for tests without database
const createMockPrismaClient = (): PrismaClient => {
  return {
    $connect: async () => {},
    $disconnect: async () => {},
    $executeRaw: async () => 0,
    $queryRaw: async () => [],
    $transaction: async (fn: any) => fn,
  } as any;
};

// Create real PrismaClient with pg adapter (Prisma v7 pattern)
const createRealPrismaClient = (): PrismaClient => {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is missing');
  }

  // 1. 初始化 PG 连接池
  console.log('[Prisma Init] Initializing pg Pool...');
  const pool = new Pool({ connectionString });

  // 2. 初始化适配器
  console.log('[Prisma Init] Initializing PrismaPg adapter...');
  const adapter = new PrismaPg(pool);

  // 3. 初始化 Client
  console.log('[Prisma Init] Initializing PrismaClient...');
  return new PrismaClient({ adapter });
};

let prismaInstance: PrismaClient;

try {
  console.log('[Prisma Init] Starting initialization...');
  prismaInstance = globalForPrisma.prisma || (isTestWithoutDb ? createMockPrismaClient() : createRealPrismaClient());
  console.log('[Prisma Init] Successfully initialized.');
} catch (error) {
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('[Prisma Init] FATAL ERROR initializing database connection:');
  console.error(error);
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  process.exit(1);
}

export const prisma = prismaInstance!;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

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
