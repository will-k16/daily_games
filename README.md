# WK Game Suite

Small daily games at **wk-game-suite.pages.dev**. One account, one currency (**WK Bucks**), one admin page.

| Path | What |
|---|---|
| `/` | Home: every game, today's status and streaks, the WK streak, WK Bucks, countdown, combined share |
| `/polly` | **Polly**: three real poll questions a day; guess what percent of US adults picked each side. Mascot: Polly the cockatoo, the town crier. [POLLY_SPEC.md](POLLY_SPEC.md) |
| `/venn` | **Venn**: 90 seconds to name things that fit two circles (round 1), then all three (round 2). Mascot: Mel the chameleon. [VENN_SPEC.md](VENN_SPEC.md) |
| `/summit` | **Summit**: name something whose value sits at the geometric middle of two ends. Mascot: Skipper the goat. [SPEC.md](SPEC.md) |
| `/pets` | Pet corner: Skipper, Mel and Polly together in their outfits, gently animated (and a "Save picture" button) |
| `/admin` | Suite admin (Suite / Summit / Polly / Venn tabs) |
| `/privacy` | Privacy policy for the whole suite |

- Build plan and every decision behind the suite: [docs/WK_GAME_SUITE_PLAN.md](docs/WK_GAME_SUITE_PLAN.md)
- Old Google Apps Script version of Summit: [legacy/](legacy/)
- The old addresses (`summit-daily.pages.dev`, `just-right.pages.dev`) 301 to `wk-game-suite.pages.dev/summit` (see `functions/_middleware.js`).

## Stack (all free tier)

| Piece | Service | Free tier |
|---|---|---|
| Website | Cloudflare Pages | unlimited static requests |
| API | Cloudflare Pages Functions (`functions/`) | 100,000 requests/day |
| Database | Cloudflare D1 (SQLite) | 5M row reads/day, 100k writes/day, 5 GB |
| AI judges | Gemini 3.5 Flash-Lite, Groq as backup (Summit also uses Groq web search). Polly's AI only reads poll pages the admin supplies | free API tiers; verdicts are cached |
| Sign-in | Google OAuth, or email + password | free |

There's no build step. `public/` is plain HTML/CSS/ES modules.

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars      # MOCK_AI=1 plays offline with fake judges
npm run db:local                     # create/upgrade the local database
npm run dev                          # http://localhost:8788
```

With `MOCK_AI=1`:
- **Summit:** put a number in your answer to control the judge: `rock 820` is judged as 820 (in the puzzle's base unit). `dog` is "vague" and `unicorn` is "invalid".
- **Venn:** answers containing `yes` fit every circle, `close` fits 2 of 3, `typo` triggers "Did you mean", `fiction` / `rude` are refused. Answers from the puzzle's built-in list fit too. Puzzles come from the built-in bank.
- **Polly:** there are no built-in questions (nothing is ever made up). Add some in `/admin` → Polly → Add: "Enter by hand" works offline, and "Paste text instead" turns every sentence with two percentages into a candidate ("Yes" / "No") so you can try the server check. A day with an empty bank shows "No poll today".

Open the account menu and click **Dev sign-in** to become admin locally, then go to `/admin`.

```bash
npm test                             # scoring, Venn and Polly rules, fuzzy matching, the Polly flow and WK Bucks ledger (on a local D1)
```

## Deploy (one time)

1. **Google sign-in:** in the Google Cloud console (APIs & Services → Credentials → your OAuth client), add the redirect URI `https://wk-game-suite.pages.dev/api/auth/callback`. Keep the old ones until the old domains are only redirects.
2. **Create the Pages project** `wk-game-suite` (dashboard → Workers & Pages → Create → Pages → Connect to Git, repo `will-k16/daily_games`, build command empty, output `public`), or:
   ```bash
   npx wrangler pages project create wk-game-suite --production-branch main
   ```
