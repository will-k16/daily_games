-- Just Right: initial schema

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT,
  created_at TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_player ON sessions(player_id);

CREATE TABLE IF NOT EXISTS puzzles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  slot INTEGER NOT NULL,
  status TEXT NOT NULL,            -- draft | approved | auto | rejected | unlimited
  property TEXT NOT NULL,
  unit_label TEXT NOT NULL DEFAULT '',
  small_item TEXT NOT NULL,
  small_value REAL NOT NULL,
  big_item TEXT NOT NULL,
  big_value REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_puzzles_live ON puzzles(date, slot) WHERE status IN ('approved', 'auto');
CREATE INDEX IF NOT EXISTS idx_puzzles_date ON puzzles(date);

CREATE TABLE IF NOT EXISTS answers (
  key TEXT PRIMARY KEY,
  property TEXT NOT NULL,
  norm TEXT NOT NULL,
  status TEXT NOT NULL,            -- ok | vague | invalid
  name TEXT NOT NULL DEFAULT '',
  value REAL NOT NULL DEFAULT 0,
  suggestions TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL DEFAULT '',
  flagged INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'ai',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_answers_norm ON answers(norm);

CREATE TABLE IF NOT EXISTS plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  puzzle_id INTEGER NOT NULL,
  mode TEXT NOT NULL,              -- daily | archive | unlimited
  state TEXT NOT NULL,             -- g1 | decide | g2 | done
  rejects1 INTEGER NOT NULL DEFAULT 0,
  rejects2 INTEGER NOT NULL DEFAULT 0,
  score INTEGER,
  used_second INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plays ON plays(player_id, puzzle_id, mode);
CREATE INDEX IF NOT EXISTS idx_plays_puzzle ON plays(puzzle_id, mode, state);

CREATE TABLE IF NOT EXISTS guesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  play_id INTEGER NOT NULL,
  attempt INTEGER NOT NULL,
  input TEXT NOT NULL,
  answer_key TEXT NOT NULL,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  raw_score INTEGER NOT NULL,
  score INTEGER NOT NULL,
  out_of_range INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guesses_play ON guesses(play_id);
CREATE INDEX IF NOT EXISTS idx_guesses_key ON guesses(answer_key);

CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guess_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',   -- open | accepted | rejected
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_player ON complaints(player_id);

CREATE TABLE IF NOT EXISTS ai_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  provider TEXT NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  error TEXT NOT NULL DEFAULT '',
  player_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_log_created ON ai_log(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_log_player ON ai_log(player_id, created_at);
