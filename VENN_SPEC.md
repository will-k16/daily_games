# Venn: game spec

Venn is the second game in WK Game Suite, at `/venn`. The decisions behind it are in [docs/WK_GAME_SUITE_PLAN.md](docs/WK_GAME_SUITE_PLAN.md) (section 4); this file describes what was built.

## The game
- Each day has **two rounds**. Round 1 is a two-circle Venn diagram; round 2 is a three-circle one. Each circle is a category written as one full plain phrase ("Things colored orange").
- **90 seconds per round.** Type as many things as you can that fit **all** circles: the overlap in round 1, the very center in round 2. "I'm done" ends a round early.
- Each round has a **Ready screen** (round, par, Start). The categories are hidden until Start, and the server doesn't send them before then. Round 2 unlocks once round 1's results are shown.
- One attempt per round per day. New puzzles at midnight UTC. Venn #1 is `VENN_LAUNCH_DATE`.

## What counts
- Any reasonable case: it counts if it can reasonably be described that way. Generic things, proper nouns and famous real people (when a category allows people). No fictional characters. Offensive answers are refused.
- The same real thing counts once: the judge returns a canonical name, and repeats show "Already have it" (no penalty). Variants collapse unless the categories are about that kind of thing.
- Round 2 counts only the center. Fitting exactly two shows "Close! Fits 2 of 3", lights those two vine rings, and doesn't count.
- Wrong answers cost nothing. Max 60 characters; empty input is ignored.
- **Did you mean ___?** A fuzzy match (edit distance) against the puzzle's known answers and answers already accepted for it, on the server, so the list never reaches the browser; if nothing is close, the AI judge may suggest one. The clock stops (and the circles hide) while the prompt is open, and the answer box is locked until it's answered. Yes judges the suggestion as if typed; No marks the answer ✗ and the player can retype it.
- **Fast typing:** answers are judged up to 4 at a time. Each waits under **Checking…** until its verdict lands in the feed; typing the same thing twice while it's checking only sends it once. Answers that reach the server after a "Did you mean" stopped the clock are held and sent again once it's answered. On the server, if two answers that arrive together turn out to be the same thing, the later one becomes a duplicate, and the count is recounted in SQL.

## The judge (`functions/_lib/venn-ai.js`)
- Gemini 3.5 Flash-Lite from memory via `callAI` (6 s timeout, one retry), Groq as backup. Logged to `ai_log` as `venn-judge`.
- A provider (or Groq model) that answers 429 is tried last for a while, and a rate-limited Groq model hands over to the next one (each has its own quota; the tiny 8b model never stands in for a busy one).
- **The judge is never allowed to lose an answer.** If every provider is busy or down, the answer is saved as `later` ("Saved for the judge" in the feed) and the page asks `POST venn/recheck` again after 2.5 s, 5 s, 10 s, 20 s, then every 30 s. Each recheck judges the waiting answers and rescores the play, so they land as normal verdicts mid-round, or raise the score after the round ends (results say the judge is still checking until then).
- Prompt inputs: the circle phrases, "judge facts as of <puzzle date>", the strictness, variant and no-fictional rules, the known answers (so canonical names line up), and the answer in `<answer>` tags with `<>` stripped.
- Output: `{ recognized, canonical, fits[], reason (≤12 words), didYouMean, offensive, fictional }`.
- Cached per puzzle in `venn_judgments` (puzzle id + normalized answer). The same answer always gets the same verdict; archive replays use the cache; admin edits win. An exact match to the puzzle's list counts without an AI call.
- Shares Summit's per-player daily AI-call cap.

## Puzzles
- The AI drafts and the admin approves (`/admin` → Venn). A day with nothing approved uses its draft; with no draft the AI makes one on the spot; if the AI is down, the built-in bank (`functions/_lib/venn-fallback.js`) is used.
- **Size check:** a draft must list at least 25 well-known answers (round 1) or 8 (round 2), or it's thrown out and regenerated. The list is stored with the puzzle and feeds "Answers you missed" and "Did you mean".
- **Par = 75% of typical** for round 1 (kept to 4–10) and **50% of typical** for round 2 (kept to 4–6), where `typical` is the AI's estimate of what an ordinary player finds in 90 seconds (it runs high, especially for round 2). History: 60% of typical was too easy (most players doubled par); 100% of typical (2026-10-20) was too hard (nobody did). Re-tuned 2026-10-21 against real plays so most players pass par and a good game reaches double par. Set when the puzzle is made, never crowd-adjusted; the admin can edit it.
- No category repeats within 30 days, and no exact pair/triple ever.

