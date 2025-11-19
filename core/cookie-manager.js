/**
 * Cookie 管理器
 * 负责 Cookie 的加载、验证和注入
 */

const fs = require('fs').promises;
const path = require('path');
const validation = require('../utils/validation');

// Global rotation state
let currentCookieIndex = 0;
let availableCookieFiles = [];

/**
 * Cookie 管理器类
 */
class CookieManager {
  constructor(options = {}) {
    this.primaryCookieFile = options.primaryCookieFile || path.join(process.cwd(), 'env.json');
    this.fallbackCookieFile = options.fallbackCookieFile || path.join(process.cwd(), 'cookies', 'twitter-cookies.json');
    this.cookiesDir = options.cookiesDir || path.join(process.cwd(), 'cookies');
    this.enableRotation = options.enableRotation !== false; // Default: enabled
    this.cookies = null;
    this.username = null;
    this.source = null;
  }

  /**
   * 扫描 cookies 目录，获取所有可用的 cookie 文件
   * @returns {Promise<Array<string>>} - Cookie 文件路径数组
   */
  async scanCookieFiles() {
    try {
      const files = await fs.readdir(this.cookiesDir);
      const cookieFiles = files
        .filter(file => file.endsWith('.json'))
        .map(file => path.join(this.cookiesDir, file));
      return cookieFiles;
    } catch (error) {
      console.warn(`[CookieManager] Failed to scan cookies directory: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取下一个 cookie 文件（轮换逻辑）
   * @returns {Promise<string>} - Cookie 文件路径
   */
  async getNextCookieFile() {
    // 如果还没有扫描过，先扫描
    if (availableCookieFiles.length === 0) {
      availableCookieFiles = await this.scanCookieFiles();
      if (availableCookieFiles.length === 0) {
        // 如果没有找到任何 cookie 文件，回退到主文件
        return this.primaryCookieFile;
      }
    }

    // 获取当前索引的文件
    const cookieFile = availableCookieFiles[currentCookieIndex];

    // 更新索引（循环）
    currentCookieIndex = (currentCookieIndex + 1) % availableCookieFiles.length;

    console.log(`[CookieManager] Rotating to cookie file ${currentCookieIndex}/${availableCookieFiles.length}: ${path.basename(cookieFile)}`);

    return cookieFile;
  }

  /**
   * 从文件加载 Cookie
   * @returns {Promise<Object>} - { cookies: Array, username: string|null, source: string }
   */
  async load() {
    let envData = null;
    let cookieSource = null;

    // 如果启用了轮换，使用轮换逻辑
    if (this.enableRotation) {
      try {
        cookieSource = await this.getNextCookieFile();
        const cookiesString = await fs.readFile(cookieSource, 'utf-8');
        envData = JSON.parse(cookiesString);
      } catch (rotationError) {
        console.warn(`[CookieManager] Rotation failed: ${rotationError.message}, falling back to primary file`);
        // 如果轮换失败，回退到主文件
        try {
          const cookiesString = await fs.readFile(this.primaryCookieFile, 'utf-8');
          envData = JSON.parse(cookiesString);
          cookieSource = this.primaryCookieFile;
        } catch (primaryError) {
          throw new Error(`Failed to load cookies: ${primaryError.message}`);
        }
      }
    } else {
      // 原有逻辑：不启用轮换
      try {
        const cookiesString = await fs.readFile(this.primaryCookieFile, 'utf-8');
        envData = JSON.parse(cookiesString);
        cookieSource = this.primaryCookieFile;
      } catch (primaryError) {
        // 如果主文件失败，尝试备用文件
        try {
          const cookiesString = await fs.readFile(this.fallbackCookieFile, 'utf-8');
          envData = JSON.parse(cookiesString);
          cookieSource = this.fallbackCookieFile;
        } catch (fallbackError) {
          throw new Error(
            `Failed to load cookies from both primary (${this.primaryCookieFile}) and fallback (${this.fallbackCookieFile}) locations. ` +
            `Primary error: ${primaryError.message}. Fallback error: ${fallbackError.message}`
          );
        }
      }
    }

    // 验证 Cookie 数据
    const cookieValidation = validation.validateEnvCookieData(envData);
    if (!cookieValidation.valid) {
      throw new Error(`Cookie validation failed: ${cookieValidation.error}`);
    }

    // 存储验证后的数据（使用过滤后的 cookies）
    this.cookies = cookieValidation.cookies;
    this.username = cookieValidation.username;
    this.source = cookieSource;

    // 如果有过滤掉的 cookie，记录信息
    if (cookieValidation.filteredCount > 0) {
      console.log(`[CookieManager] Filtered out ${cookieValidation.filteredCount} expired cookie(s), using ${this.cookies.length} valid cookies`);
    }

    return {
      cookies: this.cookies,
      username: this.username,
      source: this.source
    };
  }

  /**
   * 将 Cookie 注入到页面
   * @param {Page} page - Puppeteer 页面对象
   * @returns {Promise<void>}
   */
  async injectIntoPage(page) {
    if (!this.cookies) {
      throw new Error('Cookies not loaded. Call load() first.');
    }

    if (!page) {
      throw new Error('Page is required');
    }

    await page.setCookie(...this.cookies);
  }

  /**
   * 加载并注入 Cookie（便捷方法）
   * @param {Page} page - Puppeteer 页面对象
   * @returns {Promise<Object>} - Cookie 信息
   */
  async loadAndInject(page) {
    const cookieInfo = await this.load();
    await this.injectIntoPage(page);
    return cookieInfo;
  }

  /**
   * 获取已加载的 Cookie
   * @returns {Array|null}
   */
  getCookies() {
    return this.cookies;
  }

  /**
   * 获取用户名
   * @returns {string|null}
   */
  getUsername() {
    return this.username;
  }

  /**
   * 获取 Cookie 来源
   * @returns {string|null}
   */
  getSource() {
    return this.source;
  }

  /**
   * 检查 Cookie 是否已加载
   * @returns {boolean}
   */
  isLoaded() {
    return this.cookies !== null;
  }

  /**
   * 清除已加载的 Cookie
   */
  clear() {
    this.cookies = null;
    this.username = null;
    this.source = null;
  }
}

/**
 * 创建并加载 Cookie 管理器
 * @param {Object} options - 配置选项
 * @returns {Promise<CookieManager>}
 */
async function createCookieManager(options = {}) {
  const manager = new CookieManager(options);
  await manager.load();
  return manager;
}

module.exports = {
  CookieManager,
  createCookieManager
};
