import { JobLog, JobProgress, ScrapeJobData, ScrapeJobResult } from '../queue/types';

export type PlatformName = 'twitter' | 'reddit' | (string & {});

export type PlatformErrorCategory =
  | 'rate_limit'
  | 'auth'
  | 'not_found'
  | 'network'
  | 'unknown';

export interface CrawlTarget {
  type: string;
  identifier: string;
  options?: Record<string, any>;
}

export interface CrawlJobConfig {
  platform: PlatformName;
  target: CrawlTarget;
  startDate?: string;
  endDate?: string;
  maxItems?: number;
  deepSearch?: boolean;
  sessionLabel?: string;
  options?: Record<string, any>;
}

export interface NormalizedItem {
  id: string;
  platform: PlatformName;
  author: string;
  createdAt: string;
  url?: string;
  text?: string;
  html?: string;
  raw: any;
  meta?: Record<string, any>;
}

export interface AdapterJobContext {
  emitProgress(progress: JobProgress): Promise<void>;
  emitLog(log: JobLog): Promise<void>;
  getShouldStop(): boolean;
  log(message: string, level?: JobLog['level']): Promise<void>;
}

export interface PlatformAdapter {
  name: PlatformName;
  init?(options?: any): Promise<void> | void;
  process(job: ScrapeJobData, ctx: AdapterJobContext): Promise<ScrapeJobResult>;
  classifyError?(err: unknown): PlatformErrorCategory;
}
