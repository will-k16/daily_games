-- Venn: par as 100% of typical (0009) turned out too hard; 60% (before that) was too easy. Par is now 75% of typical
-- for round 1 (kept to 4–10) and 50% for round 2 (kept to 3–6, raised to 4–6 in 0011). Puzzles nobody has played yet get the new par;
-- played puzzles keep theirs, so no score changes.
UPDATE venn_puzzles SET par = CASE WHEN round = 2
    THEN MIN(6, MAX(3, CAST(ROUND(typical * 0.5) AS INTEGER)))
    ELSE MIN(10, MAX(4, CAST(ROUND(typical * 0.75) AS INTEGER))) END
  WHERE status != 'rejected' AND NOT EXISTS (SELECT 1 FROM venn_plays pl WHERE pl.puzzle_id = venn_puzzles.id);
