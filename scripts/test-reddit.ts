/**
 * Simple test script for Reddit TypeScript scraper
 * Run with: npx tsx scripts/test-reddit.ts
 */

import { RedditScraper } from '../core/platforms/reddit/scraper';

async function main() {
  console.log('🧪 Testing Reddit Node.js Scraper\n');

  const scraper = new RedditScraper();

  try {
    // Test 1: Fetch subreddit posts
    console.log('📝 Test 1: Fetching r/test (limit 5)...');
    const postUrls = await scraper.fetchSubredditPosts('test', 5, 'hot');
    
    if (postUrls.length > 0) {
      console.log(`✅ Success! Found ${postUrls.length} posts:`);
      postUrls.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.id} - ${p.url.slice(0, 60)}...`);
      });
    } else {
      console.log('⚠️  No posts found');
    }

    // Test 2: Fetch a single post
    if (postUrls.length > 0) {
      const testPost = postUrls[0];
      console.log(`\n📝 Test 2: Fetching post details for ${testPost.id}...`);
      
      const { post, comments } = await scraper.fetchPost(testPost.url);
      console.log(`✅ Success!`);
      console.log(`   Title: ${post.title.slice(0, 60)}...`);
      console.log(`   Author: u/${post.author}`);
      console.log(`   Score: ${post.score}`);
      console.log(`   Comments: ${comments.length}`);
    }

    console.log('\n🎉 All tests passed!');
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

main();
