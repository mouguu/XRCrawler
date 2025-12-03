import express, { Request, Response } from "express";
import * as path from "path";
import * as fs from "fs";
// 注意: scrapeProfileGraphql 已废弃，统一使用 ScraperEngine
import {
  eventBusInstance,
  ScrapeProgressData,
  LogMessageData,
  getShouldStopScraping,
  setShouldStopScraping,
  createCookieManager,
  scrapeQueue,
} from "./core";
import {
  createEnhancedLogger,
  getOutputPathManager,
  getConfigManager,
  setLogLevel,
} from "./utils";
import * as fileUtils from "./utils/fileutils";
import { apiKeyMiddleware } from "./middleware/api-key";
import { ScrapeRequest } from "./types";
import multer from "multer";
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import jobRoutes from './server/routes/jobs';

// 创建服务器日志器
const serverLogger = createEnhancedLogger("Server");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const cookiesDir = path.join(process.cwd(), "cookies");
    if (!fs.existsSync(cookiesDir)) {
      fs.mkdirSync(cookiesDir, { recursive: true });
    }
    cb(null, cookiesDir);
  },
  filename: (req, file, cb) => {
    // Ensure .json extension
    const name = file.originalname.endsWith(".json")
      ? file.originalname
      : `${file.originalname}.json`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "application/json" ||
      file.originalname.endsWith(".json")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only JSON files are allowed"));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

const app = express();

const configManager = getConfigManager();
const serverConfig = configManager.getServerConfig();
const outputConfig = configManager.getOutputConfig();
const twitterConfig = configManager.getTwitterConfig();
const redditConfig = configManager.getRedditConfig();
const LOG_CONFIG = configManager.getLoggingConfig();

setLogLevel(LOG_CONFIG.level);

const PORT = serverConfig.port;

// 统一使用 OutputPathManager，删除 legacy 路径
const outputPathManager = getOutputPathManager({
  baseDir: outputConfig.baseDir,
});
const OUTPUT_ROOT = outputPathManager.getBaseDir();
const STATIC_DIR = path.resolve(process.cwd(), "public");

// Global state for manual stop
let isScrapingActive = false;
let lastDownloadUrl: string | null = null;
let isShuttingDown = false;
function rejectIfShuttingDown(res: Response): boolean {
  if (isShuttingDown) {
    res.status(503).json({ error: "Server is shutting down" });
    return true;
  }
  return false;
}

// Middleware
app.use(express.json());
app.use(express.static(STATIC_DIR));
app.use("/api", apiKeyMiddleware);

// Bull Board - Queue Monitoring Dashboard
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(scrapeQueue)],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

// Job Management Routes
app.use('/api/job', jobRoutes);

function getSafePathInfo(resolvedPath: string): {
  identifier?: string;
  runTimestamp?: string;
  tweetCount?: number;
} {
  // 使用统一的 OUTPUT_ROOT，删除 legacy 支持
  const relPath = path.relative(OUTPUT_ROOT, resolvedPath);
  if (relPath.startsWith("..")) return {};

  const parts = relPath.split(path.sep).filter(Boolean);
  // expected: platform / identifier / run-xxxx / file
  if (parts.length < 3) return {};

  const identifier = parts[1];
  const runId = parts[2];

  let runTimestamp: string | undefined;
  const match = runId.match(/run-(.+)/);
  if (match && match[1]) {
    runTimestamp = match[1];
  }

  // Try to read tweet count from sibling tweets.json
  try {
    const dir = path.dirname(resolvedPath);
    const tweetsJsonPath = path.join(dir, "tweets.json");
    if (fs.existsSync(tweetsJsonPath)) {
      const data = JSON.parse(fs.readFileSync(tweetsJsonPath, "utf-8"));
      if (Array.isArray(data)) {
        return { identifier, runTimestamp, tweetCount: data.length };
      }
    }
  } catch {
    // ignore parse errors
  }

  return { identifier, runTimestamp };
}

