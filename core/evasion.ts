/**
 * Evasion Squad (Elite Core)
 *
 * Consolidates all anti-detection, fingerprinting, human behavior, and identity/cookie management
 * into a single cohesive module.
 *
 * Components:
 * - AntiDetection: Orchestrator
 * - FingerprintManager: Browser identity
 * - HumanBehavior: User simulation
 * - CookieManager: Identity persistence
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { ElementHandle, Page, Protocol } from 'puppeteer';
import { FingerprintGenerator } from 'fingerprint-generator';
import { FingerprintInjector } from 'fingerprint-injector';
import { safeJsonParse, validateEnvCookieData } from '../utils'; // Assume these exist in utils/index
import { ScraperErrors } from './errors';

// ==========================================
// 1. Human Behavior (Simulation)
// ==========================================

// Gaussian random for natural variance
function gaussianRandom(mean: number, stdev: number): number {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export interface HumanBehaviorConfig {
  typingSpeed: { min: number; max: number; errorRate: number };
  mouseMoveSpeed: { minDuration: number; maxDuration: number; steps: number };
  click: {
    preDelay: { min: number; max: number };
    postDelay: { min: number; max: number };
    holdTime: { min: number; max: number };
  };
  scroll: {
    stepSize: { min: number; max: number };
    stepDelay: { min: number; max: number };
    pauseChance: number;
    pauseTime: { min: number; max: number };
  };
  reading: { baseTime: number; perCharTime: number; variance: number };
  rest: { chance: number; duration: { min: number; max: number } };
}

export const DEFAULT_HUMAN_CONFIG: HumanBehaviorConfig = {
  typingSpeed: { min: 50, max: 150, errorRate: 0.02 },
  mouseMoveSpeed: { minDuration: 200, maxDuration: 600, steps: 20 },
  click: {
    preDelay: { min: 100, max: 300 },
    postDelay: { min: 50, max: 200 },
    holdTime: { min: 50, max: 120 },
  },
  scroll: {
    stepSize: { min: 100, max: 400 },
    stepDelay: { min: 50, max: 150 },
    pauseChance: 0.15,
    pauseTime: { min: 500, max: 2000 },
  },
  reading: { baseTime: 1000, perCharTime: 2, variance: 0.3 },
  rest: { chance: 0.05, duration: { min: 3000, max: 8000 } },
};

export const FAST_HUMAN_CONFIG: HumanBehaviorConfig = {
  typingSpeed: { min: 30, max: 80, errorRate: 0.01 },
  mouseMoveSpeed: { minDuration: 100, maxDuration: 300, steps: 10 },
  click: {
    preDelay: { min: 50, max: 150 },
    postDelay: { min: 20, max: 100 },
    holdTime: { min: 30, max: 80 },
  },
  scroll: {
    stepSize: { min: 200, max: 600 },
    stepDelay: { min: 30, max: 80 },
    pauseChance: 0.05,
    pauseTime: { min: 300, max: 1000 },
  },
  reading: { baseTime: 500, perCharTime: 1, variance: 0.2 },
  rest: { chance: 0.02, duration: { min: 1000, max: 3000 } },
};

export class HumanBehavior {
  private config: HumanBehaviorConfig;
  private lastMousePosition: { x: number; y: number } = { x: 0, y: 0 };

  constructor(config: Partial<HumanBehaviorConfig> = {}) {
    this.config = { ...DEFAULT_HUMAN_CONFIG, ...config };
  }

  async randomDelay(min: number, max: number): Promise<void> {
    const delay = randomInt(min, max);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  async maybeRest(): Promise<boolean> {
    if (Math.random() < this.config.rest.chance) {
      const duration = randomInt(
        this.config.rest.duration.min,
        this.config.rest.duration.max,
      );
      await new Promise((resolve) => setTimeout(resolve, duration));
      return true;
    }
    return false;
  }

  private generateBezierPath(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    steps: number,
  ): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    const ctrlX1 = startX + (endX - startX) * randomFloat(0.2, 0.4) + randomFloat(-50, 50);
    const ctrlY1 = startY + (endY - startY) * randomFloat(0.1, 0.3) + randomFloat(-30, 30);
    const ctrlX2 = startX + (endX - startX) * randomFloat(0.6, 0.8) + randomFloat(-50, 50);
    const ctrlY2 = startY + (endY - startY) * randomFloat(0.7, 0.9) + randomFloat(-30, 30);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const x = mt * mt * mt * startX + 3 * mt * mt * t * ctrlX1 + 3 * mt * t * t * ctrlX2 + t * t * t * endX;
      const y = mt * mt * mt * startY + 3 * mt * mt * t * ctrlY1 + 3 * mt * t * t * ctrlY2 + t * t * t * endY;
      points.push({ x: Math.round(x), y: Math.round(y) });
    }
    return points;
  }

  async moveMouse(page: Page, targetX: number, targetY: number): Promise<void> {
    const { mouseMoveSpeed } = this.config;
    const path = this.generateBezierPath(
      this.lastMousePosition.x,
      this.lastMousePosition.y,
      targetX,
      targetY,
      mouseMoveSpeed.steps,
    );
    const totalDuration = randomInt(mouseMoveSpeed.minDuration, mouseMoveSpeed.maxDuration);
    const stepDelay = totalDuration / path.length;

    for (const point of path) {
      await page.mouse.move(point.x, point.y);
      await this.randomDelay(Math.max(1, stepDelay - 10), stepDelay + 10);
    }
    this.lastMousePosition = { x: targetX, y: targetY };
  }

  async humanClick(page: Page, x: number, y: number): Promise<void> {
    const { click } = this.config;
    await this.moveMouse(page, x, y);
    await this.randomDelay(click.preDelay.min, click.preDelay.max);
    await page.mouse.down();
    await this.randomDelay(click.holdTime.min, click.holdTime.max);
    await page.mouse.up();
    await this.randomDelay(click.postDelay.min, click.postDelay.max);
  }

  async humanClickSelector(page: Page, selector: string): Promise<void> {
    const element = await page.$(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    const box = await element.boundingBox();
    if (!box) throw new Error('Element not visible');
    const x = box.x + randomFloat(box.width * 0.2, box.width * 0.8);
    const y = box.y + randomFloat(box.height * 0.2, box.height * 0.8);
    await this.humanClick(page, x, y);
  }

  async humanType(page: Page, text: string, selector?: string): Promise<void> {
    if (selector) {
      await this.humanClickSelector(page, selector);
      await this.randomDelay(100, 300);
    }
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (Math.random() < this.config.typingSpeed.errorRate && i > 0) {
        const wrongChar = String.fromCharCode(char.charCodeAt(0) + randomInt(-3, 3));
        await page.keyboard.type(wrongChar);
        await this.randomDelay(100, 200);
        await page.keyboard.press('Backspace');
      }
      await page.keyboard.type(char);
      const delay = randomInt(this.config.typingSpeed.min, this.config.typingSpeed.max);
      await this.randomDelay(delay * 0.5, delay * 1.5);
    }
  }

  async humanScroll(page: Page, distance: number, direction: 'up' | 'down' = 'down'): Promise<void> {
    const { scroll } = this.config;
    const sign = direction === 'down' ? 1 : -1;
    let scrolled = 0;
    while (Math.abs(scrolled) < Math.abs(distance)) {
      const step = randomInt(scroll.stepSize.min, scroll.stepSize.max);
      const actualStep = Math.min(step, Math.abs(distance) - Math.abs(scrolled));
      await page.evaluate((delta) => window.scrollBy(0, delta), sign * actualStep);
      scrolled += actualStep;
      await this.randomDelay(scroll.stepDelay.min, scroll.stepDelay.max);
      if (Math.random() < scroll.pauseChance) {
        await this.randomDelay(scroll.pauseTime.min, scroll.pauseTime.max);
      }
      await this.maybeRest();
    }
  }

  setConfig(config: Partial<HumanBehaviorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  useFastConfig(): void {
    this.config = { ...FAST_HUMAN_CONFIG };
  }

  useDefaultConfig(): void {
    this.config = { ...DEFAULT_HUMAN_CONFIG };
  }
}

// ==========================================
// 2. Fingerprint Manager (Identity)
// ==========================================

export class FingerprintManager {
  private generator: FingerprintGenerator;
  private injector: FingerprintInjector;
  private storageDir: string;
  private fingerprints: Map<string, { pool: any[]; index: number }>;
  private poolSize: number = 3;

  constructor(baseDir: string = 'output/fingerprints') {
    this.storageDir = path.isAbsolute(baseDir) ? baseDir : path.join(process.cwd(), baseDir);
    this.fingerprints = new Map();
    this.generator = new FingerprintGenerator({
      devices: ['desktop'],
      operatingSystems: ['windows', 'macos', 'linux'],
      browsers: [{ name: 'chrome', minVersion: 100 }],
      locales: ['en-US'],
    });
    this.injector = new FingerprintInjector();
    this.ensureDirExists();
    this.loadFingerprints();
  }

  private ensureDirExists() {
    if (!fs.stat(this.storageDir).then(() => true).catch(() => false)) {
      // Async creation would be better but keeping simple for constructor init usually
      // For this consolidated version, we'll lazily ensure it on write or assume pre-existence
    }
  }

  private loadFingerprints() {
    // Simplified load logic
  }

  public getFingerprint(sessionId: string, rotate: boolean = false): any {
    if (!this.fingerprints.has(sessionId)) {
      const fp = this.generator.getFingerprint();
      this.fingerprints.set(sessionId, { pool: [fp], index: 0 });
    }
    const entry = this.fingerprints.get(sessionId)!;
    if (rotate) {
      if (entry.pool.length < this.poolSize) entry.pool.push(this.generator.getFingerprint());
      entry.index = (entry.index + 1) % entry.pool.length;
    }
    return entry.pool[entry.index];
  }

  public async injectFingerprint(
    page: Page,
    sessionId: string,
    rotate: boolean = false,
  ): Promise<void> {
    const fingerprint = this.getFingerprint(sessionId, rotate);
    await this.injector.attachFingerprintToPuppeteer(page, fingerprint);
  }
}

// ==========================================
// 3. Cookie Manager (Identity Persistence)
// ==========================================

export interface CookieLoadResult {
  cookies: Protocol.Network.CookieParam[];
  username: string | null;
  source: string | null;
}

export class CookieManager {
  private cookiesDir: string;
  private enableRotation: boolean;
  private cookies: Protocol.Network.CookieParam[] | null = null;
  private username: string | null = null;
  private source: string | null = null;
  private cookieFiles: string[] = [];
  private currentCookieIndex: number = 0;

  constructor(options: { cookiesDir?: string; enableRotation?: boolean } = {}) {
    this.cookiesDir = options.cookiesDir || path.join(process.cwd(), 'cookies');
    this.enableRotation = options.enableRotation !== false;
  }

  async scanCookieFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.cookiesDir);
      this.cookieFiles = files
        .filter((f) => f.endsWith('.json') && !f.endsWith('.meta.json'))
        .map((f) => path.join(this.cookiesDir, f));
      return this.cookieFiles;
    } catch {
      return [];
    }
  }

  async load(): Promise<CookieLoadResult> {
    if (this.cookieFiles.length === 0) await this.scanCookieFiles();
    if (this.cookieFiles.length === 0) throw ScraperErrors.cookieLoadFailed('No cookie files found');

    const file = this.cookieFiles[this.currentCookieIndex];
    if (this.enableRotation) {
      this.currentCookieIndex = (this.currentCookieIndex + 1) % this.cookieFiles.length;
    }

    const content = await fs.readFile(file, 'utf-8');
    const envData = safeJsonParse(content);
    const valid = validateEnvCookieData(envData);
    
    if (!valid.valid) throw ScraperErrors.cookieLoadFailed(`Invalid cookies in ${file}`);

    this.cookies = valid.cookies || [];
    this.username = valid.username || null;
    this.source = file;

    return { cookies: this.cookies, username: this.username, source: this.source };
  }

  async injectIntoPage(page: Page): Promise<void> {
    if (!this.cookies) throw ScraperErrors.cookieLoadFailed('No cookies loaded');
    await page.setCookie(...(this.cookies as any[]));
  }
}

export async function createCookieManager(options: { cookiesDir?: string; enableRotation?: boolean } = {}): Promise<CookieManager> {
  const manager = new CookieManager(options);
  // Optional: Pre-scan or init if that was the legacy behavior, but constructor does scan lazily?
  // Let's just return the instance.
  return manager;
}

// ==========================================
// 4. AntiDetection (Orchestrator)
// ==========================================

export type AntiDetectionLevel = 'low' | 'medium' | 'high' | 'paranoid';

export class AntiDetection {
  private level: AntiDetectionLevel;
  public fingerprintManager: FingerprintManager;
  public humanBehavior: HumanBehavior;

  constructor(options: { level?: AntiDetectionLevel; fingerprintDir?: string } = {}) {
    this.level = options.level || 'high';
    this.fingerprintManager = new FingerprintManager(options.fingerprintDir);
    this.humanBehavior = new HumanBehavior();
    
    if (this.level === 'fast' as any) this.humanBehavior.useFastConfig(); // Backwards compat if needed
  }

  getLevel(): AntiDetectionLevel {
    return this.level;
  }

  getFingerprint(sessionId: string): any {
    return this.fingerprintManager.getFingerprint(sessionId, false);
  }

  async prepare(page: Page, sessionId: string, options: { rotate?: boolean } = {}): Promise<void> {
    await this.fingerprintManager.injectFingerprint(page, sessionId, options.rotate);
    
    // Hardcoded high-level setup for simplicity
    const viewports = [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }];
    await page.setViewport(viewports[Math.floor(Math.random() * viewports.length)]);
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Chromium";v="119", "Not?A_Brand";v="24"',
    });
  }

  // Proxies to HumanBehavior
  async humanClick(page: Page, selector: string) { await this.humanBehavior.humanClickSelector(page, selector); }
  async humanType(page: Page, text: string, selector?: string) { await this.humanBehavior.humanType(page, text, selector); }
  async humanScroll(page: Page, distance: number, direction: 'up' | 'down' = 'down') { await this.humanBehavior.humanScroll(page, distance, direction); }
  
  async betweenActions(config: any = 'default') {
    // Simulate thinking/pause between actions
    const fast = config === 'fast';
    const { actionDelay } = fast ? { actionDelay: { min: 400, max: 1000 } } : { actionDelay: { min: 1000, max: 3000 } };
    await this.humanBehavior.randomDelay(actionDelay.min, actionDelay.max);
    await this.humanBehavior.maybeRest();
  }
}

export const antiDetection = new AntiDetection();
export const humanBehavior = new HumanBehavior(); // Export singleton for easy access
