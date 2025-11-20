"use strict";
/**
 * Export utilities for Twitter Crawler
 * 在新的运行目录结构中导出 CSV 与 JSON
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
exports.exportToCsv = exportToCsv;
exports.exportToJson = exportToJson;
const fs_1 = require("fs");
const path = __importStar(require("path"));
const fileUtils = __importStar(require("./fileutils"));
/**
 * 导出推文数据为 CSV
 */
async function exportToCsv(tweets, runContext, options = {}) {
    if (!Array.isArray(tweets) || tweets.length === 0) {
        console.log('No tweet data to export as CSV');
        return null;
    }
    if (!runContext?.runDir) {
        throw new Error('exportToCsv requires valid runContext');
    }
    await fileUtils.ensureDirExists(runContext.runDir);
    const headers = ['text', 'time', 'url', 'likes', 'retweets', 'replies', 'hasMedia'];
    const csvRows = [
        headers.join(','),
        ...tweets.map(tweet => headers.map(field => {
            const value = tweet[field];
            if (field === 'text' && value) {
                const escaped = String(value).replace(/"/g, '""');
                return /[,"\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
            }
            if (typeof value === 'boolean') {
                return value ? '1' : '0';
            }
            if (value === null || value === undefined) {
                return '';
            }
            return String(value);
        }).join(','))
    ].join('\n');
    const defaultCsvName = runContext.csvPath ? path.basename(runContext.csvPath) : 'tweets.csv';
    const filename = options.filename || defaultCsvName;
    const csvPath = options.filename
        ? path.join(runContext.runDir, filename)
        : (runContext.csvPath || path.join(runContext.runDir, filename));
    await fs_1.promises.writeFile(csvPath, csvRows, 'utf-8');
    console.log(`✅ CSV exported successfully: ${csvPath}`);
    return csvPath;
}
/**
 * 导出推文数据为 JSON
 */
async function exportToJson(tweets, runContext, options = {}) {
    if (!Array.isArray(tweets) || tweets.length === 0) {
        console.log('No tweet data to export as JSON');
        return null;
    }
    if (!runContext?.runDir) {
        throw new Error('exportToJson requires valid runContext');
    }
    await fileUtils.ensureDirExists(runContext.runDir);
    const defaultJsonName = runContext.jsonPath ? path.basename(runContext.jsonPath) : 'tweets.json';
    const filename = options.filename || defaultJsonName;
    const jsonPath = options.filename
        ? path.join(runContext.runDir, filename)
        : (runContext.jsonPath || path.join(runContext.runDir, filename));
    await fs_1.promises.writeFile(jsonPath, JSON.stringify(tweets, null, 2), 'utf-8');
    console.log(`✅ JSON exported successfully: ${jsonPath}`);
    return jsonPath;
}
