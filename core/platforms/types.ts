import { JobLog, JobProgress, ScrapeJobData, ScrapeJobResult } from '../queue/types';

export type PlatformName = 'twitter' | 'reddit' | (string & {});

export type PlatformErrorCategory = 'rate_limit' | 'auth' | 'not_found' | 'network' | 'unknown';

export interface CrawlTarget {
  type: string;
  identifier: string;
  // biome-ignore lint/suspicious/noExplicitAny: generic options bag
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
  // biome-ignore lint/suspicious/noExplicitAny: generic options bag
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
  // biome-ignore lint/suspicious/noExplicitAny: raw data storage
  raw: any;
  // biome-ignore lint/suspicious/noExplicitAny: metadata bag
  meta?: Record<string, any>;
}

export interface AdapterJobContext {
  emitProgress(progress: JobProgress): Promise<void>;
  emitLog(log: JobLog): Promise<void>;
  getShouldStop(): Promise<boolean>;
  log(message: string, level?: JobLog['level']): Promise<void>;
}

export interface PlatformAdapter {
  name: PlatformName;
  // biome-ignore lint/suspicious/noExplicitAny: init options
  init?(options?: any): Promise<void> | void;
  process(job: ScrapeJobData, ctx: AdapterJobContext): Promise<ScrapeJobResult>;
  classifyError?(err: unknown): PlatformErrorCategory;
}
