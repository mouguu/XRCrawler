/**
 * 性能监控器
 * 统计爬取过程中的各项指标
 */

export interface TimingMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

export interface PerformanceStats {
  // 时间统计
  totalDuration: number; // 总耗时 (ms)
  navigationTime: number; // 导航耗时 (ms) - DOM 模式
  scrollTime: number; // 滚动耗时 (ms) - DOM 模式
  extractionTime: number; // 数据提取耗时 (ms)

  // API 统计 (GraphQL 模式)
  apiRequestTime: number; // API 请求总耗时 (ms)
  apiRequestCount: number; // API 请求次数
  apiParseTime: number; // API 响应解析耗时 (ms)
  apiAverageLatency: number; // API 平均延迟 (ms)
  apiRetryCount: number; // API 重试次数

  // 抓取统计
  tweetsCollected: number; // 收集的推文数
  tweetsPerSecond: number; // 每秒推文数
  scrollCount: number; // 滚动次数 - DOM 模式

  // Session 统计
  sessionSwitches: number; // Session 切换次数
  rateLimitHits: number; // Rate limit 触发次数
  rateLimitWaitTime: number; // Rate limit 等待时间 (ms)

  // 内存统计 (MB)
  peakMemoryUsage: number; // 峰值内存使用
  currentMemoryUsage: number; // 当前内存使用

  // 阶段耗时明细
  phases: PhaseMetric[];

  // 模式标识
  mode: 'graphql' | 'puppeteer'; // 爬取模式
}

export interface PhaseMetric {
  name: string;
  duration: number;
  percentage: number;
}

export class PerformanceMonitor {
  private startTime: number = 0;
  private endTime: number = 0;

  // 累计时间
  private navigationTime: number = 0;
  private scrollTime: number = 0;
  private extractionTime: number = 0;

  // API 统计
  private apiRequestTime: number = 0;
  private apiRequestCount: number = 0;
  private apiParseTime: number = 0;
  private apiRetryCount: number = 0;
  private apiLatencies: number[] = []; // 存储每次请求的延迟

  // 计数器
  private tweetsCollected: number = 0;
  private scrollCount: number = 0;
  private sessionSwitches: number = 0;
  private rateLimitHits: number = 0;
  private rateLimitWaitTime: number = 0;

  // 内存追踪
  private peakMemoryUsage: number = 0;
  private memoryCheckInterval: NodeJS.Timeout | null = null;

  // 当前阶段追踪
  private currentPhase: { name: string; startTime: number } | null = null;
  private phases: Map<string, number> = new Map();

  // 模式追踪
  private mode: 'graphql' | 'puppeteer' = 'graphql';

  /**
   * 开始监控
   */
  start(): void {
    this.startTime = Date.now();
    this.startMemoryTracking();
  }

  /**
   * 结束监控
   */
  stop(): void {
    this.endTime = Date.now();
    this.stopMemoryTracking();
    if (this.currentPhase) {
      this.endPhase();
    }
  }

  /**
   * 设置爬取模式
   */
  setMode(mode: 'graphql' | 'puppeteer'): void {
    this.mode = mode;
  }

  /**
   * 开始一个阶段计时
   */
  startPhase(name: string): void {
    if (this.currentPhase) {
      this.endPhase();
    }
    this.currentPhase = { name, startTime: Date.now() };
  }

  /**
   * 结束当前阶段计时
   */
  endPhase(): void {
    if (!this.currentPhase) return;

    const duration = Date.now() - this.currentPhase.startTime;
    const existing = this.phases.get(this.currentPhase.name) || 0;
    this.phases.set(this.currentPhase.name, existing + duration);

    // 累计到对应类别
    const name = this.currentPhase.name.toLowerCase();
    if (name.includes('navigation') || name.includes('navigate') || name.includes('goto')) {
      this.navigationTime += duration;
    } else if (name.includes('scroll')) {
      this.scrollTime += duration;
    } else if (name.includes('extract') || name.includes('parse')) {
      this.extractionTime += duration;
      // 如果是 API 解析阶段
      if (name.includes('parse') && (name.includes('api') || name.includes('response'))) {
        this.apiParseTime += duration;
      }
    } else if (name.includes('fetch') || name.includes('api') || name.includes('request')) {
      // API 请求阶段
      this.apiRequestTime += duration;
      this.apiRequestCount++;
      this.apiLatencies.push(duration);
    }

    this.currentPhase = null;
  }

