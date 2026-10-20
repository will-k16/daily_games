-- Venn: par is now the typical count (it was 60% of it, and real players kept reaching double par). Puzzles nobody has
-- played yet get the new par; played puzzles keep theirs, so no score changes.
UPDATE venn_puzzles SET par = MIN(CASE WHEN round = 2 THEN 10 ELSE 15 END, MAX(CASE WHEN round = 2 THEN 3 ELSE 5 END, typical))
  WHERE status != 'rejected' AND NOT EXISTS (SELECT 1 FROM venn_plays pl WHERE pl.puzzle_id = venn_puzzles.id);
