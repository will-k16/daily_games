# Polly: game spec

Polly is the third game in WK Game Suite, at `/polly`. Everything here was settled with Will in a Q&A on 2026-10-18 and counts as a requirement. Anything Claude filled in that Will didn't answer directly is listed in **§17, Filled in by Claude**, so Will can check it. If something isn't covered, ask Will rather than guessing.

Shared suite rules (accounts, guests, WK Bucks, midnight-UTC reset, admin rules, the home page) are in [docs/WK_GAME_SUITE_PLAN.md](docs/WK_GAME_SUITE_PLAN.md) and still apply.

---

## 1. The game in one paragraph

Each day has **3 poll questions**, each taken from a real, verified poll of **US adults**. Every question has two sides, like *"Would you rather be 10 minutes early or 10 minutes late?"* (**Early** / **Late**). For each one, you can first say which side you're on (or skip). Then you drag a **split bar** to guess what percent of Americans picked each side, and lock it in. Polly the cockatoo, the town crier, rings her bell, the townsfolk walk to their sides of the square, and the real split is revealed with its source. You score 0–100 per question on a steep curve, so the day is out of **300**. There's one shot per question and no timer. Pitch line: **"Guess what America said."**

---

## 2. Daily structure

- **3 questions per day**, in a **fixed order** that's the same for every player (Q1 → Q2 → Q3). There are no difficulty tiers or themes; the questions are mixed.
- **No Ready screen.** Opening `/polly` shows the first unanswered question right away.
- **No timer.**
- **One shot** per question: once locked in, it's final.
- New questions at **midnight UTC**, like the other games. **Polly #1 is the day it's deployed** (`POLLY_LAUNCH_DATE` var). Puzzle number = days since launch + 1.
- **Leaving mid-day is fine.** Progress is saved on the server per question at lock-in. Coming back opens the next unanswered question. Your side tap and slider position are **not** saved before lock-in, so a reload clears them.

---

## 3. One question, step by step

### 3.1 What's on screen
- The **short question** (the rewrite, ≤ 90 characters), big.
- The **two side labels** (≤ 14 characters each). The **left side is always orange** `#e8743b` and the **right side is always teal** `#1f8a8a`.
- **Your answer:** two big buttons, orange with the left label and teal with the right label, plus a small **Skip** link under them.
- The **split bar** (§3.3), its **−/+** nudge buttons, and **Lock in**.
- The topic is **not** shown to players.

### 3.2 Your own answer (optional)
- Tapping a side button marks it as chosen (filled, with a pressed state). Tapping the other switches it. **You can change it until lock-in.**
- **Skip** hides the buttons for this question and shows "Skipped" in small text, with an **Undo** link that brings them back before lock-in.
- **You don't have to answer or skip before using the bar.** The bar is usable at any time. Lock in sends whichever side is chosen, or none.
- Your own side is used for the **WK players' split** (§5.3) and the **Agree with America** stat. It never affects your score.

### 3.3 The split bar
- A horizontal bar from 0 to 100, split by one **handle**.
  - Everything **left of the handle is orange** and everything **right of it is teal**. Example: handle at 25 → the left 25% is orange and the right 75% is teal.
  - The left end shows the left label and its live % ("EARLY 25%"), and the right end shows the right label and its % ("75% LATE").
  - **What you're guessing is the left side's %.** The right side is always 100 minus that.
- **Empty until touched.** Before the first touch, the bar shows a grey dither in both halves with no handle, the side %s read "–", the text "Tap the bar to guess" sits on it, and **Lock in is disabled**.
- **Input:**
  - Tap or click anywhere on the bar: the handle jumps there.
  - Drag the handle. It snaps to **whole numbers 0–100**.
  - **− / +** buttons on either side nudge by 1. Holding one repeats every 80 ms after a 400 ms delay.
  - **Keyboard:** the bar has `role="slider"`, `aria-valuemin=0`, `aria-valuemax=100`, and `aria-valuetext="Early 25%, Late 75%"`. ←/→ move it by 1, PageUp/PageDown by 10, Home/End to 0/100.
- **Lock in** sends `{ slot, guess, own }` to the server. The server **never sends the real number before lock-in**. A second lock for the same question returns 409.
- **Before lock-in, the scene doesn't react** to the bar. The townsfolk keep milling around the middle of the square.