// API: Scrape V2 (Queue-based - Supports Multiple Concurrent Tasks)
app.post(
  "/api/scrape-v2",
  async (
    req: Request<{}, {}, ScrapeRequest>,
    res: Response
  ) => {
    if (rejectIfShuttingDown(res)) return;

    try {
      const { type, input, limit, likes, mode, dateRange, enableRotation, enableProxy, strategy } = req.body;

      serverLogger.info('收到队列爬取请求', { type, input, limit });

      // Generate unique job ID
      const jobId = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // Prepare job data based on type
      const isTwitter = type === 'profile' || type === 'thread' || type === 'search';
      const isReddit = type === 'reddit';

      if (!isTwitter && !isReddit) {
        return res.status(400).json({
          success: false,
          error: 'Invalid scrape type. Must be profile, thread, search, or reddit'
        });
      }

      const jobData: any = {
        jobId,
        type: isTwitter ? 'twitter' : 'reddit',
        config: {}
      };

      // Configure based on type
      if (isTwitter) {
        jobData.config = {
          username: type === 'profile' ? input : undefined,
          tweetUrl: type === 'thread' ? input : undefined,
          searchQuery: type === 'search' ? input : undefined,
          limit: limit || 50,
          mode: mode || 'puppeteer',
          likes: likes || false,
          enableRotation: enableRotation !== false,
          enableProxy: enableProxy || false,
          dateRange,
        };
      } else if (isReddit) {
        const isPostUrl = input && (
          input.includes('reddit.com/r/') && input.includes('/comments/') ||
          input.includes('redd.it/')
        );

        jobData.config = {
          subreddit: !isPostUrl ? input : undefined,
          postUrl: isPostUrl ? input : undefined,
          limit: limit || 500,
          strategy: strategy || 'auto',
        };
      }

      // Add job to queue
      const job = await scrapeQueue.add(jobId, jobData, {
        priority: type === 'thread' ? 10 : 5, // Threads have higher priority
      });

      serverLogger.info('任务已加入队列', { jobId: job.id, type });

      // Return immediately with job info
      res.json({
        success: true,
        jobId: job.id,
        message: 'Task queued successfully',
        statusUrl: `/api/job/${job.id}`,
        progressUrl: `/api/job/${job.id}/stream`,
      });

    } catch (error: any) {
      serverLogger.error('队列添加失败', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to queue task'
      });
    }
  }
);

// API: Manual Stop
app.post("/api/stop", (req: Request, res: Response) => {
  serverLogger.info("收到手动停止请求");

  if (!isScrapingActive) {
    return res.json({
      success: false,
      message: "No active scraping session",
    });
  }

  setShouldStopScraping(true);
  serverLogger.info("停止信号已设置，等待爬虫优雅终止");

  res.json({
    success: true,
    message: "Stop signal sent. Scraper will terminate after current batch.",
  });
});

// API: Progress Stream (SSE)
app.get("/api/progress", (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (event: string, payload: Record<string, any>) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // Send initial message
  sendEvent("connected", {
    type: "connected",
    message: "Progress stream connected",
  });

  // Listener for progress events
  const onProgress = (data: ScrapeProgressData) => {
    sendEvent("progress", { type: "progress", ...data });
  };

  const onLog = (data: LogMessageData) => {
    sendEvent("log", { type: "log", ...data });
  };

  const onPerformance = (data: any) => {
    sendEvent("performance", { type: "performance", ...data });
  };

  const onError = (error: Error) => {
    serverLogger.error("爬虫错误", error);
    sendEvent("log", { type: "log", level: "error", message: error.message });
  };

  eventBusInstance.on("scrape:progress", onProgress);
  eventBusInstance.on("log:message", onLog);
  eventBusInstance.on("performance:update", onPerformance);
  eventBusInstance.on("scrape:error", onError);

  // Remove listeners on disconnect
  req.on("close", () => {
    eventBusInstance.off("scrape:progress", onProgress);
    eventBusInstance.off("log:message", onLog);
    eventBusInstance.off("performance:update", onPerformance);
    eventBusInstance.off("scrape:error", onError);
    serverLogger.debug("SSE 客户端断开连接");
  });
});

// Helper function to broadcast progress
export function broadcastProgress(data: ScrapeProgressData): void {
  eventBusInstance.emitProgress(data);
}

// API: Get scraping status
app.get("/api/status", (req: Request, res: Response) => {
  res.json({
    isActive: isScrapingActive,
    shouldStop: getShouldStopScraping(),
  });
});

