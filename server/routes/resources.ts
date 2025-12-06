/**
 * Resources Routes
 * Handles configuration and file downloads
 */
import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createEnhancedLogger,
  getConfigManager,
  getOutputPathManager,
  safeJsonParse,
} from '../../utils';

const logger = createEnhancedLogger('ResourceRoutes');
const resourceRoutes = new Hono();

const configManager = getConfigManager();
const outputConfig = configManager.getOutputConfig();
const outputPathManager = getOutputPathManager({
  baseDir: outputConfig.baseDir,
});
const OUTPUT_ROOT = outputPathManager.getBaseDir();

function getSafePathInfo(resolvedPath: string): {
  identifier?: string;
  runTimestamp?: string;
  tweetCount?: number;
} {
  const relPath = path.relative(OUTPUT_ROOT, resolvedPath);
  if (relPath.startsWith('..')) return {};

  const parts = relPath.split(path.sep).filter(Boolean);
  if (parts.length < 3) return {};

  const identifier = parts[1];
  const runId = parts[2];

  let runTimestamp: string | undefined;
  const match = runId.match(/run-(.+)/);
  if (match?.[1]) {
    runTimestamp = match[1];
  }

  try {
    const dir = path.dirname(resolvedPath);
    const tweetsJsonPath = path.join(dir, 'tweets.json');
    if (fs.existsSync(tweetsJsonPath)) {
      const data = safeJsonParse(fs.readFileSync(tweetsJsonPath, 'utf-8'));
      if (Array.isArray(data)) {
        return { identifier, runTimestamp, tweetCount: data.length };
      }
    }
  } catch {
    // ignore parse errors
  }

  return { identifier, runTimestamp };
}

// GET /api/config
resourceRoutes.get('/config', (c) => {
  return c.json(configManager.getPublicConfig());
});

// GET /api/download
resourceRoutes.get('/download', (c) => {
  const filePathParam = c.req.query('path') || '';

  if (!filePathParam) {
    return c.text('Invalid file path', 400);
  }

  let resolvedPath = path.resolve(filePathParam);

  if (!outputPathManager.isPathSafe(resolvedPath)) {
    logger.warn('Unsafe download path attempt', {
      path: filePathParam,
      resolved: resolvedPath,
      baseDir: outputPathManager.getBaseDir(),
    });
    return c.text('Invalid file path', 400);
  }

  if (!fs.existsSync(resolvedPath)) {
    logger.warn('File not found', { path: resolvedPath });
    return c.text('File not found', 404);
  }

  // Handle directory paths
  if (fs.statSync(resolvedPath).isDirectory()) {
    let candidate = path.join(resolvedPath, 'index.md');
    if (fs.existsSync(candidate)) {
      resolvedPath = candidate;
    } else if (path.basename(resolvedPath) === 'markdown') {
      candidate = path.join(path.dirname(resolvedPath), 'index.md');
      if (fs.existsSync(candidate)) {
        resolvedPath = candidate;
      }
    }

    if (!outputPathManager.isPathSafe(resolvedPath)) {
      return c.text('Invalid file path', 400);
    }
  }

  const basename = path.basename(resolvedPath);
  let downloadName = basename;

  if (basename === 'tweets.md' || basename === 'index.md') {
    const { identifier, runTimestamp, tweetCount } = getSafePathInfo(resolvedPath);
    const timestamp = runTimestamp || new Date().toISOString().split('T')[0];
    const countSegment = typeof tweetCount === 'number' ? `-${tweetCount}tweets` : '';
    const idSegment = identifier || 'twitter';
    downloadName = `${idSegment}-timeline-${timestamp}${countSegment}.md`;
  }

  /*
   * Fix Chinese filename download issue
   * RFC 5987/6266: Use filename*=UTF-8''... for non-ASCII
   * Fallback to filename="..." for legacy (though modern browsers prefer star)
   */
  const fileContent = fs.readFileSync(resolvedPath);
  const encodedFilename = encodeURIComponent(downloadName);
  return new Response(fileContent, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}; filename="${encodedFilename}"`,
    },
  });
});

export default resourceRoutes;
