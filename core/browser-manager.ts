/**
 * 浏览器管理器
 * 负责浏览器的启动、配置和关闭
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page, HTTPRequest } from 'puppeteer';
import * as constants from '../config/constants';

puppeteer.use(StealthPlugin());

export interface BrowserLaunchOptions {
    headless?: boolean;
    userAgent?: string;
    blockResources?: boolean;
    blockedResourceTypes?: string[];
    puppeteerOptions?: any;
}

/**
 * 浏览器管理器类
 */
export class BrowserManager {
    private browser: Browser | null;
    private page: Page | null;

    constructor() {
        this.browser = null;
        this.page = null;
    }

    /**
     * 启动浏览器
     */
    async launch(options: BrowserLaunchOptions = {}): Promise<void> {
        // 禁用代理环境变量
        delete process.env.HTTP_PROXY;
        delete process.env.HTTPS_PROXY;
        delete process.env.http_proxy;
        delete process.env.https_proxy;

        const launchOptions = {
            headless: options.headless !== false,
            args: [...constants.BROWSER_ARGS], // 确保参数被正确传递
            defaultViewport: constants.BROWSER_VIEWPORT,
            ...options.puppeteerOptions
        };

        console.log('[BrowserManager] Launching with args:', launchOptions.args);
        this.browser = await puppeteer.launch(launchOptions);
    }

    /**
     * 创建新页面并配置
     */
    async createPage(options: BrowserLaunchOptions = {}): Promise<Page> {
        if (!this.browser) {
            throw new Error('Browser not launched. Call launch() first.');
        }

        this.page = await this.browser.newPage();

        // 设置 User Agent
        await this.page.setUserAgent(options.userAgent || constants.BROWSER_USER_AGENT);

        // 配置请求拦截
        if (options.blockResources !== false) {
            await this.setupRequestInterception(options.blockedResourceTypes);
        }

        return this.page;
    }

    /**
     * 设置请求拦截以屏蔽不必要的资源
     */
    async setupRequestInterception(blockedTypes: string[] | null = null): Promise<void> {
        if (!this.page) {
            throw new Error('Page not created. Call createPage() first.');
        }

        const typesToBlock = blockedTypes || constants.BLOCKED_RESOURCE_TYPES;

        await this.page.setRequestInterception(true);
        this.page.on('request', (req: HTTPRequest) => {
            const resourceType = req.resourceType();
            if (typesToBlock.includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });
    }

    /**
     * 获取当前页面
     */
    getPage(): Page {
        if (!this.page) {
            throw new Error('Page not created. Call createPage() first.');
        }
        return this.page;
    }

    /**
     * 获取浏览器实例
     */
    getBrowser(): Browser {
        if (!this.browser) {
            throw new Error('Browser not launched. Call launch() first.');
        }
        return this.browser;
    }

    /**
     * 关闭浏览器
     * 包含错误处理和强制终止逻辑
     */
    async close(): Promise<void> {
        if (!this.browser) {
            return;
        }

        try {
            // 尝试正常关闭浏览器
            await this.browser.close();
            console.log('Browser closed successfully');
        } catch (closeError: any) {
            console.error(`Browser close failed: ${closeError.message}`);

            // 如果正常关闭失败，尝试强制终止浏览器进程
            try {
                const browserProcess = this.browser.process();
                if (browserProcess && browserProcess.pid) {
                    console.log(`Attempting to kill browser process (PID: ${browserProcess.pid})...`);
                    process.kill(browserProcess.pid, 'SIGKILL');
                    console.log('Browser process killed successfully');
                }
            } catch (killError: any) {
                console.error(`Failed to kill browser process: ${killError.message}`);
                // 即使强制终止失败，也继续执行，避免阻塞后续操作
            }
        } finally {
            this.browser = null;
            this.page = null;
        }
    }

    /**
     * 检查浏览器是否正在运行
     */
    isRunning(): boolean {
        return this.browser !== null && this.browser.process() !== null;
    }

    /**
     * 检查页面是否已创建
     */
    hasPage(): boolean {
        return this.page !== null;
    }
}

/**
 * 创建并初始化浏览器管理器
 */
export async function createBrowserManager(options: BrowserLaunchOptions = {}): Promise<BrowserManager> {
    const manager = new BrowserManager();
    await manager.launch(options);
    await manager.createPage(options);
    return manager;
}
