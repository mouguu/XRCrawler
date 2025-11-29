/**
 * 指标收集器
 * 收集系统性能指标和业务指标
 */

import { createEnhancedLogger } from '../utils';

export interface Metrics {
  // 爬取指标
  scrapes: {
    total: number;
    successful: number;
    failed: number;
    byPlatform: Record<string, { total: number; successful: number; failed: number }>;
  };

  // 性能指标
  performance: {
    averageResponseTime: number;
    averageScrapeTime: number;
    totalTweetsScraped: number;
    tweetsPerSecond: number;
  };

  // 资源指标
  resources: {
    browserPoolSize: number;
    browserPoolInUse: number;
    memoryUsage: number;
    activeSessions: number;
  };

  // 错误指标
  errors: {
    total: number;
    byType: Record<string, number>;
    rateLimitHits: number;
    authFailures: number;
  };

  // 时间戳
  timestamp: number;
}

export class MetricsCollector {
  private metrics: Metrics;
  private logger = createEnhancedLogger('MetricsCollector');
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
    this.metrics = {
      scrapes: {
        total: 0,
        successful: 0,
        failed: 0,
        byPlatform: {}
      },
      performance: {
        averageResponseTime: 0,
        averageScrapeTime: 0,
        totalTweetsScraped: 0,
        tweetsPerSecond: 0
      },
      resources: {
        browserPoolSize: 0,
        browserPoolInUse: 0,
        memoryUsage: 0,
        activeSessions: 0
      },
      errors: {
        total: 0,
        byType: {},
        rateLimitHits: 0,
        authFailures: 0
      },
      timestamp: Date.now()
    };
  }

  /**
   * 记录一次爬取
   */
  recordScrape(platform: string, success: boolean): void {
    this.metrics.scrapes.total++;
    if (success) {
      this.metrics.scrapes.successful++;
    } else {
      this.metrics.scrapes.failed++;
    }

    if (!this.metrics.scrapes.byPlatform[platform]) {
      this.metrics.scrapes.byPlatform[platform] = {
        total: 0,
        successful: 0,
        failed: 0
      };
    }

    this.metrics.scrapes.byPlatform[platform].total++;
    if (success) {
      this.metrics.scrapes.byPlatform[platform].successful++;
    } else {
      this.metrics.scrapes.byPlatform[platform].failed++;
    }

    this.updateTimestamp();
  }

  /**
   * 记录性能指标
   */
  recordPerformance(
    responseTime: number,
    scrapeTime: number,
    tweetsScraped: number
  ): void {
    const total = this.metrics.performance.totalTweetsScraped + tweetsScraped;
    const elapsed = (Date.now() - this.startTime) / 1000; // 秒

    this.metrics.performance.totalTweetsScraped = total;
    this.metrics.performance.tweetsPerSecond = elapsed > 0 ? total / elapsed : 0;

    // 计算移动平均
    const count = this.metrics.scrapes.total;
    if (count > 0) {
      this.metrics.performance.averageResponseTime =
        (this.metrics.performance.averageResponseTime * (count - 1) + responseTime) / count;
      this.metrics.performance.averageScrapeTime =
        (this.metrics.performance.averageScrapeTime * (count - 1) + scrapeTime) / count;
    }

    this.updateTimestamp();
  }

  /**
   * 记录错误
   */
  recordError(errorType: string, isRateLimit: boolean = false, isAuthFailure: boolean = false): void {
    this.metrics.errors.total++;

    if (!this.metrics.errors.byType[errorType]) {
      this.metrics.errors.byType[errorType] = 0;
    }
    this.metrics.errors.byType[errorType]++;

    if (isRateLimit) {
      this.metrics.errors.rateLimitHits++;
    }
    if (isAuthFailure) {
      this.metrics.errors.authFailures++;
    }

    this.updateTimestamp();
  }

  /**
   * 更新资源指标
   */
  updateResources(resources: Partial<Metrics['resources']>): void {
    this.metrics.resources = {
      ...this.metrics.resources,
      ...resources
    };
    this.updateTimestamp();
  }

  /**
   * 获取当前指标
   */
  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  /**
   * 获取指标摘要（用于日志）
   */
  getSummary(): string {
    const { scrapes, performance, errors, resources } = this.metrics;
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    return `
Metrics Summary (Uptime: ${uptime}s):
  Scrapes: ${scrapes.successful}/${scrapes.total} successful (${((scrapes.successful / Math.max(scrapes.total, 1)) * 100).toFixed(1)}%)
  Performance: ${performance.tweetsPerSecond.toFixed(2)} tweets/s, ${performance.totalTweetsScraped} total
  Resources: ${resources.browserPoolInUse}/${resources.browserPoolSize} browsers in use
  Errors: ${errors.total} total (${errors.rateLimitHits} rate limits, ${errors.authFailures} auth failures)
    `.trim();
  }

  /**
   * 重置指标
   */
  reset(): void {
    this.startTime = Date.now();
    this.metrics = {
      scrapes: {
        total: 0,
        successful: 0,
        failed: 0,
        byPlatform: {}
      },
      performance: {
        averageResponseTime: 0,
        averageScrapeTime: 0,
        totalTweetsScraped: 0,
        tweetsPerSecond: 0
      },
      resources: {
        browserPoolSize: 0,
        browserPoolInUse: 0,
        memoryUsage: 0,
        activeSessions: 0
      },
      errors: {
        total: 0,
        byType: {},
        rateLimitHits: 0,
        authFailures: 0
      },
      timestamp: Date.now()
    };
  }

  /**
   * 导出为简单 JSON 格式（移除 Prometheus 复杂格式）
   */
  exportJSON(): Record<string, any> {
    return this.getMetrics();
  }

  private updateTimestamp(): void {
    this.metrics.timestamp = Date.now();
  }
}

// 全局单例
let globalMetricsCollector: MetricsCollector | null = null;

/**
 * 获取全局指标收集器
 */
export function getMetricsCollector(): MetricsCollector {
  if (!globalMetricsCollector) {
    globalMetricsCollector = new MetricsCollector();
  }
  return globalMetricsCollector;
}

/**
 * 重置全局指标收集器（主要用于测试）
 */
export function resetMetricsCollector(): void {
  globalMetricsCollector = null;
}

