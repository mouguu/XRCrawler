/**
 * Health Check API Routes
 */

import { Router, Request, Response } from 'express';
import { healthChecker } from '../core/health/health-checker';
import { createEnhancedLogger } from '../utils/logger';

const logger = createEnhancedLogger('HealthAPI');
const router = Router();

/**
 * GET /api/health
 * Returns health status of all services
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await healthChecker.checkAll();
    
    // Set appropriate HTTP status code based on health
    const statusCode = 
      health.status === 'down' ? 503 :
      health.status === 'degraded' ? 200 :
      200;

    res.status(statusCode).json(health);
  } catch (error: any) {
    logger.error('Health check endpoint failed', error);
    res.status(500).json({
      status: 'down',
      timestamp: new Date(),
      message: 'Health check failed',
      error: error.message
    });
  }
});

/**
 * GET /api/health/database
 * Check only database health
 */
router.get('/health/database', async (req: Request, res: Response) => {
  try {
    const health = await healthChecker.checkDatabase();
    res.status(health.status === 'down' ? 503 : 200).json(health);
  } catch (error: any) {
    logger.error('Database health check failed', error);
    res.status(500).json({ status: 'down', message: error.message });
  }
});

/**
 * GET /api/health/redis
 * Check only Redis health
 */
router.get('/health/redis', async (req: Request, res: Response) => {
  try {
    const health = await healthChecker.checkRedis();
    res.status(health.status === 'down' ? 503 : 200).json(health);
  } catch (error: any) {
    logger.error('Redis health check failed', error);
    res.status(500).json({ status: 'down', message: error.message });
  }
});

/**
 * GET /api/health/proxy
 * Check only Proxy health
 */
router.get('/health/proxy', async (req: Request, res: Response) => {
  try {
    const health = await healthChecker.checkProxy();
    res.status(health.status === 'down' ? 503 : 200).json(health);
  } catch (error: any) {
    logger.error('Proxy health check failed', error);
    res.status(500).json({ status: 'down', message: error.message });
  }
});

export default router;
