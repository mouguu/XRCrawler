import * as fs from 'node:fs';
import * as path from 'node:path';
import { FingerprintGenerator } from 'fingerprint-generator';
import { FingerprintInjector } from 'fingerprint-injector';
import { Page } from 'puppeteer';

/**
 * FingerprintManager
 *
 * Responsible for generating, persisting, and injecting browser fingerprints.
 * This ensures that each session (account) maintains a consistent browser identity
 * (User-Agent, Screen Resolution, Hardware Concurrency, etc.) to avoid detection.
 */
export class FingerprintManager {
  private generator: FingerprintGenerator;
  private injector: FingerprintInjector;
  private storageDir: string;
  private fingerprints: Map<string, { pool: any[]; index: number }>; // Fingerprint pool per session
  private poolSize: number = 3;

  constructor(baseDir: string = 'output/fingerprints') {
    this.storageDir = path.isAbsolute(baseDir) ? baseDir : path.join(process.cwd(), baseDir);
    this.fingerprints = new Map();

    // Initialize generator with common desktop configurations
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
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private loadFingerprints() {
    try {
      const files = fs.readdirSync(this.storageDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const sessionId = file.replace('.json', '');
          const content = fs.readFileSync(path.join(this.storageDir, file), 'utf-8');
          const fp = JSON.parse(content);
          this.fingerprints.set(sessionId, { pool: [fp], index: 0 });
        }
      }
    } catch (error) {
      console.error('Failed to load fingerprints:', error);
    }
  }

  /**
   * Gets a fingerprint for a specific session ID.
   * If rotate=true, will pick the next one in the pool (and grow the pool up to poolSize).
   * If none exists, it generates a new one, saves the first to disk, and caches the pool in memory.
   */
  public getFingerprint(sessionId: string, rotate: boolean = false): any {
    if (!this.fingerprints.has(sessionId)) {
      // Generate first fingerprint and persist
      const fp = this.generator.getFingerprint();
      this.fingerprints.set(sessionId, { pool: [fp], index: 0 });
      try {
        fs.writeFileSync(
          path.join(this.storageDir, `${sessionId}.json`),
          JSON.stringify(fp, null, 2),
        );
      } catch (error) {
        console.error(`Failed to save fingerprint for session ${sessionId}:`, error);
      }
    }

    const entry = this.fingerprints.get(sessionId)!;

    if (rotate) {
      // Expand pool up to poolSize
      if (entry.pool.length < this.poolSize) {
        entry.pool.push(this.generator.getFingerprint());
      }
      entry.index = (entry.index + 1) % entry.pool.length;
    }

    return entry.pool[entry.index];
  }

  /**
   * Injects the fingerprint into a Puppeteer page.
   * This must be called BEFORE the page navigates to the target URL.
   */
  public async injectFingerprint(
    page: Page,
    sessionId: string,
    rotate: boolean = false,
  ): Promise<void> {
    const fingerprint = this.getFingerprint(sessionId, rotate);
    await this.injector.attachFingerprintToPuppeteer(page, fingerprint);
  }
}
