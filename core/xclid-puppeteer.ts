/**
 * XClIdGenPuppeteer - Passive Interception Engine for Twitter SearchTimeline
 * (This is the "Magic Fix" version that implicitly handles pagination loops)
 */

import { Browser, Page, HTTPResponse } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Proxy } from './proxy-manager';

puppeteer.use(StealthPlugin());

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

export class XClIdGenPuppeteer {
  private browser?: Browser;
  private page?: Page;
  private responseQueue: any[] = [];
  private currentQuery: string = '';

  private constructor() {}

  static async create(
    cookiesHeader: string,
    userAgent: string = DEFAULT_USER_AGENT,
    proxy?: Proxy,
  ): Promise<XClIdGenPuppeteer> {
    const instance = new XClIdGenPuppeteer();

    try {
      const launchOptions: any = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
        ],
        timeout: 60000,
      };

      if (proxy) {
        const proxyServer = `${proxy.host}:${proxy.port}`;
        launchOptions.args.push(`--proxy-server=${proxyServer}`);
      }

      instance.browser = await puppeteer.launch(launchOptions);
      instance.page = await instance.browser.newPage();

      if (proxy && proxy.username && proxy.password) {
        await instance.page.authenticate({
          username: proxy.username,
          password: proxy.password,
        });
      }

      await instance.page.setUserAgent(userAgent);
      await instance.page.setViewport({ width: 1280, height: 800 });

      if (cookiesHeader) {
        const cookies = cookiesHeader.split(';').map((cookie) => {
          const [name, value] = cookie.trim().split('=');
          return { name: name.trim(), value: value?.trim() || '', domain: '.x.com', path: '/' };
        });
        await instance.page.setCookie(...cookies);
      }

      instance.page.on('response', async (response: HTTPResponse) => {
        const url = response.url();
        if (url.includes('/SearchTimeline') && url.includes('/graphql/') && response.request().method() !== 'OPTIONS') {
          try {
            if (response.ok()) {
              const json = await response.json();
              instance.responseQueue.push(json);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      });

      return instance;
    } catch (error) {
      if (instance.browser) await instance.browser.close();
      throw error;
    }
  }

  /**
   * 核心回滚点: 恢复"智能纠错"逻辑
   * 如果是同一个查询，就当作滚动处理，否则才重新导航。
   */
  async performSearch(query: string): Promise<any> {
    if (!this.page) throw new Error('Puppeteer not ready');

    // 这就是那个"负负得正"的魔法逻辑
    if (query === this.currentQuery) {
      console.warn(
        `[XClIdGenPuppeteer] (Legacy Mode) Duplicate search request. Converting to scroll to continue pagination.`,
      );
      return await this.performScrollNext();
    }

    this.responseQueue = [];
    this.currentQuery = query;

    const targetUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
    console.log(`[XClIdGenPuppeteer] (Legacy Mode) Navigating to NEW search: ${targetUrl}`);
    await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    return await this.waitForResponse(15000);
  }

  /**
   * 使用回滚前的、更简单的滚动逻辑。
   */
  async performScrollNext(): Promise<any> {
    if (!this.page) throw new Error('Puppeteer not ready');
    console.log('[XClIdGenPuppeteer] (Legacy Mode) Performing simple scroll...');
    this.responseQueue = [];

    await this.page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    return await this.waitForResponse(15000);
  }

  private async waitForResponse(timeoutMs: number): Promise<any> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (this.responseQueue.length > 0) {
        return this.responseQueue.shift();
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timeout waiting for Twitter API response after ${timeoutMs}ms`);
  }

  async close(): Promise<void> {
    if (this.browser) await this.browser.close();
  }
}
