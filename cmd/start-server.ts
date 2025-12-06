/**
 * XRCrawler Hono Server
 * Consolidated Entry Point
 */

// Early error handling to catch any startup issues
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
  console.error('[FATAL] Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise);
  console.error('[FATAL] Reason:', reason);
  process.exit(1);
});

// Force output to be unbuffered
process.stdout.write('[START] Loading modules...\n');
process.stderr.write('[START] Loading modules...\n');

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { logger } from 'hono/logger';

process.stdout.write('[START] Core modules loaded\n');
process.stderr.write('[START] Core modules loaded\n');

// Utils
import {
  createEnhancedLogger,
  getConfigManager,
  setLogLevel,
} from '../utils';

process.stdout.write('[START] Utils loaded\n');
process.stderr.write('[START] Utils loaded\n');

// Middleware
import { apiKeyMiddleware } from '../server/middleware/api-key';

process.stdout.write('[START] Middleware loaded\n');
process.stderr.write('[START] Middleware loaded\n');

// Routes (All Unified in server/routes)
import jobRoutes from '../server/routes/jobs';
import healthRoutes from '../server/routes/health';
import statsRoutes from '../server/routes/stats';
import queueMonitor from '../server/routes/queue-monitor';
import scrapeRoutes from '../server/routes/scrape';
import sessionRoutes from '../server/routes/sessions';
import resourceRoutes from '../server/routes/resources';

process.stdout.write('[START] Routes loaded\n');
process.stderr.write('[START] Routes loaded\n');

// ============ Configuration ============
process.stdout.write('[START] Initializing configuration...\n');
process.stderr.write('[START] Initializing configuration...\n');
let configManager;
let serverConfig;
let LOG_CONFIG;
let PORT;
let STATIC_DIR;

try {
  configManager = getConfigManager();
  process.stdout.write('[START] Config manager created\n');
  process.stderr.write('[START] Config manager created\n');
  serverConfig = configManager.getServerConfig();
  process.stdout.write('[START] Server config loaded\n');
  process.stderr.write('[START] Server config loaded\n');
  LOG_CONFIG = configManager.getLoggingConfig();
  process.stdout.write('[START] Log config loaded\n');
  process.stderr.write('[START] Log config loaded\n');
  setLogLevel(LOG_CONFIG.level);
  PORT = serverConfig.port;
  STATIC_DIR = path.resolve(process.cwd(), 'public');
  process.stdout.write(`[START] Configuration complete. Port: ${PORT}, Static dir: ${STATIC_DIR}\n`);
  process.stderr.write(`[START] Configuration complete. Port: ${PORT}, Static dir: ${STATIC_DIR}\n`);
} catch (error) {
  process.stderr.write(`[ERROR] Failed to initialize configuration: ${error}\n`);
  process.stderr.write(`[ERROR] Stack: ${(error as Error).stack}\n`);
  console.error('[ERROR] Failed to initialize configuration:', error);
  console.error('[ERROR] Stack:', (error as Error).stack);
  process.exit(1);
}

process.stdout.write('[START] Creating logger...\n');
process.stderr.write('[START] Creating logger...\n');
const serverLogger = createEnhancedLogger('HonoServer');

// ============ Hono App ============
process.stdout.write('[START] Creating Hono app...\n');
process.stderr.write('[START] Creating Hono app...\n');
const app = new Hono();
process.stdout.write('[START] Hono app created\n');
process.stderr.write('[START] Hono app created\n');

// Global Middleware
app.use('*', logger());
app.use('/api/*', apiKeyMiddleware);

// ============ Register Routes ============

// 1. Core API Routes
app.route('/api/jobs', jobRoutes);
app.route('/api', scrapeRoutes);   // Contains /api/scrape-v2
app.route('/api', healthRoutes);   // Contains /api/health
app.route('/api', statsRoutes);    // Contains /api/stats
app.route('/api', sessionRoutes);  // Contains /api/sessions, /api/cookies
app.route('/api', resourceRoutes); // Contains /api/config, /api/download

// 2. Admin Routes
app.route('/admin/queues', queueMonitor);

// ============ Static Files & SPA ============
app.use('/assets/*', serveStatic({ root: './public' }));
app.use('/enso.svg', serveStatic({ path: './public/enso.svg' }));
app.use('/icon.png', serveStatic({ path: './public/icon.png' }));

app.get('*', (c) => {
  const requestPath = c.req.path;
  if (requestPath.endsWith('.html')) {
    const filePath = path.join(STATIC_DIR, requestPath);
    if (fs.existsSync(filePath)) return c.html(fs.readFileSync(filePath, 'utf-8'));
  }
  const indexPath = path.join(STATIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) return c.html(fs.readFileSync(indexPath, 'utf-8'));
  return c.text('Not found', 404);
});

// ============ Server Start ============
process.stdout.write('[START] Starting server...\n');
process.stderr.write('[START] Starting server...\n');
let server: ReturnType<typeof Bun.serve>;

try {
  process.stdout.write(`[START] Attempting to start server on port ${PORT}\n`);
  process.stderr.write(`[START] Attempting to start server on port ${PORT}\n`);
  serverLogger.info(`Starting server on port ${PORT}`);
  serverLogger.info(`📊 Queue monitor at http://localhost:${PORT}/queue-monitor.html`);

  // Start Bun server
  process.stdout.write('[START] Calling Bun.serve...\n');
  process.stderr.write('[START] Calling Bun.serve...\n');
  server = Bun.serve({
    port: PORT,
    fetch: app.fetch,
  });

  process.stdout.write(`[SUCCESS] Server started on port ${server.port}\n`);
  process.stderr.write(`[SUCCESS] Server started on port ${server.port}\n`);
  serverLogger.info(`✅ Server running at http://localhost:${server.port}`);
} catch (error) {
  process.stderr.write(`[ERROR] Failed to start server: ${error}\n`);
  process.stderr.write(`[ERROR] Error type: ${(error as Error).constructor.name}\n`);
  process.stderr.write(`[ERROR] Stack: ${(error as Error).stack}\n`);
  console.error('[ERROR] Failed to start server:', error);
  console.error('[ERROR] Error type:', (error as Error).constructor.name);
  console.error('[ERROR] Stack:', (error as Error).stack);
  serverLogger.error('Failed to start server:', error as Error);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  serverLogger.info('Received SIGTERM, shutting down gracefully...');
  if (server) {
    server.stop();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  serverLogger.info('Received SIGINT, shutting down gracefully...');
  if (server) {
    server.stop();
  }
  process.exit(0);
});
