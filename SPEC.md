# Just Right: build spec

This is the single source of truth for rebuilding **Threshold** as a standalone, free-to-host web game called **Just Right**. It records three things: how the old Apps Script version worked, what makes games like it popular, and every decision made for the new version.

---

## 1. The core idea (unchanged)

Players see two real things and one measurable property, for example *a house cat* and *a blue whale* by **weight**. They name a third real thing whose value sits in the **middle by ratio**. That middle is the geometric mean, `√(small × big)`, which is the midpoint on a log scale.

- Cat (~4.5 kg) and blue whale (~150,000 kg) → middle ≈ 820 kg (about a dairy cow). The plain average, ~75,000 kg, would be meaningless.
- Wristwatch radius (~2 cm) and the Sun's radius (~696,000 km) → middle ≈ 3.7 km.

An AI "judge" estimates the value of whatever the player types. Answers are cached so the same answer always gets the same value.

---

## 2. How the old version worked (Threshold, Google Apps Script)

These are the files kept in this folder for reference: `Code.gs` (server) and `threshold.html` (client).

- **Storage:** a Google Sheet with the tabs `Users`, `Puzzles`, `Guesses` and `Cache`. Every request read whole tabs.
- **Identity:** the Google Workspace email (epsne.org) or a random client ID in localStorage. Two hard-coded admins.
- **Daily puzzle:** one pair per day. It came from an admin-scheduled row, or was AI-generated on demand, or fell back to a hard-coded list of 10 pairs. Resets at midnight UTC.
- **One guess.** The judge returned `ok`, `vague` (with suggestions and a "use the average" option) or `invalid`. Typing either end was rejected. The values of the ends were never sent before the guess.
- **AI:** Groq (with a list of models to try in order), Gemini as backup, temperature 0, JSON output. A puzzle-generator prompt (items a high-schooler knows, ratio ≥100×, pairs from different worlds, no repeats of the last 80 puzzles) and a judge prompt (status/name/value/suggestions/reason).
- **Scoring:** `err = |ln(guess/mid)|`, the minimum of a position score (100 at the middle, 0 at the ends) and a cap (100 within 1.5×, 50 at 3×, 0 at 30×). A flat 100 zone within 1.5× made perfect scores too easy.
- **Client:** a balance-beam SVG, a reveal track shaded by score, other players' dots, "you beat X%", an emoji share line, US/metric toggle, a scratchpad calculator with saved values, stats (played, average, best, streaks, distribution), an admin-only Unlimited mode, and admin tabs (Users, Puzzles, Guesses, Cached answers).
- **Problems:** a bland, generic look. Whole-sheet reads that slow down as data grows. Anonymous players could replay by clearing storage. Unclear units in the scratchpad. "The judge was wrong" with no way to appeal.

---

## 3. What makes games like this popular (research summary)

Games looked at: **Krillion** (name a rare answer; rarer scores more; a krill sinks deeper), **Noillirk** (Krillion reversed; the most common answer wins; a krill floats up on balloons), **Chainle** (one word that links clues; graded semantic score out of 1000 per round; explanations afterward), **Fermi** (estimate a number; graded on a log ratio; worked solutions shown).

