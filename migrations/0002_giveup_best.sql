-- Give-up flag on plays, and the AI's best answer cached per puzzle.
ALTER TABLE plays ADD COLUMN gave_up INTEGER NOT NULL DEFAULT 0;
ALTER TABLE puzzles ADD COLUMN best_input TEXT;
ALTER TABLE puzzles ADD COLUMN best_name TEXT;
ALTER TABLE puzzles ADD COLUMN best_value REAL;
