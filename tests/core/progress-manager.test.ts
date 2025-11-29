/**
 * ProgressManager 单元测试
 */

import { ProgressManager } from '../../core/progress-manager';
import { ScraperEventBus } from '../../core/event-bus';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ProgressManager', () => {
  let testProgressDir: string;
  let manager: ProgressManager;
  let mockEventBus: jest.Mocked<ScraperEventBus>;

  beforeEach(() => {
    testProgressDir = path.join(os.tmpdir(), 'test-progress-' + Date.now());
    
    mockEventBus = {
      emitLog: jest.fn(),
      emitProgress: jest.fn(),
      emitPerformance: jest.fn(),
      on: jest.fn(),
      off: jest.fn()
    } as any;

    manager = new ProgressManager(testProgressDir, mockEventBus);
  });

  afterEach(() => {
    try {
      fs.rmSync(testProgressDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('saveProgress', () => {
    it('should save progress to file', () => {
      const progress = {
        targetType: 'profile',
        targetValue: 'testuser',
        totalRequested: 100,
        totalScraped: 50,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        accountsUsed: [],
        completed: false
      };
      
      manager.saveProgress(progress);
      
      const filePath = path.join(testProgressDir, 'profile_testuser_progress.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should update existing progress', () => {
      const progress1 = {
        targetType: 'profile',
        targetValue: 'testuser',
        totalRequested: 100,
        totalScraped: 50,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        accountsUsed: [],
        completed: false
      };
      
      manager.saveProgress(progress1);
      
      const progress2 = {
        ...progress1,
        totalScraped: 75
      };
      
      manager.saveProgress(progress2);
      
      const loaded = manager.loadProgress('profile', 'testuser');
      expect(loaded?.totalScraped).toBe(75);
    });
  });

  describe('loadProgress', () => {
    it('should load progress from file', () => {
      const progress = {
        targetType: 'profile',
        targetValue: 'testuser',
        totalRequested: 100,
        totalScraped: 50,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        accountsUsed: [],
        completed: false
      };
      
      manager.saveProgress(progress);
      
      const loaded = manager.loadProgress('profile', 'testuser');
      expect(loaded).toBeDefined();
      expect(loaded?.totalScraped).toBe(50);
    });

    it('should return null for non-existent progress', () => {
      const loaded = manager.loadProgress('profile', 'nonexistent');
      expect(loaded).toBeNull();
    });
  });

  describe('startScraping', () => {
    it('should start new scraping session', () => {
      const progress = manager.startScraping('profile', 'testuser', 100);
      
      expect(progress.totalRequested).toBe(100);
      expect(progress.totalScraped).toBe(0);
      expect(progress.completed).toBe(false);
    });

    it('should resume existing session', () => {
      const progress1 = {
        targetType: 'profile',
        targetValue: 'testuser',
        totalRequested: 100,
        totalScraped: 50,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        accountsUsed: [],
        completed: false
      };
      
      manager.saveProgress(progress1);
      
      const progress2 = manager.startScraping('profile', 'testuser', 100, true);
      expect(progress2.totalScraped).toBe(50);
    });
  });

  describe('updateProgress', () => {
    it('should update current progress', () => {
      manager.startScraping('profile', 'testuser', 100);
      
      manager.updateProgress(25, 'tweet123', undefined, 'account1');
      
      const loaded = manager.loadProgress('profile', 'testuser');
      expect(loaded?.totalScraped).toBe(25);
      expect(loaded?.lastTweetId).toBe('tweet123');
    });
  });
});

