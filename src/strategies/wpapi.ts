// src/strategies/wpapi.ts - WordPress REST API strategy (bonus)
import { BaseStrategy, CheckResult, DiscoveredItem } from './base.js';
import { CompetitorRow } from '../db/repositories.js';
import { fetchUrl } from '../utils/http.js';
import { getBaseUrl } from '../utils/url.js';
import { getLogger } from '../logger.js';

const log = getLogger('strategy:wpapi');

export class WpApiStrategy extends BaseStrategy {
  name = 'wp-api';

  async check(competitor: CompetitorRow): Promise<CheckResult> {
    const baseUrl = getBaseUrl(competitor.website_url);
    const apiUrl = `${baseUrl}/wp-json/wp/v2/posts?orderby=date&per_page=10&_fields=id,date,title,link,author,categories,tags,excerpt,featured_media`;

    const start = Date.now();
    const result = await fetchUrl(apiUrl);

    if (result.error || result.status >= 400) {
      return {
        discoveredItems: [],
        httpStatus: result.status,
        responseBytes: result.bytes,
        durationMs: result.durationMs,
        error: result.error || `HTTP ${result.status}`,
      };
    }

    try {
      const posts = JSON.parse(result.data);
      if (!Array.isArray(posts)) {
        return { discoveredItems: [], durationMs: result.durationMs, error: 'Invalid WP API response' };
      }

      const items: DiscoveredItem[] = posts.map((post: any) => ({
        url: post.link,
        title: post.title?.rendered?.replace(/<[^>]+>/g, '') || undefined,
        publishedAt: post.date ? new Date(post.date).toISOString() : undefined,
        publishedAtSource: post.date ? 'wp-api' : undefined,
        contentSnippet: post.excerpt?.rendered?.replace(/<[^>]+>/g, '').substring(0, 300) || undefined,
      }));

      return {
        discoveredItems: items,
        httpStatus: result.status,
        responseBytes: result.bytes,
        durationMs: result.durationMs,
      };
    } catch (err: any) {
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
