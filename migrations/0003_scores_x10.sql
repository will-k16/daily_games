-- Each stage is now worth 1000 instead of 100 (the daily total is meters climbed, out of 3000).
UPDATE guesses SET raw_score = raw_score * 10, score = score * 10;
UPDATE plays SET score = score * 10 WHERE score IS NOT NULL;
