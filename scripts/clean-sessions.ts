#!/usr/bin/env bun
/**
 * Clean Sessions Script
 *
 * This script helps you manage and clean up duplicate or unwanted sessions
 * from the database.
 *
 * Usage:
 *   bun run scripts/clean-sessions.ts
 *   bun run scripts/clean-sessions.ts --keep account1,account2,account3,account4
 *   bun run scripts/clean-sessions.ts --delete Shirone,Jeanne_Howard
 */

import { prisma } from '../core/db/repositories';

interface SessionInfo {
  id: string;
  username: string;
  label: string;
  platform: string;
  isValid: boolean;
  errorCount: number;
  lastUsed: Date;
  cookieCount: number;
}

async function getAllSessions(): Promise<SessionInfo[]> {
  const dbSessions = await prisma.cookieSession.findMany({
    orderBy: { lastUsed: 'desc' }
  });

  return dbSessions.map(session => {
    let cookieCount = 0;
    if (session.cookies) {
      if (Array.isArray(session.cookies)) {
        cookieCount = session.cookies.length;
      } else if (typeof session.cookies === 'object' && session.cookies !== null) {
        const cookiesArray = (session.cookies as any).cookies;
        cookieCount = Array.isArray(cookiesArray) ? cookiesArray.length : 0;
      }
    }

    return {
      id: session.id,
      username: session.username,
      label: session.label,
      platform: session.platform,
      isValid: session.isValid,
      errorCount: session.errorCount,
      lastUsed: session.lastUsed,
      cookieCount
    };
  });
}

async function deleteSessions(sessionIds: string[]): Promise<number> {
  const result = await prisma.cookieSession.deleteMany({
    where: {
      id: { in: sessionIds }
    }
  });
  return result.count;
}

async function deleteSessionsByUsername(usernames: string[]): Promise<number> {
  const result = await prisma.cookieSession.deleteMany({
    where: {
      username: { in: usernames },
      platform: 'twitter'
    }
  });
  return result.count;
}

async function main() {
  const args = process.argv.slice(2);
  const keepFlag = args.find(arg => arg.startsWith('--keep='));
  const deleteFlag = args.find(arg => arg.startsWith('--delete='));
  const interactive = !keepFlag && !deleteFlag;

  console.log('🔍 Fetching all sessions from database...\n');

  const sessions = await getAllSessions();

  if (sessions.length === 0) {
    console.log('✅ No sessions found in database.');
    return;
  }

  console.log(`📊 Found ${sessions.length} session(s):\n`);
  console.log('┌─────┬─────────────────────┬──────────────┬─────────┬─────────────┬────────────┐');
  console.log('│ IDX │ Username/Label       │ Platform     │ Valid   │ Cookie Count│ Last Used  │');
  console.log('├─────┼─────────────────────┼──────────────┼─────────┼─────────────┼────────────┤');

  sessions.forEach((session, idx) => {
    const idxStr = String(idx + 1).padEnd(3);
    const username = (session.label || session.username).padEnd(19);
    const platform = session.platform.padEnd(12);
    const valid = (session.isValid ? '✓' : '✗').padEnd(7);
    const cookieCount = String(session.cookieCount).padEnd(11);
    const lastUsed = session.lastUsed.toISOString().split('T')[0];

    console.log(`│ ${idxStr} │ ${username} │ ${platform} │ ${valid} │ ${cookieCount} │ ${lastUsed} │`);
  });

  console.log('└─────┴─────────────────────┴──────────────┴─────────┴─────────────┴────────────┘\n');

  if (keepFlag) {
    // Keep only specified sessions
    const keepUsernames = keepFlag.split('=')[1].split(',').map(u => u.trim());
    const toDelete = sessions.filter(s => !keepUsernames.includes(s.username) && !keepUsernames.includes(s.label));

    if (toDelete.length === 0) {
      console.log('✅ No sessions to delete. All specified sessions are already in the database.');
      return;
    }

    console.log(`🗑️  Will delete ${toDelete.length} session(s):`);
    toDelete.forEach(s => console.log(`   - ${s.label || s.username} (${s.username})`));
    console.log('');

    const deleted = await deleteSessions(toDelete.map(s => s.id));
    console.log(`✅ Deleted ${deleted} session(s).`);
    console.log(`✅ Kept ${sessions.length - deleted} session(s).`);

  } else if (deleteFlag) {
    // Delete specified sessions
    const deleteUsernames = deleteFlag.split('=')[1].split(',').map(u => u.trim());
    const toDelete = sessions.filter(s =>
      deleteUsernames.includes(s.username) || deleteUsernames.includes(s.label)
    );

    if (toDelete.length === 0) {
      console.log('❌ No matching sessions found to delete.');
      return;
    }

    console.log(`🗑️  Will delete ${toDelete.length} session(s):`);
    toDelete.forEach(s => console.log(`   - ${s.label || s.username} (${s.username})`));
    console.log('');

    const deleted = await deleteSessions(toDelete.map(s => s.id));
    console.log(`✅ Deleted ${deleted} session(s).`);

  } else {
    // Interactive mode
    console.log('💡 Usage options:');
    console.log('   1. Keep only specific sessions:');
    console.log('      bun run scripts/clean-sessions.ts --keep=account1,account2,account3,account4\n');
    console.log('   2. Delete specific sessions:');
    console.log('      bun run scripts/clean-sessions.ts --delete=Shirone,Jeanne_Howard\n');
    console.log('   3. Interactive mode (coming soon)');
    console.log('\n⚠️  For safety, use --keep or --delete flags explicitly.');
  }
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

