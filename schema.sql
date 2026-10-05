-- Cipher Blog Spy - Database Schema
-- SQLite with WAL mode. Designed to be portable to PostgreSQL.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- Competitors table
CREATE TABLE IF NOT EXISTS competitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL,
  blog_url TEXT,
  feed_url TEXT,
  sitemap_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  monitoring_status TEXT NOT NULL DEFAULT 'analyzing' CHECK(monitoring_status IN ('online','offline','degraded','analyzing')),
  monitoring_profile TEXT, -- JSON
  analysis_explanation TEXT,
  last_checked_at TEXT,
  last_successful_detection_at TEXT,
  next_check_at TEXT,
  poll_interval_ms INTEGER NOT NULL DEFAULT 60000,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  circuit_breaker_until TEXT,
  etag TEXT,
  last_modified TEXT,
  content_hash TEXT,
  is_baseline_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now'))
);

-- Articles table
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_id INTEGER NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  canonical_url TEXT,
  normalized_url TEXT NOT NULL,
  title TEXT,
  author TEXT,
  published_at TEXT,
  published_at_source TEXT, -- 'feed', 'json-ld', 'sitemap-lastmod', 'meta', 'unknown'
  modified_at TEXT,
  first_discovered_at TEXT NOT NULL,
  detection_delay_ms INTEGER, -- NULL if publish time unknown
  detection_method TEXT, -- 'rss', 'atom', 'sitemap', 'page', 'wp-api', 'json-feed'
  detection_check_id INTEGER,
  also_seen_by TEXT, -- JSON array
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','captured','failed_capture','baseline','published_to_destination','indexed')),
  delay_flag TEXT, -- 'ok', 'over_5min', 'unknown_publish_time'
  delay_reason TEXT,
  -- Content fields
  body_html TEXT,
  body_text TEXT,
  summary TEXT,
  featured_image TEXT,
  inline_images TEXT, -- JSON array
  categories TEXT, -- JSON array
  tags TEXT, -- JSON array
  meta_description TEXT,
  language TEXT,
  word_count INTEGER,
  jsonld_raw TEXT,
  opengraph_raw TEXT, -- JSON
  outbound_links TEXT, -- JSON array
  content_hash TEXT,
  -- Publishing
  published_to_url TEXT,
  publish_error TEXT,
  indexed_at TEXT,
  index_result TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now')),
  UNIQUE(competitor_id, normalized_url)
);

-- Checks table - every monitoring check recorded
CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_id INTEGER NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  strategy TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  http_status INTEGER,
  response_bytes INTEGER,
  result TEXT NOT NULL CHECK(result IN ('success','not_modified','timeout','error','blocked','skipped')),
  items_found INTEGER NOT NULL DEFAULT 0,
  new_items INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  cycle_number INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now'))
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- 'new_article', 'structure_change', 'competitor_offline', 'competitor_online', 'error'
  competitor_id INTEGER REFERENCES competitors(id) ON DELETE CASCADE,
  article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now'))
);

-- Settings table (key-value)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now'))
);

-- Events table for structure changes / system events
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_id INTEGER REFERENCES competitors(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  details TEXT, -- JSON
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_articles_competitor ON articles(competitor_id);
CREATE INDEX IF NOT EXISTS idx_articles_discovered ON articles(first_discovered_at);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_normalized ON articles(normalized_url);
CREATE INDEX IF NOT EXISTS idx_checks_competitor ON checks(competitor_id);
CREATE INDEX IF NOT EXISTS idx_checks_started ON checks(started_at);
CREATE INDEX IF NOT EXISTS idx_checks_result ON checks(result);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_competitors_next_check ON competitors(next_check_at);
CREATE INDEX IF NOT EXISTS idx_competitors_enabled ON competitors(enabled);