## The clock
- The server is authoritative: a play stores `elapsed_ms` and `resumed_at`. Answers after 90 s + 2 s grace are refused and the round closes.
- Hiding the page sends `navigator.sendBeacon('/api/venn/pause')`; the circles are hidden and blurred until the player resumes. If the beacon fails, the clock keeps running. Closing the page and coming back later resumes from the banked time.

## Scoring (`public/js/venn-score.js`)
`n` counted answers, par `P`: `n < P` → 5 per answer (e.g. 3 answers with par 4 = 15); `n = P` → `A = max(25, 5P)` (par 8 = 40, so reaching a big par is never worth less than the answers it took); `n ≥ 2P` → 100; otherwise `round(A + (100 − A) × (n − P) / P)`. The day is out of 200. (Changed from the plan's "0 below par" at Will's request.)

## After a round
Your answers on the diagram (✓ in the overlap, "Close!" in their two-ring region, ✗ listed beside with the reason and "Wrong call?"), "You found 8. Par was 5. 70 / 100.", up to 10 answers you missed (most-found by other players first, then the AI's list), and how everyone did ("better than X%" and the same 10-bar score histogram as every game; see [SPEC.md](SPEC.md)). The day summary shows the same chart for day totals (of 200). Accepting a complaint makes that answer count for the puzzle, rescores every play that has it, and the player gets a note on their next visit.

## Share
```
Venn #1 🦎 145/200
🟡🔵 8 found (par 5) ███████░░░ 🟨 70
🟡🔵🔴 3 found (par 2) ███████░░░ 🟨 75
wk-game-suite.pages.dev/venn
```
Squares: 🟩 85+, 🟨 55+, 🟧 25+, 🟥 below.

## Streaks, stats, modes
- Venn streak: a day counts if either round was finished. Stats: days, average and best day (of 200), streak, max streak, histogram of day totals, archive rounds and average.
- Archive: replay past days, separate stats, no streak, half WK Bucks. Admin-only Unlimited at `/venn#/unlimited`. No public practice mode.

## WK Bucks
`floor(roundScore / 4)` per daily round (a perfect day = 50, same as Summit), `floor(roundScore / 8)` on the archive, 0 in Unlimited.

## Mel and the jungle
- Mel (from the middle of "chaMELeon") is pixel art on a low-res canvas, sitting on a branch beside big hoops of woven vine that hang from a branch in a layered jungle canopy (far trees, vines, broad leaves, hanging moss, butterflies, slow parallax). Ring A is yellow, B blue, overlap green; round 2 adds C red, and the center is a dark warm brown. Regions are dithered, not gradients.
- Mel flashes the overlap green on ✓ (default skin Fern `#3d7a5a`), the tongue zaps out and drops each caught answer into the overlap, the eyes follow the caret and pointer, and the mood at the end follows the score. Click Mel for Mel's card and the wardrobe. No sound.
- **Mel's shop** (`public/js/mel-wardrobe.js`, keys `mel:<slot>:<id>`, look in `players.mel`): skin, pattern, hat, eyewear, neck, name tag. Two taps to buy, hover preview, "Wearing", only you see the name.

## API
`GET venn/today`, `POST venn/start`, `POST venn/answer`, `POST venn/confirm`, `POST venn/pause`, `POST venn/resume`, `POST venn/done`, `GET venn/results`, `POST venn/complaint`, `GET venn/stats`, `GET venn/archive`, `GET venn/archive/day`, `POST venn/unlimited/new` (admin), `GET mel`, `POST mel/buy`, `POST mel/wear`; admin: `admin/venn/calendar`, `admin/venn/generate`, `admin/venn/puzzle` (+ `/delete`), `admin/venn/complaints` (+ `/resolve`), `admin/venn/judgments` (+ `/delete`).

## Data (migration `0005_suite_venn.sql`)
`venn_puzzles`, `venn_plays`, `venn_answers`, `venn_judgments`, `venn_complaints`, and `players.mel`.
