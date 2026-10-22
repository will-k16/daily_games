# WK Game Suite + Venn: build plan and handoff

This file is the brief for whoever builds the next phase. Everything under **Decisions** was settled with the owner (Will) in a long Q&A. Treat those as requirements, not suggestions. Where the owner said "you choose", the choice has already been made here and is marked **(builder's call, already made)**. If something genuinely isn't covered, ask Will rather than guessing.

---

## 1. Context

**What exists today.** One daily game, **Summit**, live at `summit-daily.pages.dev`, which redirects to itself from the older `just-right.pages.dev`. Players name a thing whose value sits at the geometric middle of two ends. The mascot is Skipper the goat. It has:
- an AI judge
- accounts (Google or email + password)
- a cosmetic shop paid in clovers
- an admin dashboard

The full design is in [SPEC.md](../SPEC.md).

**What's being built.**
1. The site becomes **WK Game Suite** at `wk-game-suite.pages.dev`, with a new minimal home page that lists every game.
2. Summit moves to `/summit`, unchanged as a game.
3. A second game, **Venn**, is added at `/venn`. Players find things that fit two (then three) categories at once, against a 90-second clock.
4. One account, one currency (**WK Bucks**), and one admin page cover the whole suite.

**Who's playing.** At the time of writing, the owner on a few devices. The game has had no promotion. Keep that in mind for anything crowd-based. That's why Venn's par is always the AI's estimate.

---

## 2. The codebase you're inheriting

There's no build step: plain HTML/CSS/ES modules in `public/`, Cloudflare Pages Functions in `functions/`, and a D1 SQLite database (binding `DB`, database name `just-right`). Tests run with `npm test` (`node --test tests/`). Local dev is `npm run dev` on port 8788, or `preview_start` with the name `just-right` from `.claude/launch.json`. Set `MOCK_AI=1` in `.dev.vars` to play offline; in mock mode a number inside an answer sets its value, e.g. `rock 4e-1`.

| File | What it does | Reuse for |
|---|---|---|
| `functions/api/[[path]].js` | API router: `ROUTES` map, CSRF check (JSON + same origin), `waitUntil` passed to handlers, `withCookies` | Add `venn/*` and `suite/*` routes here |
| `functions/_lib/auth.js` | `identify()` (guest cookie `jr_pid`, session `jr_sess`), Google OAuth, `register`/`passwordLogin`/`setPassword` (PBKDF2), `signIn()` merges a guest into an account | Shared by every game as-is. Update `HOMES` / `homeFor` for new paths |
| `functions/_lib/ai.js` | `callAI` (Gemini 3.5 Flash-Lite first, then Groq), `judge()` (web search, then plain second opinion), `searchJudges` (Gemini search only if `GEMINI_SEARCH=on`), `fetchJson` (timeouts, 429 handling), `toNumber`, `log()` to `ai_log`, `generatePuzzles`, `suggestMiddle` | Venn's judge and generator should call `callAI` / `fetchJson` / `log` |
| `functions/_lib/game.js` | Summit gameplay: plays, guesses, scoring, reveal, stats, best answer (background via `waitUntil`, `warmBest`, `computeBest` with a claim column), complaints, rescoring | Pattern for Venn's plays, stats, complaints and rescoring |
| `functions/_lib/wardrobe.js` | Shop: `cloverBalance` (earned from plays minus `purchases`), `buy` (single-statement overspend guard), `wear` | Becomes the suite-wide WK Bucks ledger and shop |
| `public/js/wardrobe.js` | Skipper catalog (shared browser + API), `resolveLook`, `cleanName`, `cloversFor` | Same shape for Mel's catalog |
| `functions/_lib/admin.js` + `public/js/admin.js` | Dashboard (real-player counts, labelled bar charts via `bars()`, WK-bucks grant via negative-price purchases), calendar, complaints, answers | Becomes the suite admin with per-game tabs |
| `public/js/pixel.js` | Pixel toolkit: `canvas`, `outline`, `mix`, `bayer`, terrain, pines, chalets, Skipper sprites, `outfit()` | Reuse primitives for Mel and the jungle |
| `public/js/summit-scene.js` | Summit's animated scene: layered parallax, pendulum physics, particles, `createScene` API | Pattern for Venn's scene |
| `public/js/summit.js` | Summit client: routing, render, modals, account modal (Google + email/password), wardrobe modal, share, stats | Copy the patterns: `api()`, `openModal`, `toast`, `countUp`, account modal |
| `public/css/summit.css` | Summit look: CSS tokens, time-of-day palettes, pixel UI, wardrobe + auth styles | Don't copy-paste. Venn gets its own stylesheet |
| `functions/_middleware.js` | Redirects `just-right.pages.dev` to `summit-daily.pages.dev` | Extend for the new domain |
| `public/_redirects` | Currently sends `/summit.html` and `/summit` to `/`. **This must be removed**, or `/summit` will loop | |
| `migrations/0001-0004` | Schema. 0004 added `password_hash`, `skipper` (JSON look), `purchases`, `login_fails`, `best_started` | Add 0005+ |

**Current AI setup.** Production secrets are `GROQ_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- Gemini's Google Search needs billing, which is off, so `GEMINI_SEARCH` is unset.
- Gemini 3.5 Flash-Lite answers in about 0.6 s from memory.
- Groq's free web search allows only about 2 searches a minute.
- Gemini 2.5 models are not available to this key.

---

## 3. Decisions (from the Q&A)

### 3.1 Suite and domain
- **One site, paths per game.** `wk-game-suite.pages.dev` is the home page, `/summit` is Summit and `/venn` is Venn.
- **Free domain.** Create a new Cloudflare Pages project named `wk-game-suite`, building from the same GitHub repo (`will-k16/daily_games`), output `public`, bound to the same D1 database (`just-right`).
- **Old addresses redirect.** Any request to `summit-daily.pages.dev` or `just-right.pages.dev` redirects (301) to `wk-game-suite.pages.dev/summit…`. Keep the path when it's a game path, and send `/` to `/summit`. Do this in `functions/_middleware.js`. The old projects keep building from the repo, so the middleware runs there.
- **One shared account** across all games: same cookies, same sign-in (Google or email + password), same admin rules (admin = verified Google/dev email in `ADMIN_EMAILS`).
- Guest stats are tied to the old domain's cookie and won't follow a guest to the new domain. Accepted: there are about 3 real players. Signed-in players just sign in again.

### 3.2 WK Bucks (suite-wide currency)
- **Clovers are renamed WK Bucks** everywhere: UI, code, docs.
- **1 clover = 1 WK Buck.** Balances, Skipper prices and everything already bought carry over unchanged.
- **The symbol** is a pixel-art **W with one horizontal line through its middle**, the way `$` is an S with a vertical line. Unicode `₩` has two lines and is **not** acceptable.
  - Draw it as an inline SVG on a pixel grid (e.g. 9×9, `shape-rendering: crispEdges`).
  - The bar extends one pixel past the W on each side.
  - Use it wherever the amount appears ("<glyph> 120"), with `aria-label="WK Bucks"`.
  - Put it in one shared module, e.g. `public/js/bucks.js`, exporting `bucksIcon()`.
- **One balance**, earned in any game and spent in any game's shop.
- **Earning:** a perfect day pays exactly the same in both games (**50**).
  - **Summit (unchanged):** 1 per 100 m on the daily, +5 for a perfect 1,000 stage, +5 for finishing all three. Archive pays half; practice pays 0.
  - **Venn:** `floor(roundScore / 4)` per round (0–25), so a perfect day is 25 + 25 = 50. Archive pays `floor(roundScore / 8)`; practice pays 0.
- The balance query in `wardrobe.js` (rename to `bucks.js`) adds Venn's earnings, minus `purchases` (admin grants are negative-price rows; keep that trick).

### 3.3 Home page (`/`)
- **Style: paper and ink.**
  - Off-white paper background, near-black ink, flat solid color blocks per game, like a printed game box.
  - Very little color: each game's block color is the only accent.
  - **Pixel fonts** throughout (Pixelify Sans for headings, Silkscreen for numbers; the body can stay a plain readable font).
  - **Light or dark follows the device.** Dark = dark paper with light ink, same flat blocks.
- **Title: `WK GAME SUITE`, all caps (builder's call, already made).**
- **Game cards, newest first.** Venn first with a "NEW" sticker for its first 14 days, then Summit. Each card shows:
  - the name and one-line pitch. **Venn: "Find what fits both."** **Summit: "Name something juuust right."**
  - **today's status:** "Not played yet" / "Round 1 done" / "2 of 3 stages" / today's score
  - **that game's streak**
  - **a small looping pixel animation:** Summit's cable car; Venn's vine rings with Mel blinking
- **Header / top area:**
  - sign-in / account (same modal as the games)
  - **WK Bucks balance** (glyph + number)
  - **countdown to new puzzles** (midnight UTC)
  - **the site-wide WK streak**
- **WK streak:** a day counts if you finished **at least one** stage or round of **any** game that UTC day. Nobody is forced to play every game.
- **Combined daily share:** one button copies every game's share text for today (only games you've played), followed by a single `wk-game-suite.pages.dev` link.
- **Animations (builder's call, already made).** Keep them minimal and hand-made:
  1. The title is stamped in letter by letter on the first load of a session (each letter drops in with a 2-frame `steps()` squash, like a rubber stamp).
  2. Cards lift on hover/focus with a hard offset shadow (no blur), and their pixel preview animates. Previews idle at a slow frame rate otherwise.
  3. Opening a game plays a short (~300 ms) blocky pixel-dissolve wipe in the game's block color before navigating.
  4. Nothing ambient in the background. Respect `prefers-reduced-motion`.
- **Not allowed:**
  - gradients, glassmorphism, blurred glows, soft drop shadows
  - purple-blue "AI" palettes
  - emoji-stuffed headings
  - a hero with a big tagline and CTA
  - marketing words ("unleash", "dive in", "elevate", "seamless", "experience", "journey", "level up", "crafted", "✨")
  - Inter or other default "AI" fonts
  - copy that explains the interface to the reader

  The page should read like a small hand-made arcade menu, not a landing page. All copy is plain and short ("New puzzles in 04:12:33", "Not played yet").

### 3.4 Navigation inside games
Each game's header gets **both** a small **WK badge** (top-left, next to the game's logo) and a **"← All games"** link. Both go to `/`. Each game otherwise keeps its own look.

### 3.5 Admin
**One admin page at `/admin`**, with tabs:
- **Suite:** real players per game, WK Bucks grant box, AI calls/errors, rate-limit count
- **Summit:** existing calendar / complaints / answers
- **Venn:** calendar of drafts with approve/edit/reject, par editing, complaints, judgment cache editor, admin-only Unlimited

Admin rules are unchanged.

### 3.6 Privacy
`/privacy` becomes suite-wide. Mention Venn's answer text going to the AI judge, and WK Bucks purchases.

---

## 4. Venn: complete game spec

### 4.1 One-paragraph summary
Each day has **two rounds**. **Round 1** is a two-circle Venn diagram; **Round 2** is a three-circle Venn diagram. Each circle is a category, written as a full plain phrase. You get **90 seconds per round** to type as many things as you can that fit **all** circles: the overlap in round 1, the very center in round 2. Each answer is checked instantly. The day has a **par**, the AI's estimate of a number most people can reach. Hit par and you get 25 points (or 5 per answer when par is above 5); every answer above par adds more, up to 100 at double par. The day is scored out of 200. The mascot is **Mel**, a pixel-art chameleon in a jungle. The circles are hanging **vine rings**.

### 4.2 Daily structure
- Two rounds per day, played in order. **Round 2 unlocks only after Round 1's results are shown.**
- Each round has its own **Ready screen**: round number, "Par N", a **Start** button. The categories are hidden until Start.
- **90 seconds per round.**
- An **"I'm done"** button ends a round early.
- One attempt per round per day. New puzzles at **midnight UTC**, same as Summit.
- **Venn #1 is the day it's deployed** (`VENN_LAUNCH_DATE` var, set at deploy).

### 4.3 Categories
- **Allowed kinds** (all four):
  - **properties** (colored orange, round, made of wood)
  - **time and place** (invented after 1950, from Japan)
  - **word play** (starts with B, has a double letter)
  - **topic groups** (foods, animals, sports equipment, famous people)
- **Wording:** each circle shows **one full plain phrase** ("Things colored orange", "Foods people eat"). There's no separate short label and no examples. The phrase itself must be unambiguous: "Things colored orange", never just "Orange".
- **Time-sensitive facts are judged as of the puzzle's release date.** If a puzzle released 2026-10-18 says "NBA players" and someone retires on 10-20, they still count when the 10-18 puzzle is replayed from the archive. The puzzle date goes into every judge prompt.
- **Colors are fixed:** circle A **yellow**, circle B **blue**, overlap **green**. Round 2 adds circle C **red**; the three-way center is the mix of all three, a dark warm brown. Draw the overlaps with pixel dithering/blending, not CSS gradients.

### 4.4 Who makes puzzles
- **The AI drafts and Will approves**, same flow as Summit: admin generates drafts for upcoming days, approves / edits / rejects. A day with nothing approved uses its draft; with no draft, the AI makes one on the spot; if the AI is down, a built-in fallback bank is used.
- **Every draft must pass a size check.**
  - The generator must list at least **25 real answers** for a two-circle overlap, or **8** for a three-circle center. Otherwise the puzzle is thrown out and regenerated.
  - The listed answers must be **reasonably well known**: things a typical teenager or adult could think of, not obscure trivia.
  - The list is stored with the puzzle. It feeds "Answers you missed" and "Did you mean".
- **Par (fixed, never crowd-adjusted).**
  - The generator also estimates `typical` = how many answers a typical player finds in 90 seconds.
  - **Par = floor(0.6 × typical)**, never below **3** for round 1 or **2** for round 2.
  - Par is set when the puzzle is made and **never changes**, though Will can edit it in admin before release.
  - **Par is shown to the player** on the Ready screen and during play.
- Avoid repeating a category within 30 days, and don't reuse the exact same pair or triple ever.

### 4.5 Answers: what counts
- **Allowed:** generic things ("a pumpkin"), proper nouns (brands, places, products, titles), and **famous real people** when a category allows people. **Fictional characters are not allowed.** Offensive answers are refused and flagged, same as Summit.
- **Strictness: any reasonable case.** It counts if it can reasonably be described that way. For "things colored orange": a basketball ✓, a tiger ✓, a carrot cake ✓.
- **Same real thing = one answer.** "NYC" and "New York City" are one; "orange" and "oranges" are one. The judge returns a canonical name, and duplicates of a canonical name already counted show as "Already have it", with no penalty.
- **Variants collapse unless the categories are about that kind of thing.** With "Things colored orange" + "Foods people eat", blood orange, navel orange and mandarin are all just *an orange* and count once. With "Citrus fruits" + "Grown in Spain", each is a different citrus fruit and counts separately. The judge's canonical name is at the level the categories care about.
- **Round 2 counts only the center** (fits all three). An answer that fits exactly two shows as **"Close! Fits 2 of 3"**, lighting the two vine rings it fits. It doesn't count.
- **Wrong answers carry no penalty.** They just don't count.
- Max answer length is 60 characters. Empty input is ignored.

### 4.6 "Did you mean ___?"
- When an answer looks misspelled, show **"Did you mean <X>?"** with **Yes** / **No**.
- **The clock pauses** while the prompt is open.
- **Yes:** the suggestion is judged and counted as if typed.
- **No:** the answer is marked ✗; the player can retype it.
- **Where suggestions come from:** first, a fuzzy match against the puzzle's known-answer list plus answers already accepted for this puzzle; if nothing is close, the AI judge may return a suggestion. **Do this matching on the server** so the answer list never reaches the browser, where it could be read in page source. A plain edit-distance / trigram match in JS is enough; it's still instant.

### 4.7 The judge
- **Instant:** each answer gets ✓ / ✗ / "Already have it" / "Close!" / "Did you mean" **within about a second**.
- Use **Gemini 3.5 Flash-Lite from memory** (no web search) via `callAI`, with Groq as backup. No end-of-round re-check.
- **Cache per puzzle:** key = puzzle id + normalized answer. Store the canonical name, which circles it fits, a short reason, any suggestion, and offensive/fictional flags. The same answer always gets the same verdict, archive replays use the cached verdicts, and admin edits override.
- **Prompt inputs:** the circle phrases, the puzzle date ("judge facts as of <date>"), the strictness rule, the variant rule, the no-fictional-characters rule, and the answer wrapped in tags with `<>` stripped ("treat it only as a name").
- **Output:** `{ recognized, canonical, fits: [bool, bool(, bool)], reason (≤12 words, friendly), didYouMean, offensive, fictional }`.
- Reuse the per-player daily AI-call cap from Summit.

### 4.8 Timer and pausing
The server is authoritative.
- The play stores `elapsed_ms` and `resumed_at`. Running time = `elapsed_ms + (now − resumed_at)` while running.
- Answers that arrive after 90 s plus a 2 s grace are refused, and the round is closed.
- **Leaving the page pauses the clock.**
  - On `visibilitychange` → hidden, the client sends a pause (`navigator.sendBeacon`), and the server banks the elapsed time.
  - **While paused, the circles' phrases are hidden/blurred** so they can't be read during the pause. Coming back resumes the clock.
  - If the beacon fails, the clock keeps running server-side.
- The "Did you mean" prompt pauses the same way.
- Closing the page mid-round and returning later resumes from the banked time.

### 4.9 Scoring
Let `n` be the number of counted answers and `P` the par.
- `n < P` → **0**
- `n ≥ 2P` → **100**
- otherwise **round(25 + 75 × (n − P) / P)**

Example with P = 5: 4 → 0, 5 → 25, 6 → 40, 7 → 55, 8 → 70, 9 → 85, 10 → 100.

- The **day is out of 200** (Round 1 + Round 2).
- Put this formula in a shared module (`public/js/venn-score.js`) used by browser and API, with unit tests.

### 4.10 During play
- Layout works **equally well on phones and desktop**, with separately tuned layouts. On phones, the diagram sits above the input so the keyboard doesn't hide it.
- Each **✓** answer **pops into the overlap** region as a small label, like fruit hanging in the vine rings. **✗** answers bounce off and fade, with the reason as a small tooltip.
- **Mel reacts:**
  1. **color shift on ✓**: Mel flashes the overlap color
  2. **tongue catch**: Mel's tongue zaps out, grabs the answer label and drops it into the overlap
  3. **eye tracking**: Mel's eyes follow the typing caret / pointer
  4. **mood by score** at the end, like Skipper's moods
- Visible all the time: timer, par, count so far, "I'm done".
- **No sound.**

### 4.11 After each round (results)
- **Your answers on the diagram**: correct ones placed in the overlap; wrong ones listed beside it with the reason; round-2 "Close!" ones placed in their two-ring region.
- **Your score vs par**: "You found 8. Par was 5. 70 / 100."
- **Answers you missed**: up to 10 good answers you didn't give, preferring ones other players found most often, then the AI's list. Show these only after the round ends.
- **How everyone did**: a histogram of counts and "better than X% of today's players", like Summit.
- **"Wrong call?"** on any ✗ answer files a complaint, same flow as Summit. If Will accepts it, that answer becomes ✓ for this puzzle, every play containing it is recounted and rescored, and the player gets a note next visit.

### 4.12 Share text
One line per round: circle color emojis, count, par, a 10-cell bar, a colored square for the score, and the score. Squares: 🟩 85+, 🟨 55+, 🟧 25+, 🟥 0.
```
Venn #1 🦎 145/200
🟡🔵 8 found (par 5) ███████░░░ 🟨 70
🟡🔵🔴 3 found (par 2) ███████░░░ 🟨 75
wk-game-suite.pages.dev/venn
```

### 4.13 Streaks, stats, modes
- **Venn streak:** a day counts if **either** round was finished.
- **Stats:** days played, average and best day (out of 200), streak, max streak, a histogram of day totals, and archive count/average.
- **Archive:** replay past days; separate stats; no streak; pays half WK Bucks.
- **Admin-only Unlimited:** endless generated puzzles for testing. There's **no public practice mode**.

### 4.14 Mel and the world
- **Mel**, a chameleon (the name comes from the middle of "chaMELeon"), drawn in **pixel art** in the same crisp style as Skipper, on a low-res canvas scaled up.
- **The world is a jungle canopy:** layered pixel jungle (far trees, vines, broad leaves, hanging moss, a few butterflies, slow parallax). The **circles are big hoops of woven vine** hanging from branches and overlapping in the middle. Each ring's vine carries its circle's color (yellow / blue / red flowers or tint along the vine) so the regions read clearly.
- The scene never changes theme: **no scene skins in the shop**.
- Mel sits on a branch beside the rings. Click Mel for Mel's card: portrait, mood line, a few fun facts, and a **Wardrobe** button, mirroring Skipper's card.
- Mel's default skin should differ from the overlap green so the ✓ color flash is visible: default skin **Fern** `#3d7a5a`, flash color bright overlap green.

### 4.15 Mel's shop (builder's call, already made; paid in WK Bucks)
Same mechanics as Skipper's wardrobe: two taps to buy, hover preview, "Wearing" state, name tag unlocks renaming, and only you see the name.

| Slot | Items (price; 0 = free default) |
|---|---|
| Skin color | Fern (0), Lime (30), Teal (30), Sunset orange (30), Sky blue (40), Ruby (40), Berry purple (50), Midnight (60) |
| Pattern | None (0), Spots (25), Stripes (25), Speckles (30), Zigzag (35), Camo (50), Rainbow bands (80), Galaxy (90) |
| Hat | None (0), Leaf hat (15), Flower crown (25), Explorer hat (40), Tiny top hat (60), Crown (120) |
| Eyewear | None (0), Round specs (20), Sunglasses (35), Monocle (45) |
| Neck | None (0), Bandana (15), Bowtie (20), Scarf (20) |
| Name | Name tag (20) |

The catalog lives in `public/js/mel-wardrobe.js`, shared by browser and API, the same shape as `public/js/wardrobe.js`. Purchase keys are namespaced (`mel:hat:crown`) so they never clash with Skipper's (`hat:crown`). The look is stored per player in a new column `players.mel` (JSON).

---

## 5. Data model (new migration `0005_suite_venn.sql`)
```
venn_puzzles(id, date, round 1|2, status draft|approved|auto|rejected|unlimited,
             circles JSON [phrase, phrase(, phrase)], par INT, typical INT,
             answers JSON [well-known answers], note, created_at)
  unique (date, round) where status in ('approved','auto')
venn_plays(id, player_id, puzzle_id, mode daily|archive|unlimited,
           state ready|running|paused|done, elapsed_ms, resumed_at,
           count, score, created_at, finished_at)
  unique (player_id, puzzle_id, mode)
venn_answers(id, play_id, input, norm, canonical, verdict ok|no|dup|close|pending,
             fits JSON, reason, created_at)
venn_judgments(puzzle_id, norm, canonical, fits JSON, reason, suggestion,
               offensive, fictional, source ai|admin, updated_at)  PK (puzzle_id, norm)
venn_complaints(id, answer_id, player_id, note, status, admin_note, created_at, resolved_at, seen)
players.mel TEXT DEFAULT '{}'
```
Keep `ai_log` shared, with kinds `venn-judge` and `venn-generate`.

## 6. API (new routes in `functions/api/[[path]].js`)
- **Suite:**
  - `GET suite/today`: per game: status, today's score, streak; WK streak, bucks, next reset, me
  - `GET suite/share`: the combined text
- **Venn:**
  - `GET venn/today`
  - `POST venn/start`
  - `POST venn/answer` → `{ verdict, canonical, fits, reason, didYouMean, count, elapsed }`
  - `POST venn/confirm` (Did-you-mean yes/no)
  - `POST venn/pause`, `POST venn/resume`
  - `POST venn/done`
  - `GET venn/results`
  - `POST venn/complaint`
  - `GET venn/stats`
  - `GET venn/archive`, `GET venn/archive/day`
  - `POST venn/unlimited/new` (admin)
  - `GET mel`, `POST mel/buy`, `POST mel/wear`
- **Admin:** `admin/venn/calendar`, `admin/venn/generate`, `admin/venn/puzzle`, `admin/venn/complaints`, `admin/venn/judgments`
- Existing Summit routes stay at `/api/*`, unchanged, so nothing breaks.

## 7. File layout after the change
```
public/index.html            home (new)
public/css/suite.css         home styles (new)
public/js/suite.js           home logic (new)
public/js/bucks.js           WK Bucks glyph + formatting (new)
public/summit/index.html     Summit page (moved from public/index.html; asset URLs stay absolute)
public/venn/index.html       Venn page (new)
public/css/venn.css          Venn styles (new, its own look)
public/js/venn.js            Venn client (new)
public/js/venn-scene.js      jungle + vine rings + Mel animation (new)
public/js/mel.js             Mel sprites (new)
public/js/mel-wardrobe.js    Mel catalog (new)
public/js/venn-score.js      shared scoring (new)
public/admin.html            suite admin with tabs (moved/extended)
functions/_lib/venn.js       Venn gameplay (new)
functions/_lib/venn-ai.js    Venn judge + generator (new; uses callAI/log from ai.js)
functions/_lib/bucks.js      ledger (renamed from wardrobe.js)
```

## 8. Deployment and owner actions
1. **Will:** in the Google Cloud console (OAuth client), add the redirect URI `https://wk-game-suite.pages.dev/api/auth/callback`. Keep the old ones until the old domains are only redirects.
2. Create the Pages project `wk-game-suite` (dashboard, or `wrangler pages project create wk-game-suite --production-branch main`), connect it to the GitHub repo, and set the build output to `public`.
3. Bind D1 `DB` → `just-right`. Copy the secrets (`GROQ_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) with `wrangler pages secret put … --project-name wk-game-suite`. Set the vars (`LAUNCH_DATE`, `VENN_LAUNCH_DATE`, `ADMIN_EMAILS`) in `wrangler.toml` (and change `name` to `wk-game-suite`).
4. Run `npm run db:remote` for migration 0005 **before** pushing the code that needs it.
5. Update `functions/_middleware.js` redirects, delete the two lines in `public/_redirects`, and update `homeFor`/`HOMES` in `auth.js` (`/`, `/summit`, `/venn`) so sign-in lands back on the page you started from.
6. Update README.md and SPEC.md, or add `VENN_SPEC.md`, to match.

## 9. Build order
1. **Suite skeleton:** move Summit to `/summit`, add the home page shell, the middleware redirects and the auth return paths. Deploy to the new project and confirm Summit works there.
2. **WK Bucks:** rename everywhere, add the glyph and the shared ledger. Summit's wardrobe shows WK Bucks.
3. **Home page:** cards, status, streaks, countdown, combined share, animations.
4. **Venn backend:** migration, generator with size check and par, judge + cache, timer/pause, scoring, results, complaints, stats, archive.
5. **Venn frontend:** jungle scene, vine rings, Mel sprites and reactions, Ready → play → results flow, phone and desktop layouts.
6. **Mel's shop** and the **admin Venn tab**.
7. **Polish:** copy pass (no AI-sounding text), `prefers-reduced-motion`, tests, deploy.

## 10. Verification
- `npm test` passes, with new tests for `venn-score.js` (the P=5 table above, min-par rules), the fuzzy "did you mean" matcher, and the WK Bucks ledger (Summit + Venn earnings, negative grants, a perfect Venn day = 50).
- Locally with `MOCK_AI=1` (extend the mock judge so answers containing "yes" fit, "close" fits 2 of 3, "typo" triggers a suggestion):
  - play both Venn rounds end to end
  - pause by switching tabs and check the circles hide and the clock holds
  - Did-you-mean Yes / No
  - "I'm done"
  - results, share text, archive replay, complaint → admin accept → rescore
- Check the home page at phone width (375 px) and desktop, light and dark. Card status updates after playing. The WK streak counts a day with only one game played. Combined share includes only the games played.
- Old URLs: `summit-daily.pages.dev/` and `just-right.pages.dev/` both 301 to `wk-game-suite.pages.dev/summit`. Google sign-in works on the new domain.
- Live after deploy: the admin Suite tab shows real-player counts; Venn's `ai_log` shows `venn-judge` latency under about 1 s.