// API: Get metrics (简单 JSON 格式)
app.get("/api/metrics", (req: Request, res: Response) => {
  try {
    const { getMetricsCollector } = require("./core/metrics-collector");
    const collector = getMetricsCollector();
    res.json(collector.getMetrics());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get metrics summary
app.get("/api/metrics/summary", (req: Request, res: Response) => {
  try {
    const { getMetricsCollector } = require("./core/metrics-collector");
    const collector = getMetricsCollector();
    res.json({
      summary: collector.getSummary(),
      metrics: collector.getMetrics(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API: Health check
app.get("/api/health", (req: Request, res: Response) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    isScraping: isScrapingActive,
  };

  res.json(health);
});

// API: Public config for frontend
app.get("/api/config", (req: Request, res: Response) => {
  res.json(configManager.getPublicConfig());
});

// API: Get result (download URL after scraping completes)
app.get("/api/result", (req: Request, res: Response) => {
  res.json({
    isActive: isScrapingActive,
    downloadUrl: lastDownloadUrl,
  });
});

// API: Download
app.get("/api/download", (req: Request, res: Response) => {
  const filePathParam =
    typeof req.query.path === "string" ? req.query.path : "";

  if (!filePathParam) {
    return res.status(400).send("Invalid file path");
  }

  const resolvedPath = path.resolve(filePathParam);

  // 检查路径是否安全（在 output 目录内）
  if (!outputPathManager.isPathSafe(resolvedPath)) {
    serverLogger.warn("下载路径不安全", {
      path: filePathParam,
      resolved: resolvedPath,
      baseDir: outputPathManager.getBaseDir(),
    });
    return res.status(400).send("Invalid file path");
  }

  if (!fs.existsSync(resolvedPath)) {
    serverLogger.warn("文件不存在", { path: resolvedPath });
    return res.status(404).send("File not found");
  }

  // Generate a better filename
  const basename = path.basename(resolvedPath);

  let downloadName = basename;
  if (basename === "tweets.md" || basename === "index.md") {
    const { identifier, runTimestamp, tweetCount } =
      getSafePathInfo(resolvedPath);
    const timestamp = runTimestamp || new Date().toISOString().split("T")[0];
    const countSegment =
      typeof tweetCount === "number" ? `-${tweetCount}tweets` : "";
    const idSegment = identifier || "twitter";
    downloadName = `${idSegment}-timeline-${timestamp}${countSegment}.md`;
  }

  res.download(resolvedPath, downloadName);
});

// Frontend entry (allows visiting "/" directly). Exclude /api routes.
app.get(/^(?!\/api).*/, (req: Request, res: Response) => {
  const indexPath = path.join(STATIC_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(404).send("Not found");
});

// Session Management API
app.get("/api/sessions", async (req, res) => {
  try {
    const cookieManager = await createCookieManager();
    const sessions = await cookieManager.listSessions();
    res.json({ success: true, sessions });
  } catch (error: any) {
    if (
      error.code === "COOKIE_LOAD_FAILED" ||
      error.message?.includes("No cookie files found")
    ) {
      serverLogger.warn("/api/sessions: 未找到 cookies（首次运行正常）");
      res.json({ success: true, sessions: [] }); // Return empty list instead of error
    } else {
      serverLogger.error("获取会话列表失败", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

app.post("/api/cookies", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, error: "No file uploaded" });
    }

    // Validate the uploaded file
    const cookieManager = await createCookieManager();
    try {
      // Attempt to load/validate the file we just saved
      await cookieManager.loadFromFile(req.file.path);
      res.json({
        success: true,
        message: "Cookies uploaded and validated successfully",
        filename: req.file.filename,
      });
    } catch (validationError: any) {
      // If invalid, delete the file
      fs.unlinkSync(req.file.path);
      res.status(400).json({
        success: false,
        error: `Invalid cookie file: ${validationError.message}`,
      });
    }
  } catch (error: any) {
    serverLogger.error("上传 cookies 失败", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start Server
const serverInstance = app.listen(PORT, () => {
  serverLogger.info(`服务器启动`, { port: PORT, host: "localhost" });
});

const SHUTDOWN_TIMEOUT_MS = 12000;
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  serverLogger.info(`收到关闭信号: ${signal}，等待活动任务完成`);
  setShouldStopScraping(true);

  try {
    await Promise.race([
      Promise.allSettled(Array.from(activeTasks)),
      new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
    ]);
  } finally {
    serverInstance.close(() => {
      serverLogger.info("HTTP 服务器已关闭");
      process.exit(0);
    });
    setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS + 2000).unref();
  }
}

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal as NodeJS.Signals, () => gracefulShutdown(signal));
});
