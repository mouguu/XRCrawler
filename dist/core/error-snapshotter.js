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
exports.ErrorSnapshotter = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * ErrorSnapshotter
 *
 * Responsible for capturing screenshots and HTML snapshots when an error occurs.
 * Inspired by Crawlee's ErrorSnapshotter.
 */
class ErrorSnapshotter {
    constructor(baseDir = 'output/errors') {
        this.snapshotDir = path.isAbsolute(baseDir) ? baseDir : path.join(process.cwd(), baseDir);
        this.ensureDirExists();
    }
    ensureDirExists() {
        if (!fs.existsSync(this.snapshotDir)) {
            fs.mkdirSync(this.snapshotDir, { recursive: true });
        }
    }
    /**
     * Captures a snapshot (screenshot + HTML) of the current page state.
     * @param page The Puppeteer page instance
     * @param error The error object that triggered this snapshot
     * @param contextLabel A label to identify the context (e.g., 'scrapeTimeline-elonmusk')
     */
    async capture(page, error, contextLabel = 'unknown') {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const sanitizedLabel = contextLabel.replace(/[^a-z0-9-]/gi, '_');
            const errorName = error.name || 'Error';
            // Base filename: timestamp_label_error
            const baseFilename = `${timestamp}_${sanitizedLabel}_${errorName}`;
            const screenshotPath = path.join(this.snapshotDir, `${baseFilename}.jpg`);
            const htmlPath = path.join(this.snapshotDir, `${baseFilename}.html`);
            const savedFiles = [];
            // 1. Capture Screenshot
            try {
                await page.screenshot({
                    path: screenshotPath,
                    type: 'jpeg',
                    quality: 60,
                    fullPage: true
                });
                savedFiles.push(screenshotPath);
            }
            catch (e) {
                console.error(`[ErrorSnapshotter] Failed to capture screenshot: ${e}`);
            }
            // 2. Capture HTML
            try {
                const htmlContent = await page.content();
                fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
                savedFiles.push(htmlPath);
            }
            catch (e) {
                console.error(`[ErrorSnapshotter] Failed to capture HTML: ${e}`);
            }
            // 3. Save Error Details
            try {
                const errorLogPath = path.join(this.snapshotDir, `${baseFilename}.log`);
                const errorLog = `Error: ${error.message}\nStack: ${error.stack}\nContext: ${contextLabel}\nTime: ${new Date().toISOString()}`;
                fs.writeFileSync(errorLogPath, errorLog, 'utf-8');
                savedFiles.push(errorLogPath);
            }
            catch (e) {
                console.error(`[ErrorSnapshotter] Failed to save error log: ${e}`);
            }
            return savedFiles;
        }
        catch (criticalError) {
            console.error(`[ErrorSnapshotter] Critical failure: ${criticalError}`);
            return [];
        }
    }
}
exports.ErrorSnapshotter = ErrorSnapshotter;
