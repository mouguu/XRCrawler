#!/usr/bin/env node
/**
 * Test Script for Queue-Based API
 * 
 * Tests the new /api/scrape-v2 endpoint with concurrent jobs
 */

const BASE_URL = 'http://localhost:5001';

async function testQueueAPI() {
  console.log('🧪 Testing Queue-Based API\n');

  // Test 1: Submit Twitter job
  console.log('📤 Test 1: Submitting Twitter job...');
  const twitterResponse = await fetch(`${BASE_URL}/api/scrape-v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'profile',
      input: 'elonmusk',
      limit: 10,
      mode: 'graphql',
    }),
  });

  const twitterResult = await twitterResponse.json();
  console.log('✅ Twitter job submitted:', {
    jobId: twitterResult.jobId,
    statusUrl: twitterResult.statusUrl,
    progressUrl: twitterResult.progressUrl,
  });

  // Test 2: Submit Reddit job (concurrent)
  console.log('\n📤 Test 2: Submitting Reddit job (concurrent)...');
  const redditResponse = await fetch(`${BASE_URL}/api/scrape-v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'reddit',
      input: 'programming',
      limit: 20,
    }),
  });

  const redditResult = await redditResponse.json();
  console.log('✅ Reddit job submitted:', {
    jobId: redditResult.jobId,
    statusUrl: redditResult.statusUrl,
    progressUrl: redditResult.progressUrl,
  });

  // Test 3: Check job statuses
  console.log('\n📊 Test 3: Checking job statuses...');
  
  await new Promise(resolve => setTimeout(resolve, 1000));

  const twitterStatus = await fetch(`${BASE_URL}${twitterResult.statusUrl}`);
  const twitterStatusData = await twitterStatus.json();
  console.log('Twitter job status:', {
    state: twitterStatusData.state,
    progress: twitterStatusData.progress,
  });

  const redditStatus = await fetch(`${BASE_URL}${redditResult.statusUrl}`);
  const redditStatusData = await redditStatus.json();
  console.log('Reddit job status:', {
    state: redditStatusData.state,
    progress: redditStatusData.progress,
  });

  // Test 4: List all jobs
  console.log('\n📋 Test 4: Listing all jobs...');
  const jobsResponse = await fetch(`${BASE_URL}/api/jobs`);
  const jobsData = await jobsResponse.json();
  console.log(`Found ${jobsData.jobs.length} jobs:`, jobsData.jobs.map(j => ({
    id: j.id,
    type: j.type,
    state: j.state,
  })));

  // Test 5: SSE Connection (brief test)
  console.log('\n📡 Test 5: Testing SSE connection...');
  console.log(`You can test SSE manually by opening:`);
  console.log(`  ${BASE_URL}${twitterResult.progressUrl}`);
  console.log(`  ${BASE_URL}${redditResult.progressUrl}`);

  console.log('\n✅ All API tests completed!');
  console.log('\n🎯 Next: Open Bull Board to see jobs:');
  console.log(`  ${BASE_URL}/admin/queues`);
}

// Run tests
testQueueAPI().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
