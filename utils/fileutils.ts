/**
 * File utilities and run directory helpers for Twitter Crawler
 * 统一管理输出结构与目录创建
 * 重构：使用 OutputPathManager 统一管理路径
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { getOutputPathManager } from './output-path-manager';
import * as timeUtils from './time';

const DEFAULT_OUTPUT_ROOT = path.resolve(process.cwd(), 'output');

const DEFAULT_PLATFORM = 'twitter';
const DEFAULT_IDENTIFIER = 'timeline';

/**
 * 简单清理文件路径片段，避免非法字符
 */
export function sanitizeSegment(segment: string = ''): string {
  return (
    String(segment)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '') || DEFAULT_IDENTIFIER
  );
}

/**
 * 确保目录存在
 */
export async function ensureDirExists(dir: string): Promise<boolean> {
  if (!dir) {
    return false;
  }
  try {
    await fs.mkdir(dir, { recursive: true });
    return true;
  } catch (_error: any) {
    // 静默失败，由调用方处理错误
    return false;
  }
}

/**
 * 确保基础输出目录存在
 * 重构：使用 OutputPathManager
 */
export async function ensureBaseStructure(): Promise<boolean> {
  const pathManager = getOutputPathManager();
  const baseDir = pathManager.getBaseDir();
  return await ensureDirExists(baseDir);
}

/**
 * 兼容旧函数名称
 */
export async function ensureDirectories(): Promise<boolean> {
  return ensureBaseStructure();
}

export function getDefaultOutputRoot(): string {
  // 使用 OutputPathManager 获取统一的基础目录
  try {
    const pathManager = getOutputPathManager();
    return pathManager.getBaseDir();
  } catch {
    return DEFAULT_OUTPUT_ROOT;
  }
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
 * 重构：使用 OutputPathManager 统一管理
 */
export async function createRunContext(options: RunContextOptions = {}): Promise<RunContext> {
  const platform = sanitizeSegment(options.platform || DEFAULT_PLATFORM);
  const identifier = sanitizeSegment(options.identifier || DEFAULT_IDENTIFIER);
  const timezone = timeUtils.resolveTimezone(options.timezone);

  let sourceDate = new Date();
  if (options.timestamp) {
    const overrideDate = new Date(options.timestamp);
    if (!Number.isNaN(overrideDate.getTime())) {
      sourceDate = overrideDate;
    }
  }

  const timestampInfo = timeUtils.formatZonedTimestamp(sourceDate, timezone, {
    includeMilliseconds: true,
    includeOffset: true,
  });

  const runTimestamp = timestampInfo.fileSafe;
  const runTimestampIso = timestampInfo.iso;
  const runTimestampUtc = sourceDate.toISOString();
  const runId = `run-${runTimestamp}`;

  // 使用 OutputPathManager 统一管理路径
  const pathManager = getOutputPathManager({
    baseDir: options.baseOutputDir,
  });

  const runPath = await pathManager.createRunPath(platform, identifier, runId);

  return {
    platform: runPath.platform,
    identifier: runPath.identifier,
    outputRoot: pathManager.getBaseDir(),
    runId: runPath.runId,
    timezone,
    runTimestamp,
    runTimestampIso,
    runTimestampUtc,
    runDir: runPath.runDir,
    markdownDir: runPath.markdownDir,
    screenshotDir: runPath.screenshotDir,
    jsonPath: runPath.jsonPath,
    csvPath: runPath.csvPath,
    markdownIndexPath: runPath.markdownIndexPath,
    metadataPath: runPath.metadataPath,
  };
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
    return [];
  }
  try {
    const files = await fs.readdir(dir);
    return files
      .filter(
        (file) =>
          file.endsWith('.md') && !file.startsWith('merged-') && !file.startsWith('digest-'),
      )
      .map((file) => path.join(dir, file));
  } catch (_error: any) {
    // 静默返回空数组，由调用方处理
    return [];
  }
}

export { DEFAULT_OUTPUT_ROOT };
