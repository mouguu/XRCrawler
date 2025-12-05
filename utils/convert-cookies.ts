#!/usr/bin/env node
/**
 * Converts Netscape cookie file format to JSON format for Puppeteer.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface CookieParam {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expires?: number;
}

/**
 * Parses a Netscape cookie file line.
 * Based on spec: http://curl.haxx.se/rfc/cookie_spec.html
 * Handles potential variations in column count.
 */
export function parseNetscapeCookieLine(line: string): CookieParam | null {
  if (!line || line.startsWith('#')) {
    return null; // Skip comments and empty lines
  }

  const parts = line.trim().split('\t');
  if (parts.length < 7) {
    return null; // Needs at least 7 columns
  }

  const [domain, _includeSubdomainsStr, cookiePath, secureStr, expiresTimestampStr, name, value] =
    parts;
  const isSecure = secureStr.toUpperCase() === 'TRUE';
  const expiresTimestamp = parseInt(expiresTimestampStr, 10);

  const cookie: CookieParam = {
    name,
    value,
    domain: domain, // keep as-is (leading dot OK)
    path: cookiePath,
    secure: isSecure,
    httpOnly: false,
  };

  // Handle expiration
  if (!Number.isNaN(expiresTimestamp) && expiresTimestamp > 0) {
    cookie.expires = expiresTimestamp;
  } else {
    cookie.expires = -1; // Puppeteer uses -1 for session cookies
  }

  return cookie;
}

/**
 * Converts a Netscape cookie file to Puppeteer-compatible JSON.
 * @param inputFile Path to the Netscape cookie file.
 * @param outputFile Path to save the JSON output file.
 */
export async function convertCookieFile(inputFile: string, outputFile: string): Promise<void> {
  console.log(`Converting ${inputFile} to ${outputFile}...`);
  try {
    const fileContent = await fs.readFile(inputFile, 'utf-8');
    const lines = fileContent.split('\n');
    const cookies = lines.map(parseNetscapeCookieLine).filter((c): c is CookieParam => Boolean(c));

    if (cookies.length === 0) {
      console.warn('No valid cookies found in the input file.');
      return;
    }

    const outputData = {
      cookies,
    };

    await fs.writeFile(outputFile, JSON.stringify(outputData, null, 2), 'utf-8');
    console.log(`✅ Successfully converted ${cookies.length} cookies to ${outputFile}`);
  } catch (error: any) {
    console.error(`Error converting cookie file: ${error.message}`);
    if (error.code === 'ENOENT') {
      console.error(`Input file not found: ${inputFile}`);
    }
  }
}

// --- Main execution ---
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: node convert-cookies.js <input_netscape_file> <output_json_file>');
    process.exit(1);
  }

  const [inputFile, outputFile] = args;

  convertCookieFile(path.resolve(inputFile), path.resolve(outputFile));
}
