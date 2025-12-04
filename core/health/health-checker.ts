/**
 * Health Check System for XRCrawler
 * Monitors critical services: Database, Redis, Proxy
 */

import { prisma } from '../db/prisma';
import { redisConnection } from '../queue/connection';
import { createEnhancedLogger } from '../../utils/logger';
import axios from 'axios';

const logger = createEnhancedLogger('HealthChecker');

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  responseTime: number;
  message?: string;
  details?: any;
}

export interface OverallHealth {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: Date;
  checks: {
    database: HealthStatus;
    redis: HealthStatus;
    proxy: HealthStatus;
  };
}

export class HealthChecker {
  /**
   * Check PostgreSQL database health
   */
  async checkDatabase(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - start;
      
      return {
        status: responseTime < 100 ? 'healthy' : 'degraded',
        responseTime,
        message: responseTime < 100 ? 'Database responding normally' : 'Database responding slowly'
      };
    } catch (error: any) {
      logger.error('Database health check failed', error);
      return {
        status: 'down',
        responseTime: Date.now() - start,
        message: 'Database connection failed',
        details: error.message
      };
    }
  }

  /**
   * Check Redis health
   */
  async checkRedis(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      await redisConnection.ping();
      const responseTime = Date.now() - start;
      
      return {
        status: responseTime < 50 ? 'healthy' : 'degraded',
        responseTime,
        message: responseTime < 50 ? 'Redis responding normally' : 'Redis responding slowly'
      };
    } catch (error: any) {
      logger.error('Redis health check failed', error);
      return {
        status: 'down',
        responseTime: Date.now() - start,
        message: 'Redis connection failed',
        details: error.message
      };
    }
  }

  /**
   * Check Proxy health (if configured)
   */
  async checkProxy(): Promise<HealthStatus> {
    const proxyUrl = process.env.PROXY_URL;
    
    if (!proxyUrl) {
      return {
        status: 'healthy',
        responseTime: 0,
        message: 'No proxy configured (direct connection)'
      };
    }

    const start = Date.now();
    try {
      // Test proxy by hitting httpbin.org
      await axios.get('http://httpbin.org/ip', {
        proxy: this.parseProxyUrl(proxyUrl),
        timeout: 5000
      });
      
      const responseTime = Date.now() - start;
      
      return {
        status: responseTime < 1000 ? 'healthy' : 'degraded',
        responseTime,
        message: responseTime < 1000 ? 'Proxy responding normally' : 'Proxy responding slowly'
      };
    } catch (error: any) {
      logger.error('Proxy health check failed', error);
      return {
        status: 'down',
        responseTime: Date.now() - start,
        message: 'Proxy connection failed',
        details: error.message
      };
    }
  }

  /**
   * Run all health checks
   */
  async checkAll(): Promise<OverallHealth> {
    const [database, redis, proxy] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkProxy()
    ]);

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
    
    if (database.status === 'down' || redis.status === 'down') {
      overallStatus = 'down';
    } else if (database.status === 'degraded' || redis.status === 'degraded' || proxy.status === 'degraded') {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date(),
      checks: { database, redis, proxy }
    };
  }

  /**
   * Parse proxy URL into axios-compatible format
   */
  private parseProxyUrl(proxyUrl: string) {
    try {
      const url = new URL(proxyUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 8080,
        auth: url.username && url.password ? {
          username: url.username,
          password: url.password
        } : undefined
      };
    } catch {
      // If parsing fails, return undefined (axios will use direct connection)
      return undefined;
    }
  }
}

// Singleton instance
export const healthChecker = new HealthChecker();