What they share:
1. **Open input, scored by degree.** No single right answer, and partial credit always.
2. **The score measures how you think** (taste, calibration, sense of scale), which makes it shareable.
3. **You're playing against the crowd or the world:** "what would people say?" / "how big is it really?"
4. **Everyone gets the same short puzzle each day** (2–5 minutes), plus a spoiler-free share.
5. **Low stakes and forgiving.** Mistakes cost points, not the whole game.
6. **A reveal you learn from**, where the post-answer moment is the payoff.
7. **One visual picture of your score** (Krillion's ocean depth) turns a number into a story.
8. **A character and a world** (the krill, chains) give the game personality and make it feel handmade.

Pitfalls to avoid: bare higher/lower feedback (it becomes binary search), ambiguous feedback arrows, number entry that breaks with other locales' formats, repeated questions, wrong reference data, and graded scoring without a believable source.

---

## 4. Decisions for the new version

### 4.1 Platform (everything free)
- **Cloudflare Pages** (static site) + **Pages Functions** (API) + **D1** (SQLite).
  - Free tier: 100,000 function requests/day, 5 million D1 row reads/day, 100,000 row writes/day, 5 GB storage. Static asset requests are free and unlimited.
- **AI judge:** Groq (primary) → Gemini (backup), both free tiers. Caching answers means repeat answers never hit the AI. Each player is limited per day (80 AI calls) to protect the quota.
- **Code:** a git repo pushed to GitHub, with Cloudflare Pages deploying on every push. Free `*.pages.dev` subdomain.
- No build step: plain HTML/CSS/ES modules on the front end and plain JS functions on the back end.

### 4.2 Audience and identity
- **Public**, anyone can play.
- **Anonymous by default:** a server-set HttpOnly cookie holds a random player ID.
- **Optional Google sign-in** syncs stats across devices. Signing in merges the anonymous device's plays into the account.
- **No public names anywhere.** Comparisons are percentiles, histograms and anonymous top answers.
- **Admin** = Google accounts listed in `ADMIN_EMAILS` (`will.kolander@gmail.com`).

### 4.3 Daily structure
- **3 puzzles per day**, ramping **easy → medium → hard**. They are the three acts of the Goldilocks story:
  1. 🥣 **Porridge** (kitchen): easy
  2. 🪑 **Chairs** (living room): medium
  3. 🛏️ **Beds** (bedroom): hard
- Daily score out of **300**.
- Reset at **midnight UTC**. Puzzle number = days since launch + 1.
- Difficulty comes from **all** of the following: property familiarity, range width (narrower is harder), obscurity of the two ends, and how few common things live near the middle.
- The three puzzles each day use **three different properties**, so one answer can't do well on all of them.
- **No timer.**

### 4.4 Guess rules (per puzzle)
1. The player types the name of a real thing.
2. Rejections that **don't use up a guess**: empty input, over 80 characters, one of the two ends, the same thing as their own first guess (on the second try), `invalid` (fictional, nonsense, offensive, property doesn't apply), or `vague` (offers 3–4 specific suggestions plus "use the average").
3. **Out of range** (judged value ≤ the small end or ≥ the big end) shows only "Out of range", never which side. Each guess allows **3** out-of-range rejections. A **4th** out-of-range answer is locked in as that guess with **score 0**.
4. **After the first accepted guess**, the player sees what they typed, how the judge interpreted it, the judge's value, and the **score**. They do *not* see the ends' values or which direction they're off. Since they know both the value and the score, they can work out that the middle is about X× above *or* below. That's the deduction game.
5. Then they either **keep it** (final), or take **one second guess**:
   - The second guess must be a different thing from the first.
   - **The second guess is final** (not "best of"), and it's multiplied by **×0.8** (so a perfect second guess = 80).
   - A first guess that scores 100 is kept automatically.
6. **Full reveal after each puzzle:** both ends' values, the just-right middle, where each guess landed on the thermometer, the score histogram and percentile for that puzzle, today's **best answer**, and the **top answers** with their values and scores.
7. **"Judge got it wrong?"** on any judged guess logs a complaint (with an optional note) for the admin.

### 4.5 Scoring
- `lo, hi` = the ends, `mid = √(lo·hi)`, `err = |ln(g/mid)|`, `half = ln(hi/mid)`, `P = ln(1.05)`.
- Outside the range → 0 (and rejected anyway, see above).
- `e = max(0, err − P)`
- Position factor: `pos = max(0, 1 − e / (half − P))`, which reaches 0 at the ends. Narrow ranges are naturally harsher.
- Precision factor (a bell curve with a gentle tail): `prec = 1 / (1 + (e / K)²)`, where `K = ln 3 − P`. That gives 50% at 3× off.
- `score = 100` if `e = 0` (within 1.05×), otherwise `floor(100 · pos · prec)`, so every distance gives a distinct, continuous score.
- Sample values on a very wide range (10¹²×): 1.05× → 100, 1.1× → 99, 1.5× → 87, 2× → 69, 3× → 46, 10× → 14, 30× → 6.
- On a narrow range (30×): 1.1× → 96, 1.5× → 70, 2× → 44, 3× → 18.
- Second guess: `round(raw × 0.8)`.