### 3.4 The reveal (after each question)
The reveal plays in this order, about 4 seconds in total:
1. **The bell (400 ms):** Polly swings her hand bell on the podium, and three pixel "ding" marks pop out.
2. **The walk (1,500 ms):** the townsfolk walk to their sides. Exactly `round(30 × real / 100)` of the 30 townsfolk go to the orange (left) half; the rest go to teal.
3. **Count-up (600 ms):** the bar re-fills to the **real** split, and the real % counts up above a white notch with a tag ("62%").
4. **Your guess stays on the bar** as a small ink triangle under it labelled "You 55". A dithered bracket between your marker and the real notch is labelled "7 off" (or **"Exact!"** at 0 off).
5. **Score (600 ms):** the score counts up (0–100). Polly's crest rises to match (§11.3), a squawk bubble appears (§11.4), and **pixel confetti** fires from the town hall on a 100.

Then, below the bar:
- **Real answer:** "62% said Early · 38% said Late"
- **The exact poll wording** (original question, in quotes)
- **Source line:** pollster name, "poll ended Aug 11, 2025", "1,024 US adults" (sample size), and a **"See the poll" link** that opens the source in a new tab
- **WK players' bar** (§5.3)
- **How everyone did** (§5.4)
- **"Report this question"** link (§9)
- A **Next question** button. On Q3 it reads **See your day**. Nothing advances on its own.

**Reduced motion:** no walk (the townsfolk snap to their sides), no count-ups, no confetti, and the bell doesn't swing (the ding marks still show).

---

## 4. Scoring

- `real` = the left side's share of people who picked a side, **rounded to a whole %** (§7.4).
- `d = |guess − real|` (whole numbers)
- `e = max(0, d − 2)`
- `score = 0` if `d ≥ 25`; otherwise `score = round(100 × (1 − e / 23) ^ 1.62)`

Every whole score from 0 to 100 is possible. Reference values:

| off | 0–2 | 3 | 4 | 5 | 6 | 7 | 8 | 10 | 12 | 15 | 18 | 20 | 22 | 24 | 25+ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| score | 100 | 93 | 86 | 80 | 73 | 67 | 61 | 50 | 40 | 26 | 15 | 8 | 4 | 1 | 0 |

- **Day total** = the sum of the 3 scores, out of **300**.
- No bonus for picking the majority side, and no second guess.
- Put the formula in **`public/js/polly-score.js`**, shared by browser and API, with unit tests that check every value in the table above.

---

## 5. Crowd comparisons

### 5.1 The 5-player rule (all three games)
Nothing that compares you with other players is shown until **at least 5 different players** have the relevant result. Until then, show **"Comparisons show once 5 people have played."** (or "…have finished." for day totals). This now applies to Summit and Venn too, already changed in code through `MIN_CROWD = 5` in `public/js/score.js` and `public/js/venn-score.js`. Polly gets the same constant in `polly-score.js`.

### 5.2 Who counts
Only **daily** plays count toward comparisons. Archive and Unlimited plays never do. Archive replays show the daily crowd for reference, with the line "N people played this on the day" instead of "better than".

