/**
 * FileSystem Utilities (Consolidated)
 * Merges functionality from output-path-manager, fileutils, and path-utils.
 */

import * as fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import * as path from 'node:path';
import * as timeUtils from './datetime';

// ==========================================
// Part 1: Path Helpers (from path-utils.ts & fileutils.ts)
// ==========================================

export function isPathInsideBase(targetPath: string, baseDir: string): boolean {
  if (!targetPath || !baseDir) return false;
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  const baseWithSep = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(baseWithSep);
}

export function sanitizeSegment(segment: string = ''): string {
  return (
    String(segment)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '') || 'timeline'
  );
}

export async function ensureDirExists(dir: string): Promise<boolean> {
  if (!dir) return false;
  try {
    await fsPromises.mkdir(dir, { recursive: true });
    return true;
  } catch (_error: any) {
    return false;
  }
}

export function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

export async function getMarkdownFiles(dir: string): Promise<string[]> {
  if (!dir) return [];
  try {
    const files = await fsPromises.readdir(dir);
    return files
      .filter((file) => file.endsWith('.md') && !file.startsWith('merged-') && !file.startsWith('digest-'))
      .map((file) => path.join(dir, file));
  } catch (_error: any) {
    return [];
  }
}

// ==========================================
// Part 2: Output Path Manager (from output-path-manager.ts)
// ==========================================

export interface OutputPathConfig {
  baseDir?: string;
}

export interface RunPathResult {
  platform: string;
  identifier: string;
  runId: string;
  runDir: string;
  markdownDir: string;
  screenshotDir: string;
  jsonPath: string;
  csvPath: string;
  markdownIndexPath: string;
  metadataPath: string;
}

const DEFAULT_BASE_DIR = path.resolve(process.cwd(), 'output');
export const DEFAULT_OUTPUT_ROOT = DEFAULT_BASE_DIR;

let singletonInstance: OutputPathManager | null = null;

export class OutputPathManager {
  private baseDir: string;

  constructor(config: OutputPathConfig = {}) {
    this.baseDir = config.baseDir || process.env.OUTPUT_DIR || DEFAULT_BASE_DIR;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  getPlatformDir(platform: string): string {
    return path.join(this.baseDir, sanitizeSegment(platform));
  }

  getIdentifierDir(platform: string, identifier: string): string {
    return path.join(this.getPlatformDir(platform), sanitizeSegment(identifier));
  }

  async createRunPath(platform: string, identifier: string, runId: string): Promise<RunPathResult> {
    const runDir = path.join(this.getIdentifierDir(platform, identifier), runId);
    const markdownDir = path.join(runDir, 'markdown');
    const screenshotDir = path.join(runDir, 'screenshots');

    await fsPromises.mkdir(runDir, { recursive: true });
    await fsPromises.mkdir(markdownDir, { recursive: true });
    await fsPromises.mkdir(screenshotDir, { recursive: true });

    return {
      platform: sanitizeSegment(platform),
      identifier: sanitizeSegment(identifier),
      runId,
      runDir,
      markdownDir,
      screenshotDir,
      jsonPath: path.join(runDir, 'tweets.json'),
      csvPath: path.join(runDir, 'tweets.csv'),
      markdownIndexPath: path.join(runDir, 'index.md'),
      metadataPath: path.join(runDir, 'metadata.json'),
    };
  }

  isPathSafe(filePath: string): boolean {
    return isPathInsideBase(filePath, this.baseDir);
  }

  resolvePath(relativePath: string): string {
    if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
      throw new Error('Path traversal detected');
    }
    return path.join(this.baseDir, relativePath);
  }
}

export function getOutputPathManager(config?: OutputPathConfig): OutputPathManager {
  if (!singletonInstance || config) {
    singletonInstance = new OutputPathManager(config);
  }
  return singletonInstance;
}

export function resetOutputPathManager(): void {
  singletonInstance = null;
}

// ==========================================
// Part 3: Run Context Helpers
// ==========================================

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

export async function createRunContext(options: RunContextOptions = {}): Promise<RunContext> {
  const platform = sanitizeSegment(options.platform || 'twitter');
  const identifier = sanitizeSegment(options.identifier || 'timeline');
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

  const runId = `run-${timestampInfo.fileSafe}`;

  const pathManager = getOutputPathManager({ baseDir: options.baseOutputDir });
  const runPath = await pathManager.createRunPath(platform, identifier, runId);

  return {
    platform: runPath.platform,
    identifier: runPath.identifier,
    outputRoot: pathManager.getBaseDir(),
    runId: runPath.runId,
    timezone,
    runTimestamp: timestampInfo.fileSafe,
    runTimestampIso: timestampInfo.iso,
    runTimestampUtc: sourceDate.toISOString(),
    runDir: runPath.runDir,
    markdownDir: runPath.markdownDir,
    screenshotDir: runPath.screenshotDir,
    jsonPath: runPath.jsonPath,
    csvPath: runPath.csvPath,
    markdownIndexPath: runPath.markdownIndexPath,
    metadataPath: runPath.metadataPath,
  };
}

export async function ensureBaseStructure(): Promise<boolean> {
  const pathManager = getOutputPathManager();
  return await ensureDirExists(pathManager.getBaseDir());
}

export async function ensureDirectories(): Promise<boolean> {
  return ensureBaseStructure();
}

export function getDefaultOutputRoot(): string {
  try {
    return getOutputPathManager().getBaseDir();
  } catch {
    return DEFAULT_OUTPUT_ROOT;
  }
}
