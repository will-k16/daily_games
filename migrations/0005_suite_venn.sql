-- WK Game Suite: Venn (a second daily game) and Mel's wardrobe. WK Bucks reuse the purchases table.

CREATE TABLE IF NOT EXISTS venn_puzzles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  round INTEGER NOT NULL,          -- 1 = two circles, 2 = three circles
  status TEXT NOT NULL,            -- draft | approved | auto | rejected | unlimited
  circles TEXT NOT NULL,           -- JSON [phrase, phrase(, phrase)]
  par INTEGER NOT NULL,
  typical INTEGER NOT NULL DEFAULT 0,
  answers TEXT NOT NULL DEFAULT '[]',   -- JSON list of well-known answers (never sent to players)
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_venn_puzzles_live ON venn_puzzles(date, round) WHERE status IN ('approved', 'auto');
CREATE INDEX IF NOT EXISTS idx_venn_puzzles_date ON venn_puzzles(date);

CREATE TABLE IF NOT EXISTS venn_plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  puzzle_id INTEGER NOT NULL,
  mode TEXT NOT NULL,              -- daily | archive | unlimited
  state TEXT NOT NULL,             -- ready | running | paused | done
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  resumed_at INTEGER,              -- epoch ms while running, NULL otherwise
  count INTEGER NOT NULL DEFAULT 0,
  score INTEGER,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_venn_plays ON venn_plays(player_id, puzzle_id, mode);
CREATE INDEX IF NOT EXISTS idx_venn_plays_puzzle ON venn_plays(puzzle_id, mode, state);

CREATE TABLE IF NOT EXISTS venn_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  play_id INTEGER NOT NULL,
  input TEXT NOT NULL,
  norm TEXT NOT NULL,
  canonical TEXT NOT NULL DEFAULT '',
  verdict TEXT NOT NULL,           -- ok | no | dup | close | pending
  fits TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_venn_answers_play ON venn_answers(play_id);
CREATE INDEX IF NOT EXISTS idx_venn_answers_norm ON venn_answers(norm);

CREATE TABLE IF NOT EXISTS venn_judgments (
  puzzle_id INTEGER NOT NULL,
  norm TEXT NOT NULL,
  canonical TEXT NOT NULL DEFAULT '',
  fits TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL DEFAULT '',
  suggestion TEXT NOT NULL DEFAULT '',
  offensive INTEGER NOT NULL DEFAULT 0,
  fictional INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'ai',    -- ai | admin
  updated_at TEXT NOT NULL,
  PRIMARY KEY (puzzle_id, norm)
);

CREATE TABLE IF NOT EXISTS venn_complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  answer_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',  -- open | accepted | rejected
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_venn_complaints_status ON venn_complaints(status);
CREATE INDEX IF NOT EXISTS idx_venn_complaints_player ON venn_complaints(player_id);

ALTER TABLE players ADD COLUMN mel TEXT NOT NULL DEFAULT '{}';
