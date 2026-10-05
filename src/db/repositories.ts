// src/db/repositories.ts - Data access layer using sql.js query helpers
import { queryAll, queryOne, runSql, saveDb } from './database.js';

// ─── Competitor Repository ─────────────────────────────────────────

export interface CompetitorRow {
  id: number;
  name: string;
  website_url: string;
  blog_url: string | null;
  feed_url: string | null;
  sitemap_url: string | null;
  enabled: number;
  monitoring_status: string;
  monitoring_profile: string | null;
  analysis_explanation: string | null;
  last_checked_at: string | null;
  last_successful_detection_at: string | null;
  next_check_at: string | null;
  poll_interval_ms: number;
  consecutive_failures: number;
  circuit_breaker_until: string | null;
  etag: string | null;
  last_modified: string | null;
  content_hash: string | null;
  is_baseline_complete: number;
  created_at: string;
  updated_at: string;
}

export const competitorRepo = {
  findAll(): CompetitorRow[] {
    return queryAll<CompetitorRow>('SELECT * FROM competitors ORDER BY name');
  },

  findEnabled(): CompetitorRow[] {
    return queryAll<CompetitorRow>('SELECT * FROM competitors WHERE enabled = 1 ORDER BY next_check_at ASC');
  },

  findById(id: number): CompetitorRow | undefined {
    return queryOne<CompetitorRow>('SELECT * FROM competitors WHERE id = ?', [id]);
  },

  create(data: { name: string; website_url: string; blog_url?: string; feed_url?: string; sitemap_url?: string }): CompetitorRow {
    const now = new Date().toISOString();
    const result = runSql(
      `INSERT INTO competitors (name, website_url, blog_url, feed_url, sitemap_url, next_check_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.website_url, data.blog_url || null, data.feed_url || null, data.sitemap_url || null, now, now, now]
    );
    saveDb();
    return this.findById(result.lastId)!;
  },

  update(id: number, data: Record<string, any>): CompetitorRow | undefined {
    const current = this.findById(id);
    if (!current) return undefined;
    const fields = Object.keys(data).filter(k => k !== 'id' && k !== 'created_at');
    if (fields.length === 0) return current;
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => data[f] ?? null);
    const now = new Date().toISOString();
    runSql(`UPDATE competitors SET ${sets}, updated_at = ? WHERE id = ?`, [...values, now, id]);
    saveDb();
    return this.findById(id);
  },

  delete(id: number): boolean {
    const result = runSql('DELETE FROM competitors WHERE id = ?', [id]);
    saveDb();
    return result.changes > 0;
  },

  setEnabled(id: number, enabled: boolean): void {
    runSql('UPDATE competitors SET enabled = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, new Date().toISOString(), id]);
    saveDb();
  },

  count(): number {
    const row = queryOne<any>('SELECT COUNT(*) as cnt FROM competitors');
    return row?.cnt ?? 0;
  },

  countByStatus(): Record<string, number> {
    const rows = queryAll<any>('SELECT monitoring_status, COUNT(*) as cnt FROM competitors WHERE enabled=1 GROUP BY monitoring_status');
    const result: Record<string, number> = { online: 0, offline: 0, degraded: 0, analyzing: 0 };
    for (const r of rows) result[r.monitoring_status] = r.cnt;
    return result;
  },
};

// ─── Article Repository ─────────────────────────────────────────

export interface ArticleRow {
  id: number;
  competitor_id: number;
  url: string;
  canonical_url: string | null;
  normalized_url: string;
  title: string | null;
  author: string | null;
  published_at: string | null;
  published_at_source: string | null;
  modified_at: string | null;
  first_discovered_at: string;
  detection_delay_ms: number | null;
  detection_method: string | null;
  detection_check_id: number | null;
  also_seen_by: string | null;
  status: string;
  delay_flag: string | null;
  delay_reason: string | null;
  body_html: string | null;
  body_text: string | null;
  summary: string | null;
  featured_image: string | null;
  inline_images: string | null;
  categories: string | null;
  tags: string | null;
  meta_description: string | null;
  language: string | null;
  word_count: number | null;
  jsonld_raw: string | null;
  opengraph_raw: string | null;
  outbound_links: string | null;
  content_hash: string | null;
  published_to_url: string | null;
  publish_error: string | null;
  indexed_at: string | null;
  index_result: string | null;
  created_at: string;
}

export const articleRepo = {
  findByCompetitor(competitorId: number, limit = 100, offset = 0): ArticleRow[] {
    return queryAll<ArticleRow>(
      'SELECT * FROM articles WHERE competitor_id = ? ORDER BY first_discovered_at DESC LIMIT ? OFFSET ?',
      [competitorId, limit, offset]
    );
  },

  findRecent(limit = 50, offset = 0, filters?: { competitorId?: number; method?: string; overFiveMin?: boolean; status?: string }): ArticleRow[] {
    let sql = 'SELECT * FROM articles WHERE 1=1';
    const params: any[] = [];
    if (filters?.competitorId) { sql += ' AND competitor_id = ?'; params.push(filters.competitorId); }
    if (filters?.method) { sql += ' AND detection_method = ?'; params.push(filters.method); }
    if (filters?.overFiveMin) { sql += " AND delay_flag = 'over_5min'"; }
    if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
    sql += ' ORDER BY first_discovered_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return queryAll<ArticleRow>(sql, params);
  },

  findById(id: number): ArticleRow | undefined {
    return queryOne<ArticleRow>('SELECT * FROM articles WHERE id = ?', [id]);
  },

  insertOrIgnore(data: {
    competitor_id: number;
    url: string;
    canonical_url?: string;
    normalized_url: string;
    title?: string;
    author?: string;
    published_at?: string;
    published_at_source?: string;
    modified_at?: string;
    first_discovered_at: string;
    detection_delay_ms?: number;
    detection_method?: string;
    detection_check_id?: number;
    status?: string;
    delay_flag?: string;
    delay_reason?: string;
    content_hash?: string;
    categories?: string;
    tags?: string;
    featured_image?: string;
  }): { article: ArticleRow; isNew: boolean } {
    // Check existing first
    const existing = queryOne<ArticleRow>(
      'SELECT * FROM articles WHERE competitor_id = ? AND normalized_url = ?',
      [data.competitor_id, data.normalized_url]
    );
    if (existing) {
      return { article: existing, isNew: false };
    }

    try {
      const result = runSql(`
        INSERT INTO articles (competitor_id, url, canonical_url, normalized_url, title, author, published_at, published_at_source,
          modified_at, first_discovered_at, detection_delay_ms, detection_method, detection_check_id, status, delay_flag, delay_reason,
          content_hash, categories, tags, featured_image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.competitor_id, data.url, data.canonical_url || null, data.normalized_url,
        data.title || null, data.author || null, data.published_at || null, data.published_at_source || null,
        data.modified_at || null, data.first_discovered_at, data.detection_delay_ms ?? null,
        data.detection_method || null, data.detection_check_id ?? null, data.status || 'new',
        data.delay_flag || null, data.delay_reason || null, data.content_hash || null,
        data.categories || null, data.tags || null, data.featured_image || null,
      ]);
      saveDb();
      if (result.lastId > 0) {
        const article = this.findById(result.lastId)!;
        return { article, isNew: true };
      }
    } catch (err: any) {
      // UNIQUE constraint violation = race condition / duplicate
      if (err.message?.includes('UNIQUE constraint')) {
        const found = queryOne<ArticleRow>(
          'SELECT * FROM articles WHERE competitor_id = ? AND normalized_url = ?',
          [data.competitor_id, data.normalized_url]
        );
        if (found) return { article: found, isNew: false };
      }
      throw err;
    }
    // Fallback
    const found = queryOne<ArticleRow>(
      'SELECT * FROM articles WHERE competitor_id = ? AND normalized_url = ?',
      [data.competitor_id, data.normalized_url]
    )!;
    return { article: found, isNew: false };
  },

  updateContent(id: number, data: Record<string, any>): void {
    const fields = Object.keys(data).filter(k => k !== 'id' && k !== 'created_at');
    if (fields.length === 0) return;
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => data[f] ?? null);
    runSql(`UPDATE articles SET ${sets} WHERE id = ?`, [...values, id]);
    saveDb();
  },

  addAlsoSeenBy(id: number, method: string): void {
    const article = this.findById(id);
    if (!article) return;
    const existing: string[] = article.also_seen_by ? JSON.parse(article.also_seen_by as string) : [];
    if (!existing.includes(method)) {
      existing.push(method);
      runSql('UPDATE articles SET also_seen_by = ? WHERE id = ?', [JSON.stringify(existing), id]);
    }
  },

  countTotal(): number {
    const row = queryOne<any>("SELECT COUNT(*) as cnt FROM articles WHERE status != 'baseline'");
    return row?.cnt ?? 0;
  },

  getDelayStats(): { avg: number | null; min: number | null; max: number | null; within5min: number; total: number } {
    const row = queryOne<any>(`
      SELECT AVG(detection_delay_ms) as avg, MIN(detection_delay_ms) as min, MAX(detection_delay_ms) as max,
        SUM(CASE WHEN detection_delay_ms <= 300000 THEN 1 ELSE 0 END) as within5min,
        COUNT(*) as total
      FROM articles WHERE detection_delay_ms IS NOT NULL AND status != 'baseline'
    `);
    return {
      avg: row?.avg ?? null,
      min: row?.min ?? null,
      max: row?.max ?? null,
      within5min: row?.within5min ?? 0,
      total: row?.total ?? 0,
    };
  },

  getMethodStats(): any[] {
    return queryAll(`
      SELECT detection_method,
        COUNT(*) as count,
        AVG(detection_delay_ms) as avg_delay,
        MIN(detection_delay_ms) as min_delay,
        MAX(detection_delay_ms) as max_delay,
        SUM(CASE WHEN detection_delay_ms <= 300000 THEN 1 ELSE 0 END) as within5min
      FROM articles WHERE detection_delay_ms IS NOT NULL AND status != 'baseline'
      GROUP BY detection_method
    `);
  },
};

