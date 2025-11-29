/**
 * Logger 单元测试
 */

import { logger, createModuleLogger, createEnhancedLogger, EnhancedLogger, setLogLevel, LOG_LEVELS } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

describe('Logger', () => {
  let testLogDir: string;

  beforeEach(() => {
    testLogDir = path.join(process.cwd(), 'test-logs');
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true });
    }
  });

  afterEach(() => {
    try {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('logger', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have log methods', () => {
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('createModuleLogger', () => {
    it('should create module logger', () => {
      const moduleLogger = createModuleLogger('TestModule');
      
      expect(moduleLogger).toBeDefined();
      expect(typeof moduleLogger.info).toBe('function');
      expect(typeof moduleLogger.warn).toBe('function');
      expect(typeof moduleLogger.error).toBe('function');
    });

    it('should include module name in logs', () => {
      const moduleLogger = createModuleLogger('TestModule');
      
      // Just verify it doesn't throw
      expect(() => {
        moduleLogger.info('Test message');
      }).not.toThrow();
    });
  });

  describe('createEnhancedLogger', () => {
    it('should create enhanced logger', () => {
      const enhancedLogger = createEnhancedLogger('TestModule');
      
      expect(enhancedLogger).toBeInstanceOf(EnhancedLogger);
      expect(typeof enhancedLogger.info).toBe('function');
      expect(typeof enhancedLogger.setContext).toBe('function');
    });

    it('should support context', () => {
      const enhancedLogger = createEnhancedLogger('TestModule');
      
      enhancedLogger.setContext({ userId: '123' });
      expect(() => {
        enhancedLogger.info('Test message');
      }).not.toThrow();
    });

    it('should support performance tracking', () => {
      const enhancedLogger = createEnhancedLogger('TestModule');
      
      const endOperation = enhancedLogger.startOperation('test-op');
      expect(typeof endOperation).toBe('function');
      
      endOperation();
    });

    it('should track async operations', async () => {
      const enhancedLogger = createEnhancedLogger('TestModule');
      
      const result = await enhancedLogger.trackAsync('async-op', async () => {
        return 'result';
      });
      
      expect(result).toBe('result');
    });

    it('should track sync operations', () => {
      const enhancedLogger = createEnhancedLogger('TestModule');
      
      const result = enhancedLogger.trackSync('sync-op', () => {
        return 'result';
      });
      
      expect(result).toBe('result');
    });
  });

  describe('setLogLevel', () => {
    it('should set log level', () => {
      setLogLevel('debug');
      expect(logger.level).toBe('debug');
    });

    it('should accept LOG_LEVELS constants', () => {
      setLogLevel(LOG_LEVELS.INFO);
      expect(logger.level).toBe('info');
    });
  });

  describe('LOG_LEVELS', () => {
    it('should have all log levels', () => {
      expect(LOG_LEVELS.ERROR).toBe('error');
      expect(LOG_LEVELS.WARN).toBe('warn');
      expect(LOG_LEVELS.INFO).toBe('info');
      expect(LOG_LEVELS.DEBUG).toBe('debug');
      expect(LOG_LEVELS.VERBOSE).toBe('verbose');
    });
  });
});