  /**
   * 记录 API 请求（带延迟信息）
   */
  recordApiRequest(latency: number, retried: boolean = false): void {
    this.apiRequestTime += latency;
    this.apiRequestCount++;
    this.apiLatencies.push(latency);
    if (retried) {
      this.apiRetryCount++;
    }
  }

  /**
   * 记录 API 解析时间
   */
  recordApiParse(duration: number): void {
    this.apiParseTime += duration;
  }

  /**
   * 记录 Rate Limit 等待时间
   */
  recordRateLimitWait(waitTime: number): void {
    this.rateLimitHits++;
    this.rateLimitWaitTime += waitTime;
  }

  /**
   * 记录推文收集数量
   */
  recordTweets(count: number): void {
    this.tweetsCollected = count;
  }

  /**
   * 增加推文计数
   */
  addTweets(count: number): void {
    this.tweetsCollected += count;
  }

  /**
   * 记录滚动
   */
  recordScroll(): void {
    this.scrollCount++;
  }

  /**
   * 记录 Session 切换
   */
  recordSessionSwitch(): void {
    this.sessionSwitches++;
  }

  /**
   * 记录 Rate Limit
   */
  recordRateLimit(): void {
    this.rateLimitHits++;
  }

  /**
   * 启动内存追踪
   */
  private startMemoryTracking(): void {
    this.updateMemoryUsage();
    this.memoryCheckInterval = setInterval(() => {
      this.updateMemoryUsage();
    }, 1000);
  }

  /**
   * 停止内存追踪
   */
  private stopMemoryTracking(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
  }

  /**
   * 更新内存使用情况
   */
  private updateMemoryUsage(): void {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    if (heapUsedMB > this.peakMemoryUsage) {
      this.peakMemoryUsage = heapUsedMB;
    }
  }

  /**
   * 获取当前内存使用
   */
  private getCurrentMemoryUsage(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed / 1024 / 1024;
  }

  /**
   * 获取统计结果
   */
  getStats(): PerformanceStats {
    const totalDuration = (this.endTime || Date.now()) - this.startTime;
    const tweetsPerSecond = totalDuration > 0 ? this.tweetsCollected / (totalDuration / 1000) : 0;

    // 计算 API 平均延迟
    const apiAverageLatency =
      this.apiLatencies.length > 0
        ? this.apiLatencies.reduce((sum, lat) => sum + lat, 0) / this.apiLatencies.length
        : 0;

    // 计算各阶段百分比
    const phaseMetrics: PhaseMetric[] = [];
    for (const [name, duration] of this.phases.entries()) {
      phaseMetrics.push({
        name,
        duration,
        percentage: totalDuration > 0 ? (duration / totalDuration) * 100 : 0,
      });
    }

    // 按耗时排序
    phaseMetrics.sort((a, b) => b.duration - a.duration);

    return {
      totalDuration,
      navigationTime: this.navigationTime,
      scrollTime: this.scrollTime,
      extractionTime: this.extractionTime,
      apiRequestTime: this.apiRequestTime,
      apiRequestCount: this.apiRequestCount,
      apiParseTime: this.apiParseTime,
      apiAverageLatency: Math.round(apiAverageLatency * 100) / 100,
      apiRetryCount: this.apiRetryCount,
      tweetsCollected: this.tweetsCollected,
      tweetsPerSecond: Math.round(tweetsPerSecond * 100) / 100,
      scrollCount: this.scrollCount,
      sessionSwitches: this.sessionSwitches,
      rateLimitHits: this.rateLimitHits,
      rateLimitWaitTime: this.rateLimitWaitTime,
      peakMemoryUsage: Math.round(this.peakMemoryUsage * 100) / 100,
      currentMemoryUsage: Math.round(this.getCurrentMemoryUsage() * 100) / 100,
      phases: phaseMetrics,
      mode: this.mode,
    };
  }

