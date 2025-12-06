/**
 * Content Processor (Elite Core)
 *
 * Consolidates data cleaning and normalization for all platforms.
 * Handles:
 * - Tweet cleaning & deduplication (WASM optimized)
 * - Reddit payload parsing (WASM optimized)
 * - URL normalization (WASM optimized)
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RawTweetData, Tweet, normalizeRawTweet } from '../types/tweet-definitions';

// ==========================================
// 1. Common Types
// ==========================================

export interface ProcessStats {
  total: number;
  deduped: number;
  dropped: number;
  [key: string]: number;
}

export interface ProcessingResult<T> {
  data: T;
  stats: ProcessStats;
  usedWasm: boolean;
  wasmError?: string;
}

// ==========================================
// 2. WASM Loader
// ==========================================

async function resolveWasm(name: string, functionName?: string): Promise<any> {
    const candidates = [
        path.resolve(__dirname, '..', 'wasm', name, 'pkg', `${name.replace('-', '_')}.js`),
        path.resolve(__dirname, '..', '..', 'wasm', name, 'pkg', `${name.replace('-', '_')}.js`),
        path.resolve(process.cwd(), 'wasm', name, 'pkg', `${name.replace('-', '_')}.js`),
    ];

    for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) continue;
        try {
            const module = await import(candidate);
            if (functionName) {
                 const fn = (module as any)[functionName] || (module as any).default?.[functionName];
                 if (typeof fn === 'function') return module;
            } else {
                return module;
            }
        } catch {}
    }
    return null;
}

// ==========================================
// 3. Tweet Processing
// ==========================================

export interface CleanTweetsResult {
  tweets: Tweet[];
  stats: ProcessStats & { added: number; truncated: number };
  usedWasm: boolean;
  wasmError?: string;
}

function coerceTweet(input: any): Tweet | null {
  if (!input || typeof input !== 'object') return null;
  // Already normalized
  if (typeof input.id === 'string' && typeof input.url === 'string' && typeof input.text === 'string') {
    return input as Tweet;
  }
  // Raw data
  if (typeof input.author === 'string' && typeof input.time === 'string') {
    try {
      return normalizeRawTweet(input as RawTweetData);
    } catch { return null; }
  }
  return null;
}

function sortTweetsByTime(tweets: Tweet[]): Tweet[] {
    return [...tweets].sort((a, b) => {
        const aMs = a.time ? new Date(a.time).getTime() : 0;
        const bMs = b.time ? new Date(b.time).getTime() : 0;
        return bMs - aMs;
    });
}

export async function processTweets(
  existing: Tweet[],
  incoming: any[],
  limit?: number
): Promise<CleanTweetsResult> {
    const wasm = await resolveWasm('tweet-cleaner', 'clean_and_merge');
    let wasmError: string | undefined;

    if (wasm) {
        try {
             // Access export directly or via default
            const cleaner = (wasm as any).clean_and_merge ? (wasm as any) : (wasm as any).default;
            const res = cleaner.clean_and_merge(existing, incoming, limit);
            return {
                tweets: sortTweetsByTime(res.tweets),
                stats: res.stats,
                usedWasm: true
            };
        } catch (e: any) { wasmError = e.message; }
    }

    // Fallback
    const map = new Map<string, Tweet>();
    let dropped = 0, deduped = 0, added = 0;

    for (const t of existing) {
        const n = coerceTweet(t);
        if(!n) { dropped++; continue; }
        map.set(n.id, n);
    }
    for (const t of incoming) {
        const n = coerceTweet(t);
        if(!n) { dropped++; continue; }
        if(map.has(n.id)) deduped++; else added++;
        map.set(n.id, n);
    }
    
    let tweets = sortTweetsByTime(Array.from(map.values()));
    let truncated = 0;
    
    if (limit && limit > 0 && tweets.length > limit) {
        truncated = tweets.length - limit;
        tweets = tweets.slice(0, limit);
    }

    return {
        tweets,
        stats: { total: tweets.length, added, deduped, dropped, truncated },
        usedWasm: false,
        wasmError
    };
}

// ==========================================
// 4. Reddit Processing
// ==========================================

export interface NormalizedRedditPost {
  id: string;
  title?: string | null;
  author?: string | null;
  url?: string | null;
  selfText?: string | null;
  subreddit?: string | null;
  score?: number | null;
  upvoteRatio?: number | null;
  numComments?: number | null;
  createdUtc?: number | null;
  permalink?: string | null;
  flair?: string | null;
  over18?: boolean | null;
  stickied?: boolean | null;
}

export async function processReddit(payload: any): Promise<ProcessingResult<NormalizedRedditPost[]>> {
    const wasm = await resolveWasm('reddit-cleaner', 'parse_reddit_payload');
    let wasmError: string | undefined;

    if (wasm) {
         try {
             const parser = (wasm as any).parse_reddit_payload ? (wasm as any) : (wasm as any).default;
             const res = parser.parse_reddit_payload(payload);
             return { data: res.posts, stats: res.stats, usedWasm: true };
         } catch(e: any) { wasmError = e.message; }
    }

    // Fallback
   const posts: NormalizedRedditPost[] = [];
   const seen = new Set<string>();
   let dropped = 0, deduped = 0;

   const walk = (node: any) => {
       if(!node) return;
       if(Array.isArray(node)) return node.forEach(walk);
       
       const children = node?.data?.children;
       if(Array.isArray(children)) {
           for(const c of children) {
               const d = c?.data || c;
               const id = d?.id || d?.name;
               if(!id || typeof id !== 'string') { dropped++; continue; }
               if(seen.has(id)) { deduped++; continue; }
               seen.add(id);
               posts.push({
                   id,
                   title: d?.title ?? null,
                   author: d?.author ?? null,
                   url: d?.url ?? d?.permalink ?? null,
                   selfText: d?.selftext ?? null,
                   subreddit: d?.subreddit ?? null,
                   score: d?.score,
                   upvoteRatio: d?.upvote_ratio,
                   numComments: d?.num_comments,
                   createdUtc: d?.created_utc,
                   permalink: d?.permalink,
                   flair: d?.link_flair_text,
                   over18: d?.over_18,
                   stickied: d?.stickied
               });
           }
       }
   };
   
   walk(payload);
   
   return {
       data: posts,
       stats: { total: posts.length, deduped, dropped },
       usedWasm: false,
       wasmError
   };
}

// ==========================================
// 5. URL Normalization
// ==========================================

export interface UrlStats {
    original: number;
    unique: number;
    duplicates: number;
}

function normalizeUrlTS(urlStr: string): string {
    try {
        const url = new URL(urlStr);
        if (url.protocol === 'http:') url.protocol = 'https:';
        
        // Hostname normalization
        const host = url.hostname;
        if (host.includes('twitter.com')) url.hostname = 'x.com';
        if (host.includes('reddit.com')) url.hostname = 'reddit.com';

        // Param cleaning
        const tracking = ['utm_source', 'utm_medium', 'ref', 's', 'fbclid', 'gclid'];
        tracking.forEach(p => url.searchParams.delete(p));
        
        url.hash = '';
        if (url.pathname.endsWith('/') && url.pathname.length > 1) {
            url.pathname = url.pathname.replace(/\/+$/, '');
        }
        return url.toString();
    } catch { return urlStr; }
}

export async function normalizeUrl(url: string): Promise<string> {
    const wasm = await resolveWasm('url-normalizer');
    if (wasm) {
        try { 
            const n = new wasm.UrlNormalizer();
            return n.normalize(url);
        } catch {}
    }
    return normalizeUrlTS(url);
}

export async function normalizeUrls(urls: string[]): Promise<ProcessingResult<string[]>> {
    const wasm = await resolveWasm('url-normalizer');
    if (wasm) {
        try {
            const n = new wasm.UrlNormalizer();
            const res = n.normalize_batch_with_stats(urls);
            return {
                data: res.urls,
                stats: { total: res.original, deduped: 0, dropped: 0, unique: res.unique, duplicates: res.duplicates } as any,
                usedWasm: true
            };
        } catch {}
    }

    // Fallback
    const seen = new Set<string>();
    const result: string[] = [];
    for (const u of urls) {
        const norm = normalizeUrlTS(u);
        if (!seen.has(norm)) {
            seen.add(norm);
            result.push(norm);
        }
    }
    return {
        data: result,
        stats: { 
            total: urls.length, 
            unique: result.length, 
            duplicates: urls.length - result.length, 
            deduped: urls.length - result.length, 
            dropped: 0 
        },
        usedWasm: false
    };
}

// Sync version (TS only) for non-async contexts
export function normalizeUrlSync(url: string): string {
    return normalizeUrlTS(url);
}
