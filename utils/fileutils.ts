/**
 * File utilities and run directory helpers for Twitter Crawler
 * 统一管理输出结构、缓存与目录创建
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as timeUtils from './time';

const DEFAULT_OUTPUT_ROOT = path.resolve(process.cwd(), 'output');
const CACHE_ROOT = path.resolve(process.cwd(), '.cache');

const DEFAULT_PLATFORM = 'twitter';
const DEFAULT_IDENTIFIER = 'timeline';

/**
 * 简单清理文件路径片段，避免非法字符
 */
export function sanitizeSegment(segment: string = ''): string {
  return String(segment)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '') || DEFAULT_IDENTIFIER;
}

/**
 * 确保目录存在
 */
export async function ensureDirExists(dir: string): Promise<boolean> {
  if (!dir) {
    console.error('ensureDirExists requires directory path');
    return false;
  }
  try {
    await fs.mkdir(dir, { recursive: true });
    return true;
  } catch (error: any) {
    console.error(`Failed to create directory: ${dir}`, error.message);
    return false;
  }
}

/**
 * 确保基础输出与缓存目录存在
 */
export async function ensureBaseStructure(): Promise<boolean> {
  await Promise.all([
    ensureDirExists(DEFAULT_OUTPUT_ROOT),
    ensureDirExists(CACHE_ROOT)
  ]);
  return true;
}

/**
 * 兼容旧函数名称，保留调用但现在只保证基础结构存在
 */
export async function ensureDirectories(): Promise<boolean> {
  return ensureBaseStructure();
}

export function getDefaultOutputRoot(): string {
  return DEFAULT_OUTPUT_ROOT;
}

export interface RunContextOptions {
  platform?: string;
  identifier?: string;
  baseOutputDir?: string;
  timestamp?: string;
  timezone?: string;
}

export interface RunContext {
  platform: string;
  identifier: string;
  outputRoot: string;
  runId: string;
  timezone: string;
  runTimestamp: string;
  runTimestampIso: string;
  runTimestampUtc: string;
  runDir: string;
  markdownDir: string;
  screenshotDir: string;
  jsonPath: string;
  csvPath: string;
  markdownIndexPath: string;
  metadataPath: string;
}

/**
 * 创建一次抓取任务的运行目录上下文
 */
export async function createRunContext(options: RunContextOptions = {}): Promise<RunContext> {
  await ensureBaseStructure();

  const platform = sanitizeSegment(options.platform || DEFAULT_PLATFORM);
  const identifier = sanitizeSegment(options.identifier || DEFAULT_IDENTIFIER);
  const timezone = timeUtils.resolveTimezone(options.timezone);

  let sourceDate = new Date();
  if (options.timestamp) {
    const overrideDate = new Date(options.timestamp);
    if (!Number.isNaN(overrideDate.getTime())) {
      sourceDate = overrideDate;
    } else {
      console.warn(`[fileutils] Invalid timestamp override "${options.timestamp}", using current time instead.`);
    }
  }

  const timestampInfo = timeUtils.formatZonedTimestamp(sourceDate, timezone, {
    includeMilliseconds: true,
    includeOffset: true
  });

  const runTimestamp = timestampInfo.fileSafe;
  const runTimestampIso = timestampInfo.iso;
  const runTimestampUtc = sourceDate.toISOString();
  const runId = `run-${runTimestamp}`;

  const outputRoot = options.baseOutputDir
    ? path.resolve(options.baseOutputDir)
    : DEFAULT_OUTPUT_ROOT;

  const platformDir = path.join(outputRoot, platform);
  const subjectDir = path.join(platformDir, identifier);
  const runDir = path.join(subjectDir, runId);
  const markdownDir = path.join(runDir, 'markdown');
  const screenshotDir = path.join(runDir, 'screenshots');

  await Promise.all([
    ensureDirExists(platformDir),
    ensureDirExists(subjectDir),
    ensureDirExists(runDir),
    ensureDirExists(markdownDir),
    ensureDirExists(screenshotDir)
  ]);

  return {
    platform,
    identifier,
    outputRoot,
    runId,
    timezone,
    runTimestamp,
    runTimestampIso,
    runTimestampUtc,
    runDir,
    markdownDir,
    screenshotDir,
    jsonPath: path.join(runDir, 'tweets.json'),
    csvPath: path.join(runDir, 'tweets.csv'),
    markdownIndexPath: path.join(runDir, 'index.md'),
    metadataPath: path.join(runDir, 'metadata.json')
  };
}

/**
 * 获取缓存文件路径
 */
export function getCacheFilePath(platform: string = DEFAULT_PLATFORM, identifier: string = DEFAULT_IDENTIFIER): string {
  const safePlatform = sanitizeSegment(platform);
  const safeIdentifier = sanitizeSegment(identifier);
  return path.join(CACHE_ROOT, safePlatform, `${safeIdentifier}.json`);
}

/**
 * 加载已抓取URL集合
 */
export async function loadSeenUrls(platform: string = DEFAULT_PLATFORM, identifier: string = DEFAULT_IDENTIFIER): Promise<Set<string>> {
  const cacheFile = getCacheFilePath(platform, identifier);
  await ensureDirExists(path.dirname(cacheFile));
  try {
    const data = await fs.readFile(cacheFile, 'utf-8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      console.log(`[${platform}] Loaded ${parsed.length} scraped URLs (${identifier})`);
      return new Set(parsed);
    }
    return new Set();
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.warn(`[${platform}] Failed to load scraped URLs (${identifier}): ${error.message}`);
    }
    return new Set();
  }
}

/**
 * 保存已抓取URL集合
 */
export async function saveSeenUrls(platform: string = DEFAULT_PLATFORM, identifier: string = DEFAULT_IDENTIFIER, urls: Set<string>): Promise<boolean> {
  if (!urls || !(urls instanceof Set)) {
    console.error('saveSeenUrls requires Set type urls');
    return false;
  }

  const cacheFile = getCacheFilePath(platform, identifier);
  await ensureDirExists(path.dirname(cacheFile));

  try {
    await fs.writeFile(
      cacheFile,
      JSON.stringify(Array.from(urls), null, 2),
      'utf-8'
    );
    console.log(`[${platform}] Saved ${urls.size} scraped URLs (${identifier})`);
    return true;
  } catch (error: any) {
    console.error(`[${platform}] Failed to save scraped URLs (${identifier}):`, error.message);
    return false;
  }
}

/**
 * 生成今天的日期字符串，格式为 YYYY-MM-DD
 */
export function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 获取目录中的 Markdown 文件（排除合并文件）
 */
export async function getMarkdownFiles(dir: string): Promise<string[]> {
  if (!dir) {
    console.error('getMarkdownFiles requires directory path');
    return [];
  }
  try {
    const files = await fs.readdir(dir);
    return files
      .filter(file => file.endsWith('.md') && !file.startsWith('merged-') && !file.startsWith('digest-'))
      .map(file => path.join(dir, file));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.warn(`Directory does not exist, cannot read Markdown files: ${dir}`);
      return [];
    }
    console.error(`Failed to read Markdown files (${dir}):`, error.message);
    return [];
  }
}

export {
  DEFAULT_OUTPUT_ROOT,
  CACHE_ROOT
};
