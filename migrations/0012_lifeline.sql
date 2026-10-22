-- WK Game Suite: Lifeline (name someone alive for both events) and Race the jerboa's shop.

CREATE TABLE IF NOT EXISTS lifeline_puzzles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  round INTEGER NOT NULL,          -- 1 easy, 2 medium, 3 hard
  status TEXT NOT NULL,            -- draft | approved | auto (picked for the day on its own) | rejected
  a_label TEXT NOT NULL,
  a_date TEXT NOT NULL,            -- "1941-12-07", or "-0044-03-15" for BCE
  a_prec INTEGER NOT NULL DEFAULT 11,   -- 11 day, 9 year (Wikidata's precision numbers)
  b_label TEXT NOT NULL,
  b_date TEXT NOT NULL,
  b_prec INTEGER NOT NULL DEFAULT 11,
  examples TEXT NOT NULL DEFAULT '[]',  -- JSON list of names alive for both (shown after you play)
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lifeline_live ON lifeline_puzzles(date, round) WHERE status IN ('approved', 'auto');
CREATE INDEX IF NOT EXISTS idx_lifeline_puzzles_date ON lifeline_puzzles(date);

-- Everyone a player has named: looked up on Wikidata once, then kept. An admin fix sets source = 'admin'.
CREATE TABLE IF NOT EXISTS lifeline_people (
  qid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  descr TEXT NOT NULL DEFAULT '',
  birth TEXT NOT NULL DEFAULT '',
  birth_prec INTEGER NOT NULL DEFAULT 11,
  death TEXT NOT NULL DEFAULT '',
  death_prec INTEGER NOT NULL DEFAULT 11,
  links INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'wikidata',
  updated_at TEXT NOT NULL
);

-- What a typed name turned into, so the same name never hits Wikipedia twice.
CREATE TABLE IF NOT EXISTS lifeline_searches (
  norm TEXT PRIMARY KEY,
  qids TEXT NOT NULL,              -- JSON list of candidate Wikidata ids, best first
  pick TEXT NOT NULL DEFAULT '',   -- the one to take straight away, or '' to ask which
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lifeline_plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  puzzle_id INTEGER NOT NULL,
  mode TEXT NOT NULL,              -- daily | archive
  input TEXT NOT NULL,
  qid TEXT NOT NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  kind TEXT NOT NULL,              -- both | one | between | outside
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lifeline_plays ON lifeline_plays(player_id, puzzle_id, mode);
CREATE INDEX IF NOT EXISTS idx_lifeline_plays_puzzle ON lifeline_plays(puzzle_id, mode);
CREATE INDEX IF NOT EXISTS idx_lifeline_plays_qid ON lifeline_plays(qid);

CREATE TABLE IF NOT EXISTS lifeline_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  play_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  qid TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',  -- open | fixed | dismissed
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lifeline_reports_status ON lifeline_reports(status);
CREATE INDEX IF NOT EXISTS idx_lifeline_reports_player ON lifeline_reports(player_id);

ALTER TABLE players ADD COLUMN race TEXT NOT NULL DEFAULT '{}';