  /**
   * 格式化输出统计报告
   */
  getReport(): string {
    const stats = this.getStats();
    const lines: string[] = [];

    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('                    📊 PERFORMANCE REPORT                   ');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');

    // 模式标识
    lines.push(`🔧 MODE: ${stats.mode.toUpperCase()}`);
    lines.push('');

    // 时间统计
    lines.push('⏱️  TIME STATISTICS');
    lines.push('───────────────────────────────────────────────────────────');
    lines.push(`   Total Duration:     ${this.formatDuration(stats.totalDuration)}`);

    if (stats.mode === 'graphql') {
      lines.push(
        `   API Request Time:   ${this.formatDuration(stats.apiRequestTime)} (${this.percentage(stats.apiRequestTime, stats.totalDuration)})`,
      );
      lines.push(
        `   API Parse Time:     ${this.formatDuration(stats.apiParseTime)} (${this.percentage(stats.apiParseTime, stats.totalDuration)})`,
      );
      lines.push(`   API Requests:       ${stats.apiRequestCount}`);
      lines.push(`   Avg API Latency:    ${this.formatDuration(stats.apiAverageLatency)}`);
      if (stats.apiRetryCount > 0) {
        lines.push(`   API Retries:        ${stats.apiRetryCount}`);
      }
    }

    if (stats.mode === 'puppeteer') {
      lines.push(
        `   Navigation Time:    ${this.formatDuration(stats.navigationTime)} (${this.percentage(stats.navigationTime, stats.totalDuration)})`,
      );
      lines.push(
        `   Scroll Time:        ${this.formatDuration(stats.scrollTime)} (${this.percentage(stats.scrollTime, stats.totalDuration)})`,
      );
    }

    lines.push(
      `   Extraction Time:    ${this.formatDuration(stats.extractionTime)} (${this.percentage(stats.extractionTime, stats.totalDuration)})`,
    );
    lines.push('');

    // 抓取统计
    lines.push('🐦 SCRAPING STATISTICS');
    lines.push('───────────────────────────────────────────────────────────');
    lines.push(`   Tweets Collected:   ${stats.tweetsCollected}`);
    lines.push(`   Tweets/Second:      ${stats.tweetsPerSecond.toFixed(2)}`);
    lines.push(`   Scroll Count:       ${stats.scrollCount}`);
    lines.push(
      `   Avg Tweets/Scroll:  ${stats.scrollCount > 0 ? (stats.tweetsCollected / stats.scrollCount).toFixed(2) : 'N/A'}`,
    );
    lines.push('');

    // Session 统计
    lines.push('🔄 SESSION STATISTICS');
    lines.push('───────────────────────────────────────────────────────────');
    lines.push(`   Session Switches:   ${stats.sessionSwitches}`);
    lines.push(`   Rate Limit Hits:    ${stats.rateLimitHits}`);
    if (stats.rateLimitWaitTime > 0) {
      lines.push(`   Rate Limit Wait:    ${this.formatDuration(stats.rateLimitWaitTime)}`);
    }
    lines.push('');

    // 内存统计
    lines.push('💾 MEMORY STATISTICS');
    lines.push('───────────────────────────────────────────────────────────');
    lines.push(`   Peak Memory:        ${stats.peakMemoryUsage.toFixed(2)} MB`);
    lines.push(`   Current Memory:     ${stats.currentMemoryUsage.toFixed(2)} MB`);
    lines.push('');

    // 阶段明细（如果有）
    if (stats.phases.length > 0) {
      lines.push('📋 PHASE BREAKDOWN');
      lines.push('───────────────────────────────────────────────────────────');
      for (const phase of stats.phases.slice(0, 10)) {
        // 只显示前10个
        const bar = this.progressBar(phase.percentage, 20);
        lines.push(
          `   ${phase.name.padEnd(20)} ${this.formatDuration(phase.duration).padStart(10)} ${bar} ${phase.percentage.toFixed(1)}%`,
        );
      }
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * 格式化时间
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(1);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * 计算百分比
   */
  private percentage(part: number, total: number): string {
    if (total === 0) return '0%';
    return `${((part / total) * 100).toFixed(1)}%`;
  }

  /**
   * 生成进度条
   */
  private progressBar(percentage: number, width: number): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  /**
   * 重置所有统计
   */
  reset(): void {
    this.startTime = 0;
    this.endTime = 0;
    this.navigationTime = 0;
    this.scrollTime = 0;
    this.extractionTime = 0;
    this.apiRequestTime = 0;
    this.apiRequestCount = 0;
    this.apiParseTime = 0;
    this.apiRetryCount = 0;
    this.apiLatencies = [];
    this.tweetsCollected = 0;
    this.scrollCount = 0;
    this.sessionSwitches = 0;
    this.rateLimitHits = 0;
    this.rateLimitWaitTime = 0;
    this.peakMemoryUsage = 0;
    this.currentPhase = null;
    this.phases.clear();
    this.mode = 'graphql';
    this.stopMemoryTracking();
  }
}

// 全局单例（可选）
let globalMonitor: PerformanceMonitor | null = null;

export function getGlobalMonitor(): PerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor();
  }
  return globalMonitor;
}

export function resetGlobalMonitor(): void {
  if (globalMonitor) {
    globalMonitor.reset();
  }
  globalMonitor = null;
}
