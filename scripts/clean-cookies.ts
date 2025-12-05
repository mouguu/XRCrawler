#!/usr/bin/env node

/**
 * Cookie Cleaner - Automatically remove expired cookies from JSON files
 * Usage: node scripts/clean-cookies.js
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COOKIES_DIR = path.join(__dirname, '../data/cookies');

interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

function cleanCookieFile(filePath: string): void {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(raw);

    // Handle both array and object wrapper
    let cookies: Cookie[] = [];
    let isWrapped = false;

    if (Array.isArray(json)) {
      cookies = json;
    } else if (json.cookies && Array.isArray(json.cookies)) {
      cookies = json.cookies;
      isWrapped = true;
    } else {
      console.log(`  ⚠️  Skipping ${path.basename(filePath)}: Unknown format`);
      return;
    }

    const now = Date.now() / 1000; // Convert to seconds
    const validCookies = cookies.filter((cookie) => {
      if (cookie.expires && cookie.expires < now) {
        console.log(
          `  ⚠️  Removing expired: ${cookie.name} (expired at ${new Date(cookie.expires * 1000).toISOString()})`,
        );
        return false;
      }
      return true;
    });

    if (validCookies.length < cookies.length) {
      const output = isWrapped ? { ...json, cookies: validCookies } : validCookies;
      fs.writeFileSync(filePath, JSON.stringify(output, null, 2));
      console.log(
        `  ✅ Cleaned: ${path.basename(filePath)} (${cookies.length - validCookies.length} removed)`,
      );
    } else {
      console.log(`  ✓  No expired cookies in ${path.basename(filePath)}`);
    }
  } catch (error: any) {
    console.error(`  ❌ Error processing ${path.basename(filePath)}: ${error.message}`);
  }
}

function main(): void {
  if (!fs.existsSync(COOKIES_DIR)) {
    console.log(`Cookie directory not found: ${COOKIES_DIR}`);
    return;
  }

  console.log('🧹 Cleaning expired cookies...\n');

  const files = fs
    .readdirSync(COOKIES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(COOKIES_DIR, file));

  if (files.length === 0) {
    console.log('No cookie files found.');
    return;
  }

  files.forEach(cleanCookieFile);

  console.log('\n✨ Cookie cleanup complete!');
}

main();
