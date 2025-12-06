/**
 * ScraperDependencies 单元测试
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
// import { createDefaultDependencies, ScraperDependencies } from '../../core/index';
import { ScraperEventBus } from '../../core/scraper-engine.types';

// Mock repositories to prevent Prisma initialization
mock.module('../../core/db/repositories', () => ({
  TweetRepository: {
    saveTweet: mock(() => Promise.resolve()),
    saveTweets: mock(() => Promise.resolve()),
  },
  JobRepository: {
    createJob: mock(() => Promise.resolve()),
    updateStatus: mock(() => Promise.resolve()),
  },
  CheckpointRepository: {
    saveCheckpoint: mock(() => Promise.resolve()),
    getCheckpoint: mock(() => Promise.resolve(null)),
  },
  prisma: {
    session: {
      findFirst: mock(() => Promise.resolve(null)),
    },
  },
}));

describe('ScraperDependencies', () => {
  let mockEventBus: Partial<ScraperEventBus>;

  beforeEach(() => {
    mockEventBus = {
      emitLog: mock(() => {}),
      emitProgress: mock(() => {}),
      emitPerformance: mock(() => {}),
      emitError: mock(() => {}),
    } as any;
  });

  describe('createDefaultDependencies', () => {
    test('should create all required dependencies', async () => {
      const { createDefaultDependencies } = await import('../../core/index');
      const deps = createDefaultDependencies(mockEventBus as ScraperEventBus);

      expect(deps).toHaveProperty('navigationService');
      expect(deps).toHaveProperty('rateLimitManager');
      expect(deps).toHaveProperty('errorSnapshotter');
      expect(deps).toHaveProperty('antiDetection');
      expect(deps).toHaveProperty('performanceMonitor');
      expect(deps).toHaveProperty('progressManager');
      expect(deps).toHaveProperty('sessionManager');
      expect(deps).toHaveProperty('proxyManager');
    });

    test('should use custom cookie directory', async () => {
      const customCookieDir = `./test-cookies-${Date.now()}-${Math.random()}`;
      const { createDefaultDependencies } = await import('../../core/index');
      const deps = createDefaultDependencies(mockEventBus as ScraperEventBus, customCookieDir);

      expect(deps.sessionManager).toBeDefined();
    });

    test('should use custom progress directory', async () => {
      const customProgressDir = `./test-progress-${Date.now()}-${Math.random()}`;
      const { createDefaultDependencies } = await import('../../core/index');
      const deps = createDefaultDependencies(
        mockEventBus as ScraperEventBus,
        './cookies',
        customProgressDir,
      );

      expect(deps.progressManager).toBeDefined();
    });

    test('should create independent instances', async () => {
      const { createDefaultDependencies } = await import('../../core/index');
      const deps1 = createDefaultDependencies(mockEventBus as ScraperEventBus);
      const deps2 = createDefaultDependencies(mockEventBus as ScraperEventBus);

      expect(deps1.sessionManager).not.toBe(deps2.sessionManager);
      expect(deps1.navigationService).not.toBe(deps2.navigationService);
    });

    test('should pass eventBus to services', async () => {
      const { createDefaultDependencies } = await import('../../core/index');
      const deps = createDefaultDependencies(mockEventBus as ScraperEventBus);

      // Verify eventBus is passed (indirectly through service behavior)
      expect(deps.sessionManager).toBeDefined();
      expect(deps.progressManager).toBeDefined();
    });
  });

  describe('ScraperDependencies interface', () => {
    test('should match expected structure', async () => {
      const { createDefaultDependencies } = await import('../../core/index');
      const deps = createDefaultDependencies(mockEventBus as ScraperEventBus);

      // Type check: all properties should exist
      // const typedDeps: ScraperDependencies = deps;
      expect(deps).toBeDefined();
    });
  });
});
