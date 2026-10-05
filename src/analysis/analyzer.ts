// src/analysis/analyzer.ts - Automatic website analysis and monitoring profile discovery
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { fetchUrl } from '../utils/http.js';
import { resolveUrl, getBaseUrl, looksLikeArticleUrl } from '../utils/url.js';
import { getLogger } from '../logger.js';
import { competitorRepo } from '../db/repositories.js';

const log = getLogger('analyzer');

export interface StrategyInfo {
  strategy: string;
  url: string;
  score: number; // 0-100 quality score
  details: string;
  itemCount?: number;
  hasDates?: boolean;
}

export interface MonitoringProfile {
  strategies: StrategyInfo[];
  primary: string | null;
  secondary: string | null;
  explanation: string;
  feedUrls: string[];
  sitemapUrls: string[];
  blogUrl: string | null;
  pageSelector: string | null;
  wpApiAvailable: boolean;
  analyzedAt: string;
}

const COMMON_FEED_PATHS = [
  '/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml',
  '/blog/feed', '/index.xml', '/feed/atom', '/feed/rss',
  '/blog/rss.xml', '/blog/atom.xml', '/feeds/posts/default',
];

const COMMON_SITEMAP_PATHS = [
  '/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml',
  '/post-sitemap.xml', '/sitemap/sitemap-index.xml',
  '/sitemap.xml.gz', '/news-sitemap.xml',
];

const COMMON_BLOG_PATHS = [
  '/blog', '/news', '/articles', '/insights', '/resources',
  '/updates', '/posts', '/journal', '/stories',
];

/**
 * Analyze a competitor website and build a monitoring profile.
 * Only needs a homepage URL; discovers everything else.
 */
