// src/capture/content.ts - Content extraction using Readability + cheerio fallbacks
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import * as cheerio from 'cheerio';
import { fetchUrl } from '../utils/http.js';
import { getLogger } from '../logger.js';

const log = getLogger('capture');

export interface CapturedContent {
  title: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  summary: string | null;
  featuredImage: string | null;
  inlineImages: string[];
  author: string | null;
  publishedAt: string | null;
  publishedAtSource: string | null;
  modifiedAt: string | null;
  categories: string[];
  tags: string[];
  metaDescription: string | null;
  language: string | null;
  wordCount: number;
  jsonldRaw: string | null;
  opengraphRaw: string | null;
  outboundLinks: string[];
  canonicalUrl: string | null;
}

/**
 * Fetch and extract full content from an article URL
 */
export async function captureArticleContent(url: string): Promise<CapturedContent> {
  const result = await fetchUrl(url, { timeoutMs: 15000 });
  if (result.error || !result.data) {
    log.warn({ url, error: result.error }, 'Failed to fetch article for capture');
    return emptyContent();
  }

  return extractContent(url, result.data);
}

/**
 * Extract content from HTML without fetching
 */
export function extractContent(url: string, html: string): CapturedContent {
  const $ = cheerio.load(html);
  const content: CapturedContent = emptyContent();

  // 1. Extract JSON-LD
  const jsonldScripts = $('script[type="application/ld+json"]');
  const jsonlds: any[] = [];
  jsonldScripts.each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '');
      jsonlds.push(data);
    } catch {}
  });
  if (jsonlds.length > 0) {
    content.jsonldRaw = JSON.stringify(jsonlds);
    // Extract from JSON-LD
    for (const ld of jsonlds) {
      const article = Array.isArray(ld) ? ld.find(a => a['@type']?.match(/Article|BlogPosting|NewsArticle/)) : ld;
      if (article && article['@type']?.match(/Article|BlogPosting|NewsArticle/i)) {
        if (article.headline) content.title = article.headline;
        if (article.datePublished) {
          try {
            content.publishedAt = new Date(article.datePublished).toISOString();
            content.publishedAtSource = 'json-ld';
          } catch {}
        }
        if (article.dateModified) {
          try { content.modifiedAt = new Date(article.dateModified).toISOString(); } catch {}
        }
        if (article.author) {
          content.author = typeof article.author === 'string' ? article.author
            : article.author?.name || article.author?.[0]?.name || null;
        }
        if (article.image) {
          content.featuredImage = typeof article.image === 'string' ? article.image : article.image?.url || null;
        }
      }
    }
  }

  // 2. Extract OpenGraph
  const og: Record<string, string> = {};
  $('meta[property^="og:"], meta[property^="article:"]').each((_, el) => {
    const prop = $(el).attr('property') || '';
    const val = $(el).attr('content') || '';
    og[prop] = val;
  });
  if (Object.keys(og).length > 0) {
    content.opengraphRaw = JSON.stringify(og);
    if (!content.title && og['og:title']) content.title = og['og:title'];
    if (!content.featuredImage && og['og:image']) content.featuredImage = og['og:image'];
    if (!content.publishedAt && og['article:published_time']) {
      try {
        content.publishedAt = new Date(og['article:published_time']).toISOString();
        content.publishedAtSource = 'meta';
      } catch {}
    }
    if (!content.modifiedAt && og['article:modified_time']) {
      try { content.modifiedAt = new Date(og['article:modified_time']).toISOString(); } catch {}
    }
  }

  // 3. Fallback meta tags
  if (!content.title) content.title = $('title').text().trim() || null;
  if (!content.metaDescription) {
    content.metaDescription = $('meta[name="description"]').attr('content') || null;
  }
  if (!content.author) {
    content.author = $('meta[name="author"]').attr('content') || null;
  }
  if (!content.publishedAt) {
    const timeEl = $('time[datetime]').first();
    if (timeEl.length) {
      try {
        content.publishedAt = new Date(timeEl.attr('datetime')!).toISOString();
        content.publishedAtSource = 'meta';
      } catch {}
    }
  }

  // 4. Canonical URL
  content.canonicalUrl = $('link[rel="canonical"]').attr('href') || null;

  // 5. Language
  content.language = $('html').attr('lang') || null;

  // 6. Categories/tags from meta
  $('meta[property="article:tag"]').each((_, el) => {
    const tag = $(el).attr('content');
    if (tag) content.tags.push(tag);
  });
  $('meta[property="article:section"]').each((_, el) => {
    const cat = $(el).attr('content');
    if (cat) content.categories.push(cat);
  });

  // 7. Featured image fallback
  if (!content.featuredImage) {
    const firstImg = $('article img, .post-content img, .entry-content img, main img').first();
    if (firstImg.length) content.featuredImage = firstImg.attr('src') || null;
  }

  // 8. Use Readability for body extraction
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (article) {
      content.bodyHtml = article.content || null;
      content.bodyText = article.textContent || null;
      if (!content.title && article.title) content.title = article.title;
      if (article.excerpt) content.summary = article.excerpt;
    }
  } catch (err: any) {
    log.debug({ err: err.message, url }, 'Readability extraction failed');
  }

  // 9. Fallback body extraction if Readability failed
  if (!content.bodyText) {
    const articleEl = $('article, .post-content, .entry-content, .article-body, main');
    if (articleEl.length) {
      content.bodyHtml = articleEl.first().html() || null;
      content.bodyText = articleEl.first().text().trim() || null;
    }
  }

  // 10. Word count
  if (content.bodyText) {
    content.wordCount = content.bodyText.split(/\s+/).filter(Boolean).length;
  }

  // 11. Inline images
  $('article img, .post-content img, .entry-content img').each((_, el) => {
    const src = $(el).attr('src');
    if (src) content.inlineImages.push(src);
  });

  // 12. Outbound links
  $('article a[href], .post-content a[href], .entry-content a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.startsWith('http')) {
      try {
        if (new URL(href).hostname !== new URL(url).hostname) {
          content.outboundLinks.push(href);
        }
      } catch {}
    }
  });

  return content;
}

function emptyContent(): CapturedContent {
  return {
    title: null, bodyHtml: null, bodyText: null, summary: null,
    featuredImage: null, inlineImages: [], author: null,
    publishedAt: null, publishedAtSource: null, modifiedAt: null,
    categories: [], tags: [], metaDescription: null, language: null,
    wordCount: 0, jsonldRaw: null, opengraphRaw: null, outboundLinks: [],
    canonicalUrl: null,
  };
}
