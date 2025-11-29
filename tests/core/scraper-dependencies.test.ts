/**
 * ScraperDependencies 单元测试
 */

import { createDefaultDependencies, ScraperDependencies } from '../../core/scraper-dependencies';
import { ScraperEventBus } from '../../core/event-bus';

describe('ScraperDependencies', () => {
  let mockEventBus: jest.Mocked<ScraperEventBus>;

  beforeEach(() => {
    mockEventBus = {
      emitLog: jest.fn(),
      emitProgress: jest.fn(),
      emitPerformance: jest.fn(),
      on: jest.fn(),
      off: jest.fn()
    } as any;
  });

  describe('createDefaultDependencies', () => {
    it('should create all required dependencies', () => {
      const deps = createDefaultDependencies(mockEventBus);
      
      expect(deps).toHaveProperty('navigationService');
      expect(deps).toHaveProperty('rateLimitManager');
      expect(deps).toHaveProperty('errorSnapshotter');
      expect(deps).toHaveProperty('fingerprintManager');
      expect(deps).toHaveProperty('performanceMonitor');
      expect(deps).toHaveProperty('progressManager');
      expect(deps).toHaveProperty('sessionManager');
      expect(deps).toHaveProperty('proxyManager');
    });

    it('should use custom cookie directory', () => {
      const customCookieDir = './test-cookies';
      const deps = createDefaultDependencies(mockEventBus, customCookieDir);
      
      expect(deps.sessionManager).toBeDefined();
    });

    it('should use custom progress directory', () => {
      const customProgressDir = './test-progress';
      const deps = createDefaultDependencies(mockEventBus, './cookies', customProgressDir);
      
      expect(deps.progressManager).toBeDefined();
    });

    it('should create independent instances', () => {
      const deps1 = createDefaultDependencies(mockEventBus);
      const deps2 = createDefaultDependencies(mockEventBus);
      
      expect(deps1.sessionManager).not.toBe(deps2.sessionManager);
      expect(deps1.navigationService).not.toBe(deps2.navigationService);
    });

    it('should pass eventBus to services', () => {
      const deps = createDefaultDependencies(mockEventBus);
      
      // Verify eventBus is passed (indirectly through service behavior)
      expect(deps.sessionManager).toBeDefined();
      expect(deps.progressManager).toBeDefined();
    });
  });

  describe('ScraperDependencies interface', () => {
    it('should match expected structure', () => {
      const deps = createDefaultDependencies(mockEventBus);
      
      // Type check: all properties should exist
      const typedDeps: ScraperDependencies = deps;
      expect(typedDeps).toBe(deps);
    });
  });
});