// ─── Check Repository ─────────────────────────────────────────

export interface CheckRow {
  id: number;
  competitor_id: number;
  strategy: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  http_status: number | null;
  response_bytes: number | null;
  result: string;
  items_found: number;
  new_items: number;
  error_message: string | null;
  cycle_number: number | null;
  created_at: string;
}

export const checkRepo = {
  insert(data: Omit<CheckRow, 'id' | 'created_at'>): CheckRow {
    const result = runSql(`
      INSERT INTO checks (competitor_id, strategy, started_at, ended_at, duration_ms, http_status,
        response_bytes, result, items_found, new_items, error_message, cycle_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.competitor_id, data.strategy, data.started_at, data.ended_at, data.duration_ms,
      data.http_status ?? null, data.response_bytes ?? null, data.result,
      data.items_found, data.new_items, data.error_message || null, data.cycle_number ?? null,
    ]);
    return queryOne<CheckRow>('SELECT * FROM checks WHERE id = ?', [result.lastId])!;
  },

  findRecent(limit = 100, offset = 0, filters?: { competitorId?: number; result?: string }): CheckRow[] {
    let sql = 'SELECT * FROM checks WHERE 1=1';
    const params: any[] = [];
    if (filters?.competitorId) { sql += ' AND competitor_id = ?'; params.push(filters.competitorId); }
    if (filters?.result) { sql += ' AND result = ?'; params.push(filters.result); }
    sql += ' ORDER BY started_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return queryAll<CheckRow>(sql, params);
  },

  countLast24h(): { total: number; failed: number; timeouts: number } {
    const since = new Date(Date.now() - 86400000).toISOString();
    const row = queryOne<any>(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN result IN ('error','blocked') THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN result = 'timeout' THEN 1 ELSE 0 END) as timeouts
      FROM checks WHERE started_at > ?
    `, [since]);
    return { total: row?.total || 0, failed: row?.failed || 0, timeouts: row?.timeouts || 0 };
  },

  getMethodPerformance(): any[] {
    return queryAll(`
      SELECT strategy,
        COUNT(*) as count,
        AVG(duration_ms) as avg_duration,
        SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
      FROM checks
      GROUP BY strategy
    `);
  },
};

