-- Email + password sign-in, Skipper's wardrobe, and a background "best answer" job per puzzle.
ALTER TABLE players ADD COLUMN password_hash TEXT;
ALTER TABLE players ADD COLUMN skipper TEXT NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_players_email ON players(email);

CREATE TABLE IF NOT EXISTS login_fails (
  key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_fails ON login_fails(key, created_at);

CREATE TABLE IF NOT EXISTS purchases (
  player_id TEXT NOT NULL,
  item TEXT NOT NULL,
  price INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (player_id, item)
);

ALTER TABLE puzzles ADD COLUMN best_started TEXT;

-- The judge now searches the web for every new answer. Give everything the old judge turned down
-- (and never got a human fix) a fresh look.
DELETE FROM answers WHERE status IN ('invalid', 'vague') AND source IN ('ai', 'mock') AND flagged = 0;
