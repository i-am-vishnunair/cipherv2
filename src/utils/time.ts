// src/utils/time.ts - Time formatting utilities

/**
 * Format a delay in milliseconds as human-readable string.
 * Examples: "3m 12s", "20m 0s", "1h 0m 0s", "45s"
 */
export function formatDelay(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return 'N/A – publish time unavailable';
  if (ms < 0) return '0s (pre-detection)';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Determine delay flag and reason
 */
export function classifyDelay(delayMs: number | null): { flag: string; reason: string | null } {
  if (delayMs === null) {
    return { flag: 'unknown_publish_time', reason: 'No publish time available from any source' };
  }
  if (delayMs <= 300000) { // 5 minutes
    return { flag: 'ok', reason: null };
  }
  // Over 5 minutes - try to provide a reason
  let reason = 'Polling interval';
  if (delayMs > 1800000) reason = 'Sitemap lastmod or feed cache lag';
  else if (delayMs > 600000) reason = 'Feed cache lag or CDN delay';
  return { flag: 'over_5min', reason };
}

/**
 * Get current time as ISO string with millisecond precision
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Calculate delay between two ISO timestamps in milliseconds
 */
export function calcDelayMs(publishedAt: string | null, discoveredAt: string): number | null {
  if (!publishedAt) return null;
  try {
    const pub = new Date(publishedAt).getTime();
    const disc = new Date(discoveredAt).getTime();
    if (isNaN(pub) || isNaN(disc)) return null;
    return Math.max(0, disc - pub);
  } catch {
    return null;
  }
}

/**
 * Add jitter to a value (±20%)
 */
export function addJitter(value: number, factor = 0.2): number {
  const jitter = value * factor * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(value + jitter));
}
