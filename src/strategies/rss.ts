// src/strategies/rss.ts - RSS/Atom feed polling strategy
import { XMLParser } from 'fast-xml-parser';
import { BaseStrategy, CheckResult, DiscoveredItem } from './base.js';
import { CompetitorRow } from '../db/repositories.js';
import { fetchUrl } from '../utils/http.js';
import { getLogger } from '../logger.js';

const log = getLogger('strategy:rss');

export class RssStrategy extends BaseStrategy {
  name = 'rss';

  async check(competitor: CompetitorRow): Promise<CheckResult> {
    const feedUrl = competitor.feed_url;
    if (!feedUrl) {
      return { discoveredItems: [], durationMs: 0, error: 'No feed URL configured' };
    }

    const start = Date.now();
    const result = await fetchUrl(feedUrl, {
      etag: competitor.etag || undefined,
      lastModified: competitor.last_modified || undefined,
    });

    if (result.error) {
      return {
        discoveredItems: [],
        httpStatus: result.status,
        responseBytes: result.bytes,
        durationMs: result.durationMs,
        error: result.error,
      };
    }

    if (result.notModified) {
      return {
        discoveredItems: [],
        httpStatus: 304,
        responseBytes: 0,
        durationMs: result.durationMs,
        notModified: true,
        etag: result.headers['etag'],
        lastModified: result.headers['last-modified'],
      };
    }

    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['item', 'entry'].includes(name),
      });
      const parsed = parser.parse(result.data);
      const items: DiscoveredItem[] = [];

      // RSS 2.0
      const rssItems = parsed?.rss?.channel?.item || [];
      for (const item of (Array.isArray(rssItems) ? rssItems : [rssItems])) {
        if (!item) continue;
        const url = item.link || item.guid?.['#text'] || item.guid;
        if (!url || typeof url !== 'string') continue;

        items.push({
          url,
          title: item.title || undefined,
          publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
          publishedAtSource: item.pubDate ? 'feed' : undefined,
          author: item['dc:creator'] || item.author || undefined,
          categories: extractCategories(item.category),
          contentSnippet: item.description?.substring(0, 500) || undefined,
        });
      }

      // Atom
      const atomEntries = parsed?.feed?.entry || [];
      for (const entry of (Array.isArray(atomEntries) ? atomEntries : [atomEntries])) {
        if (!entry) continue;
        let url = '';
        if (Array.isArray(entry.link)) {
          const alt = entry.link.find((l: any) => l['@_rel'] === 'alternate' || !l['@_rel']);
          url = alt?.['@_href'] || entry.link[0]?.['@_href'] || '';
        } else if (entry.link?.['@_href']) {
          url = entry.link['@_href'];
        }
        if (!url) continue;

        items.push({
          url,
          title: entry.title?.['#text'] || entry.title || undefined,
          publishedAt: entry.published ? new Date(entry.published).toISOString()
            : entry.updated ? new Date(entry.updated).toISOString() : undefined,
          publishedAtSource: entry.published ? 'feed' : entry.updated ? 'feed' : undefined,
          author: entry.author?.name || undefined,
          categories: extractCategories(entry.category),
        });
      }

      return {
        discoveredItems: items,
        httpStatus: result.status,
        responseBytes: result.bytes,
        durationMs: result.durationMs,
        etag: result.headers['etag'],
        lastModified: result.headers['last-modified'],
      };
    } catch (err: any) {
      log.warn({ err: err.message, url: feedUrl }, 'Failed to parse feed');
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

function extractCategories(cat: any): string[] | undefined {
  if (!cat) return undefined;
  if (Array.isArray(cat)) return cat.map(c => c?.['#text'] || c?.toString() || '').filter(Boolean);
  const text = cat?.['#text'] || cat?.toString();
  return text ? [text] : undefined;
}