### 4.6 Puzzle creation
- **The AI drafts and the admin approves.** Admin clicks "Generate drafts" for upcoming days, and the AI writes tiered sets of 3 per day. On the calendar the admin can approve, edit, reject or hand-write puzzles.
- If a day has no approved puzzle for a slot when someone plays: use that day's draft (it's marked `auto`). Otherwise generate one on the spot, and if the AI is down, use the built-in tiered fallback bank.
- Ratio between the ends: easy 1,000×–10,000,000×, medium 100×–100,000×, hard 30×–1,000×. Minimum 20×.

### 4.7 Properties (13 + 6 new = 19)
Values are stored in one base unit per property:

| key | label | base unit | tier hint |
|---|---|---|---|
| weight | weight | kg | easy |
| height | height | m | easy |
| length | length | m | easy |
| speed | top speed | m/s | easy |
| price | price | USD | easy |
| distance | distance | m | medium |
| volume | volume | L | medium |
| age | age | years | medium |
| population | population | people | medium |
| duration | duration | seconds | medium |
| capacity | capacity (people it holds) | people | medium |
| calories | food energy | kcal | medium |
| area | area | m² | hard |
| lifespan | lifespan | years | hard |
| depth | depth | m | hard |
| power | power | watts | hard |
| data | data size | bytes | hard |
| words | word count | words | hard |
| copies | copies sold | copies | hard |

Custom properties with their own unit label are allowed for admin-made puzzles.

### 4.8 AI judge
- Same three statuses: `ok` / `vague` / `invalid`. Offensive answers → `invalid`, marked as flagged.
- The cache key is `property | normalized answer | avg flag` (plus the unit for custom properties). Admin edits override the AI.
- Prompt safety: the answer is wrapped in tags with `<>` stripped, and the prompt says to treat it only as a name.
- Every AI call is logged (provider, success, latency, error) for the dashboard.

### 4.9 Complaints
- A player reports a judged guess (with an optional note). It goes to the **Complaints inbox**.
- **Accept** (optionally with a corrected name and value):
  1. fix the cached value so future players get it,
  2. **rescore every guess** that used that answer (play scores update, with ×0.8 still applied to second guesses),
  3. **notify the player** ("Your appeal was accepted") on their next visit.
- **Reject:** the player is notified that it was reviewed.

### 4.10 Moderation of shown answers
- Offensive answers are rejected by the judge.
- **Top answers** and the **best answer** show an answer publicly only if it was given by **2+ different players** or the admin **approved** it. Admin sees a "needs approval" list.

### 4.11 Social and comparison
- Per puzzle: percentile ("you beat 73%"), a score histogram, today's best answer, and the top 5 answers (name, value, score).
- Per day: total out of 300 and the day's percentile.
- **Share text** (no spoilers), one row per room:
  ```
  Just Right #12 🐻 213/300
  🥣 ❌❌🟩 98
  🪑 🟧→🟩 72
  🛏️ 🟥 43
  https://<site>
  ```
  ❌ = an out-of-range rejection, colored squares = accepted guesses (🟩 ≥ 90, 🟨 ≥ 60, 🟧 ≥ 30, 🟥 < 30), → = took the second guess (×0.8 applied).
- **Tip-jar link** (configurable; hidden if empty). No ads.

### 4.12 Archive and Unlimited
- **Archive:** everyone can replay past days. Archive scores are saved with **separate stats** and never affect streaks or daily percentiles.
- **Unlimited:** **admin only**, for testing. Nobody else sees the option at all.

### 4.13 Stats
Days played (all 3 rooms finished), average daily total, best, current streak, max streak, a distribution of daily totals, and archive plays and average.

### 4.14 Scratchpad ("Field notebook")
- It must **not cover the puzzle**: on desktop it docks as a side column next to the game, and on phones it's a bottom sheet that always shows a compact puzzle summary at the top.
- **Middle finder:** enter estimates for the small and big ends, each with any unit, and get `√(small × big)` in any unit. It explains: *"If your guesses for the two ends are about right, the just-right value is about √(small × big). That's the middle by ratio."*
- **Notebook:** rows of name + number + unit, with a clear "+ Add a value" button. Each row can be sent to the finder.
- **Converter:** any unit to any unit of the same kind (g → lb, m → ft, and so on). Units cover mass, length, area, volume, time, speed, energy, power and data.
- **Calculator:** plain numbers (clearly labeled), with √, ^, ×10ⁿ and history.
- Everything is saved locally (localStorage).

