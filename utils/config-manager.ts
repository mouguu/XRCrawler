/**
 * 统一配置管理器
 * 集中管理所有配置，支持环境变量、配置文件和默认值
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ErrorCode, ScraperError } from '../core/errors';
import { safeJsonParse } from './safe-json';

export interface AppConfig {
  // 服务器配置
  server: {
    port: number;
    host: string;
    publicUrl?: string;
    apiKey?: string;
  };

  // 输出配置
  output: {
    baseDir: string;
    enableLegacyCompat: boolean;
  };

  // Redis 配置
  redis: {
    host: string;
    port: number;
    db: number;
    password?: string;
  };

  // 队列配置
  queue: {
    concurrency: number;
    rateLimit: {
      max: number;
      duration: number;
    };
  };

  // Twitter 配置
  twitter: {
    defaultMode: 'graphql' | 'puppeteer' | 'mixed';
    defaultLimit: number;
    apiTimeout: number;
    browserTimeout: number;
  };

  // Reddit 配置
  reddit: {
    apiUrl: string;
    apiPort: number;
    apiTimeout: number;
    defaultStrategy: 'auto' | 'super_full' | 'super_recent' | 'new';
  };

  // 浏览器配置
  browser: {
    headless: boolean;
    userAgent: string;
    viewport: {
      width: number;
      height: number;
    };
  };

  // 速率限制配置
  rateLimit: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    enableRotation: boolean;
  };

  // 日志配置
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    enableFileLogging: boolean;
    logDir: string;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  server: {
    port: 5001,
    host: '0.0.0.0',
    publicUrl: undefined,
    apiKey: undefined,
  },
  output: {
    baseDir: path.resolve(process.cwd(), 'output'),
    enableLegacyCompat: false,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    db: 0,
    password: process.env.REDIS_PASSWORD,
  },
  queue: {
    concurrency: 2,
    rateLimit: {
      max: 10,
      duration: 60000,
    },
  },
  twitter: {
    defaultMode: 'graphql',
    defaultLimit: 50,
    apiTimeout: 30000,
    browserTimeout: 60000,
  },
  reddit: {
    apiUrl: 'http://127.0.0.1:5002',
    apiPort: 5002,
    apiTimeout: 300000,
    defaultStrategy: 'auto',
  },
  browser: {
    headless: true,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: {
      width: 1280,
      height: 960,
    },
  },
  rateLimit: {
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 60000,
    enableRotation: true,
  },
  logging: {
    level: 'info',
    enableFileLogging: false,
    logDir: path.resolve(process.cwd(), 'logs'),
  },
};

export class ConfigManager {
  private config: AppConfig;
  private configFilePath: string;

  constructor(configFilePath?: string) {
    this.configFilePath = configFilePath || path.resolve(process.cwd(), 'config.json');
    this.config = { ...DEFAULT_CONFIG };
    this.load();
  }

  /**
   * 加载配置（环境变量 > 配置文件 > 默认值）
   */
  private load(): void {
    // 1. 加载配置文件
    this.loadFromFile();

    // 2. 覆盖环境变量
    this.loadFromEnv();

    // 3. 验证配置
    this.validate();
  }

  /**
   * 从文件加载配置
   */
  private loadFromFile(): void {
    if (!fs.existsSync(this.configFilePath)) {
      return;
    }

    try {
      const fileContent = fs.readFileSync(this.configFilePath, 'utf-8');
      const fileConfig = safeJsonParse(fileContent);
      this.config = this.mergeConfig(this.config, fileConfig);
    } catch (error: any) {
      console.warn(`Failed to load config file ${this.configFilePath}: ${error.message}`);
    }
  }

  /**
   * 从环境变量加载配置
   */
  private loadFromEnv(): void {
    // 服务器配置
    if (process.env.PORT) {
      this.config.server.port = parseInt(process.env.PORT, 10);
    }
    if (process.env.HOST) {
      this.config.server.host = process.env.HOST;
    }
    if (process.env.PUBLIC_URL) {
      this.config.server.publicUrl = process.env.PUBLIC_URL;
    }
    if (process.env.API_KEY) {
      this.config.server.apiKey = process.env.API_KEY;
    }

    // 输出配置
    if (process.env.OUTPUT_DIR) {
      this.config.output.baseDir = path.resolve(process.env.OUTPUT_DIR);
    }

    // Twitter 配置
    if (process.env.TWITTER_DEFAULT_MODE) {
      const mode = process.env.TWITTER_DEFAULT_MODE as 'graphql' | 'puppeteer' | 'mixed';
      if (['graphql', 'puppeteer', 'mixed'].includes(mode)) {
        this.config.twitter.defaultMode = mode;
      }
    }
    if (process.env.TWITTER_DEFAULT_LIMIT) {
      this.config.twitter.defaultLimit = parseInt(process.env.TWITTER_DEFAULT_LIMIT, 10);
    }

    // Reddit 配置
    if (process.env.REDDIT_API_URL) {
      this.config.reddit.apiUrl = process.env.REDDIT_API_URL;
    }
    if (process.env.REDDIT_API_PORT) {
      this.config.reddit.apiPort = parseInt(process.env.REDDIT_API_PORT, 10);
    }

    // 浏览器配置
    if (process.env.BROWSER_HEADLESS) {
      this.config.browser.headless = process.env.BROWSER_HEADLESS === 'true';
    }

    // 日志配置
    if (process.env.LOG_LEVEL) {
      const level = process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error';
      if (['debug', 'info', 'warn', 'error'].includes(level)) {
        this.config.logging.level = level;
      }
    }
  }

  /**
   * 合并配置对象（深度合并）
   */
  private mergeConfig(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeConfig(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * 验证配置
   */
  private validate(): void {
    // 验证端口范围
    if (this.config.server.port < 1 || this.config.server.port > 65535) {
      throw new ScraperError(
        ErrorCode.INVALID_CONFIG,
        `Invalid server port: ${this.config.server.port}`,
        { context: { port: this.config.server.port } },
      );
    }

    // 验证超时值
    if (this.config.twitter.apiTimeout < 1000) {
      throw new ScraperError(
        ErrorCode.INVALID_CONFIG,
        `Twitter API timeout too small: ${this.config.twitter.apiTimeout}`,
        { context: { timeout: this.config.twitter.apiTimeout } },
      );
    }

    // 验证输出目录
    try {
      fs.mkdirSync(this.config.output.baseDir, { recursive: true });
    } catch (error: any) {
      throw new ScraperError(
        ErrorCode.INVALID_CONFIG,
        `Cannot create output directory: ${error.message}`,
        { context: { baseDir: this.config.output.baseDir } },
      );
    }
  }

  /**
   * 获取完整配置
   */
  getConfig(): AppConfig {
    return { ...this.config };
  }

  /**
   * 获取服务器配置
   */
  getServerConfig(): AppConfig['server'] {
    return { ...this.config.server };
  }

  /**
   * 获取输出配置
   */
  getOutputConfig(): AppConfig['output'] {
    return { ...this.config.output };
  }

  /**
   * 获取 Twitter 配置
   */
  getTwitterConfig(): AppConfig['twitter'] {
    return { ...this.config.twitter };
  }

  /**
   * 获取 Reddit 配置
   */
  getRedditConfig(): AppConfig['reddit'] {
    return { ...this.config.reddit };
  }

  /**
   * 获取浏览器配置
   */
  getBrowserConfig(): AppConfig['browser'] {
    return { ...this.config.browser };
  }

  /**
   * 获取速率限制配置
   */
  getRateLimitConfig(): AppConfig['rateLimit'] {
    return { ...this.config.rateLimit };
  }

  /**
   * 获取 Redis 配置
   */
  getRedisConfig(): AppConfig['redis'] {
    return { ...this.config.redis };
  }

  /**
   * 获取队列配置
   */
  getQueueConfig(): AppConfig['queue'] {
    return { ...this.config.queue };
  }

  /**
   * 获取日志配置
   */
  getLoggingConfig(): AppConfig['logging'] {
    return { ...this.config.logging };
  }

  /**
   * 更新配置（运行时）
   */
  updateConfig(updates: Partial<AppConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
    this.validate();
  }

  /**
   * 对前端/CLI 暴露的公共配置
   */
  getPublicConfig(): {
    apiBase: string;
    twitter: Pick<AppConfig['twitter'], 'defaultLimit' | 'defaultMode'>;
    reddit: Pick<AppConfig['reddit'], 'defaultStrategy'>;
    output: Pick<AppConfig['output'], 'baseDir'>;
  } {
    return {
      apiBase: this.config.server.publicUrl || '',
      twitter: {
        defaultLimit: this.config.twitter.defaultLimit,
        defaultMode: this.config.twitter.defaultMode,
      },
      reddit: {
        defaultStrategy: this.config.reddit.defaultStrategy,
      },
      output: {
        baseDir: this.config.output.baseDir,
      },
    };
  }

  /**
   * 保存配置到文件
   */
  saveToFile(filePath?: string): void {
    const targetPath = filePath || this.configFilePath;
    try {
      fs.writeFileSync(targetPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error: any) {
      throw new ScraperError(
        ErrorCode.FILE_SYSTEM_ERROR,
        `Failed to save config file: ${error.message}`,
        { context: { filePath: targetPath } },
      );
    }
  }
}

// 全局单例
let globalConfigManager: ConfigManager | null = null;

/**
 * 获取全局配置管理器实例
 */
export function getConfigManager(configFilePath?: string): ConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigManager(configFilePath);
  }
  return globalConfigManager;
}

/**
 * 重置全局配置管理器（主要用于测试）
 */
export function resetConfigManager(): void {
  globalConfigManager = null;
}
