// src/strategies/sitemap.ts - XML Sitemap polling strategy
import { XMLParser } from 'fast-xml-parser';
import { BaseStrategy, CheckResult, DiscoveredItem } from './base.js';
import { CompetitorRow } from '../db/repositories.js';
import { fetchUrl } from '../utils/http.js';
import { looksLikeArticleUrl } from '../utils/url.js';
import { getLogger } from '../logger.js';

const log = getLogger('strategy:sitemap');

export class SitemapStrategy extends BaseStrategy {
  name = 'sitemap';

  async check(competitor: CompetitorRow): Promise<CheckResult> {
    const sitemapUrl = competitor.sitemap_url;
    if (!sitemapUrl) {
      return { discoveredItems: [], durationMs: 0, error: 'No sitemap URL configured' };
    }

    const start = Date.now();
    try {
      const items = await this.fetchSitemap(sitemapUrl, 0);
      return {
        discoveredItems: items,
        durationMs: Date.now() - start,
        httpStatus: 200,
        responseBytes: 0,
      };
    } catch (err: any) {
      return {
        discoveredItems: [],
        durationMs: Date.now() - start,
        error: err.message,
      };
    }
  }

  private async fetchSitemap(url: string, depth: number): Promise<DiscoveredItem[]> {
    if (depth > 3) return []; // Recursion limit

    const result = await fetchUrl(url);
    if (result.error || !result.data) return [];

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['sitemap', 'url'].includes(name),
    });

    try {
      const parsed = parser.parse(result.data);

      // Sitemap index
      if (parsed?.sitemapindex?.sitemap) {
        const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
          ? parsed.sitemapindex.sitemap : [parsed.sitemapindex.sitemap];

        // Sort by lastmod descending to prioritize newest
        sitemaps.sort((a: any, b: any) => {
          const aTime = a.lastmod ? new Date(a.lastmod).getTime() : 0;
          const bTime = b.lastmod ? new Date(b.lastmod).getTime() : 0;
          return bTime - aTime;
        });

        // Only fetch the newest few child sitemaps
        const items: DiscoveredItem[] = [];
        for (const sm of sitemaps.slice(0, 3)) {
          if (sm.loc) {
            const childItems = await this.fetchSitemap(sm.loc, depth + 1);
            items.push(...childItems);
          }
        }
        return items;
      }

      // Regular sitemap
      if (parsed?.urlset?.url) {
        const urls = Array.isArray(parsed.urlset.url) ? parsed.urlset.url : [parsed.urlset.url];
        const items: DiscoveredItem[] = [];

        for (const entry of urls) {
          if (!entry?.loc) continue;
          const loc = entry.loc;

          // Only include URLs that look like articles
          if (!looksLikeArticleUrl(loc)) continue;

          const lastmod = entry.lastmod || null;
          // Check for news:publication_date
          const newsDate = entry?.['news:news']?.['news:publication_date'] || null;
          const newsTitle = entry?.['news:news']?.['news:title'] || null;

          items.push({
            url: loc,
            title: newsTitle || undefined,
            publishedAt: newsDate ? new Date(newsDate).toISOString()
              : lastmod ? new Date(lastmod).toISOString() : undefined,
            publishedAtSource: newsDate ? 'sitemap-news' : lastmod ? 'sitemap-lastmod' : undefined,
            modifiedAt: lastmod ? new Date(lastmod).toISOString() : undefined,
          });
        }

        // Sort by date descending
        items.sort((a, b) => {
          const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return bTime - aTime;
        });

        return items.slice(0, 100); // Limit to newest 100
      }

      return [];
    } catch (err: any) {
      log.warn({ err: err.message, url }, 'Failed to parse sitemap');
      return [];
    }
  }
}
