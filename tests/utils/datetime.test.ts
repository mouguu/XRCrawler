import { describe, expect, test } from 'bun:test';
import { DateUtils, DateChunker, getDefaultTimezone, resolveTimezone, formatZonedTimestamp, formatReadableLocal } from '../../utils/datetime';
import * as timeUtils from '../../utils/datetime';

describe('DateTime Utils', () => {
  describe('DateUtils', () => {
    describe('parseDate', () => {
      test('should parse relative date string like "1 year"', () => {
        const result = DateUtils.parseDate('1 year');
        expect(typeof result).toBe('string');
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      test('should parse relative date string like "3 months"', () => {
        const result = DateUtils.parseDate('3 months');
        expect(typeof result).toBe('string');
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      test('should return absolute date string as-is', () => {
        const result = DateUtils.parseDate('2024-01-01');
        expect(result).toBe('2024-01-01');
      });
    });

    describe('generateDateRanges', () => {
      test('should generate daily date ranges', () => {
        const ranges = DateUtils.generateDateRanges('2024-01-01', '2024-01-05', 'daily');

        expect(ranges.length).toBeGreaterThan(0);
        expect(ranges[0]).toHaveProperty('start');
        expect(ranges[0]).toHaveProperty('end');
        expect(ranges[0].start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      test('should generate monthly date ranges', () => {
        const ranges = DateUtils.generateDateRanges('2024-01-01', '2024-03-01', 'monthly');

        expect(ranges.length).toBeGreaterThan(0);
        ranges.forEach((range) => {
          expect(range.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(range.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
      });

      test('should generate yearly date ranges', () => {
        const ranges = DateUtils.generateDateRanges('2020-01-01', '2024-01-01', 'yearly');

        expect(ranges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('TimeUtils', () => {
    describe('getDefaultTimezone', () => {
      test('should return timezone string', () => {
        const tz = getDefaultTimezone();
        expect(typeof tz).toBe('string');
        expect(tz.length).toBeGreaterThan(0);
      });
    });

    describe('resolveTimezone', () => {
      test('should return provided timezone', () => {
        expect(resolveTimezone('America/New_York')).toBe('America/New_York');
      });

      test('should return default if not provided', () => {
        const tz = resolveTimezone();
        expect(tz).toBeDefined();
      });
    });

    describe('formatZonedTimestamp', () => {
      test('should format timestamp with timezone', () => {
        const date = new Date('2024-01-01T00:00:00Z');
        const result = formatZonedTimestamp(date, 'UTC');

        expect(result).toHaveProperty('iso');
        expect(result).toHaveProperty('fileSafe');
        expect(result.iso).toContain('2024');
      });

      test('should include milliseconds when requested', () => {
        const date = new Date('2024-01-01T00:00:00.123Z');
        const result = formatZonedTimestamp(date, 'UTC', {
          includeMilliseconds: true,
        });

        expect(result.iso).toContain('.123');
      });

      test('should create file-safe format', () => {
        const date = new Date('2024-01-01T00:00:00Z');
        const result = formatZonedTimestamp(date, 'UTC');

        expect(result.fileSafe).not.toContain(':');
        expect(result.fileSafe).not.toContain(' ');
      });
    });

    describe('formatReadableLocal', () => {
      test('should format readable local time', () => {
        const date = new Date('2024-01-01T00:00:00Z');
        const formatted = formatReadableLocal(date, 'UTC');

        expect(formatted).toContain('2024');
        expect(formatted).toContain('(');
      });
    });
  });

  describe('DateChunker', () => {
    describe('generateDateChunks', () => {
      test('should generate date chunks by year', () => {
        const chunks = DateChunker.generateDateChunks('2020-01-01', '2024-01-01', 'year');

        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks[0]).toHaveProperty('since');
        expect(chunks[0]).toHaveProperty('until');
        expect(chunks[0]).toHaveProperty('label');
      });

      test('should generate date chunks by month', () => {
        const chunks = DateChunker.generateDateChunks('2024-01-01', '2024-03-01', 'month');

        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks[0].since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(chunks[0].until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      test('should generate chunks from newest to oldest', () => {
        const chunks = DateChunker.generateDateChunks('2022-01-01', '2024-01-01', 'year');

        // First chunk should be most recent
        expect(chunks[0].until).toContain('2024');
      });

      test('should use default dates when not provided', () => {
        const chunks = DateChunker.generateDateChunks();

        expect(chunks.length).toBeGreaterThan(0);
      });

      test('should format dates correctly', () => {
        const chunks = DateChunker.generateDateChunks('2024-01-01', '2024-12-31', 'month');

        chunks.forEach((chunk) => {
          expect(chunk.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(chunk.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(chunk.label).toBeDefined();
        });
      });
    });
  });
});
