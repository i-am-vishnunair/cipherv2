// src/strategies/index.ts - Strategy registry
import { Strategy } from './base.js';
import { RssStrategy } from './rss.js';
import { SitemapStrategy } from './sitemap.js';
import { PageStrategy } from './page.js';
import { WpApiStrategy } from './wpapi.js';

const strategyMap: Record<string, () => Strategy> = {
  rss: () => new RssStrategy(),
  sitemap: () => new SitemapStrategy(),
  page: () => new PageStrategy(),
  'wp-api': () => new WpApiStrategy(),
};

export function getStrategy(name: string): Strategy | undefined {
  const factory = strategyMap[name];
  return factory ? factory() : undefined;
}

export function getAllStrategies(): Strategy[] {
  return Object.values(strategyMap).map(f => f());
}

export function getStrategyNames(): string[] {
  return Object.keys(strategyMap);
}

export type { Strategy, CheckResult, DiscoveredItem } from './base.js';
