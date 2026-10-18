-- WK Game Suite: Polly (guess what America said) and Polly's shop. WK Bucks reuse the purchases table.

CREATE TABLE IF NOT EXISTS polly_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  domains TEXT NOT NULL DEFAULT '[]',   -- JSON list of domains; subdomains count too
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

INSERT INTO polly_sources (name, domains, active, created_at) VALUES
  ('Pew Research Center', '["pewresearch.org"]', 1, '2026-10-18T00:00:00.000Z'),
  ('Gallup', '["gallup.com","news.gallup.com"]', 1, '2026-10-18T00:00:00.000Z'),
  ('General Social Survey / NORC', '["gss.norc.org","norc.org"]', 1, '2026-10-18T00:00:00.000Z'),
  ('YouGov', '["today.yougov.com","yougov.com"]', 1, '2026-10-18T00:00:00.000Z'),
  ('AP-NORC', '["apnorc.org"]', 1, '2026-10-18T00:00:00.000Z'),
  ('Ipsos', '["ipsos.com"]', 1, '2026-10-18T00:00:00.000Z'),
  ('Marist', '["maristpoll.marist.edu"]', 1, '2026-10-18T00:00:00.000Z'),
  ('Quinnipiac', '["poll.qu.edu"]', 1, '2026-10-18T00:00:00.000Z'),
  ('Monmouth', '["monmouth.edu"]', 1, '2026-10-18T00:00:00.000Z'),
  ('SSRS', '["ssrs.com"]', 1, '2026-10-18T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS polly_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'draft',      -- draft | approved | rejected | retired
  topic TEXT NOT NULL DEFAULT 'life',        -- life | beliefs | money | politics (never shown to players)
  short TEXT NOT NULL DEFAULT '',
  left_label TEXT NOT NULL DEFAULT '',
  right_label TEXT NOT NULL DEFAULT '',
  original_wording TEXT NOT NULL DEFAULT '',
  left_raw REAL,
  right_raw REAL,
  unsure_raw REAL,
  real INTEGER,                              -- left share of people who picked a side, whole %
  source_id INTEGER,
  url TEXT NOT NULL DEFAULT '',
  poll_end_date TEXT,                        -- exact day, YYYY-MM-DD
  sample_size INTEGER,
  time_sensitive INTEGER NOT NULL DEFAULT 0,
  ts_reason TEXT NOT NULL DEFAULT '',
  entry TEXT NOT NULL DEFAULT 'admin-entered',   -- auto-checked | admin-pasted | admin-entered
  evidence TEXT NOT NULL DEFAULT '',
  last_run_date TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_polly_questions_status ON polly_questions(status, approved_at);

CREATE TABLE IF NOT EXISTS polly_schedule (
  date TEXT NOT NULL,
  slot INTEGER NOT NULL,                     -- 1 | 2 | 3, played in that order
  question_id INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  reused INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, slot)
);
CREATE INDEX IF NOT EXISTS idx_polly_schedule_q ON polly_schedule(question_id);
-- A question is only ever scheduled once, except when it's reused to fill a day.
CREATE UNIQUE INDEX IF NOT EXISTS uq_polly_schedule_once ON polly_schedule(question_id) WHERE reused = 0;

CREATE TABLE IF NOT EXISTS polly_plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  date TEXT,                                 -- NULL in unlimited
  mode TEXT NOT NULL,                        -- daily | archive | unlimited
  total INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,           -- questions answered
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_polly_plays ON polly_plays(player_id, date, mode) WHERE mode IN ('daily', 'archive');
CREATE INDEX IF NOT EXISTS idx_polly_plays_date ON polly_plays(date, mode);

CREATE TABLE IF NOT EXISTS polly_guesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  play_id INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  own TEXT,                                  -- left | right | NULL (skipped)
  guess INTEGER NOT NULL,
  real INTEGER NOT NULL,                     -- snapshot at lock-in; a fix rewrites it
  score INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_polly_guesses ON polly_guesses(play_id, slot);
CREATE INDEX IF NOT EXISTS idx_polly_guesses_q ON polly_guesses(question_id);

CREATE TABLE IF NOT EXISTS polly_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guess_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  reason TEXT NOT NULL,                      -- wrong | wording | biased | other
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',       -- open | fixed | dismissed | retired
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_polly_reports_status ON polly_reports(status);
CREATE INDEX IF NOT EXISTS idx_polly_reports_player ON polly_reports(player_id);

ALTER TABLE players ADD COLUMN polly TEXT NOT NULL DEFAULT '{}';
