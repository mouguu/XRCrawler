import type { BrowserLaunchOptions } from "./browser-manager";
import type { BrowserPool, BrowserPoolOptions } from "./browser-pool";
import type { ScraperEventBus } from "./event-bus";
import type { ScraperDependencies } from "./scraper-dependencies";
import type { RunContext } from "../utils";
import type { Tweet, ProfileInfo } from "../types";
import type { PerformanceStats } from "./performance-monitor";

export interface ScraperEngineOptions {
  headless?: boolean;
  browserOptions?: BrowserLaunchOptions;
  sessionId?: string;
  eventBus?: ScraperEventBus;
  /**
   * 如果为 true，只初始化 API 客户端，不启动浏览器
   * 适用于纯 GraphQL API 模式，节省资源
   */
  apiOnly?: boolean;
  /** 依赖注入（用于测试和自定义配置） */
  dependencies?: ScraperDependencies;
  /** 浏览器池选项（如果提供，将使用浏览器池复用浏览器实例） */
  browserPoolOptions?: BrowserPoolOptions;
  /** 浏览器池实例（如果提供，直接使用此实例） */
  browserPool?: BrowserPool;
}

export interface ScrapeTimelineConfig {
  username?: string;
  limit?: number;
  mode?: "timeline" | "search";
  searchQuery?: string;
  runContext?: RunContext;
  saveMarkdown?: boolean;
  saveScreenshots?: boolean;
  exportCsv?: boolean;
  exportJson?: boolean;
  outputDir?: string;
  tab?: "likes" | "replies";
  withReplies?: boolean;
  stopAtTweetId?: string;
  sinceTimestamp?: number;
  collectProfileInfo?: boolean;
  /** 爬取模式: 'graphql' 使用 API (默认), 'puppeteer' 使用 DOM, 'mixed' 先 API 后 DOM 补深度 */
  scrapeMode?: "graphql" | "puppeteer" | "mixed";
  resume?: boolean;
  dateRange?: {
    start: string;
    end: string;
  };
  enableRotation?: boolean;
  /** Internal use: offset progress current/target when doing mixed模式 DOM 续跑 */
  progressBase?: number;
  progressTarget?: number;
}

export interface ScrapeTimelineResult {
  success: boolean;
  tweets: Tweet[];
  runContext?: RunContext;
  profile?: ProfileInfo | null;
  error?: string;
  performance?: PerformanceStats;
}

export interface ScrapeThreadOptions {
  tweetUrl: string;
  maxReplies?: number;
  runContext?: RunContext;
  saveMarkdown?: boolean;
  exportCsv?: boolean;
  exportJson?: boolean;
  outputDir?: string;
  headless?: boolean;
  sessionId?: string;
  /** 爬取模式: 'graphql' 使用 API (默认), 'puppeteer' 使用 DOM */
  scrapeMode?: "graphql" | "puppeteer";
}

export interface ScrapeThreadResult {
  success: boolean;
  tweets: Tweet[];
  originalTweet?: Tweet | null;
  replies?: Tweet[];
  runContext?: RunContext;
  error?: string;
  performance?: PerformanceStats;
}


