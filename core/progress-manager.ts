import * as fs from 'fs';
import * as path from 'path';
import { ScraperEventBus } from './event-bus';

export interface ScrapingProgress {
    targetType: string;
    targetValue: string;
    totalRequested: number;
    totalScraped: number;
    lastTweetId?: string;
    lastCursor?: string;
    startTime: number;
    lastUpdate: number;
    accountsUsed: string[];
    completed: boolean;
    dateRange?: {
        since: string;
        until: string;
    };
    currentChunkIndex?: number; // For date chunking
    totalChunks?: number;       // For date chunking
}

export class ProgressManager {
    private progressDir: string;
    private currentProgress: ScrapingProgress | null = null;
    private eventBus?: ScraperEventBus;

    constructor(progressDir: string = './data/progress', eventBus?: ScraperEventBus) {
        this.progressDir = progressDir;
        this.eventBus = eventBus;
        this.ensureProgressDir();
    }

    private ensureProgressDir(): void {
        if (!fs.existsSync(this.progressDir)) {
            fs.mkdirSync(this.progressDir, { recursive: true });
        }
    }

    private getProgressFilePath(targetType: string, targetValue: string): string {
        const cleanTarget = targetValue.replace(/[@ \/]/g, '_');
        return path.join(this.progressDir, `${targetType}_${cleanTarget}_progress.json`);
    }

    public loadProgress(targetType: string, targetValue: string): ScrapingProgress | null {
        const filePath = this.getProgressFilePath(targetType, targetValue);
        if (!fs.existsSync(filePath)) {
            return null;
        }

        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            const progress = JSON.parse(data) as ScrapingProgress;
            this.log(`Loaded progress: ${progress.totalScraped}/${progress.totalRequested} tweets`);
            return progress;
        } catch (error: any) {
            this.log(`Failed to load progress: ${error.message}`, 'error');
            return null;
        }
    }

    public saveProgress(progress: ScrapingProgress): boolean {
        try {
            const filePath = this.getProgressFilePath(progress.targetType, progress.targetValue);
            progress.lastUpdate = Date.now();
            fs.writeFileSync(filePath, JSON.stringify(progress, null, 2), 'utf-8');
            // Only log debug to avoid spamming
            // this.log(`Progress saved: ${progress.totalScraped}/${progress.totalRequested}`, 'debug');
            return true;
        } catch (error: any) {
            this.log(`Failed to save progress: ${error.message}`, 'error');
            return false;
        }
    }

    public startScraping(
        targetType: string,
        targetValue: string,
        totalRequested: number,
        resume: boolean = false,
        dateRange?: { since: string; until: string }
    ): ScrapingProgress {
        if (resume) {
            const existingProgress = this.loadProgress(targetType, targetValue);
            if (existingProgress && !existingProgress.completed) {
                // Update total requested if it changed
                if (existingProgress.totalRequested !== totalRequested) {
                    existingProgress.totalRequested = totalRequested;
                }
                this.currentProgress = existingProgress;
                this.log(`Resuming scraping from ${existingProgress.totalScraped} tweets`);
                return existingProgress;
            }
        }

        this.currentProgress = {
            targetType,
            targetValue,
            totalRequested,
            totalScraped: 0,
            startTime: Date.now(),
            lastUpdate: Date.now(),
            accountsUsed: [],
            completed: false,
            dateRange
        };

        this.saveProgress(this.currentProgress);
        this.log(`Started new scraping session: 0/${totalRequested} tweets`);
        return this.currentProgress;
    }

    public updateProgress(
        tweetsScraped: number,
        lastTweetId?: string,
        lastCursor?: string,
        accountUsed?: string,
        chunkInfo?: { current: number; total: number }
    ): boolean {
        if (!this.currentProgress) {
            return false;
        }

        this.currentProgress.totalScraped = tweetsScraped; // This should be total accumulated, not delta
        
        if (lastTweetId) {
            this.currentProgress.lastTweetId = lastTweetId;
        }

        if (lastCursor) {
            this.currentProgress.lastCursor = lastCursor;
        }

        if (accountUsed && !this.currentProgress.accountsUsed.includes(accountUsed)) {
            this.currentProgress.accountsUsed.push(accountUsed);
        }

        if (chunkInfo) {
            this.currentProgress.currentChunkIndex = chunkInfo.current;
            this.currentProgress.totalChunks = chunkInfo.total;
        }

        if (this.currentProgress.totalScraped >= this.currentProgress.totalRequested) {
            this.currentProgress.completed = true;
            this.log(`Scraping completed: ${this.currentProgress.totalScraped} tweets`);
        }

        return this.saveProgress(this.currentProgress);
    }

    public completeScraping(): boolean {
        if (!this.currentProgress) {
            return false;
        }
        this.currentProgress.completed = true;
        return this.saveProgress(this.currentProgress);
    }

    public getCurrentProgress(): ScrapingProgress | null {
        return this.currentProgress;
    }

    private log(message: string, level: 'info' | 'warn' | 'error' | 'debug' = 'info'): void {
        if (this.eventBus) {
            this.eventBus.emitLog(message, level);
        } else {
            console.log(`[ProgressManager] ${message}`);
        }
    }
}
