/**
 * @deprecated This file is DEPRECATED and should not be used.
 *
 * This file contains the old algorithm-based approach to generate Transaction IDs,
 * which has been proven ineffective due to Twitter's constant algorithm updates.
 *
 * **Current Architecture:**
 * - SearchTimeline requests: Use passive interception mode via `xclid-puppeteer.ts`
 * - Other API requests: Use direct Axios calls (for UserTweets, UserByScreenName, etc.)
 *
 * **Why this is deprecated:**
 * - The encryption algorithm reverse-engineering approach is unreliable
 * - Twitter frequently updates their algorithm, making this approach obsolete
 * - Passive interception mode (xclid-puppeteer.ts) is the proven stable solution
 *
 * **DO NOT USE THIS FILE** - It may cause 404 errors and other failures.
 */

import crypto from 'node:crypto';

import axios, { AxiosRequestConfig } from 'axios';

import { HttpsProxyAgent } from 'https-proxy-agent';

import { ScraperErrors } from './errors';

import { Proxy } from './proxy-manager';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

// Regex to find animation indices in the JS file
const INDICES_REGEX = /\((\w+)\s*\[\s*(\d+)\s*\]\s*,\s*16\)/g;

// Fallback regex for different minification styles
const INDICES_REGEX_ALT = /\.([a-zA-Z0-9_$]+)\[(\d+)\]\s*%\s*16/g;

function interpolate(from: number[], to: number[], f: number): number[] {
  if (from.length !== to.length) return from;
  return from.map((a, i) => a * (1 - f) + to[i] * f);
}

function getRotationMatrix(rotation: number): number[] {
  const rad = (rotation * Math.PI) / 180;
  return [Math.cos(rad), -Math.sin(rad), Math.sin(rad), Math.cos(rad)];
}

function solve(value: number, minVal: number, maxVal: number, rounding: boolean): number {
  const result = (value * (maxVal - minVal)) / 255 + minVal;
  return rounding ? Math.floor(result) : Math.round(result * 100) / 100;
}

function floatToHex(x: number): string {
  const intPart = Math.floor(x);
  let quotient = intPart;
  let remainder = 0;
  const result: string[] = [];

  while (quotient > 0) {
    quotient = Math.floor(x / 16);
    remainder = Math.floor(x - quotient * 16);
    result.unshift(remainder > 9 ? String.fromCharCode(remainder + 55) : remainder.toString());
    x = quotient;
  }

  const fraction = x - Math.floor(x);
  if (fraction === 0) return result.join('') || '0';
  result.push('.');

  let frac = fraction;
  let guard = 0;
  while (frac > 0 && guard < 8) {
    frac *= 16;
    const integer = Math.floor(frac);
    frac -= integer;
    result.push(integer > 9 ? String.fromCharCode(integer + 55) : integer.toString());
    guard++;
  }

  return result.join('');
}

class Cubic {
  constructor(private curves: number[]) {}

  private calculate(a: number, b: number, m: number): number {
    return 3 * a * (1 - m) * (1 - m) * m + 3 * b * (1 - m) * m * m + m * m * m;
  }

  getValue(time: number): number {
    let start = 0;
    let end = 1;
    let mid = 0;
    let startGradient = 0;
    let endGradient = 0;

    if (time <= 0) {
      if (this.curves[0] > 0) {
        startGradient = this.curves[1] / this.curves[0];
      } else if (this.curves[1] === 0 && this.curves[2] > 0) {
        startGradient = this.curves[3] / this.curves[2];
      }
      return startGradient * time;
    }

    if (time >= 1) {
      if (this.curves[2] < 1) {
        endGradient = (this.curves[3] - 1) / (this.curves[2] - 1);
      } else if (this.curves[2] === 1 && this.curves[0] < 1) {
        endGradient = (this.curves[1] - 1) / (this.curves[0] - 1);
      }
      return 1 + endGradient * (time - 1);
    }

    while (start < end) {
      mid = (start + end) / 2;
      const xEst = this.calculate(this.curves[0], this.curves[2], mid);
      if (Math.abs(time - xEst) < 0.00001) {
        return this.calculate(this.curves[1], this.curves[3], mid);
      }
      if (xEst < time) {
        start = mid;
      } else {
        end = mid;
      }
    }
    return this.calculate(this.curves[1], this.curves[3], mid);
  }
}

// --- Main Logic ---

