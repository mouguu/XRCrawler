import * as fs from 'node:fs';
import * as path from 'node:path';
import { Page, Protocol } from 'puppeteer';
import { CookieManager } from './cookie-manager';
import { ScraperEventBus } from './event-bus';

export interface Session {
  id: string;
  cookies: Protocol.Network.CookieParam[];
  usageCount: number;
  errorCount: number;
  consecutiveFailures: number;
  isRetired: boolean;
  filePath: string;
  username?: string | null;
}

/**
 * SessionManager - 解耦重构
 * 不再内部创建 CookieManager，而是接收 CookieManager 实例或直接使用 cookie 数据
 */
export class SessionManager {
  private sessions: Session[] = [];
  private maxErrorCount: number = 3;
  private maxConsecutiveFailures: number = 2;
  private cookieManager?: CookieManager; // 可选，用于加载 cookies

  constructor(
    private cookieDir: string = './cookies',
    private eventBus?: ScraperEventBus,
    cookieManager?: CookieManager, // 可选的 CookieManager 实例
  ) {
    // 如果提供了 CookieManager，使用它；否则在需要时创建
    this.cookieManager = cookieManager;
  }

  /**
   * 初始化：加载所有 Cookie 文件
   * 解耦：可以接收 CookieManager 或直接加载
   */
  async init(cookieManager?: CookieManager): Promise<void> {
    if (cookieManager) {
      this.cookieManager = cookieManager;
    } else if (!this.cookieManager) {
      // 延迟创建 CookieManager
      const { CookieManager } = await import('./cookie-manager');
      this.cookieManager = new CookieManager({ cookiesDir: this.cookieDir, enableRotation: false });
    }

    if (!fs.existsSync(this.cookieDir)) {
      this._log(`Cookie directory not found: ${this.cookieDir}`, 'warn');
      return;
    }

    const files = fs.readdirSync(this.cookieDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(this.cookieDir, file);
      try {
        const cookieInfo = await this.cookieManager?.loadFromFile(filePath);
        this.sessions.push({
          id: file.replace('.json', ''),
          cookies: cookieInfo.cookies,
          username: cookieInfo.username,
          usageCount: 0,
          errorCount: 0,
          consecutiveFailures: 0,
          isRetired: false,
          filePath,
        });
      } catch (e: any) {
        this._log(`Failed to load cookie file ${file}: ${e.message}`, 'error');
      }
    }

    this._log(`Loaded ${this.sessions.length} sessions.`);
  }

  hasActiveSession(): boolean {
    return this.sessions.some((s) => !s.isRetired);
  }

  getSessionById(id: string): Session | undefined {
    return this.sessions.find((s) => s.id === id);
  }

  /**
   * 获取所有可用的session（未退休的）
   */
  getAllActiveSessions(): Session[] {
    return this.sessions.filter((s) => !s.isRetired);
  }

  /**
   * 获取下一个可用 Session (按健康度排序，优先选择错误少的)
   */
  getNextSession(preferredId?: string, excludeId?: string): Session | null {
    const activeSessions = this.sessions.filter((s) => !s.isRetired);
    if (activeSessions.length === 0) return null;

    const normalizedPreferred = preferredId ? preferredId.replace('.json', '') : undefined;
    if (normalizedPreferred) {
      const preferred = activeSessions.find((s) => s.id === normalizedPreferred);
      if (preferred) return preferred;
    }

    const normalizedExclude = excludeId ? excludeId.replace('.json', '') : undefined;
    const eligibleSessions = normalizedExclude
      ? activeSessions.filter((s) => s.id !== normalizedExclude)
      : activeSessions;

    if (eligibleSessions.length === 0) {
      return null;
    }

    // 按错误次数排序，优先选择错误最少的 session
    const sorted = [...eligibleSessions].sort((a, b) => {
      // 优先选择错误少的
      if (a.errorCount !== b.errorCount) {
        return a.errorCount - b.errorCount;
      }
      // 错误相同则选择使用次数少的
      return a.usageCount - b.usageCount;
    });

    const selected = sorted[0];
    this._log(
      `Selected session: ${selected.id} (errors: ${selected.errorCount}, usage: ${selected.usageCount})`,
    );
    return selected;
  }

  /**
   * 标记 Session 为“坏” (遇到错误)
   * 如果错误次数过多，将自动退休该 Session
   */
  markBad(sessionId: string, reason: string = 'unknown error'): void {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.errorCount++;
      session.consecutiveFailures++;
      this._log(`Session ${sessionId} error count: ${session.errorCount} (${reason})`, 'warn');

      if (
        session.errorCount >= this.maxErrorCount ||
        session.consecutiveFailures >= this.maxConsecutiveFailures
      ) {
        this.retire(sessionId);
      }
    }
  }

  /**
   * 标记 Session 为“好” (成功抓取)
   */
  markGood(sessionId: string): void {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.usageCount++;
      // 成功一次可以抵消一次错误 (可选)
      if (session.errorCount > 0) session.errorCount--;
      session.consecutiveFailures = 0;
    }
  }

  /**
   * 退休 Session (不再使用)
   */
  retire(sessionId: string): void {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.isRetired = true;
      this._log(`Session ${sessionId} has been RETIRED due to too many errors.`, 'error');
    }
  }

  /**
   * 将 Session 注入到 Page
   */
  async injectSession(
    page: Page,
    session: Session,
    clearExistingCookies: boolean = true,
  ): Promise<void> {
    this._log(`Injecting session: ${session.id}`);
    if (clearExistingCookies) {
      const existingCookies = await page.cookies();
      if (existingCookies.length > 0) {
        await page.deleteCookie(...existingCookies);
      }
    }
    await page.setCookie(...(session.cookies as Parameters<typeof page.setCookie>));
  }

  private _log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (this.eventBus) {
      this.eventBus.emitLog(message, level);
    } else {
      const prefix = '[SessionManager]';
      if (level === 'error') console.error(prefix, message);
      else if (level === 'warn') console.warn(prefix, message);
      else console.log(prefix, message);
    }
  }
}
