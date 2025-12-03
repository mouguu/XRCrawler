import { RedditApiClient } from '../reddit-api-client';
import { ScraperErrors } from '../errors';
import { createEnhancedLogger } from '../../utils/logger';
import { getConfigManager } from '../../utils/config-manager';
import { PlatformAdapter } from './types';

const logger = createEnhancedLogger('RedditAdapter');
const configManager = getConfigManager();

export const redditAdapter: PlatformAdapter = {
  name: 'reddit',

  async process(data, ctx) {
    const { config: jobConfig } = data;
    const redditConfig = configManager.getRedditConfig();
    const startTime = Date.now();

    await ctx.log(`Starting Reddit scrape: ${jobConfig.subreddit || jobConfig.postUrl}`);

    const client = new RedditApiClient(redditConfig.apiUrl, redditConfig.apiTimeout);

    const isHealthy = await client.healthCheck();
    if (!isHealthy) {
      throw ScraperErrors.apiRequestFailed(
        'Reddit API server is not available. Please start it with: pnpm run dev:reddit',
        undefined,
        { type: 'reddit', service: 'health_check_failed' }
      );
    }

    const isPostUrl = jobConfig.postUrl !== undefined;
    let result;

    try {
      if (isPostUrl) {
        await ctx.log(`Scraping post: ${jobConfig.postUrl}`);
        result = await client.scrapePost(jobConfig.postUrl!);
      } else {
        await ctx.log(`Scraping r/${jobConfig.subreddit}`);
        result = await client.scrapeSubreddit({
          subreddit: jobConfig.subreddit || 'UofT',
          maxPosts: jobConfig.limit || 500,
          strategy: (jobConfig.strategy || redditConfig.defaultStrategy) as
            | 'auto'
            | 'super_full'
            | 'super_recent'
            | 'new',
          saveJson: true,
          onProgress: (current, total, message) => {
            ctx.emitProgress({ current, target: total, action: message });
          },
          onLog: (message, level = 'info') => {
            ctx.log(message, level as any);
          },
        });
      }

      if (result.success && result.data?.file_path) {
        const duration = Date.now() - startTime;
        const count = result.data.scraped_count || result.data.comment_count || 0;

        await ctx.log(
          `Reddit scraping completed! ${count} items scraped (${(duration / 1000).toFixed(
            1
          )}s)`,
          'info'
        );

        return {
          success: true,
          downloadUrl: `/api/download?path=${encodeURIComponent(result.data.file_path)}`,
          stats: {
            count,
            duration,
          },
        };
      }

      throw new Error(result.error || 'Reddit scraping failed');
    } catch (error: any) {
      await ctx.log(`Error: ${error.message}`, 'error');
      logger.error('Reddit scraping failed', error);
      throw error;
    }
  },

  classifyError(err: any) {
    if (err?.response?.status === 401) return 'auth';
    if (err?.response?.status === 404) return 'not_found';
    if (err?.response?.status === 429) return 'rate_limit';
    return 'unknown';
  },
};
