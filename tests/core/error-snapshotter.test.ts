/**
 * ErrorSnapshotter 单元测试
 */

import { ErrorSnapshotter } from '../../core/error-snapshotter';
import { Page } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Mock puppeteer
jest.mock('puppeteer');

describe('ErrorSnapshotter', () => {
  let snapshotter: ErrorSnapshotter;
  let testSnapshotDir: string;
  let mockPage: jest.Mocked<Page>;

  beforeEach(() => {
    testSnapshotDir = path.join(os.tmpdir(), 'test-snapshots-' + Date.now());
    snapshotter = new ErrorSnapshotter(testSnapshotDir);
    
    mockPage = {
      screenshot: jest.fn().mockResolvedValue(Buffer.from('screenshot')),
      content: jest.fn().mockResolvedValue('<html></html>')
    } as unknown as jest.Mocked<Page>;
  });

  afterEach(() => {
    try {
      fs.rmSync(testSnapshotDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('capture', () => {
    it('should capture screenshot and HTML', async () => {
      const error = new Error('Test error');
      const files = await snapshotter.capture(mockPage, error, 'test-context');
      
      expect(files.length).toBeGreaterThan(0);
      expect(mockPage.screenshot).toHaveBeenCalled();
      expect(mockPage.content).toHaveBeenCalled();
    });

    it('should create error log file', async () => {
      const error = new Error('Test error');
      const files = await snapshotter.capture(mockPage, error, 'test-context');
      
      const logFile = files.find(f => f.endsWith('.log'));
      expect(logFile).toBeDefined();
      
      if (logFile) {
        const content = fs.readFileSync(logFile, 'utf-8');
        expect(content).toContain('Test error');
        expect(content).toContain('test-context');
      }
    });

    it('should handle screenshot failure gracefully', async () => {
      mockPage.screenshot = jest.fn().mockRejectedValue(new Error('Screenshot failed'));
      
      const error = new Error('Test error');
      const files = await snapshotter.capture(mockPage, error, 'test-context');
      
      // Should still capture HTML and log
      expect(files.length).toBeGreaterThan(0);
    });

    it('should sanitize context label in filename', async () => {
      const error = new Error('Test error');
      const files = await snapshotter.capture(mockPage, error, 'test@context#123');
      
      // Filename should not contain special characters
      const hasInvalidChars = files.some(f => /[@#]/.test(path.basename(f)));
      expect(hasInvalidChars).toBe(false);
    });
  });
});

