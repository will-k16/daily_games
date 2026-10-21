-- Venn: round 2 par is at least 4 (a par of 3 made double par too easy). Only puzzles nobody has played yet.
UPDATE venn_puzzles SET par = 4
  WHERE round = 2 AND par < 4 AND status != 'rejected' AND NOT EXISTS (SELECT 1 FROM venn_plays pl WHERE pl.puzzle_id = venn_puzzles.id);