3. **Bindings and secrets:** Settings → Bindings → D1 database, variable `DB` → `just-right`. Copy the secrets:
   ```bash
   npx wrangler pages secret put GROQ_API_KEY --project-name wk-game-suite
   npx wrangler pages secret put GEMINI_API_KEY --project-name wk-game-suite
   npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name wk-game-suite
   npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name wk-game-suite
   ```
   Vars live in `wrangler.toml`: `LAUNCH_DATE` (Summit #1), `VENN_LAUNCH_DATE` (Venn #1, the day Venn is deployed), `POLLY_LAUNCH_DATE` (Polly #1, the day Polly is deployed), `ADMIN_EMAILS`, `TIP_URL`.
4. **Migrate the database before pushing code that needs it:**
   ```bash
   npm run db:remote
   ```
5. Push to `main`. Every push redeploys the new project and the two old ones (which now only redirect).

AI keys: Gemini at https://aistudio.google.com/apikey (Flash-Lite answers in about half a second), Groq at https://console.groq.com/keys. Gemini's Google Search needs billing, so `GEMINI_SEARCH` stays unset; set `JUDGE=groq` to put Groq first.

## Running it day to day

- **Fastest way to fill the calendars:** each game's admin tab has an **Import** sub-tab. Copy that game's prompt from [prompts/PROMPTS.md](prompts/PROMPTS.md) into an LLM (paste in the **Copy avoid list** text so nothing repeats), paste its answer back, press **Check**, then **Add to calendar**. Summit and Venn days are approved onto the next empty days; Polly questions are checked against their source pages (verified ones are approved, the rest wait as drafts).
- `/admin` → **Suite**: real players per game, your WK Bucks (grant or take back), AI calls/errors and rate-limit hits.
- `/admin` → **Summit**: today's stages, calendar (generate / approve / edit / reject), complaints (fix a value and rescore), answers.
- `/admin` → **Polly** → **Auto-find**: Polly finds its own questions. It reads the pollsters' feeds (Pew's RSS, Gallup's poll sitemap and AP-NORC's RSS to start; add more there), queues new report pages, and runs each through the same AI-read-then-server-check as a pasted URL. Questions whose numbers, poll date and sample size were all found on the page, that fit the length limits and aren't time-sensitive are approved on their own (toggle it off to review everything); the rest wait as drafts. It runs in the background every few hours while the bank is low (whenever someone opens Polly), or press **Find polls now**. You can also paste many links at once there.
- `/admin` → **Polly**: dashboard (today's players, average score and miss per question, the bank, **Bank low** and **STALE** warnings); **Add** (paste a poll URL from an allowlisted pollster, paste the page text, or enter by hand; the AI pulls candidates from the page and the server checks every number against the page text); **Bank** (edit / approve / reject / retire); **Calendar** (auto-fill, drag to swap or move, pin, unschedule); **Reports** (fix = edit and rescore, dismiss, retire); **Sources** (the allowlist). Keep at least 14 days (42 questions) approved: Polly never makes up a question, and a day the bank can't fill shows "No poll today".
- `/admin` → **Venn**: calendar of drafts (approve / edit / reject, edit par before release), complaints (accept = that answer counts for the puzzle and every play with it is rescored), judgment cache editor, and Venn Unlimited.
- A day with nothing approved uses its draft; with no draft the AI makes one on the spot; if the AI is down, a built-in bank is used.

## Layout

```
functions/api/[[path]].js   API router (suite/*, Summit, venn/*, mel/*, polly/*, admin/*)
functions/_middleware.js    old domains → wk-game-suite.pages.dev/summit
functions/_lib/             auth, bucks (WK Bucks ledger + shops), game (Summit), venn, venn-ai, venn-admin,
                            fuzzy ("did you mean"), suite (home page + combined share), ai, admin, fallback banks,
                            polly (gameplay, scheduling, stats, reports), polly-ai (page fetch, extractor, server check), polly-admin,
                            polly-auto (feeds → queue → questions, auto-approve)
migrations/                 D1 schema (0005 adds Venn and Mel, 0006 adds Polly, 0007 Polly's auto-find)
public/index.html           suite home (css/suite.css, js/suite.js)
public/summit/index.html    Summit (js/summit.js, js/summit-scene.js, css/summit.css)
public/venn/index.html      Venn (js/venn.js, js/venn-scene.js, js/mel.js, css/venn.css)
public/polly/index.html     Polly (js/polly.js, js/polly-scene.js, js/polly-sprites.js, css/polly.css)
public/js/polly-score.js    Polly scoring, WK Bucks, share text, the 5-player rule, stale dates (browser + server)
public/js/bucks.js          the WK Bucks glyph
public/js/venn-score.js     Venn scoring, par, payouts, share text (browser + server)
public/js/score.js          Summit scoring and share text (browser + server)
public/js/wardrobe.js       Skipper's catalog;  public/js/mel-wardrobe.js  Mel's catalog;  public/js/polly-wardrobe.js  Polly's shop
public/js/account.js        the shared account modal
```
