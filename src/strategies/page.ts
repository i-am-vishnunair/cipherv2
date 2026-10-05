// src/strategies/page.ts - Direct blog/article listing page monitoring strategy
import * as cheerio from 'cheerio';
import { BaseStrategy, CheckResult, DiscoveredItem } from './base.js';
import { CompetitorRow } from '../db/repositories.js';
import { fetchUrl } from '../utils/http.js';
import { resolveUrl, looksLikeArticleUrl, getBaseUrl } from '../utils/url.js';
import { getLogger } from '../logger.js';

const log = getLogger('strategy:page');

export class PageStrategy extends BaseStrategy {
  name = 'page';

  async check(competitor: CompetitorRow): Promise<CheckResult> {
    const pageUrl = competitor.blog_url || competitor.website_url;
    if (!pageUrl) {
      return { discoveredItems: [], durationMs: 0, error: 'No blog/website URL configured' };
    }

    const start = Date.now();
    const result = await fetchUrl(pageUrl);

    if (result.error) {
      return {
        discoveredItems: [],
        httpStatus: result.status,
        responseBytes: result.bytes,
        durationMs: result.durationMs,
        error: result.error,
      };
    }

    try {
      const $ = cheerio.load(result.data);
      const baseUrl = getBaseUrl(pageUrl);
      const items: DiscoveredItem[] = [];
      const seenUrls = new Set<string>();

      // Try to use selector from monitoring profile
      let profile: any = null;
      try {
        if (competitor.monitoring_profile) {
          profile = JSON.parse(competitor.monitoring_profile);
        }
      } catch {}

      const linkSelector = profile?.pageSelector || 'a[href]';

      // Extract all links
      $(linkSelector).each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const fullUrl = resolveUrl(href, baseUrl);
        if (seenUrls.has(fullUrl)) return;

        // Filter: only article-like URLs from same domain
        try {
          const urlObj = new URL(fullUrl);
          if (urlObj.hostname !== new URL(pageUrl).hostname) return;
        } catch { return; }

        if (!looksLikeArticleUrl(fullUrl)) return;

        seenUrls.add(fullUrl);

        // Try to extract title from link text or parent
        const linkText = $(el).text().trim();
        const title = linkText.length > 5 && linkText.length < 300 ? linkText : undefined;

        // Try to find a time element nearby
        let publishedAt: string | undefined;
        let publishedAtSource: string | undefined;
        const parent = $(el).closest('article, .post, .entry, li, div');
        const timeEl = parent.find('time[datetime]').first();
        if (timeEl.length) {
          try {
            publishedAt = new Date(timeEl.attr('datetime')!).toISOString();
            publishedAtSource = 'meta';
          } catch {}
        }

        items.push({
          url: fullUrl,
          title,
          publishedAt,
          publishedAtSource,
        });
      });

      return {
        discoveredItems: items,
        httpStatus: result.status,
        responseBytes: result.bytes,
        durationMs: result.durationMs,
      };
    } catch (err: any) {
      log.warn({ err: err.message, url: pageUrl }, 'Failed to parse page');
      return {
        discoveredItems: [],
        httpStatus: result.status,
        responseBytes: result.bytes,
        durationMs: result.durationMs,
        error: `Parse error: ${err.message}`,
      };
    }
  }
}
