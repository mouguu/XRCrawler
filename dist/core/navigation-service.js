"use strict";
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
exports.NavigationService = void 0;
const retryUtils = __importStar(require("../utils/retry"));
const constants = __importStar(require("../config/constants"));
// @ts-ignore
const dataExtractor = __importStar(require("./data-extractor"));
class NavigationService {
    constructor(eventBus) {
        this.eventBus = eventBus;
    }
    async navigateToUrl(page, url, options = {}) {
        const maxRetries = options.maxRetries || 1;
        try {
            await retryUtils.retryPageGoto(page, url, {
                waitUntil: 'networkidle2',
                timeout: options.timeout || 30000
            }, {
                maxRetries,
                baseDelay: 1000,
                onRetry: (error, attempt) => {
                    this._log(`Navigation failed (attempt ${attempt}/${maxRetries}): ${error.message}`, 'warn');
                }
            });
            return true;
        }
        catch (error) {
            this._log(`Navigation failed: ${error.message}`, 'error');
            throw error;
        }
    }
    async waitForTweets(page, options = {}) {
        const maxRetries = options.maxRetries || 1;
        try {
            await retryUtils.retryWaitForSelector(page, dataExtractor.X_SELECTORS.TWEET, { timeout: options.timeout || 25000 }, {
                maxRetries,
                baseDelay: 1000,
                onRetry: (error, attempt) => {
                    this._log(`Waiting for tweets failed (attempt ${attempt}/${maxRetries}): ${error.message}`, 'warn');
                }
            });
            return true;
        }
        catch (error) {
            this._log(`No tweets found: ${error.message}`, 'error');
            throw error;
        }
    }
    async reloadPage(page) {
        try {
            await retryUtils.retryWithBackoff(async () => {
                await page.reload({ waitUntil: 'networkidle2', timeout: constants.NAVIGATION_TIMEOUT });
                this._log('Page refreshed, waiting for tweets to reload...');
                await page.waitForSelector(dataExtractor.X_SELECTORS.TWEET, {
                    timeout: constants.WAIT_FOR_TWEETS_AFTER_REFRESH_TIMEOUT
                });
            }, {
                ...constants.REFRESH_RETRY_CONFIG,
                onRetry: (error, attempt) => {
                    this._log(`Page refresh failed (attempt ${attempt}): ${error.message}`, 'warn');
                }
            });
            return true;
        }
        catch (error) {
            this._log(`Page reload failed: ${error.message}`, 'error');
            throw error;
        }
    }
    _log(message, level = 'info') {
        if (this.eventBus) {
            this.eventBus.emitLog(message, level);
        }
        else {
            console.log(`[NavigationService] ${message}`);
        }
    }
}
exports.NavigationService = NavigationService;
