-- Polly: finding questions automatically. Feeds (RSS or sitemaps) from allowlisted pollsters list new report
-- pages; each page is queued, read, and its candidates checked; the trustworthy ones are approved on their own.

CREATE TABLE IF NOT EXISTS polly_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  url TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'rss',          -- rss (RSS or Atom) | sitemap
  active INTEGER NOT NULL DEFAULT 1,
  last_checked TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO polly_feeds (source_id, url, kind, active, created_at)
  SELECT id, 'https://www.pewresearch.org/feed/', 'rss', 1, '2026-10-18T00:00:00.000Z' FROM polly_sources WHERE name = 'Pew Research Center';
INSERT OR IGNORE INTO polly_feeds (source_id, url, kind, active, created_at)
  SELECT id, 'https://news.gallup.com/sitemap-content.xml?space=POLL', 'sitemap', 1, '2026-10-18T00:00:00.000Z' FROM polly_sources WHERE name = 'Gallup';
INSERT OR IGNORE INTO polly_feeds (source_id, url, kind, active, created_at)
  SELECT id, 'https://apnorc.org/feed/', 'rss', 1, '2026-10-18T00:00:00.000Z' FROM polly_sources WHERE name = 'AP-NORC';

CREATE TABLE IF NOT EXISTS polly_pages (
  url TEXT PRIMARY KEY,
  source_id INTEGER,
  title TEXT NOT NULL DEFAULT '',
  published TEXT,
  status TEXT NOT NULL DEFAULT 'queued',     -- queued | done | failed | skipped
  attempts INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0,          -- approved on their own
  drafted INTEGER NOT NULL DEFAULT 0,        -- passed the check, waiting for the admin
  failed INTEGER NOT NULL DEFAULT 0,         -- failed the check
  note TEXT NOT NULL DEFAULT '',
  found_at TEXT NOT NULL,
  checked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_polly_pages_status ON polly_pages(status, published);

-- Pages the admin already added by hand count as read.
INSERT OR IGNORE INTO polly_pages (url, source_id, status, found_at, checked_at)
  SELECT url, MIN(source_id), 'done', '2026-10-18T00:00:00.000Z', '2026-10-18T00:00:00.000Z' FROM polly_questions WHERE url != '' GROUP BY url;

CREATE TABLE IF NOT EXISTS polly_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO polly_meta (key, value) VALUES ('auto_approve', '1');