### 4.15 Units for display
A US/metric toggle. Values are formatted with sensible units (oz/lb/tons, in/ft/mi, mL/L/gal, ms through years, W through GW, B through TB, and so on).

### 4.16 Admin tools (admin.html)
- **Dashboard:** today's players, average scores per room, the score distribution, AI calls and errors, open complaints.
- **Calendar and queue:** the next 30 / past 14 days with 3 slots each and their status. Generate drafts, edit, approve, reject, hand-write.
- **Complaints inbox:** accept (with a value fix and rescore) or reject.
- **Answer value editor:** search the cache, edit name/value/status, approve for public display, rescore.
- **Unlimited:** a link into the game in unlimited mode.

---

## 5. Design: "Just Right" (rebrand of Threshold)

- **Concept:** Goldilocks: not too small, not too big. The two ends become **"Too small"** and **"Too big"** signs instead of A and B, and you find the one that's **juuust right**.
- **Mascot and logo:** **a pixel bear cub** (Baby Bear) hosting in a cozy cottage. Its face reacts to every score (sad, neutral, happy, wow), with sparkles on a perfect.
- **Vibe:** **cozy illustrated + pixel art.** Pixel sprites (bear, bowls, chairs, beds, window, sky) on warm, storybook backgrounds. Gingham tablecloth patterns and wooden hand-painted signs.
- **Each room** shows a tiny item and a giant item (small and big bowl / chair / bed) with the item names on wooden signs. The middle spot holds a "?" that fills in on reveal.
- **Score meter:** a **porridge thermometer** running from "too small" (cold, blue) to "too big" (hot, red), with a green "just right" band in the middle. The bear-head marker slides to where you landed.
- **Daily progress:** a **honey jar** that fills with your daily total (out of 300). Room tabs show 🥣 🪑 🛏️ with scores.
- **Time of day:** the scene and palette follow the player's local time (morning, day, evening, night). Night doubles as dark mode.
- **Type:** a pixel font for headings and scores (Pixelify Sans) and a rounded body font (Nunito).
- **Motion:** lots of animation, **no sound**: bobbing bear, rising steam, sliding marker, pixel confetti on great scores, a wobble on misses. Respects `prefers-reduced-motion`.
- **Devices:** phone and desktop treated equally.
- **Onboarding:** an illustrated 3-panel how-to on first visit (reopen with "?").

---

## 6. Data model (D1)

- `players(id, google_sub, email, created_at, last_seen)`
- `sessions(token, player_id, created_at, expires_at)`
- `puzzles(id, date, slot, status[draft|approved|auto|rejected|unlimited], property, unit_label, small_item, small_value, big_item, big_value, note, created_at)`, unique `(date, slot)` among approved/auto
- `answers(key, property, norm, status, name, value, suggestions, reason, flagged, approved, source, updated_at)`
- `plays(id, player_id, puzzle_id, mode[daily|archive|unlimited], state[g1|decide|g2|done], rejects1, rejects2, score, used_second, created_at, finished_at)`, unique `(player_id, puzzle_id, mode)`
- `guesses(id, play_id, attempt, input, answer_key, name, value, raw_score, score, out_of_range, created_at)`
- `complaints(id, guess_id, player_id, note, status[open|accepted|rejected], admin_note, created_at, resolved_at, seen)`
- `ai_log(id, kind, provider, ok, ms, error, player_id, created_at)`

## 7. Configuration
- `wrangler.toml` vars: `LAUNCH_DATE`, `ADMIN_EMAILS`, `TIP_URL`.
- Secrets: `GROQ_API_KEY`, `GEMINI_API_KEY` (optional), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, optional `GROQ_MODEL`, `GEMINI_MODEL`.
- Local dev only (`.dev.vars`): `MOCK_AI=1` (fake judge for offline testing), `DEV_LOGIN_EMAIL` (localhost-only sign-in without Google).