### 5.3 WK players' split (per question)
- Shown only once **5+ players** chose a side (skips don't count) for that question on its day.
- Drawn as a **second, thinner bar** (12 px tall versus the main bar's 40–44 px) directly under the real bar, in the same orange/teal, labelled **"WK players (12)"** with each side's %.
- Under 5: the slim bar isn't drawn, and the line reads "WK players' split shows once 5 people have picked a side."

### 5.4 How everyone did (per question and per day)
- **Per question** (on each reveal): "Better than **64%** of today's players" plus a **10-bar score histogram** (0–9, 10–19 … 90–100) with your bar highlighted.
- **Per day** (on the summary): the same for the day total (out of 300, 10 bars of 30 points each).
- "Better than X%" = the share of **other** players whose score is strictly lower than yours.

---

## 6. End-of-day summary

Shown after Q3's **See your day**, and whenever you open `/polly` with all three done.
1. **Polly's end-of-day pose and mood line** (§11.5)
2. **Day total:** "241/300", counted up
3. **The 3 questions recapped**, one row each: short wording, your guess, the real %, how far off, and the score with its colored square
4. **How everyone did** for the day (§5.4)
5. **You vs America:** "You sided with the majority on 2 of 3." Only questions where you picked a side **and** the real split isn't exactly 50/50 count, so it can read "1 of 2" if you skipped one.
6. **Share** button and **"Next poll in 04:12:33"**

---

## 7. Where questions come from

### 7.1 The hard rule
**Every number in the game comes from a real poll page and is checked against that page. Nothing is ever made up.** The AI never searches the web and never supplies numbers from memory. It only reads the text of a poll page that the admin supplied, and pulls questions and numbers out of that text. The server then checks every number against the text itself.

### 7.2 Allowed sources (allowlist)
- A table of allowed pollsters, editable in admin (add, remove, turn off). It starts with:
  - **Pew Research Center** (`pewresearch.org`)
  - **Gallup** (`gallup.com`, `news.gallup.com`)
  - **General Social Survey / NORC** (`gss.norc.org`, `norc.org`)
  - **YouGov** (`today.yougov.com`, `yougov.com`)
  - **AP-NORC** (`apnorc.org`)
  - **Ipsos** (`ipsos.com`)
  - **Marist** (`maristpoll.marist.edu`)
  - **Quinnipiac** (`poll.qu.edu`)
  - **Monmouth** (`monmouth.edu`)
  - **SSRS** (`ssrs.com`)
- A pasted URL whose domain (or a subdomain of it) isn't on an active allowlist entry is **refused** before anything is fetched.
- When the admin pastes text or types a question by hand, they must pick an allowlisted source from a dropdown and still give the source URL, and that URL must also pass the allowlist.

### 7.3 Adding questions (admin → Polly → Add)
There are three ways in, all on one screen:
1. **Paste a URL** (the normal way). The server fetches the page itself (10 s timeout, follows redirects, HTML only), strips it to plain text, keeps the first 60,000 characters, and sends that to the AI (§7.5).
2. **Paste the page text.** Use this when the fetch fails (blocked, needs login, PDF, chart image). Paste the URL and the report text; the AI reads the pasted text and the same checks run against it. Questions made this way are marked **admin-pasted**.
3. **Enter by hand.** A form with every field in §7.6, and no AI. Use it when the numbers are only in a chart or PDF. Marked **admin-entered**.

### 7.4 Turning raw numbers into the answer
- Polls often have a "don't know / no answer" group. **Drop it and rescale:** `real = round(100 × left_raw / (left_raw + right_raw))`. Example: 45 yes / 30 no / 25 unsure → 60.
- Store the raw numbers (left, right, unsure) **and** the rounded `real`. Scoring uses `real`.
- The reveal does **not** show the unsure share (Will chose sample size and source link only).

### 7.5 The AI extractor (`functions/_lib/polly-ai.js`)
- **Model:** Gemini 3.5 Flash-Lite via `callAI`, Groq as backup, **no search tools on either**, temperature 0, JSON output. Logged to `ai_log` as `polly-extract`. It doesn't count toward any player's AI cap (admin only).
- **Prompt inputs:** the source name, the URL, today's date, the page text in `<page>` tags, and these rules:
  - Use **only** facts written in the page text. Never add, estimate or recall numbers. If the page doesn't state a number, don't output that question.
  - Only **US adults** (all US adults, not a subgroup such as "Republicans" or "parents"). Skip anything else.
  - Only results with **exactly two sides** (plus an optional don't-know group). A multi-option question can be used only if the page itself reports it as two groups (e.g. "Total agree / Total disagree").
  - Side labels must be **the poll's own options**, shortened to ≤ 14 characters and never loaded words. ("Approve" / "Disapprove", not "Supports" / "Opposes" if the poll said approve.)
  - Write a short plain question of ≤ 90 characters that means exactly what the poll asked.
  - Tag the topic: `life` (everyday life and habits), `beliefs` (beliefs and society), `money` (money and work) or `politics` (politics and elections).
  - Flag **time-sensitive** questions (current officeholders, elections, candidates, recent news, anything whose answer could shift within months), with a one-line reason.
  - Return the **exact original wording** and an **evidence** snippet: the exact text from the page that contains the numbers.
  - Up to **10** questions per page.
- **Output, per question:** `{ original_wording, short, left_label, right_label, left_raw, right_raw, unsure_raw|null, population, poll_end_date|null (YYYY-MM-DD), sample_size|null, topic, time_sensitive, ts_reason, evidence }`

### 7.6 The server check (after the AI, before the admin sees anything)
Each candidate must pass **all** of these, or it's dropped and listed under "Failed the check" with the reason:
1. The `evidence` snippet appears in the page text. The comparison ignores case and collapses whitespace.
2. `left_raw`, `right_raw` and `unsure_raw` (if any) each appear **as numbers inside the evidence snippet**.
3. `original_wording` appears in the page text, using the same comparison as rule 1.
4. `left_raw + right_raw (+ unsure_raw)` is between **95 and 105**.
5. `population` is US adults.
6. Labels are ≤ 14 characters and the short wording is ≤ 90.

**The poll date and sample size** count as checked only if they also appear in the page text. Otherwise those fields come up **blank and required**, and the admin types them from the source.

Candidates that pass are marked **auto-checked**. Admin-entered questions skip the check and are marked **admin-entered**.

### 7.7 Admin review
- Candidates show as a list with **checkboxes** (all unticked), every field editable, a check badge (auto-checked / admin-pasted / admin-entered), the evidence snippet, and the URL.
- The admin ticks the ones to keep and presses **Save as drafts**. Then each draft is **approved** or **rejected** from the bank.
- **Required to approve:** the short wording, both labels, both raw numbers, original wording, source, URL, **poll end date (exact day)**, sample size, topic, and the time-sensitive flag (the AI's guess, which the admin can toggle).
- **The poll must have ended within 10 years** of the approval date, or Approve is disabled with the message "Poll is over 10 years old."
- **Dates:** store and show **the poll's end date only**, always as an exact day ("poll ended Aug 11, 2025"). A poll with no exact end date on its page can't be approved until the admin types one in.

### 7.8 Time-sensitive questions
- **Limit:** a time-sensitive question should run **within 3 months** of its poll end date: `run date ≤ poll_end_date + 3 calendar months`.
- **Warn only.** The calendar and dashboard show a red **STALE** badge on any scheduled time-sensitive question past its limit. It still runs unless the admin removes it.
- **All questions:** a scheduled question whose run date is over 10 years after its poll end date also gets the STALE badge (warn only).

---

## 8. Scheduling

### 8.1 Auto-fill
- Approving a question puts it in the bank. **Auto-fill** puts bank questions into the empty slots of the next **60 days**, oldest approval first.
- Auto-fill runs when a question is approved, when the admin opens the calendar, and when a day is first loaded with an empty slot.
- **Rules for one day's 3 questions:**
  1. At most **1 politics** question (hard rule).
  2. No two questions from the **same source URL** (hard rule).
  3. **Three different topics** where possible. If the bank can't do that, this rule relaxes, but rules 1 and 2 never do.
- The admin can **drag to swap** any two scheduled questions, move one to another day, **pin** one to a date (auto-fill never moves a pinned question), or **unschedule** one (it goes back to the bank).

### 8.2 Repeats
- **A question never repeats**, with one exception. If a day still has an empty slot when it loads and no unscheduled approved questions remain, the server reuses the approved question whose last run is **longest ago**. That question must not be time-sensitive and must satisfy the day rules. It's marked **reused** in admin.
- **Nothing is ever generated** to fill a gap.
- If even reuse can't fill the day (an empty bank on launch), the page shows **"No poll today. Check back tomorrow."** Streaks aren't broken by a day with no poll.
- **Bank low:** the admin dashboard and the Polly tab show a warning when fewer than **14 days** (42 questions) of approved, never-run questions remain, counting scheduled and unscheduled.

---

## 9. Reports and corrections

- **"Report this question"** on every reveal opens a small form. The reason is one of **Number looks wrong**, **Confusing wording**, **Biased / unfair** or **Other**, plus an optional note (max 300 characters, required only for Other). One report per player per question; after sending, the link changes to "Reported".
- Reports go to **admin → Polly → Reports**, showing the question, the player's guess and their reason/note. The admin can:
  - **Fix**: edit any field. If `real` changes, **every play of that question is rescored** (daily, archive and unlimited), play totals are recomputed, and WK Bucks, stats and percentiles follow because they're computed from plays.
  - **Dismiss**: mark it reviewed with no change.
  - **Retire**: pull the question from future schedules (past plays keep their scores).
- **The reporter gets a note on their next visit:**
  - Fix: "Thanks! We fixed '<short wording>'. Your score was updated."
  - Dismiss: "We checked '<short wording>' and the numbers stand."
  - Retire: "Thanks! We've retired '<short wording>'."

---

## 10. Share text, streaks, stats, modes, WK Bucks

### 10.1 Share
```
Polly #12 🦜 241/300
🎯 100  🟨 73  🟨 68
wk-game-suite.pages.dev/polly
```
- The square for each score: **🎯 100**, 🟩 85–99, 🟨 55–84, 🟧 25–54, 🟥 0–24.
- In the archive the header reads `Polly #12 (archive) 🦜 241/300`.
- The **Share** button on the summary copies the text, with the same toast as the other games.
- On the **home page's combined share**, Polly is included once at least one question is answered. Unanswered questions show as `⬜ –`.

### 10.2 Streaks
- **Polly streak:** a day counts only if **all 3** questions were answered.
- **WK streak** (suite rule): answering **at least one** Polly question counts for the day.

### 10.3 Stats (Stats button in the header)
- **Standard:** days played (all 3 answered), average day, best day (of 300), current streak, max streak, a histogram of day totals (10 bars), and archive days played plus archive average.
- **Average miss:** the mean of `|guess − real|` over every daily question answered, to one decimal ("You're off by 9.4 on average").
- **Lean:** the mean over daily questions of `|guess − 50| − |real − 50|`, to one decimal.
  - Above +1: "You think people agree more than they do (+3.2)."
  - Below −1: "You think things are closer than they are (−2.7)."
  - Otherwise: "No lean. You read splits about right."
- **Agree with America:** the share of daily questions where your side matched the majority. It counts only questions where you picked a side and the real split isn't 50/50. "You sided with the majority 71% of the time (24 questions)."
- Stats need at least 1 finished day; before that, show "Play a day to see stats."

### 10.4 Archive
Replay any past day from Polly #1, picked from a calendar list. Archive stats are separate, there's no streak, and comparisons are reference-only (§5.2). A day already played in the archive opens its summary.

### 10.5 Unlimited (admin only)
`/polly#/unlimited` serves random approved questions one at a time, without end. Each has the full reveal. No stats, no WK Bucks, nothing counted. Nobody else sees the option.

### 10.6 WK Bucks
- **Daily:** `floor(score / 7)` per question (max 14) **+ 8** for finishing all three. A perfect day = 14 × 3 + 8 = **50**, the same as Summit and Venn.
- **Archive:** `floor(score / 14)` per question **+ 4** for finishing all three (a perfect day = 25).
- **Unlimited:** 0.
- These go into the suite ledger (`functions/_lib/bucks.js`) alongside Summit and Venn earnings.

---

## 11. Polly and the town square (design)

### 11.1 Art direction
- **Pixel art**, the same family as Skipper and Mel: a low-res canvas (**320 × 150**) scaled up crisp with `image-rendering: pixelated`, dithered skies, chunky 1-px dark outlines, and hard shadows. No gradients, blur or soft shadows.
- **Fonts (Claude's call, as Will asked; matches the suite):** Pixelify Sans for headings, Silkscreen for numbers, percentages and the share line, Nunito for reading text.
- **No sound.**
- Respect `prefers-reduced-motion` (§3.4 and §11.6).

### 11.2 The scene (back to front)
1. **Sky:** dithered bands in the time-of-day palette, plus drifting pixel clouds (stars and a moon at night).
2. **Town hall:** in the center at the back, a brick-and-stone building with a **clock tower**. The clock's hands show the **current UTC time**. Hovering or tapping the clock shows a tooltip, "New poll in 04:12:33".
3. **Shops:** on both sides, storefronts with striped awnings (bakery, books, hardware, café) and windows that glow at evening and night.
4. **Bunting:** strings of flags across the top of the square in alternating orange and teal (style set by the decor slot, §12.2).
5. **Side banners:** a tall **orange banner** hanging on the left building and a **teal banner** on the right, each printed in pixel letters with the current question's side label ("EARLY" / "LATE"). They swap with a short 2-frame flip when the question changes.
6. **The square:** cobbles across the ground. The **left half is tinted orange and the right half teal** (a 25% dithered mix over the cobble color), split down the middle at the fountain.
7. **Fountain and podium:** a stone fountain in the center with a **stone podium in front of it**. Polly stands on the podium.
8. **Townsfolk:** exactly **30**, made from 8 body types × palette swaps (hats, coats, a kid, an older person with a cane, someone with a dog on a lead). During a question they mill slowly around the middle. On the reveal they walk to their sides (§3.4). At the start of the next question they wander back to the middle.
9. **Ambient life:** pigeons that peck and flutter off when townsfolk walk past, a cat curled on a shop step that occasionally stretches, a sheet of paper that blows across now and then, and lamp posts that light up at evening and night.
- **Pointer parallax:** 2 layers (sky and clouds move 2 px, everything else stays still). Off with reduced motion.

### 11.3 Polly
- **Polly** is a **white cockatoo** with a **sunny-yellow crest**, a dark grey beak and feet, and black eyes. She holds a brass **hand bell** and a small rolled scroll under one wing.
- **Role: town crier.** She "reads out" each question (the scroll unrolls for a moment when a question appears) and rings the bell on the reveal.
- **Crest height follows the score** on each reveal:
  - 0–24: flat
  - 25–54: low
  - 55–84: half up
  - 85–99: high
  - 100: full fan (the crest tips spread)
- **Idle:** she blinks every 3–6 s, tilts her head every so often, and her crest twitches.
- **Clicking Polly** opens her card (§11.7).

### 11.4 Squawk bubbles (per question, after the score count-up)
A pixel speech bubble beside Polly, shown for 2.5 s:
- **100:** "Spot on! Bawk!"
- **85–99:** "So close I felt it in my crest!"
- **55–84:** "Not bad. The square's impressed."
- **25–54:** "Hmm. The town had other ideas."
- **0–24:** "Squawk! Way off!"

### 11.5 End-of-day moods (day total out of 300)

| Band | Pose | Line |
|---|---|---|
| 270+ **thrilled** | crest fully fanned, wings out, bell held high | "You could run this town!" |
| 210–269 **happy** | crest high, small hop | "You know this crowd well." |
| 150–209 **okay** | crest half up, nod | "Not bad. People are hard to read." |
| 90–149 **puzzled** | crest low, head tilted | "This town keeps surprising us." |
| 0–89 **sad** | crest flat, bell lowered | "Tough crowd today. Tomorrow's a new poll." |

Before you've played, her card line is **"Hear ye! Three questions today."**

### 11.6 Time of day
- Four palettes by the **player's local time**, the same as Summit: **morning** 5:00–9:59, **day** 10:00–16:59, **evening** 17:00–19:59, **night** 20:00–4:59.
- Morning has a warm low sun and long shadows. Day is bright. Evening has an orange sky, with lamps and windows coming on. Night is a dark-blue sky with stars and a moon, lit lamps and glowing windows.
- The orange/teal side colors stay the **same hex in every palette**, so sides always read the same.

### 11.7 Polly's card
- Pixel portrait (in her current outfit), her **current name** (the default "Polly", or whatever the name tag set), the role line **"Cockatoo · Town crier"**, today's mood line in quotes, and three facts:
  - **Crest:** "goes up when she's excited, down when she's not"
  - **Rhythm:** "cockatoos can bob along to a beat"
  - **Home:** "cockatoos come from Australia and nearby islands"
- Buttons: **Back to the square** and **Wardrobe**.
- **The card never mentions her default name** or where the name came from. After renaming, the old name appears nowhere. (Fixed the same problem in Mel's card today, where the "Name: from the middle of chaMELeon" fact has been removed.)

### 11.8 Page layout
- **Header:** the WK badge and **"← All games"** (both go to `/`) on the left, then the **POLLY** pixel wordmark (with a small yellow crest on the P), "#12", and three progress pips (grey until answered, then that question's score color). On the right: the WK Bucks balance, **Stats**, **Archive** and the account button.
- **Phone (portrait, ≤ 767 px):** the scene is on top, sized to the full width at 320:150, and capped at **40% of the viewport height**. Below it sit the question card (short wording, side buttons, Skip, bar, −/+, Lock in), all visible **without scrolling at 375 × 667**. The reveal content below the bar scrolls.
- **Desktop (≥ 768 px):** the same stack, centered. The scene is up to **960 px** wide (3× scale) and the controls column is max **640 px**, centered below.
- **Bar size:** 44 px tall on desktop and 40 px on phone, with a 3 px ink border and a hard 3 px offset shadow. The handle is a 20 × 56 px pixel peg with grip lines and a focus ring.

### 11.9 Colors (CSS tokens in `public/css/polly.css`, its own stylesheet)

| Token | Value | Use |
|---|---|---|
| `--left` | `#e8743b` | left side (orange): bar, button, banner, cobble tint |
| `--right` | `#1f8a8a` | right side (teal) |
| `--ink` | `#1f1a17` | outlines, text |
| `--paper` | `#f6efe2` | page background (day and morning) |
| `--panel` | `#fffaf0` | cards |
| `--crest` | `#f2c230` | Polly's default crest, accents |
| `--paper-night` / `--panel-night` | `#1d2233` / `#272d42` | UI at evening and night (ink switches to `#f3ead8`) |

Text on orange and teal is white `#ffffff` in Silkscreen, at least 14 px.

### 11.10 Home page card
- **Block color: teal** `#1f8a8a`. The pitch line is **"Guess what America said."**
- Status:
  - "Not played yet"
  - "1 of 3 answered"
  - "2 of 3 answered"
  - the day total ("241/300")
- Plus the Polly streak.
- **Looping animation:** Polly on the podium swings her bell, her crest bobs, and two tiny townsfolk walk to opposite sides. It idles at a slow frame rate and animates on hover/focus, like the others.
- **Order: newest first**, so Polly, then Venn, then Summit. Polly gets the **NEW** sticker for its first 14 days.

---

## 12. Polly's shop (WK Bucks)

The mechanics are the same as Skipper's and Mel's: two taps to buy, hover preview, a "Wearing" state, and the name tag unlocks renaming (only you see the name). The catalog lives in `public/js/polly-wardrobe.js`, shared by browser and API. Keys are namespaced `polly:<slot>:<id>`, and the look is stored in a new column `players.polly` (JSON).

### 12.1 Outfit

| Slot | Items (price; 0 = free default) |
|---|---|
| Crest color | Sunny yellow `#f2c230` (0), Peach `#f6b98a` (25), Coral `#f07a5a` (30), Mint `#86d3a8` (30), Lilac `#b9a2e0` (40), Flame `#e8452b` (50) |
| Hat | None (0), Tricorn (25), Bowler (35), Top hat (60), Crown (120) |
| Bell | Brass `#b8862e` (0), Silver `#c9ced6` (30), Gold `#f2c13d` (60) |
| Name | Name tag (20) |

### 12.2 Town decor (changes the square for you only)

| Slot | Items |
|---|---|
| Bunting | Triangle flags (0), Square pennants (20), Paper lanterns (40), String lights (60). Always orange/teal |
| Fountain | Stone basin (0), Tiered marble (40), Lion heads (60), Golden (100) |
| Lamps | Iron posts (0), Gas lanterns (30), Globe lamps (40) |
| Ground | Grey cobbles (0), Red brick (30), Herringbone (40). The orange/teal tint always applies on top |
| Visitors | **Pick one.** Pigeons are always there; choose one extra: None (0), Ducks (25), Dog walker (35), Ice-cream cart (50) |

The wardrobe modal has two tabs, **Polly** and **Town**.

---

## 13. Data model (migration `0006_polly.sql`)
```
polly_sources(id, name, domains JSON, active INT, created_at)
polly_questions(id, status draft|approved|rejected|retired,
                topic life|beliefs|money|politics,
                short, left_label, right_label, original_wording,
                left_raw REAL, right_raw REAL, unsure_raw REAL NULL, real INT,
                source_id, url, poll_end_date, sample_size INT,
                time_sensitive INT, ts_reason, entry auto-checked|admin-pasted|admin-entered,
                evidence, last_run_date NULL, created_at, approved_at)
polly_schedule(date, slot 1|2|3, question_id, pinned INT, reused INT)   PK (date, slot)
polly_plays(id, player_id, date NULL, mode daily|archive|unlimited, total INT, done INT,
            created_at, finished_at)                           unique (player_id, date, mode) for daily/archive
polly_guesses(id, play_id, slot, question_id, own left|right|NULL, guess INT, real INT, score INT, created_at)
            unique (play_id, slot)
polly_reports(id, guess_id, player_id, reason wrong|wording|biased|other, note,
              status open|fixed|dismissed|retired, admin_note, created_at, resolved_at, seen)
players.polly TEXT DEFAULT '{}'
```
- `polly_guesses.real` is a snapshot at lock-in. A fix rewrites it and the score for every row with that `question_id`.
- `ai_log` is shared, with kind `polly-extract`.

## 14. API (in `functions/api/[[path]].js`)
- **Player:**
  - `GET polly/today`: the day's questions **without** real numbers or sources for unanswered slots, your locked answers and reveals for answered ones, stats summary, bucks, notifications, next reset
  - `POST polly/lock` `{ slot, guess, own }` → the full reveal for that question (real, original wording, source, sample size, URL, WK split if 5+, crowd if 5+, score, bucks earned)
  - `GET polly/summary`, `POST polly/report`, `GET polly/stats`
  - `GET polly/archive`, `GET polly/archive/day`, `POST polly/archive/lock`
  - `POST polly/unlimited/next`, `POST polly/unlimited/lock` (admin)
  - `GET polly`, `POST polly/buy`, `POST polly/wear`
- **Admin:**
  - `admin/polly/extract` (URL or pasted text → candidates + failed list)
  - `admin/polly/drafts` (save ticked)
  - `admin/polly/question` (edit / approve / reject / retire)
  - `admin/polly/bank`
  - `admin/polly/calendar`
  - `admin/polly/schedule` (swap / move / pin / unschedule)
  - `admin/polly/reports` (+ `/resolve`)
  - `admin/polly/sources`
- **Suite:** `suite/today` and `suite/share` include Polly.

## 15. Admin tab (`/admin` → Polly)
- **Dashboard:** today's players, average score per question, average miss, the bank (approved never-run questions, and how many days that covers), the **Bank low** warning, and **STALE** warnings.
- **Add:** URL box, "Paste text instead", "Enter by hand"; then the candidate list and the failed-check list (§7.3–7.7).
- **Bank:** every question, filterable by status/topic/time-sensitive/entry type, with search, edit, approve, reject and retire.
- **Calendar:** past 14 days and next 60, three slots per day, with drag to swap/move, pin, unschedule, and **STALE**/**reused** badges.
- **Reports:** inbox (§9).
- **Sources:** the allowlist editor.
- **Unlimited:** a link to `/polly#/unlimited`.
- The **Suite** tab's real-player counts and AI-call stats include Polly.

## 16. Files
```
public/polly/index.html       page
public/css/polly.css          styles (own look)
public/js/polly.js            client: flow, bar, reveal, summary, stats, archive, wardrobe, card
public/js/polly-scene.js      town square scene, townsfolk, reveal animation
public/js/polly-sprites.js    Polly + townsfolk + decor sprites
public/js/polly-wardrobe.js   shop catalog
public/js/polly-score.js      score, bucks, share text, MIN_CROWD (shared)
functions/_lib/polly.js       gameplay, scheduling, stats, reports, rescoring
functions/_lib/polly-ai.js    page fetch, text strip, extractor, server check
functions/_lib/polly-admin.js admin endpoints
migrations/0006_polly.sql
```
Also update: the `suite.js` home card + `functions/_lib/suite.js`, `bucks.js` ledger, `/privacy` (§18), `auth.js` `HOMES`/`homeFor` (`/polly`), README, `wrangler.toml` (`POLLY_LAUNCH_DATE`).

**Tests:** the scoring table, rescaling and rounding, bucks (perfect day = 50, archive = 25), share text including 🎯, the server check (each rule passing and failing), auto-fill rules (≤ 1 politics, no same URL, topic relax), reuse picking the longest-ago non-time-sensitive question, the stale rule (3 months / 10 years), and the 5-player rule.

---

## 17. Filled in by Claude (Will: check these)
These weren't asked directly. Change any that are wrong.
1. **Reuse** skips time-sensitive questions entirely (a reused one would always be stale), and there's no minimum gap. It's just the longest-ago run.
2. **The clock** shows the current UTC time, with the countdown in a tooltip.
3. **30 townsfolk**, and how many walk left is `round(30 × real / 100)`.
4. **The topic tag** is stored even though it isn't shown to players, because the "1 politics per day" and "different topics" rules need it.
5. The **10-year limit** blocks approval but only warns at schedule time. The 3-month time-sensitive limit only warns (Will's call).
6. The **combined home share** shows unanswered Polly questions as `⬜ –`.
7. **Exact timings** (bell 400 ms, walk 1,500 ms, count-ups 600 ms, bubble 2.5 s, nudge repeat 80/400 ms).
8. **Polly is "she".**
9. **Polly's lines, facts and mood bands' poses**, plus the scene's shop types (bakery, books, hardware, café).
10. **The 60-day auto-fill horizon** and the calendar range (past 14 / next 60).
11. **Night UI colors** and the "Lean" ±1 threshold.
12. Questions are **US adults only**, which means subgroup results are skipped even when they're on the same page.

## 18. Privacy additions
Add to `/privacy`: Polly stores your side choice and guesses. Other players only ever see them as totals, and only once 5 or more people have answered. Poll page text is sent to the AI by the admin only; player input is never sent to the AI in Polly.
