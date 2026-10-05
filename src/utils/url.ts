// src/utils/url.ts - URL normalization and deduplication utilities

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid',
  'ref', 'source', 'share', 'sms', 'hss_channel',
  '_ga', '_gl', 'yclid', 'twclid', 'li_fat_id',
]);

/**
 * Normalize a URL for deduplication:
 * - Lowercase host
 * - Strip tracking params, fragments, trailing slashes
 * - Resolve protocol-relative URLs
 */
export function normalizeUrl(urlStr: string, baseUrl?: string): string {
  try {
    let url: URL;
    if (baseUrl) {
      url = new URL(urlStr, baseUrl);
    } else {
      url = new URL(urlStr);
    }

    // Lowercase the host
    url.hostname = url.hostname.toLowerCase();

    // Remove tracking parameters
    const keysToDelete: string[] = [];
    url.searchParams.forEach((_, key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(k => url.searchParams.delete(k));

    // Sort remaining params for consistency
    url.searchParams.sort();

    // Remove fragment
    url.hash = '';

    // Get the URL string
    let normalized = url.toString();

    // Remove trailing slash (but keep if it's just the root)
    if (normalized.endsWith('/') && url.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    return urlStr;
  }
}

/**
 * Extract the hostname from a URL
 */
export function getHostname(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.toLowerCase();
  } catch {
    return urlStr;
  }
}

/**
 * Check if a URL looks like a blog article URL
 */
export function looksLikeArticleUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const path = url.pathname.toLowerCase();

    // Too short paths are unlikely to be articles
    if (path.split('/').filter(Boolean).length < 2) return false;

    // Common article patterns
    const articlePatterns = [
      /\/\d{4}\/\d{2}\//,           // /2024/01/slug
      /\/blog\/.+/,                   // /blog/slug
      /\/posts?\/.+/,                 // /post/slug
      /\/articles?\/.+/,              // /article/slug
      /\/news\/.+/,                   // /news/slug
      /\/(insights?|resources?|updates?)\/.+/,
    ];

    return articlePatterns.some(p => p.test(path));
  } catch {
    return false;
  }
}

/**
 * Extract the base URL (scheme + host)
 */
export function getBaseUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    return `${url.protocol}//${url.host}`;
  } catch {
    return urlStr;
  }
}

/**
 * Resolve a potentially relative URL against a base
 */
export function resolveUrl(relative: string, base: string): string {
  try {
    return new URL(relative, base).toString();
  } catch {
    return relative;
  }
}

/**
 * Check if two URLs are the same domain
 */
export function isSameDomain(url1: string, url2: string): boolean {
  try {
    return new URL(url1).hostname.toLowerCase() === new URL(url2).hostname.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Simple title similarity check (Jaccard similarity on words)
 */
export function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  return intersection / (wordsA.size + wordsB.size - intersection);
}

/**
 * Create a content hash from text
 */
export function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
