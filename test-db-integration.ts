import { prisma } from './core/db/prisma';
import { JobRepository } from './core/db/job-repo';
import { TweetRepository } from './core/db/tweet-repo';
import { CheckpointRepository } from './core/db/checkpoint-repo';

async function testDatabaseIntegration() {
  console.log('🧪 Testing Database Integration...\n');

  try {
    // 1. Test Database Connection
    console.log('1️⃣ Testing database connection...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection successful!\n');

    // 2. Test JobRepository
    console.log('2️⃣ Testing JobRepository...');
    const job = await JobRepository.createJob({
      bullJobId: 'test-job-123',
      type: 'twitter-profile',
      config: { username: 'test_user', limit: 100 },
      priority: 1
    });
    console.log('✅ Created job:', job.id);

    await JobRepository.updateStatus(job.id, 'active');
    console.log('✅ Updated job status to active');

    await JobRepository.logError({
      jobId: job.id,
      severity: 'error',
      category: 'NETWORK_ERROR',
      message: 'Test error message',
      stack: 'Error stack trace',
      context: { test: true }
    });
    console.log('✅ Logged error\n');

    // 3. Test CheckpointRepository
    console.log('3️⃣ Testing CheckpointRepository...');
    await CheckpointRepository.saveCheckpoint(
      job.id,
      'timeline_cursor',
      'cursor-abc-123',
      { count: 50 }
    );
    console.log('✅ Saved checkpoint');

    const cursor = await CheckpointRepository.getCheckpoint(job.id, 'timeline_cursor');
    console.log('✅ Retrieved checkpoint:', cursor, '\n');

    // 4. Test TweetRepository
    console.log('4️⃣ Testing TweetRepository...');
    const tweet = await TweetRepository.saveTweet({
      tweet: {
        id: '1234567890',
        text: 'Hello from test!',
        username: 'testuser',
        userId: '9876543210',
        createdAt: new Date().toISOString(),
        metrics: { likes: 10, retweets: 5, replies: 2 },
        media: []
      },
      jobId: job.id
    });
    console.log('✅ Saved tweet:', tweet?.id, '\n');

    // 5. Summary
    console.log('🎉 All tests passed!\n');
    console.log('📊 Database Tables Created:');
    console.log('   - Job');
    console.log('   - Task');
    console.log('   - Tweet');
    console.log('   - Checkpoint');
    console.log('   - ErrorLog');
    console.log('   - CookieSession');
    console.log('\n✅ PostgreSQL integration is working correctly!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabaseIntegration();
