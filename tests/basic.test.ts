import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeUrl, looksLikeArticleUrl, titleSimilarity } from '../src/utils/url.js';
import { formatDelay, calcDelayMs, classifyDelay } from '../src/utils/time.js';

describe('URL Utils', () => {
  it('normalizes URLs correctly', () => {
    expect(normalizeUrl('https://Example.com/Blog/?utm_source=twitter&_ga=123#frag'))
      .toBe('https://example.com/Blog');
      
    expect(normalizeUrl('/relative/path', 'https://base.com'))
      .toBe('https://base.com/relative/path');
  });

  it('detects article URLs correctly', () => {
    expect(looksLikeArticleUrl('https://example.com/blog/my-post-title')).toBe(true);
    expect(looksLikeArticleUrl('https://example.com/2024/01/news-update')).toBe(true);
    expect(looksLikeArticleUrl('https://example.com/contact-us')).toBe(false);
  });

  it('calculates title similarity', () => {
    expect(titleSimilarity('Hello World Test', 'Hello World Test')).toBe(1);
    expect(titleSimilarity('Hello World', 'Different Thing')).toBe(0);
    expect(titleSimilarity('My awesome post about tech', 'Awesome post about tech!')).toBeGreaterThan(0.5);
  });
});

describe('Time Utils', () => {
  it('formats delay correctly', () => {
    expect(formatDelay(45000)).toBe('45s');
    expect(formatDelay(125000)).toBe('2m 5s');
    expect(formatDelay(3665000)).toBe('1h 1m 5s');
    expect(formatDelay(null)).toBe('N/A – publish time unavailable');
  });

  it('calculates delay ms', () => {
    const pub = new Date('2024-01-01T12:00:00Z');
    const disc = new Date('2024-01-01T12:05:00Z');
    expect(calcDelayMs(pub.toISOString(), disc.toISOString())).toBe(300000);
  });

  it('classifies delay', () => {
    expect(classifyDelay(null).flag).toBe('unknown_publish_time');
    expect(classifyDelay(1000).flag).toBe('ok');
    expect(classifyDelay(300000).flag).toBe('ok'); // exactly 5 min
    expect(classifyDelay(300001).flag).toBe('over_5min');
  });
});
