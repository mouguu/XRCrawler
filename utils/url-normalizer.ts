/**
 * URL Normalizer - Node.js胶水层
 * 优先使用WASM，失败时回退到TypeScript实现
 */

export interface NormalizeResult {
  urls: string[];
  stats: {
    original: number;
    unique: number;
    duplicates: number;
  };
  usedWasm: boolean;
}

let wasmModule: any = null;
let wasmLoadAttempted = false;

/**
 * 尝试加载WASM模块
 */
async function loadWasmModule(): Promise<any> {
  if (wasmLoadAttempted) {
    return wasmModule;
  }

  wasmLoadAttempted = true;

  try {
    // 尝试从编译后的pkg目录加载
    const wasm = await import(
      "../../wasm/url-normalizer/pkg/url_normalizer.js"
    );
    wasmModule = wasm;
    console.log("[url-normalizer] WASM module loaded successfully");
    return wasm;
  } catch (error) {
    console.warn(
      "[url-normalizer] WASM module not available, using TypeScript fallback:",
      error
    );
    return null;
  }
}

/**
 * TypeScript回退实现 - 归一化单个URL
 */
function normalizeUrlTS(urlStr: string): string {
  try {
    const url = new URL(urlStr);

    // 1. 统一协议为 https
    if (url.protocol === "http:") {
      url.protocol = "https:";
    }

    // 2. 规范化域名
    const hostname = url.hostname;
    if (
      hostname === "twitter.com" ||
      hostname === "www.twitter.com" ||
      hostname === "mobile.twitter.com"
    ) {
      url.hostname = "x.com";
    } else if (
      hostname === "www.reddit.com" ||
      hostname === "old.reddit.com" ||
      hostname === "new.reddit.com"
    ) {
      url.hostname = "reddit.com";
    }

    // 3. 移除追踪参数
    const trackingParams = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "msclkid",
      "mc_cid",
      "mc_eid",
      "ref",
      "referrer",
      "source",
      "campaign",
      "s",
      "_ga",
      "_gid",
      "igshid",
      "ncid",
    ]);

    const searchParams = new URLSearchParams(url.search);
    const keysToDelete: string[] = [];
    searchParams.forEach((_, key) => {
      if (trackingParams.has(key)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => searchParams.delete(key));

    // 更新查询字符串
    const newSearch = searchParams.toString();
    url.search = newSearch ? `?${newSearch}` : "";

    // 4. 移除fragment (锚点)
    url.hash = "";

    // 5. 移除尾部斜杠
    if (url.pathname.endsWith("/") && url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.toString();
  } catch (error) {
    // 解析失败，返回原始URL
    return urlStr;
  }
}

/**
 * TypeScript回退实现 - 批量归一化
 */
function normalizeBatchTS(urls: string[]): NormalizeResult {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const url of urls) {
    const normalized = normalizeUrlTS(url);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return {
    urls: result,
    stats: {
      original: urls.length,
      unique: result.length,
      duplicates: urls.length - result.length,
    },
    usedWasm: false,
  };
}

/**
 * 归一化单个URL（优先WASM）
 */
export async function normalizeUrl(url: string): Promise<string> {
  const wasm = await loadWasmModule();

  if (wasm) {
    try {
      const normalizer = new wasm.UrlNormalizer();
      return normalizer.normalize(url);
    } catch (error) {
      console.warn(
        "[url-normalizer] WASM normalize failed, using TS fallback:",
        error
      );
    }
  }

  return normalizeUrlTS(url);
}

/**
 * 批量归一化并去重URL（优先WASM）
 */
export async function normalizeUrls(urls: string[]): Promise<NormalizeResult> {
  const wasm = await loadWasmModule();

  if (wasm) {
    try {
      const normalizer = new wasm.UrlNormalizer();
      const result = normalizer.normalize_batch_with_stats(urls);

      return {
        urls: result.urls,
        stats: {
          original: result.original,
          unique: result.unique,
          duplicates: result.duplicates,
        },
        usedWasm: true,
      };
    } catch (error) {
      console.warn(
        "[url-normalizer] WASM batch normalize failed, using TS fallback:",
        error
      );
    }
  }

  return normalizeBatchTS(urls);
}

/**
 * 同步版本 - 仅TypeScript实现（用于非异步场景）
 */
export function normalizeUrlSync(url: string): string {
  return normalizeUrlTS(url);
}

export function normalizeUrlsSync(urls: string[]): NormalizeResult {
  return normalizeBatchTS(urls);
}