// ─── Notification Repository ─────────────────────────────────────────

export interface NotificationRow {
  id: number;
  type: string;
  competitor_id: number | null;
  article_id: number | null;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}

export const notificationRepo = {
  create(data: { type: string; competitor_id?: number; article_id?: number; title: string; message: string }): NotificationRow {
    const result = runSql(`
      INSERT INTO notifications (type, competitor_id, article_id, title, message)
      VALUES (?, ?, ?, ?, ?)
    `, [data.type, data.competitor_id ?? null, data.article_id ?? null, data.title, data.message]);
    saveDb();
    return queryOne<NotificationRow>('SELECT * FROM notifications WHERE id = ?', [result.lastId])!;
  },

  findRecent(limit = 50, unreadOnly = false): NotificationRow[] {
    const sql = unreadOnly
      ? 'SELECT * FROM notifications WHERE is_read = 0 ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?';
    return queryAll<NotificationRow>(sql, [limit]);
  },

  markRead(id: number): void {
    runSql('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
    saveDb();
  },

  markAllRead(): void {
    runSql('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
    saveDb();
  },

  countUnread(): number {
    const row = queryOne<any>('SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0');
    return row?.cnt ?? 0;
  },
};

// ─── Settings Repository ─────────────────────────────────────────

export const settingsRepo = {
  get(key: string): string | null {
    const row = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return row?.value ?? null;
  },

  set(key: string, value: string): void {
    runSql(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `, [key, value, new Date().toISOString()]);
    saveDb();
  },

  getAll(): Record<string, string> {
    const rows = queryAll<{ key: string; value: string }>('SELECT key, value FROM settings');
    const result: Record<string, string> = {};
    for (const r of rows) result[r.key] = r.value;
    return result;
  },
};
