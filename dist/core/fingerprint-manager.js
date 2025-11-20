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
exports.FingerprintManager = void 0;
const fingerprint_generator_1 = require("fingerprint-generator");
const fingerprint_injector_1 = require("fingerprint-injector");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * FingerprintManager
 *
 * Responsible for generating, persisting, and injecting browser fingerprints.
 * This ensures that each session (account) maintains a consistent browser identity
 * (User-Agent, Screen Resolution, Hardware Concurrency, etc.) to avoid detection.
 */
class FingerprintManager {
    constructor(baseDir = 'output/fingerprints') {
        this.storageDir = path.isAbsolute(baseDir) ? baseDir : path.join(process.cwd(), baseDir);
        this.fingerprints = new Map();
        // Initialize generator with common desktop configurations
        this.generator = new fingerprint_generator_1.FingerprintGenerator({
            devices: ['desktop'],
            operatingSystems: ['windows', 'macos', 'linux'],
            browsers: [{ name: 'chrome', minVersion: 100 }],
            locales: ['en-US']
        });
        this.injector = new fingerprint_injector_1.FingerprintInjector();
        this.ensureDirExists();
        this.loadFingerprints();
    }
    ensureDirExists() {
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
    }
    loadFingerprints() {
        try {
            const files = fs.readdirSync(this.storageDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const sessionId = file.replace('.json', '');
                    const content = fs.readFileSync(path.join(this.storageDir, file), 'utf-8');
                    this.fingerprints.set(sessionId, JSON.parse(content));
                }
            }
        }
        catch (error) {
            console.error('Failed to load fingerprints:', error);
        }
    }
    /**
     * Gets a fingerprint for a specific session ID.
     * If one exists, it returns the persisted one.
     * If not, it generates a new one and saves it.
     */
    getFingerprint(sessionId) {
        if (this.fingerprints.has(sessionId)) {
            return this.fingerprints.get(sessionId);
        }
        // Generate new fingerprint
        const fingerprint = this.generator.getFingerprint();
        // Save to memory
        this.fingerprints.set(sessionId, fingerprint);
        // Save to disk
        try {
            fs.writeFileSync(path.join(this.storageDir, `${sessionId}.json`), JSON.stringify(fingerprint, null, 2));
        }
        catch (error) {
            console.error(`Failed to save fingerprint for session ${sessionId}:`, error);
        }
        return fingerprint;
    }
    /**
     * Injects the fingerprint into a Puppeteer page.
     * This must be called BEFORE the page navigates to the target URL.
     */
    async injectFingerprint(page, sessionId) {
        const fingerprint = this.getFingerprint(sessionId);
        await this.injector.attachFingerprintToPuppeteer(page, fingerprint);
    }
}
exports.FingerprintManager = FingerprintManager;