async function getPageText(
  url: string,
  headers: Record<string, string>,
  proxy?: Proxy,
): Promise<string> {
  const config: AxiosRequestConfig = {
    headers,
    responseType: 'text',
    validateStatus: () => true,
  };

  if (proxy) {
    let proxyUrl = `http://${proxy.host}:${proxy.port}`;
    if (proxy.username && proxy.password) {
      proxyUrl = `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
    }
    const agent = new HttpsProxyAgent(proxyUrl);
    config.httpsAgent = agent;
    config.httpAgent = agent;
    config.proxy = false;
  } else {
    config.proxy = false;
  }

  const response = await axios.get(url, config);
  return response.data;
}

function extractVkBytes(html: string): number[] {
  const match = html.match(/twitter-site-verification" content="([^"]+)"/);
  if (!match) {
    // Fallback: try to find it in window.__INITIAL_STATE__ or other places if meta tag missing
    // But usually it is in meta tag.
    console.warn('[XClIdGen] Could not find twitter-site-verification meta tag');
    // Return a dummy or handle error. For now throw to retry.
    throw ScraperErrors.dataExtractionFailed('Could not find twitter-site-verification meta');
  }
  return Array.from(Buffer.from(match[1], 'base64'));
}

/**
 * Robustly find the ondemand.s script URL using Regex instead of JSON parsing
 */
function getOndemandScriptUrl(html: string): string {
  // Pattern 1: Look for the mapping object structure {...,"ondemand.s":"hash",...}
  // This handles both quoted "ondemand.s" and unquoted ondemand.s
  const match1 = html.match(/["']?ondemand\.s["']?:["']([a-zA-Z0-9]+)["']/);
  if (match1 && match1[1]) {
    return `https://abs.twimg.com/responsive-web/client-web/ondemand.s.${match1[1]}a.js`;
  }

  // Pattern 2: Look for array based loading
  const match2 = html.match(/\+\s*["']ondemand\.s\.["']\s*\+\s*["']([a-zA-Z0-9]+)["']/);
  if (match2 && match2[1]) {
    return `https://abs.twimg.com/responsive-web/client-web/ondemand.s.${match2[1]}a.js`;
  }

  throw ScraperErrors.dataExtractionFailed('Could not locate ondemand.s script hash');
}

async function parseAnimIdx(html: string, proxy?: Proxy): Promise<number[]> {
  const scriptUrl = getOndemandScriptUrl(html);
  console.log(`[XClIdGen] Found script URL: ${scriptUrl}`);

  const config: AxiosRequestConfig = { responseType: 'text', validateStatus: () => true };
  if (proxy) {
    let proxyUrl = `http://${proxy.host}:${proxy.port}`;
    if (proxy.username && proxy.password) {
      proxyUrl = `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
    }
    const agent = new HttpsProxyAgent(proxyUrl);
    config.httpsAgent = agent;
    config.httpAgent = agent;
    config.proxy = false;
  } else {
    config.proxy = false;
  }

  const scriptResp = await axios.get(scriptUrl, config);
  if (scriptResp.status !== 200) {
    throw ScraperErrors.apiRequestFailed(`Failed to load script`, scriptResp.status);
  }

  const scriptText = scriptResp.data;

  // Try primary regex
  let matches = [...scriptText.matchAll(INDICES_REGEX)].map((m) => Number(m[2]));

  // Try fallback regex if first failed
  if (!matches.length) {
     matches = [...scriptText.matchAll(INDICES_REGEX_ALT)].map((m) => Number(m[2]));
  }

  if (!matches.length) {
    console.warn('[XClIdGen] Failed to match animation indices. Script content preview:', scriptText.substring(0, 200));
    throw ScraperErrors.dataExtractionFailed('No animation indices found in script');
  }

  // We need at least 2 indices to work with
  return matches;
}

function parseAnimArr(html: string, vkBytes: number[]): number[][] {
  // Find the SVG containing the loading animation paths
  const svgBlocks = [...html.matchAll(/<svg[^>]*id="loading-x-anim[^"]*"[^>]*>[\s\S]*?<\/svg>/g)];
  if (!svgBlocks.length)
    throw ScraperErrors.dataExtractionFailed("Couldn't get loading-x-anim svg");

  const pathDs: string[] = [];

  // Extract all path 'd' attributes
  for (const block of svgBlocks) {
    const paths = [...block[0].matchAll(/<path[^>]*d="([^"]+)"[^>]*>/g)].map((m) => m[1]);
    if (paths.length >= 2) {
      // Usually the relevant paths are the second ones in these specific SVGs
      pathDs.push(paths[1]);
    }
  }

  if (!pathDs.length) throw ScraperErrors.dataExtractionFailed("Couldn't parse animation paths");

  // Determine which path to use based on vkBytes
  const idx = vkBytes[5] % pathDs.length;
  const chosen = pathDs[idx];

  // Parse the 'd' attribute (M x y C x y x y x y ...)
  return chosen
    .slice(9) // Remove "M x y C " prefix approximately
    .split('C')
    .map((seg) => seg.replace(/[^\d. -]/g, ' ').trim()) // Clean up
    .map((seg) => seg.split(/\s+/).map(Number)) // Convert to numbers
    .filter(arr => arr.length > 0 && !isNaN(arr[0])); // Filter bad parses
}

async function loadKeys(
  html: string,
  proxy?: Proxy,
): Promise<{ vkBytes: number[]; animKey: string }> {
  // 1. Extract Verification Bytes
  const vkBytes = extractVkBytes(html);

  // 2. Parse Animation Array from SVG
  const animArr = parseAnimArr(html, vkBytes);

  // 3. Parse Animation Indices from ondemand.s script
  const animIdx = await parseAnimIdx(html, proxy);
  // 4. Calculate Frame Time
  let frameTime = 1;
  // Use safe access
  const safeAnimIdx = animIdx.length > 1 ? animIdx.slice(1) : animIdx;

  for (const x of safeAnimIdx) {
    // Ensure x is within bounds of vkBytes
    const val = vkBytes[x % vkBytes.length];
    frameTime *= (val % 16);
  }

  // 5. Calculate Frame Index
  const idx0 = animIdx.length > 0 ? animIdx[0] : 0;
  const frameIdx = vkBytes[idx0 % vkBytes.length] % 16;

  // 6. Get Frame Row
  const frameRow = animArr[frameIdx % animArr.length];

  // 7. Calculate Frame Duration
  const frameDur = frameTime / 4096;
  // 8. Calculate Final Key
  const animKey = calcAnimKey(frameRow, frameDur);
  return { vkBytes, animKey };
}

function calcAnimKey(frames: number[], targetTime: number): string {
  if (!frames || frames.length < 8) return "";

  const fromColor = [...frames.slice(0, 3), 1];
  const toColor = [...frames.slice(3, 6), 1];
  const fromRotation = [0];
  const toRotation = [solve(frames[6], 60, 360, true)];
  const curves = frames.slice(7).map((x, i) => solve(x, i % 2 ? -1 : 0, 1, false));
  const val = new Cubic(curves).getValue(targetTime);
  const color = interpolate(fromColor, toColor, val).map((v) => (v > 0 ? v : 0));
  const rotation = interpolate(fromRotation, toRotation, val);
  const matrix = getRotationMatrix(rotation[0]);

  const strArr = color.slice(0, -1).map((v) => Math.round(v).toString(16));
  for (const value of matrix) {
    const rounded = Math.abs(Math.round(value * 100) / 100);
    const hex = floatToHex(rounded);
    strArr.push(hex.startsWith('.') ? `0${hex}` : hex || '0');
  }
  strArr.push('0', '0');
  return strArr.join('').replace(/[.-]/g, '');
}

export class XClIdGen {
  private constructor(
    private vkBytes: number[],
    private animKey: string,
  ) {
    this.usedPairs = new Set<string>();
  }

  private usedPairs: Set<string> = new Set();
  private lastTimestamp: number = 0;
  private sequenceCounter: number = 0;

  static async create(
    cookiesHeader: string,
    userAgent: string = DEFAULT_USER_AGENT,
    proxy?: Proxy,
  ): Promise<XClIdGen> {
    const headers = {
      'user-agent': userAgent,
      cookie: cookiesHeader,
    };
    console.log('[XClIdGen] Fetching main page...');
    const html = await getPageText('https://x.com/tesla', headers, proxy);
    console.log('[XClIdGen] Page fetched, calculating keys...');
    const { vkBytes, animKey } = await loadKeys(html, proxy);
    console.log('[XClIdGen] Keys calculated successfully');
    return new XClIdGen(vkBytes, animKey);
  }

  calc(method: string, path: string): string {
    const ts = Math.floor((Date.now() - 1682924400000) / 1000);
    const tsBytes = [0, 1, 2, 3].map((i) => (ts >> (i * 8)) & 0xff);
    const dkw = 'obfiowerehiring';
    const drn = 3;
    const payload = `${method.toUpperCase()}!${path}!${ts}${dkw}${this.animKey}`;
    const hash = crypto.createHash('sha256').update(payload).digest();
    const merged = [...this.vkBytes, ...tsBytes, ...hash.slice(0, 16), drn];

    // Ensure unique (timestamp, random_num) pairs
    let num: number;
    let pairKey: string;
    let attempts = 0;
    const maxAttempts = 1000;

    do {
      num = Math.floor(Math.random() * 256);
      pairKey = `${ts}-${num}`;
      attempts++;

      if (ts !== this.lastTimestamp) {
        this.usedPairs.clear();
        this.sequenceCounter = 0;
        this.lastTimestamp = ts;
      }

      if (attempts >= maxAttempts) {
        num = (this.sequenceCounter % 256);
        this.sequenceCounter++;
        pairKey = `${ts}-${num}-seq${this.sequenceCounter}`;
        break;
      }
    } while (this.usedPairs.has(pairKey));

    this.usedPairs.add(pairKey);

    if (this.usedPairs.size > 1000) {
      const entries = Array.from(this.usedPairs);
      this.usedPairs = new Set(entries.slice(-500));
    }

    const xored = Uint8Array.from([num, ...merged.map((x) => x ^ num)]);
    return Buffer.from(xored).toString('base64').replace(/=+$/, '');
  }
}
