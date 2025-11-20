"use strict";
/**
 * Cookie 管理器
 * 负责 Cookie 的加载、验证和注入
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CookieManager = void 0;
exports.createCookieManager = createCookieManager;
const fs_1 = require("fs");
const path = __importStar(require("path"));
const validation = __importStar(require("../utils/validation"));
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
     */
    async scanCookieFiles() {
        try {
            const files = await fs_1.promises.readdir(this.cookiesDir);
            const cookieFiles = files
                .filter(file => file.endsWith('.json'))
                .map(file => path.join(this.cookiesDir, file));
            return cookieFiles;
        }
        catch (error) {
            console.warn(`[CookieManager] Failed to scan cookies directory: ${error.message}`);
            return [];
        }
    }
    /**
     * 获取下一个 cookie 文件（轮换逻辑）
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
     */
    async load() {
        let envData = null;
        let cookieSource = null;
        // 如果启用了轮换，使用轮换逻辑
        if (this.enableRotation) {
            try {
                cookieSource = await this.getNextCookieFile();
                const cookiesString = await fs_1.promises.readFile(cookieSource, 'utf-8');
                envData = JSON.parse(cookiesString);
            }
            catch (rotationError) {
                console.warn(`[CookieManager] Rotation failed: ${rotationError.message}, falling back to primary file`);
                // 如果轮换失败，回退到主文件
                try {
                    const cookiesString = await fs_1.promises.readFile(this.primaryCookieFile, 'utf-8');
                    envData = JSON.parse(cookiesString);
                    cookieSource = this.primaryCookieFile;
                }
                catch (primaryError) {
                    throw new Error(`Failed to load cookies: ${primaryError.message}`);
                }
            }
        }
        else {
            // 原有逻辑：不启用轮换
            try {
                const cookiesString = await fs_1.promises.readFile(this.primaryCookieFile, 'utf-8');
                envData = JSON.parse(cookiesString);
                cookieSource = this.primaryCookieFile;
            }
            catch (primaryError) {
                // 如果主文件失败，尝试备用文件
                try {
                    const cookiesString = await fs_1.promises.readFile(this.fallbackCookieFile, 'utf-8');
                    envData = JSON.parse(cookiesString);
                    cookieSource = this.fallbackCookieFile;
                }
                catch (fallbackError) {
                    throw new Error(`Failed to load cookies from both primary (${this.primaryCookieFile}) and fallback (${this.fallbackCookieFile}) locations. ` +
                        `Primary error: ${primaryError.message}. Fallback error: ${fallbackError.message}`);
                }
            }
        }
        // 验证 Cookie 数据
        const cookieValidation = validation.validateEnvCookieData(envData);
        if (!cookieValidation.valid) {
            throw new Error(`Cookie validation failed: ${cookieValidation.error}`);
        }
        // 存储验证后的数据（使用过滤后的 cookies）
        this.cookies = cookieValidation.cookies || [];
        this.username = cookieValidation.username || null;
        this.source = cookieSource;
        // 如果有过滤掉的 cookie，记录信息
        if (cookieValidation.filteredCount && cookieValidation.filteredCount > 0) {
            console.log(`[CookieManager] Filtered out ${cookieValidation.filteredCount} expired cookie(s), using ${this.cookies?.length || 0} valid cookies`);
        }
        return {
            cookies: this.cookies || [],
            username: this.username,
            source: this.source
        };
    }
    /**
     * 将 Cookie 注入到页面
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
     */
    async loadAndInject(page) {
        const cookieInfo = await this.load();
        await this.injectIntoPage(page);
        return cookieInfo;
    }
    /**
     * 获取已加载的 Cookie
     */
    getCookies() {
        return this.cookies;
    }
    /**
     * 获取用户名
     */
    getUsername() {
        return this.username;
    }
    /**
     * 获取 Cookie 来源
     */
    getSource() {
        return this.source;
    }
    /**
     * 检查 Cookie 是否已加载
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
exports.CookieManager = CookieManager;
/**
 * 创建并加载 Cookie 管理器
 */
async function createCookieManager(options = {}) {
    const manager = new CookieManager(options);
    await manager.load();
    return manager;
}
