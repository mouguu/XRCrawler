/**
 * Reddit Scraper - Node.js Implementation
 * 
 * Replaces the Python reddit-helper service with a native TypeScript implementation.
 * Uses Reddit's public JSON API for data retrieval.
 */

import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { createEnhancedLogger } from '../../../utils';
import {
  RedditListing,
  RedditThing,
  RedditPost,
  RedditComment,
  RedditMore,
  FlattenedComment,
  RedditScraperConfig,
  RedditScraperResult,
} from './types';

const logger = createEnhancedLogger('RedditScraper');

export class RedditScraper {
  private client: AxiosInstance;
  private baseDelay = 2000; // 2 seconds between requests

  constructor() {
    this.client = axios.create({
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 20000, // 20 second timeout
    });
  }

  /**
   * Fetch subreddit posts
   */
  async fetchSubredditPosts(
    subreddit: string,
    limit: number = 100,
    sortType: string = 'hot'
  ): Promise<Array<{ url: string; id: string }>> {
    const posts: Array<{ url: string; id: string }> = [];
    let after: string | null = null;
    let page = 1;

    while (posts.length < limit) {
      try {
        logger.info(`Fetching page ${page}...`);
        
        // Rate limiting
        if (page > 1) {
          await this.delay(this.baseDelay);
        }

        let url = `https://www.reddit.com/r/${subreddit}/${sortType}.json?limit=100`;
        if (after) {
          url += `&after=${after}`;
        }

        const response = await this.client.get<RedditListing>(url);
        
        if (response.status === 403) {
          logger.warn('Blocked by Reddit (403)');
          break;
        }

        const children = response.data.data.children;
        
        if (!children || children.length === 0) {
          logger.info('No more posts available');
          break;
        }

        for (const child of children) {
          if (posts.length >= limit) break;
          
          if (child.kind === 't3') {
            const postData = child.data as RedditPost;
            posts.push({
              url: `https://www.reddit.com${postData.permalink}`,
              id: postData.id,
            });
          }
        }

        logger.info(`Page ${page}: Found ${children.length} posts (total: ${posts.length})`);

        // Check for next page
        after = response.data.data.after;
        if (!after || children.length < 100) {
          logger.info('Reached end of listing');
          break;
        }

        page++;
      } catch (error: any) {
        logger.error(`Error fetching page ${page}`, error);
        if (page === 1) {
          throw error; // Fail fast on first page
        }
        break; // Stop on subsequent pages
      }
    }

    return posts;
  }

  /**
   * Fetch a single post with all comments
   */
  async fetchPost(postUrl: string): Promise<{ post: RedditPost; comments: FlattenedComment[] }> {
    logger.info(`Fetching post: ${postUrl}`);

    // Ensure URL ends with .json
    let url = postUrl.endsWith('.json') ? postUrl : `${postUrl}.json`;
    
    // Handle short URLs (redd.it)
    if (url.includes('redd.it/')) {
      url = url.replace('redd.it/', 'reddit.com/comments/');
    }

    await this.delay(this.baseDelay);

    try {
      const response = await this.client.get<[RedditListing, RedditListing]>(url);
      const [postListing, commentListing] = response.data;

      // Parse post
      const postChildren = postListing.data.children;
      if (!postChildren || postChildren.length === 0) {
        throw new Error('No post data found');
      }

      const post = postChildren[0].data as RedditPost;

      // Parse comments
      const comments = this.parseCommentTree(commentListing, 0, post.id);

      logger.info(`Fetched post: "${post.title.slice(0, 60)}" (${comments.length} comments)`);

      return { post, comments };
    } catch (error: any) {
      logger.error(`Failed to fetch post: ${postUrl}`, error);
      throw error;
    }
  }

  /**
   * Recursively parse comment tree into flat array
   */
  private parseCommentTree(
    listing: RedditListing | RedditThing,
    depth: number,
    parentId: string | null
  ): FlattenedComment[] {
    const comments: FlattenedComment[] = [];

    // Handle both Listing and Thing wrappers
    const data = 'kind' in listing && listing.kind === 'Listing' 
      ? listing.data 
      : (listing as any).data;

    const children = data?.children || [];

    for (const child of children) {
      if (child.kind === 't1') {
        // Comment
        const commentData = child.data as RedditComment;

        comments.push({
          id: commentData.id,
          author: commentData.author,
          body: commentData.body,
          score: commentData.score,
          created_utc: commentData.created_utc,
          depth,
          parent_id: parentId,
          permalink: `https://reddit.com${commentData.permalink}`,
          is_submitter: commentData.is_submitter,
          gilded: commentData.gilded,
          controversiality: commentData.controversiality,
        });

        // Recursively parse replies
        if (commentData.replies && typeof commentData.replies !== 'string') {
          const childComments = this.parseCommentTree(
            commentData.replies,
            depth + 1,
            commentData.id
          );
          comments.push(...childComments);
        }
      } else if (child.kind === 'more') {
        // "Load more comments" marker
        const moreData = child.data as RedditMore;
        if (moreData.count > 0) {
          logger.debug(`${moreData.count} more comments hidden at depth ${depth}`);
        }
      }
    }

    return comments;
  }

  /**
   * Scrape a subreddit
   */
  async scrapeSubreddit(config: RedditScraperConfig): Promise<RedditScraperResult> {
    const { subreddit, limit = 100, sortType = 'hot' } = config;

    if (!subreddit) {
      return { status: 'error', message: 'Subreddit name is required' };
    }

    try {
      logger.info(`Starting subreddit scrape: r/${subreddit}`);
      
      // Step 1: Fetch post URLs
      const postUrls = await this.fetchSubredditPosts(subreddit, limit, sortType);
      
      if (postUrls.length === 0) {
        return { status: 'error', message: 'No posts found' };
      }

      logger.info(`Found ${postUrls.length} posts`);

      // Step 2: Fetch post details (with concurrency limit)
      const posts: Array<{ post: RedditPost; comments: FlattenedComment[] }> = [];
      const concurrency = 3;

      for (let i = 0; i < postUrls.length; i += concurrency) {
        const batch = postUrls.slice(i, i + concurrency);
        const results = await Promise.allSettled(
          batch.map(({ url }) => this.fetchPost(url))
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            posts.push(result.value);
          } else {
            logger.warn('Failed to fetch post', result.reason);
          }
        }

        logger.info(`Progress: ${Math.min(i + concurrency, postUrls.length)}/${postUrls.length}`);
      }

      logger.info(`Successfully scraped ${posts.length} posts`);

      return {
        status: 'success',
        scrapedCount: posts.length,
        totalPosts: postUrls.length,
        message: 'Scraping completed',
      };
    } catch (error: any) {
      logger.error('Subreddit scrape failed', error);
      return {
        status: 'error',
        message: error.message || 'Scraping failed',
      };
    }
  }

  /**
   * Scrape a single post
   */
  async scrapePost(postUrl: string): Promise<RedditScraperResult> {
    try {
      const { post, comments } = await this.fetchPost(postUrl);

      return {
        status: 'success',
        post,
        comments,
        message: 'Post scraped successfully',
      };
    } catch (error: any) {
      logger.error('Post scrape failed', error);
      return {
        status: 'error',
        message: error.message || 'Failed to scrape post',
      };
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
