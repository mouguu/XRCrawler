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
exports.RequestQueue = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
class RequestQueue {
    constructor(options = {}) {
        this.queue = [];
        this.inProgress = new Set();
        this.handled = new Set(); // Persisted set of handled uniqueKeys
        this.persistInterval = null;
        const queueDir = options.queueDir || path.join(process.cwd(), '.queue');
        if (!fs.existsSync(queueDir)) {
            fs.mkdirSync(queueDir, { recursive: true });
        }
        this.queueFilePath = path.join(queueDir, 'queue.json');
        this.handledFilePath = path.join(queueDir, 'handled.json');
        this.loadState();
        // Auto-persist state periodically
        if (options.persistIntervalMs !== 0) {
            this.persistInterval = setInterval(() => this.persistState(), options.persistIntervalMs || 10000);
        }
    }
    /**
     * Compute a unique key for a URL to ensure deduplication
     */
    computeUniqueKey(url) {
        // Simple normalization: remove query params if needed, or just hash
        // For Twitter, usually the URL path is enough unique identity
        return (0, crypto_1.createHash)('md5').update(url).digest('hex');
    }
    /**
     * Add a request to the queue
     */
    async addRequest(task) {
        const uniqueKey = task.uniqueKey || this.computeUniqueKey(task.url);
        // Deduplication check
        if (this.handled.has(uniqueKey)) {
            // Already handled, skip
            return;
        }
        // Check if already in queue
        if (this.queue.some(t => t.uniqueKey === uniqueKey)) {
            return;
        }
        const newTask = {
            ...task,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            uniqueKey,
            retryCount: 0,
            priority: task.priority || 0
        };
        this.queue.push(newTask);
        // Sort by priority (descending)
        this.queue.sort((a, b) => b.priority - a.priority);
        console.log(`[RequestQueue] Added task: ${task.url} (Priority: ${newTask.priority})`);
    }
    /**
     * Get the next task to process
     */
    fetchNextRequest() {
        if (this.queue.length === 0)
            return null;
        const task = this.queue.shift(); // Get highest priority task
        if (task) {
            this.inProgress.add(task.uniqueKey);
            return task;
        }
        return null;
    }
    /**
     * Mark a task as successfully handled
     */
    async markRequestHandled(task) {
        this.inProgress.delete(task.uniqueKey);
        this.handled.add(task.uniqueKey);
        // Immediate persist for handled set is safer
        this.persistState();
    }
    /**
     * Reclaim a failed task (retry)
     */
    async reclaimRequest(task, error) {
        this.inProgress.delete(task.uniqueKey);
        if (task.retryCount < 3) {
            task.retryCount++;
            // Penalty: lower priority slightly or keep same? 
            // Let's push it back to queue
            this.queue.push(task);
            this.queue.sort((a, b) => b.priority - a.priority);
            console.log(`[RequestQueue] Reclaimed task (Retry ${task.retryCount}): ${task.url}`);
        }
        else {
            console.error(`[RequestQueue] Task failed permanently after 3 retries: ${task.url}`);
            // Optionally move to a "dead letter queue"
        }
    }
    /**
     * Persist queue state to disk
     */
    persistState() {
        try {
            fs.writeFileSync(this.queueFilePath, JSON.stringify(this.queue, null, 2));
            // Convert Set to Array for JSON serialization
            fs.writeFileSync(this.handledFilePath, JSON.stringify(Array.from(this.handled), null, 2));
        }
        catch (e) {
            console.error('[RequestQueue] Failed to persist state:', e);
        }
    }
    /**
     * Load queue state from disk
     */
    loadState() {
        try {
            if (fs.existsSync(this.queueFilePath)) {
                const data = fs.readFileSync(this.queueFilePath, 'utf-8');
                this.queue = JSON.parse(data);
            }
            if (fs.existsSync(this.handledFilePath)) {
                const data = fs.readFileSync(this.handledFilePath, 'utf-8');
                const handledArray = JSON.parse(data);
                this.handled = new Set(handledArray);
            }
            console.log(`[RequestQueue] Loaded state: ${this.queue.length} pending, ${this.handled.size} handled.`);
        }
        catch (e) {
            console.error('[RequestQueue] Failed to load state:', e);
        }
    }
    /**
     * Check if queue is empty and no tasks in progress
     */
    isFinished() {
        return this.queue.length === 0 && this.inProgress.size === 0;
    }
    /**
     * Stop the auto-persist interval
     */
    close() {
        if (this.persistInterval) {
            clearInterval(this.persistInterval);
            this.persistState(); // Final save
        }
    }
}
exports.RequestQueue = RequestQueue;
