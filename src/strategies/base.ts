// src/strategies/base.ts - Strategy interface and base class
import { CompetitorRow } from '../db/repositories.js';

export interface DiscoveredItem {
  url: string;
  title?: string;
  publishedAt?: string;
  publishedAtSource?: string; // 'feed', 'json-ld', 'sitemap-lastmod', 'meta', 'wp-api', 'unknown'
  modifiedAt?: string;
  author?: string;
  categories?: string[];
  tags?: string[];
  featuredImage?: string;
  contentSnippet?: string;
}

export interface CheckResult {
  discoveredItems: DiscoveredItem[];
  httpStatus?: number;
  responseBytes?: number;
  durationMs: number;
  error?: string;
  notModified?: boolean;
  etag?: string;
  lastModified?: string;
}

export interface Strategy {
  name: string;
  check(competitor: CompetitorRow): Promise<CheckResult>;
}

export abstract class BaseStrategy implements Strategy {
  abstract name: string;
  abstract check(competitor: CompetitorRow): Promise<CheckResult>;
}
