import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fileUtils from '../../utils/filesystem';
import {
  getOutputPathManager,
  OutputPathManager,
  resetOutputPathManager,
  isPathInsideBase
} from '../../utils/filesystem';

describe('FileSystem Utils', () => {
  let testOutputDir: string;

  beforeEach(async () => {
    testOutputDir = path.join(os.tmpdir(), `test-output-${Date.now()}`);
    process.env.OUTPUT_DIR = testOutputDir;
  });

  afterEach(async () => {
    try {
      await fsPromises.rm(testOutputDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
    delete process.env.OUTPUT_DIR;
  });

  describe('FileUtils', () => {
    describe('sanitizeSegment', () => {
      test('should sanitize special characters', () => {
        expect(fileUtils.sanitizeSegment('test@user#123')).toBe('test-user-123');
        expect(fileUtils.sanitizeSegment('user name')).toBe('user-name');
        expect(fileUtils.sanitizeSegment('user/name')).toBe('user-name');
      });

      test('should handle empty string', () => {
        const result = fileUtils.sanitizeSegment('');
        expect(result).toBeTruthy();
      });

      test('should convert to lowercase', () => {
        expect(fileUtils.sanitizeSegment('USERNAME')).toBe('username');
      });

      test('should remove leading/trailing dashes', () => {
        expect(fileUtils.sanitizeSegment('-username-')).toBe('username');
      });

      test('should collapse multiple dashes', () => {
        expect(fileUtils.sanitizeSegment('user---name')).toBe('user-name');
      });
    });

    describe('ensureDirExists', () => {
      test('should create directory if not exists', async () => {
        const dir = path.join(testOutputDir, 'new-dir');
        const result = await fileUtils.ensureDirExists(dir);

        expect(result).toBe(true);
        expect(fs.existsSync(dir)).toBe(true);
      });

      test('should return true if directory exists', async () => {
        const dir = path.join(testOutputDir, 'existing-dir');
        await fsPromises.mkdir(dir, { recursive: true });

        const result = await fileUtils.ensureDirExists(dir);
        expect(result).toBe(true);
      });

      test('should create nested directories', async () => {
        const dir = path.join(testOutputDir, 'nested', 'deep', 'path');
        await fileUtils.ensureDirExists(dir);

        expect(fs.existsSync(dir)).toBe(true);
      });
    });

    describe('getDefaultOutputRoot', () => {
      test('should return default output root', () => {
        const root = fileUtils.getDefaultOutputRoot();
        expect(root).toBeTruthy();
        expect(typeof root).toBe('string');
      });

      test('should respect OUTPUT_DIR environment variable', () => {
        const tempDir = require('node:os').tmpdir();
        const customDir = path.join(tempDir, `custom-output-${Date.now()}`);
        const originalEnv = process.env.OUTPUT_DIR;
        process.env.OUTPUT_DIR = customDir;

        // Reset OutputPathManager singleton to pick up new env var
        resetOutputPathManager();

        // Create the directory so validation passes
        fs.mkdirSync(customDir, { recursive: true });

        // Get a new instance with the env var
        const _pathManager = getOutputPathManager({ baseDir: customDir });
        const root = fileUtils.getDefaultOutputRoot();

        // Should use the custom directory
        expect(root).toBe(customDir);

        // Cleanup
        try {
          fs.rmSync(customDir, { recursive: true, force: true });
        } catch (_error) {
          // Ignore
        }

        // Restore
        if (originalEnv) {
          process.env.OUTPUT_DIR = originalEnv;
        } else {
          delete process.env.OUTPUT_DIR;
        }
        resetOutputPathManager();
      });
    });

    describe('createRunContext', () => {
      test('should create run context with default options', async () => {
        const context = await fileUtils.createRunContext();

        expect(context).toHaveProperty('platform');
        expect(context).toHaveProperty('identifier');
        expect(context).toHaveProperty('runId');
        expect(context).toHaveProperty('runDir');
        expect(context).toHaveProperty('markdownDir');
        expect(context).toHaveProperty('jsonPath');
        expect(context).toHaveProperty('csvPath');
      });

      test('should create run context with custom options', async () => {
        const context = await fileUtils.createRunContext({
          platform: 'twitter',
          identifier: 'testuser',
          timestamp: '2024-01-01T00:00:00Z',
        });

        expect(context.platform).toBe('twitter');
        expect(context.identifier).toBe('testuser');
        expect(context.runId).toContain('run-');
      });

      test('should create all required directories', async () => {
        const context = await fileUtils.createRunContext({
          platform: 'test',
          identifier: 'test',
        });

        expect(fs.existsSync(context.runDir)).toBe(true);
        expect(fs.existsSync(context.markdownDir)).toBe(true);
        expect(fs.existsSync(context.screenshotDir)).toBe(true);
      });

      test('should sanitize platform and identifier', async () => {
        const context = await fileUtils.createRunContext({
          platform: 'Test@Platform',
          identifier: 'User#123',
        });

        expect(context.platform).toBe('test-platform');
        expect(context.identifier).toBe('user-123');
      });
    });

    describe('getTodayString', () => {
      test('should return date in YYYY-MM-DD format', () => {
        const today = fileUtils.getTodayString();
        expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      test('should return current date', () => {
        const today = fileUtils.getTodayString();
        const expected = new Date().toISOString().split('T')[0];
        expect(today).toBe(expected);
      });
    });

    describe('getMarkdownFiles', () => {
      test('should return markdown files in directory', async () => {
        const dir = path.join(testOutputDir, 'markdown-test');
        await fsPromises.mkdir(dir, { recursive: true });

        await fsPromises.writeFile(path.join(dir, 'file1.md'), 'content');
        await fsPromises.writeFile(path.join(dir, 'file2.md'), 'content');
        await fsPromises.writeFile(path.join(dir, 'file3.txt'), 'content');

        const files = await fileUtils.getMarkdownFiles(dir);

        expect(files.length).toBe(2);
        expect(files.every((f) => f.endsWith('.md'))).toBe(true);
      });

      test('should exclude merged files', async () => {
        const dir = path.join(testOutputDir, 'markdown-test2');
        await fsPromises.mkdir(dir, { recursive: true });

        await fsPromises.writeFile(path.join(dir, 'normal.md'), 'content');
        await fsPromises.writeFile(path.join(dir, 'merged-file.md'), 'content');
        await fsPromises.writeFile(path.join(dir, 'digest-file.md'), 'content');

        const files = await fileUtils.getMarkdownFiles(dir);

        expect(files.length).toBe(1);
        expect(files[0]).toContain('normal.md');
      });

      test('should return empty array for non-existent directory', async () => {
        const files = await fileUtils.getMarkdownFiles('/non/existent/path');
        expect(files).toEqual([]);
      });

      test('should return empty array for empty directory', async () => {
        const dir = path.join(testOutputDir, 'empty-dir');
        await fsPromises.mkdir(dir, { recursive: true });

        const files = await fileUtils.getMarkdownFiles(dir);
        expect(files).toEqual([]);
      });
    });

    describe('ensureBaseStructure', () => {
      test('should create base output structure', async () => {
        const result = await fileUtils.ensureBaseStructure();
        expect(result).toBe(true);
      });
    });
  });

  describe('PathUtils', () => {
    const baseDir = path.join(process.cwd(), 'output');

    test('returns true for path inside base directory', () => {
      const target = path.join(baseDir, 'user', 'index.md');
      expect(isPathInsideBase(target, baseDir)).toBe(true);
    });

    test('returns false for traversal outside base directory', () => {
      const target = path.join(baseDir, '..', 'etc', 'passwd');
      expect(isPathInsideBase(target, baseDir)).toBe(false);
    });

    test('returns true when target equals base directory', () => {
      expect(isPathInsideBase(baseDir, baseDir)).toBe(true);
    });

    test('returns false when inputs are empty', () => {
      expect(isPathInsideBase('', baseDir)).toBe(false);
      expect(isPathInsideBase(baseDir, '')).toBe(false);
    });
  });

  describe('OutputPathManager', () => {
    let outputManager: OutputPathManager;

    beforeEach(() => {
      // 使用临时目录进行测试
      outputManager = new OutputPathManager({ baseDir: testOutputDir });
    });

    describe('getBaseDir', () => {
      test('should return the configured base directory', () => {
        expect(outputManager.getBaseDir()).toBe(testOutputDir);
      });
    });

    describe('getPlatformDir', () => {
      test('should return platform directory path', () => {
        const platformDir = outputManager.getPlatformDir('twitter');
        expect(platformDir).toBe(path.join(testOutputDir, 'twitter'));
      });

      test('should sanitize platform name', () => {
        const platformDir = outputManager.getPlatformDir('Twitter/X');
        expect(platformDir).toBe(path.join(testOutputDir, 'twitter-x'));
      });
    });

    describe('getIdentifierDir', () => {
      test('should return identifier directory path', () => {
        const identifierDir = outputManager.getIdentifierDir('twitter', 'elonmusk');
        expect(identifierDir).toBe(path.join(testOutputDir, 'twitter', 'elonmusk'));
      });

      test('should sanitize identifier name', () => {
        const identifierDir = outputManager.getIdentifierDir('twitter', 'Elon Musk');
        expect(identifierDir).toBe(path.join(testOutputDir, 'twitter', 'elon-musk'));
      });
    });

    describe('createRunPath', () => {
      test('should create complete run path structure', async () => {
        const runPath = await outputManager.createRunPath('twitter', 'elonmusk', 'run-2024-01-01');

        expect(runPath.platform).toBe('twitter');
        expect(runPath.identifier).toBe('elonmusk');
        expect(runPath.runId).toBe('run-2024-01-01');
        expect(runPath.runDir).toBe(path.join(testOutputDir, 'twitter', 'elonmusk', 'run-2024-01-01'));
        expect(runPath.markdownDir).toBe(
          path.join(testOutputDir, 'twitter', 'elonmusk', 'run-2024-01-01', 'markdown'),
        );
        expect(runPath.screenshotDir).toBe(
          path.join(testOutputDir, 'twitter', 'elonmusk', 'run-2024-01-01', 'screenshots'),
        );
      });

      test('should create directories if they do not exist', async () => {
        const runPath = await outputManager.createRunPath('reddit', 'UofT', 'run-2024-01-01');

        // 检查目录是否存在
        const stats = await fsPromises.stat(runPath.runDir);
        expect(stats.isDirectory()).toBe(true);

        const markdownStats = await fsPromises.stat(runPath.markdownDir);
        expect(markdownStats.isDirectory()).toBe(true);
      });

      test('should generate correct file paths', async () => {
        const runPath = await outputManager.createRunPath('twitter', 'test', 'run-123');

        expect(runPath.jsonPath).toBe(path.join(runPath.runDir, 'tweets.json'));
        expect(runPath.csvPath).toBe(path.join(runPath.runDir, 'tweets.csv'));
        expect(runPath.markdownIndexPath).toBe(path.join(runPath.runDir, 'index.md'));
        expect(runPath.metadataPath).toBe(path.join(runPath.runDir, 'metadata.json'));
      });
    });

    describe('isPathSafe', () => {
      test('should return true for paths within base directory', () => {
        const safePath = path.join(testOutputDir, 'twitter', 'test.json');
        expect(outputManager.isPathSafe(safePath)).toBe(true);
      });

      test('should return false for paths outside base directory', () => {
        const unsafePath = path.join(process.cwd(), '..', 'sensitive-file.json');
        expect(outputManager.isPathSafe(unsafePath)).toBe(false);
      });
    });

    describe('resolvePath', () => {
      test('should resolve relative paths correctly', () => {
        const resolved = outputManager.resolvePath('twitter/test.json');
        expect(resolved).toBe(path.join(testOutputDir, 'twitter', 'test.json'));
      });

      test('should throw error for path traversal attempts', () => {
        expect(() => {
          outputManager.resolvePath('../../etc/passwd');
        }).toThrow('Path traversal detected');
      });
    });

    describe('getOutputPathManager (singleton)', () => {
      test('should return the same instance on multiple calls', () => {
        const instance1 = getOutputPathManager();
        const instance2 = getOutputPathManager();
        expect(instance1).toBe(instance2);
      });

      test('should allow reset for testing', () => {
        const instance1 = getOutputPathManager();
        resetOutputPathManager();
        const instance2 = getOutputPathManager();
        expect(instance1).not.toBe(instance2);
      });
    });
  });
});
