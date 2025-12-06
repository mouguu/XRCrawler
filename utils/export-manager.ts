/**
 * Markdown merge utilities for convergence outputs.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { ensureBaseStructure, getDefaultOutputRoot, getMarkdownFiles, RunContext } from './filesystem';

const DEFAULT_CONVERGENCE_DIR = path.join(getDefaultOutputRoot(), 'convergence');
const COOKIE_FILE = path.join(__dirname, '..', 'env.json');

type Platform = 'x' | 'medium';

interface TweetLike {
  time?: string | number | Date;
  text?: string;
  url?: string;
  likes?: number;
  retweets?: number;
  replies?: number;
  hasMedia?: boolean;
  platform?: Platform;
}

interface ArticleLike {
  title?: string;
  authorName?: string;
  publishedDate?: string | number | Date;
  content?: string;
  url?: string;
  originalUrl?: string;
  platform?: Platform;
}

async function getUsernameFromEnv(): Promise<string | null> {
  try {
    const envContent = await fs.readFile(COOKIE_FILE, 'utf-8');
    const envData = JSON.parse(envContent);
    if (typeof envData.username === 'string') {
      return envData.username;
    }
    if (Array.isArray(envData)) {
      const usernameCookie = envData.find((c: any) => c?.name === 'username');
      if (usernameCookie) {
        return usernameCookie.value;
      }
    }
    return null;
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.warn(`Failed to read env.json to get username: ${error.message}`);
    }
    return null;
  }
}

export async function mergeMarkdownFiles(
  sourceDir: string,
  outputDir: string,
  platform: Platform,
  deleteSourceFiles = false,
): Promise<string | null> {
  if (!sourceDir || !outputDir || !platform) {
    console.error('mergeMarkdownFiles missing required parameters: sourceDir, outputDir, platform');
    return null;
  }

  try {
    console.log(
      `[${platform.toUpperCase()}] Starting to merge Markdown files from ${sourceDir}...`,
    );
    console.log(`[DEBUG] mergeMarkdownFiles called with deleteSourceFiles=${deleteSourceFiles}`);
    await ensureBaseStructure();
    await fs.mkdir(outputDir, { recursive: true });

    const mdFiles = await getMarkdownFiles(sourceDir);
    if (mdFiles.length === 0) {
      console.log(`[${platform.toUpperCase()}] No Markdown files found to merge in ${sourceDir}`);
      return null;
    }

    mdFiles.sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
    console.log(
      `[${platform.toUpperCase()}] Found ${mdFiles.length} Markdown files ready to merge`,
    );

    const mergeTime = new Date();
    const username = await getUsernameFromEnv();
    const dateString = mergeTime.toISOString().split('T')[0];
    const timeString = mergeTime.toTimeString().split(' ')[0].replace(/:/g, '');
    const mergedFilename = `merged-${platform}-${dateString}-${timeString}.md`;

    const metadataBlock = [
      '---',
      `platform: ${platform}`,
      `mergedFilename: ${mergedFilename}`,
      `mergeTimestamp: ${mergeTime.toISOString()}`,
      username
        ? `accountUsername: ${username}`
        : '# accountUsername: (not found in env.json/medium-cookies.json)',
      `totalItemsMerged: ${mdFiles.length}`,
      '---',
      '\n',
    ].join('\n');

    const separator = '\n\n---\n\n';
    let itemIndex = 1;
    let allItemsContent = '';

    for (const file of mdFiles) {
      const content = await fs.readFile(file, 'utf-8');
      allItemsContent += `## ${itemIndex}.\n\n${content}${separator}`;
      itemIndex++;
    }

    if (allItemsContent.endsWith(separator)) {
      allItemsContent = allItemsContent.slice(0, -separator.length);
    }

    const finalContent = metadataBlock + allItemsContent;
    const mergedFilePath = path.join(outputDir, mergedFilename);
    await fs.writeFile(mergedFilePath, finalContent, 'utf-8');
    console.log(
      `[${platform.toUpperCase()}] ✅ All Markdown files merged and saved as: ${mergedFilename}`,
    );

    if (deleteSourceFiles) {
      console.log(
        `[${platform.toUpperCase()}] Deleting ${mdFiles.length} source Markdown files from ${sourceDir}...`,
      );
      let deletedCount = 0;
      for (const file of mdFiles) {
        const base = path.basename(file);
        if (base.startsWith('merged-') || base.startsWith('digest-')) {
          console.warn(`[${platform.toUpperCase()}] Skipping deletion of protected file: ${file}`);
          continue;
        }
        try {
          await fs.unlink(file);
          deletedCount++;
        } catch (delError: any) {
          console.warn(
            `[${platform.toUpperCase()}] Failed to delete file: ${file}`,
            delError.message,
          );
        }
      }
      console.log(`[${platform.toUpperCase()}] Successfully deleted ${deletedCount} source files`);
    }

    return mergedFilePath;
  } catch (error: any) {
    console.error(`[${platform.toUpperCase()}] Failed to merge Markdown files:`, error.message);
    return null;
  }
}

function formatTweetForConvergence(tweet: TweetLike, index: number): string {
  const date = tweet.time ? new Date(tweet.time) : new Date();
  const text = tweet.text || '';
  const content = [
    `## ${index}. (X) ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`,
    '',
    `> ${text.replace(/\n/g, '\n> ')}`,
    '',
    `❤️ ${tweet.likes || 0} | 🔄 ${tweet.retweets || 0} | 💬 ${tweet.replies || 0}${tweet.hasMedia ? ' | 🖼️' : ''}`,
    tweet.url ? `🔗 [View on X](${tweet.url})` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return content;
}

function formatMediumForConvergence(article: ArticleLike, index: number): string {
  const publishedDate = article.publishedDate ? new Date(article.publishedDate) : null;
  const title = article.title || 'Untitled';
  const content = [
    `## ${index}. (Medium) ${title}`,
    '',
    article.authorName ? `*By ${article.authorName}*` : '',
    publishedDate ? `*Published on ${publishedDate.toLocaleDateString()}*` : '',
    '',
    '---',
    '',
    article.content || '',
    '',
    '---',
    article.originalUrl ? `🔗 [View Original](${article.originalUrl})` : '',
    article.url && article.originalUrl && article.url !== article.originalUrl
      ? `🔗 [View Scraped Version](${article.url})`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  return content;
}

export async function mergeAllPlatforms(
  twitterResults: TweetLike[] = [],
  mediumResults: ArticleLike[] = [],
  outputDir: string = DEFAULT_CONVERGENCE_DIR,
): Promise<string | null> {
  const allItems = [
    ...twitterResults.map((item) => ({ ...item, platform: 'x' as Platform })),
    ...mediumResults.map((item) => ({ ...item, platform: 'medium' as Platform })),
  ];

  if (allItems.length === 0) {
    console.log('[Convergence] No content found from any platform to merge.');
    return null;
  }

  allItems.sort((a, b) => {
    const dateA = new Date((a as any).time || (a as any).publishedDate || Date.now()).getTime();
    const dateB = new Date((b as any).time || (b as any).publishedDate || Date.now()).getTime();
    return dateB - dateA;
  });

  console.log(
    `[Convergence] Starting to merge ${allItems.length} items (from ${twitterResults.length} X, ${mediumResults.length} Medium)...`,
  );
  await ensureBaseStructure();
  await fs.mkdir(outputDir, { recursive: true });

  const mergeTime = new Date();
  const username = await getUsernameFromEnv();
  const dateString = mergeTime.toISOString().split('T')[0];
  const timeString = mergeTime.toTimeString().split(' ')[0].replace(/:/g, '');
  const mergedFilename = `convergence-${dateString}-${timeString}.md`;

  const metadataBlock = [
    '---',
    `mergedFilename: ${mergedFilename}`,
    `mergeTimestamp: ${mergeTime.toISOString()}`,
    username ? `primaryAccount: ${username}` : '# primaryAccount: (not found in env.json)',
    `totalItemsMerged: ${allItems.length}`,
    `twitterItems: ${twitterResults.length}`,
    `mediumItems: ${mediumResults.length}`,
    '---',
    '\n',
  ].join('\n');

  const separator = '\n\n---\n\n';
  let finalContent = metadataBlock;
  let itemIndex = 1;

  for (const item of allItems) {
    let formattedItem = '';
    if (item.platform === 'x') {
      formattedItem = formatTweetForConvergence(item, itemIndex);
    } else if (item.platform === 'medium') {
      formattedItem = formatMediumForConvergence(item as ArticleLike, itemIndex);
    }

    if (formattedItem) {
      finalContent += formattedItem + separator;
      itemIndex++;
    }
  }

  if (finalContent.endsWith(separator)) {
    finalContent = finalContent.slice(0, -separator.length);
  }

  const mergedFilePath = path.join(outputDir, mergedFilename);
  try {
    await fs.writeFile(mergedFilePath, finalContent, 'utf-8');
    console.log(`[Convergence] ✅ Convergence file saved successfully: ${mergedFilename}`);
    return mergedFilePath;
  } catch (error: any) {
    console.error(`[Convergence] Failed to save convergence file:`, error.message);
    return null;
  }
}

export async function exportToJson<T>(data: T[], filePathOrContext: string | RunContext): Promise<void> {
  const filePath = typeof filePathOrContext === 'string' ? filePathOrContext : filePathOrContext.jsonPath;
  await ensureBaseStructure();
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function exportToCsv<T extends Record<string, any>>(data: T[], filePathOrContext: string | RunContext): Promise<void> {
  if (!data || data.length === 0) return;
  const filePath = typeof filePathOrContext === 'string' ? filePathOrContext : filePathOrContext.csvPath;
  await ensureBaseStructure();
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ].join('\n');

  await fs.writeFile(filePath, csvContent, 'utf-8');
}

