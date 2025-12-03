import { RedditScraper } from './reddit/scraper';
import { createEnhancedLogger } from '../../utils/logger';
import { getOutputPathManager } from '../../utils';
import { PlatformAdapter } from './types';
import * as path from 'path';
import * as fs from 'fs';

const logger = createEnhancedLogger('RedditAdapter');

export const redditAdapter: PlatformAdapter = {
  name: 'reddit',

  async process(data, ctx) {
    const { config: jobConfig } = data;
    const startTime = Date.now();

    await ctx.log(`Starting Reddit scrape: ${jobConfig.subreddit || jobConfig.postUrl}`);

    const scraper = new RedditScraper();
    const isPostUrl = jobConfig.postUrl !== undefined;

    try {
      let result;
      let posts: any[] = [];
      let outputPath: string;

      if (isPostUrl) {
        // Single post scraping
        await ctx.log(`Scraping post: ${jobConfig.postUrl}`);
        result = await scraper.scrapePost(jobConfig.postUrl!);

        if (result.status === 'success' && result.post && result.comments) {
          posts = [{
            ...result.post,
            comments: result.comments,
          }];

          // Save to file
          const outputPathManager = getOutputPathManager();
          const postId = result.post.id;
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const runDir = path.join(
            outputPathManager.getBaseDir(),
            'reddit',
            `post_${postId}`,
            `run-${timestamp}`
          );

          fs.mkdirSync(runDir, { recursive: true });
          outputPath = path.join(runDir, 'post.json');
          fs.writeFileSync(outputPath, JSON.stringify(posts[0], null, 2));

          await ctx.log(`Saved post with ${result.comments.length} comments`, 'info');
        } else {
          throw new Error(result.message || 'Failed to scrape post');
        }
      } else {
        // Subreddit scraping
        const subreddit = jobConfig.subreddit || 'javascript';
        const limit = jobConfig.limit || 50;

        await ctx.log(`Scraping r/${subreddit} (limit: ${limit})`);

        // Fetch post URLs
        const postUrls = await scraper.fetchSubredditPosts(subreddit, limit, 'hot');
        
        if (postUrls.length === 0) {
          throw new Error('No posts found');
        }

        await ctx.log(`Found ${postUrls.length} posts, fetching details...`);

        // Fetch post details with progress updates
        const concurrency = 3;
        for (let i = 0; i < postUrls.length; i += concurrency) {
          const batch = postUrls.slice(i, i + concurrency);
          const batchResults = await Promise.allSettled(
            batch.map(({ url }) => scraper.fetchPost(url))
          );

          for (const batchResult of batchResults) {
            if (batchResult.status === 'fulfilled') {
              posts.push({
                ...batchResult.value.post,
                comments: batchResult.value.comments,
              });
            } else {
              logger.warn('Failed to fetch post', batchResult.reason);
            }
          }

          const current = Math.min(i + concurrency, postUrls.length);
          ctx.emitProgress({ 
            current, 
            target: postUrls.length, 
            action: `Scraped ${posts.length}/${postUrls.length} posts` 
          });

          await ctx.log(`Progress: ${current}/${postUrls.length} posts processed`);
        }

        // Save to file
        const outputPathManager = getOutputPathManager();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const runDir = path.join(
          outputPathManager.getBaseDir(),
          'reddit',
          subreddit,
          `run-${timestamp}`
        );

        fs.mkdirSync(runDir, { recursive: true });
        outputPath = path.join(runDir, 'posts.json');
        fs.writeFileSync(outputPath, JSON.stringify(posts, null, 2));

        await ctx.log(`Saved ${posts.length} posts to ${outputPath}`, 'info');
      }

      const duration = Date.now() - startTime;
      const count = posts.length;

      await ctx.log(
        `Reddit scraping completed! ${count} items scraped (${(duration / 1000).toFixed(1)}s)`,
        'info'
      );

      return {
        success: true,
        downloadUrl: `/api/download?path=${encodeURIComponent(outputPath!)}`,
        stats: {
          count,
          duration,
        },
      };
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