export async function analyzeWebsite(competitorId: number, websiteUrl: string): Promise<MonitoringProfile> {
  const baseUrl = getBaseUrl(websiteUrl);
  const strategies: StrategyInfo[] = [];
  const feedUrls: string[] = [];
  const sitemapUrls: string[] = [];
  let blogUrl: string | null = null;
  let pageSelector: string | null = null;
  let wpApiAvailable = false;

  log.info({ competitorId, url: websiteUrl }, 'Starting website analysis');

  // Update status to analyzing
  competitorRepo.update(competitorId, { monitoring_status: 'analyzing' });

  // 1. Fetch homepage and look for feed links
  try {
    const homeResult = await fetchUrl(websiteUrl, { timeoutMs: 15000 });
    if (!homeResult.error && homeResult.data) {
      const $ = cheerio.load(homeResult.data);

      // Find RSS/Atom links
      $('link[rel="alternate"]').each((_, el) => {
        const type = $(el).attr('type') || '';
        const href = $(el).attr('href');
        if (href && (type.includes('rss') || type.includes('atom') || type.includes('xml'))) {
          const fullUrl = resolveUrl(href, baseUrl);
          if (!feedUrls.includes(fullUrl)) feedUrls.push(fullUrl);
        }
      });

      // Find blog links in navigation
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().toLowerCase().trim();
        const fullUrl = resolveUrl(href, baseUrl);
        try {
          const u = new URL(fullUrl);
          if (u.hostname !== new URL(baseUrl).hostname) return;
          const path = u.pathname.toLowerCase();
          if (COMMON_BLOG_PATHS.some(bp => path === bp || path === bp + '/')) {
            if (!blogUrl) blogUrl = fullUrl;
          }
        } catch {}
      });
    }
  } catch (err: any) {
    log.warn({ err: err.message }, 'Failed to fetch homepage');
  }

  // 2. Probe common feed paths
  for (const path of COMMON_FEED_PATHS) {
    const url = baseUrl + path;
    if (feedUrls.includes(url)) continue;
    try {
      const result = await fetchUrl(url, { timeoutMs: 5000 });
      if (!result.error && result.status === 200 && result.data) {
        // Quick check if it's XML-like
        const trimmed = result.data.trim();
        if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed') || trimmed.includes('<channel>')) {
          feedUrls.push(url);
        }
      }
    } catch {}
  }

  // 3. Validate and score each feed
  for (const feedUrl of feedUrls) {
    try {
      const result = await fetchUrl(feedUrl, { timeoutMs: 8000 });
      if (result.error || !result.data) continue;

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['item', 'entry'].includes(name),
      });
      const parsed = parser.parse(result.data);

      // RSS
      const rssItems = parsed?.rss?.channel?.item;
      if (rssItems) {
        const items = Array.isArray(rssItems) ? rssItems : [rssItems];
        const hasDates = items.some((i: any) => i.pubDate);
        const isAtom = false;
        const score = Math.min(100, 50 + items.length * 2 + (hasDates ? 20 : 0));
        strategies.push({
          strategy: 'rss',
          url: feedUrl,
          score,
          details: `RSS feed with ${items.length} items${hasDates ? ', has pubDate' : ', no dates'}`,
          itemCount: items.length,
          hasDates,
        });
      }

      // Atom
      const atomEntries = parsed?.feed?.entry;
      if (atomEntries) {
        const entries = Array.isArray(atomEntries) ? atomEntries : [atomEntries];
        const hasDates = entries.some((e: any) => e.published || e.updated);
        const score = Math.min(100, 45 + entries.length * 2 + (hasDates ? 20 : 0));
        strategies.push({
          strategy: 'rss',
          url: feedUrl,
          score,
          details: `Atom feed with ${entries.length} entries${hasDates ? ', has dates' : ', no dates'}`,
          itemCount: entries.length,
          hasDates,
        });
      }
    } catch {}
  }

  // 4. Check robots.txt for sitemaps
  try {
    const robotsResult = await fetchUrl(baseUrl + '/robots.txt', { timeoutMs: 5000 });
    if (!robotsResult.error && robotsResult.data) {
      const lines = robotsResult.data.split('\n');
      for (const line of lines) {
        const match = line.match(/^sitemap:\s*(.+)/i);
        if (match) {
          const sitemapUrl = match[1].trim();
          if (!sitemapUrls.includes(sitemapUrl)) sitemapUrls.push(sitemapUrl);
        }
      }
    }
  } catch {}

  // 5. Probe common sitemap paths
  for (const path of COMMON_SITEMAP_PATHS) {
    const url = baseUrl + path;
    if (sitemapUrls.includes(url)) continue;
    try {
      const result = await fetchUrl(url, { timeoutMs: 5000 });
      if (!result.error && result.status === 200 && result.data) {
        if (result.data.includes('<urlset') || result.data.includes('<sitemapindex')) {
          sitemapUrls.push(url);
        }
      }
    } catch {}
  }

  // 6. Validate and score sitemaps
  for (const sitemapUrl of sitemapUrls) {
    try {
      const result = await fetchUrl(sitemapUrl, { timeoutMs: 8000 });
      if (result.error || !result.data) continue;

      const parser = new XMLParser({
        ignoreAttributes: false,
        isArray: (name) => ['sitemap', 'url'].includes(name),
      });
      const parsed = parser.parse(result.data);

      let urlCount = 0;
      let hasLastmod = false;

      if (parsed?.sitemapindex?.sitemap) {
        const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
          ? parsed.sitemapindex.sitemap : [parsed.sitemapindex.sitemap];
        urlCount = sitemaps.length;
        hasLastmod = sitemaps.some((s: any) => s.lastmod);
        strategies.push({
          strategy: 'sitemap',
          url: sitemapUrl,
          score: Math.min(80, 30 + urlCount * 2 + (hasLastmod ? 25 : 0)),
          details: `Sitemap index with ${urlCount} child sitemaps${hasLastmod ? ', has lastmod' : ''}`,
          itemCount: urlCount,
          hasDates: hasLastmod,
        });
      } else if (parsed?.urlset?.url) {
        const urls = Array.isArray(parsed.urlset.url) ? parsed.urlset.url : [parsed.urlset.url];
        urlCount = urls.length;
        hasLastmod = urls.some((u: any) => u.lastmod);
        const articleCount = urls.filter((u: any) => u.loc && looksLikeArticleUrl(u.loc)).length;
        strategies.push({
          strategy: 'sitemap',
          url: sitemapUrl,
          score: Math.min(80, 20 + articleCount + (hasLastmod ? 25 : 0)),
          details: `Sitemap with ${urlCount} URLs (${articleCount} articles)${hasLastmod ? ', has lastmod' : ''}`,
          itemCount: articleCount,
          hasDates: hasLastmod,
        });
      }
    } catch {}
  }

  // 7. Check for WordPress REST API
  try {
    const wpResult = await fetchUrl(`${baseUrl}/wp-json/wp/v2/posts?per_page=1`, { timeoutMs: 5000 });
    if (!wpResult.error && wpResult.status === 200) {
      const posts = JSON.parse(wpResult.data);
      if (Array.isArray(posts)) {
        wpApiAvailable = true;
        strategies.push({
          strategy: 'wp-api',
          url: `${baseUrl}/wp-json/wp/v2/posts`,
          score: 85,
          details: 'WordPress REST API available with structured JSON data',
          hasDates: true,
        });
      }
    }
  } catch {}

  // 8. Analyze blog listing page
  const blogPageUrl = blogUrl || websiteUrl;
  try {
    const pageResult = await fetchUrl(blogPageUrl, { timeoutMs: 8000 });
    if (!pageResult.error && pageResult.data) {
      const $ = cheerio.load(pageResult.data);
      const articleLinks: string[] = [];

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const fullUrl = resolveUrl(href, baseUrl);
        try {
          if (new URL(fullUrl).hostname !== new URL(baseUrl).hostname) return;
        } catch { return; }
        if (looksLikeArticleUrl(fullUrl)) {
          articleLinks.push(fullUrl);
        }
      });

      const uniqueLinks = [...new Set(articleLinks)];
      if (uniqueLinks.length > 0) {
        strategies.push({
          strategy: 'page',
          url: blogPageUrl,
          score: Math.min(60, 10 + uniqueLinks.length * 3),
          details: `Blog page with ${uniqueLinks.length} article links found`,
          itemCount: uniqueLinks.length,
        });
      }
    }
  } catch {}

  // 9. Sort strategies by score and select primary/secondary
  strategies.sort((a, b) => b.score - a.score);

  const primary = strategies[0] || null;
  const secondary = strategies[1] || null;

  // Build explanation
  let explanation = '';
  if (primary) {
    explanation = `Primary: ${primary.strategy.toUpperCase()} (score: ${primary.score}) – ${primary.details}`;
    if (secondary) {
      explanation += `\nSecondary: ${secondary.strategy.toUpperCase()} (score: ${secondary.score}) – ${secondary.details}`;
    }
    explanation += `\n\nChosen ${primary.strategy.toUpperCase()} because `;
    if (primary.strategy === 'rss') {
      explanation += `feed has ${primary.hasDates ? 'pubDate' : 'entries'}, ${primary.itemCount || 0} items. `;
    } else if (primary.strategy === 'sitemap') {
      explanation += `sitemap ${primary.hasDates ? 'has lastmod' : 'available'}, ${primary.itemCount || 0} entries. `;
    } else if (primary.strategy === 'wp-api') {
      explanation += 'WordPress REST API provides structured JSON with dates. ';
    } else {
      explanation += `${primary.itemCount || 0} article links found on listing page. `;
    }
    if (secondary) {
      explanation += `${secondary.strategy.toUpperCase()} used as backup.`;
    }
  } else {
    explanation = 'No monitoring strategies could be discovered. The site may not have a feed, sitemap, or detectable blog section.';
  }

  const profile: MonitoringProfile = {
    strategies,
    primary: primary?.strategy || null,
    secondary: secondary?.strategy || null,
    explanation,
    feedUrls,
    sitemapUrls,
    blogUrl,
    pageSelector,
    wpApiAvailable,
    analyzedAt: new Date().toISOString(),
  };

  // Update competitor with discovered URLs and profile
  const updates: Record<string, any> = {
    monitoring_profile: JSON.stringify(profile),
    analysis_explanation: explanation,
    monitoring_status: primary ? 'online' : 'degraded',
  };

  if (feedUrls.length > 0 && !competitorRepo.findById(competitorId)?.feed_url) {
    updates.feed_url = feedUrls[0];
  }
  if (sitemapUrls.length > 0 && !competitorRepo.findById(competitorId)?.sitemap_url) {
    updates.sitemap_url = sitemapUrls[0];
  }
  if (blogUrl && !competitorRepo.findById(competitorId)?.blog_url) {
    updates.blog_url = blogUrl;
  }

  competitorRepo.update(competitorId, updates);

  log.info({
    competitorId,
    strategies: strategies.length,
    primary: primary?.strategy,
    secondary: secondary?.strategy,
  }, 'Analysis complete');

  return profile;
}
