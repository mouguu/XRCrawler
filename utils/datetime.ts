/**
 * DateTime Utilities (Consolidated)
 * Merges functionality from date-utils, time, and date-chunker.
 */

import dayjs from 'dayjs';

// ==========================================
// Part 1: Timezone & Formatting Helpers (from time.ts)
// ==========================================

const DEFAULT_TIMEZONE: string =
  process.env.TWITTER_CRAWLER_TIMEZONE || process.env.TWITTER_CRAWLER_TZ || process.env.TZ || 'UTC';

export function isValidTimezone(timezone: string | null | undefined): boolean {
  try {
    if (!timezone) return false;
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch (_error) {
    return false;
  }
}

export function getDefaultTimezone(): string {
  return DEFAULT_TIMEZONE;
}

export function resolveTimezone(timezone?: string): string {
  if (!timezone) return DEFAULT_TIMEZONE;
  const trimmed = String(timezone).trim();
  if (!trimmed) return DEFAULT_TIMEZONE;
  if (isValidTimezone(trimmed)) return trimmed;
  console.warn(`[time] Invalid timezone "${timezone}", falling back to ${DEFAULT_TIMEZONE}`);
  return DEFAULT_TIMEZONE;
}

function normalizeOffset(rawOffset: string): string {
  if (!rawOffset) return '+00:00';
  let offset = rawOffset.replace(/^(GMT|UTC)/, '');
  if (!offset) return '+00:00';
  if (!/^[+-]/.test(offset)) offset = `+${offset}`;

  if (!offset.includes(':')) {
    const sign = offset.startsWith('-') ? '-' : '+';
    const hours = offset.replace(/^[+-]/, '').padStart(2, '0');
    return `${sign}${hours}:00`;
  }

  const [hourPart, minutePart = '00'] = offset.split(':');
  const sign = hourPart.startsWith('-') ? '-' : '+';
  const hours = hourPart.replace(/^[+-]/, '').padStart(2, '0');
  const minutes = minutePart.padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

interface FormatOptions {
  includeMilliseconds?: boolean;
  includeOffset?: boolean;
}

interface ZonedTimestamp {
  iso: string;
  fileSafe: string;
  offset: string;
  parts: Record<string, string>;
}

export function formatZonedTimestamp(
  dateInput: Date | string | number,
  timezone?: string,
  options: FormatOptions = {},
): ZonedTimestamp {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput ?? Date.now());
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('formatZonedTimestamp: Invalid date input');
  }

  const tz = resolveTimezone(timezone);
  const { includeMilliseconds = true, includeOffset = true } = options;

  const baseFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = baseFormatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  parts.forEach(({ type, value }) => {
    if (type !== 'literal') partMap[type] = value;
  });

  const millis = includeMilliseconds ? String(date.getMilliseconds()).padStart(3, '0') : null;
  let iso = `${partMap.year}-${partMap.month}-${partMap.day}T${partMap.hour}:${partMap.minute}:${partMap.second}`;
  if (includeMilliseconds && millis) iso += `.${millis}`;

  let offset = '+00:00';
  if (includeOffset) {
    const offsetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      timeZoneName: 'shortOffset',
    });
    const offsetParts = offsetFormatter.formatToParts(date);
    const tzName = offsetParts.find((part) => part.type === 'timeZoneName');
    if (tzName?.value) {
      offset = normalizeOffset(tzName.value);
    }
    iso += offset;
  }

  const fileSafe = iso.replace(/:/g, '-').replace(/\./g, '-');

  return { iso, fileSafe, offset, parts: partMap };
}

export function formatReadableLocal(dateInput: Date | string | number, timezone?: string): string {
  const { iso, offset } = formatZonedTimestamp(dateInput, timezone, {
    includeMilliseconds: false,
    includeOffset: true,
  });
  const base = iso.endsWith(offset) ? iso.slice(0, iso.length - offset.length) : iso;
  return `${base.replace('T', ' ')} (${offset})`;
}

// ==========================================
// Part 2: Date Utils & Range Generation (from date-utils.ts)
// ==========================================

export interface DateRange {
  start: string;
  end: string;
}

export type ChunkType = 'daily' | 'weekly' | 'monthly' | 'yearly';

export class DateUtils {
  static generateDateRanges(
    start: string,
    end: string,
    chunkType: ChunkType = 'monthly',
  ): DateRange[] {
    const ranges: DateRange[] = [];
    let current = dayjs(start);
    const endDate = dayjs(end);

    while (current.isBefore(endDate)) {
      let chunkEnd: dayjs.Dayjs;
      switch (chunkType) {
        case 'daily': chunkEnd = current.add(1, 'day'); break;
        case 'weekly': chunkEnd = current.add(1, 'week'); break;
        case 'monthly': chunkEnd = current.add(1, 'month'); break;
        case 'yearly': chunkEnd = current.add(1, 'year'); break;
        default: chunkEnd = current.add(1, 'month');
      }

      if (chunkEnd.isAfter(endDate)) chunkEnd = endDate;

      ranges.push({
        start: current.format('YYYY-MM-DD'),
        end: chunkEnd.format('YYYY-MM-DD'),
      });
      current = chunkEnd;
    }
    return ranges;
  }

  static parseDate(dateStr: string): string {
    const now = dayjs();
    const lower = dateStr.toLowerCase();

    if (lower.includes('year')) {
      const num = parseInt(lower.replace(/\D/g, ''), 10) || 1;
      return now.subtract(num, 'year').format('YYYY-MM-DD');
    } else if (lower.includes('month')) {
      const num = parseInt(lower.replace(/\D/g, ''), 10) || 1;
      return now.subtract(num, 'month').format('YYYY-MM-DD');
    } else if (lower.includes('day')) {
      const num = parseInt(lower.replace(/\D/g, ''), 10) || 1;
      return now.subtract(num, 'day').format('YYYY-MM-DD');
    }
    return dateStr;
  }
}

// ==========================================
// Part 3: Date Chunker (from date-chunker.ts)
// ==========================================

export interface DateChunk {
  since: string;
  until: string;
  label: string;
}

export class DateChunker {
  static generateDateChunks(
    startDate?: string,
    endDate?: string,
    chunkSize: 'month' | 'year' = 'year',
  ): DateChunk[] {
    const end = endDate ? dayjs(endDate) : dayjs();
    const start = startDate ? dayjs(startDate) : dayjs().subtract(15, 'year');

    const chunks: DateChunk[] = [];
    let current = end;

    while (current.isAfter(start)) {
      const chunkEnd = current;
      const chunkStart = current.subtract(1, chunkSize);
      const effectiveStart = chunkStart.isBefore(start) ? start : chunkStart;

      chunks.push({
        since: effectiveStart.format('YYYY-MM-DD'),
        until: chunkEnd.format('YYYY-MM-DD'),
        label: `${effectiveStart.format('YYYY-MM-DD')} to ${chunkEnd.format('YYYY-MM-DD')}`,
      });
      current = effectiveStart;
    }
    return chunks;
  }
}
