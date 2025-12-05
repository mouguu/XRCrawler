import dayjs from 'dayjs';

export interface DateRange {
  start: string;
  end: string;
}

export type ChunkType = 'daily' | 'weekly' | 'monthly' | 'yearly';

export class DateUtils {
  /**
   * Splits a date range into smaller chunks.
   * @param start Start date (YYYY-MM-DD)
   * @param end End date (YYYY-MM-DD)
   * @param chunkType 'daily' | 'weekly' | 'monthly' | 'yearly'
   * @returns Array of DateRange objects
   */
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
        case 'daily':
          chunkEnd = current.add(1, 'day');
          break;
        case 'weekly':
          chunkEnd = current.add(1, 'week');
          break;
        case 'monthly':
          chunkEnd = current.add(1, 'month');
          break;
        case 'yearly':
          chunkEnd = current.add(1, 'year');
          break;
        default:
          chunkEnd = current.add(1, 'month');
      }

      // Ensure we don't exceed the end date
      if (chunkEnd.isAfter(endDate)) {
        chunkEnd = endDate;
      }

      ranges.push({
        start: current.format('YYYY-MM-DD'),
        end: chunkEnd.format('YYYY-MM-DD'),
      });

      current = chunkEnd;
    }

    return ranges;
  }

  /**
   * Parses relative date strings like "1 year", "3 months" into YYYY-MM-DD.
   * @param dateStr Absolute date or relative string
   */
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
