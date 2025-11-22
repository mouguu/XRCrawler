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
exports.RateLimitManager = void 0;
const path = __importStar(require("path"));
const cookie_manager_1 = require("./cookie-manager");
const throttle = (ms) => new Promise(resolve => setTimeout(resolve, ms));
class RateLimitManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.cookieManager = new cookie_manager_1.CookieManager();
        this.maxRotationAttempts = 3;
    }
    async handleRateLimit(page, currentAttempt, error, currentSessionId) {
        if (currentAttempt >= this.maxRotationAttempts) {
            this._log(`Rate limit handling failed after ${currentAttempt} attempts: ${error.message}`, 'error');
            return false;
        }
        this._log(`⚠️ Rate limit detected! Rotating to next cookie account (attempt ${currentAttempt + 1}/${this.maxRotationAttempts})...`, 'warn');
        try {
            // Create a new instance to ensure fresh state or use existing one if designed to handle rotation
            // Assuming CookieManager has logic to pick a *different* cookie or we need to implement that logic.
            // For now, we'll reload and inject. In a real scenario, CookieManager should track used cookies.
            // The original code just did `new CookieManager().load()`.
            const newCookieManager = new cookie_manager_1.CookieManager();
            let cookieData = await newCookieManager.load(); // This needs to be smart enough to load a *different* one if possible, or just next one
            // If we picked the same cookie as current, try the next one (avoid rotating to self)
            if (currentSessionId && cookieData.source && cookieData.source.includes(currentSessionId)) {
                this._log(`Selected same session (${currentSessionId}), trying next cookie...`, 'warn');
                cookieData = await newCookieManager.load();
            }
            await newCookieManager.injectIntoPage(page);
            this._log(`✅ Switched to cookie: ${path.basename(cookieData.source || 'unknown')}`);
            await throttle(2000);
            return true;
        }
        catch (err) {
            this._log(`Failed to rotate cookie: ${err.message}`, 'error');
            return false;
        }
    }
    isRateLimitError(error) {
        const msg = error.message || '';
        return msg.includes('Waiting failed') ||
            msg.includes('timeout') ||
            msg.includes('exceeded') ||
            msg.includes('Waiting for selector') ||
            msg.includes('Navigation timeout');
    }
    _log(message, level = 'info') {
        if (this.eventBus) {
            this.eventBus.emitLog(message, level);
        }
        else {
            console.log(`[RateLimitManager] ${message}`);
        }
    }
}
exports.RateLimitManager = RateLimitManager;
