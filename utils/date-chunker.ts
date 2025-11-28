import dayjs from 'dayjs';

export interface DateChunk {
    since: string;  // YYYY-MM-DD
    until: string;  // YYYY-MM-DD
    label: string;
}

export class DateChunker {
    /**
     * Generates date chunks from newest to oldest (e.g., 2025 → 2024 → 2023).
     * Smart allocation: system will scrape chunks until target count is reached.
     * 
     * @param startDate Earliest date to go back to (default: 15 years ago)
     * @param endDate Latest date to start from (default: today)
     * @param chunkSize Size of each chunk ('month' or 'year')
     */
    static generateDateChunks(
        startDate?: string,
        endDate?: string,
        chunkSize: 'month' | 'year' = 'year'
    ): DateChunk[] {
        const end = endDate ? dayjs(endDate) : dayjs();
        const start = startDate ? dayjs(startDate) : dayjs().subtract(15, 'year');
        
        const chunks: DateChunk[] = [];
        let current = end;

        // Generate chunks from newest to oldest
        while (current.isAfter(start)) {
            const chunkEnd = current;
            const chunkStart = current.subtract(1, chunkSize);

            // Cap at the absolute start limit
            const effectiveStart = chunkStart.isBefore(start) ? start : chunkStart;

            chunks.push({
                since: effectiveStart.format('YYYY-MM-DD'),
                until: chunkEnd.format('YYYY-MM-DD'),
                label: `${effectiveStart.format('YYYY-MM-DD')} to ${chunkEnd.format('YYYY-MM-DD')}`
            });

            current = effectiveStart;
        }

        return chunks;
    }
}
