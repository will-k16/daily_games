# Summit ⛰️

A daily game. Each day has three stages: Foothills (easy), Ridge (medium) and Peak (hard). Each shows something **too small** (the bottom cable-car station), something **too big** (the top station), and a property like weight. Players name something that's **juuust right**: the middle *by ratio*, √(small × big).

- Full design and rules: [SPEC.md](SPEC.md)
- Old Google Apps Script version: [legacy/](legacy/)

## Stack (all free tier)

| Piece | Service | Free tier |
|---|---|---|
| Website | Cloudflare Pages | unlimited static requests |
| API | Cloudflare Pages Functions (`functions/`) | 100,000 requests/day |
| Database | Cloudflare D1 (SQLite) | 5M row reads/day, 100k writes/day, 5 GB |
| AI judge | Groq (primary), Gemini (backup) | free API tiers; answers are cached |
| Sign-in | Google OAuth | free |

There's no build step. `public/` is plain HTML/CSS/ES modules.

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars      # MOCK_AI=1 plays offline with a fake judge
npm run db:local                     # create the local database
npm run dev                          # http://localhost:8788
```

With `MOCK_AI=1`, put a number in your answer to control the judge: `rock 820` is judged as 820 (in the puzzle's base unit). `dog` is "vague" and `unicorn` is "invalid".
Open the account menu and click **Dev sign-in** to become admin locally, then go to `/admin.html`.

```bash
npm test                             # scoring + unit tests
```

## Deploy (one time)

1. **Push to GitHub.** Create an empty repo, then:
   ```bash
   git remote add origin https://github.com/<you>/just-right.git
   git push -u origin main
   ```
2. **Create the database:**
   ```bash
   npx wrangler login
   npx wrangler d1 create just-right
   ```
   Copy the printed `database_id` into `wrangler.toml`, then:
   ```bash
   npm run db:remote
   ```
3. **Create the Pages project.** In the Cloudflare dashboard go to Workers & Pages → Create → Pages → Connect to Git, and pick the repo.
   - Build command: *(leave empty)*. Build output directory: `public`.
   - Settings → Bindings → add **D1 database**, variable name `DB` → `just-right`. (The binding in `wrangler.toml` is used too.)
4. **Get a free Groq key** at https://console.groq.com/keys. Optionally also get a Gemini key at https://aistudio.google.com as a backup.
5. **Set up Google sign-in.** Go to https://console.cloud.google.com → APIs & Services → Credentials → Create OAuth client ID (Web application).
   - Authorized redirect URI: `https://summit-daily.pages.dev/api/auth/callback`
6. **Add secrets** in Pages → Settings → Variables and Secrets (Production), or with the CLI:
   ```bash
   npx wrangler pages secret put GROQ_API_KEY
   npx wrangler pages secret put GEMINI_API_KEY        # optional
   npx wrangler pages secret put GOOGLE_CLIENT_ID
   npx wrangler pages secret put GOOGLE_CLIENT_SECRET
   ```
7. In `wrangler.toml`, set `LAUNCH_DATE` (the day puzzle #1 goes live), `ADMIN_EMAILS`, and optionally `TIP_URL`. Then push. Every push to `main` redeploys.

## Running it day to day

- `/admin.html` → **Calendar** → *Generate drafts* to get AI puzzles for upcoming days, then approve or edit them.
  If a day has nothing approved, its draft is used. If there's no draft either, the AI makes one on the spot, and the built-in fallback bank covers AI outages.
- **Complaints:** accept a complaint to fix the judged value. Every guess that used that answer is rescored, and the player gets a note on their next visit.
- **Answers:** fix any judged value, and approve answers so they can appear in public "top answers". An answer shows publicly once 2+ players have given it, or once you approve it.
- **Unlimited** (∞ in the header, admins only) gives endless practice puzzles for testing.

## Layout

```
functions/api/[[path]].js   API router
functions/_lib/             auth, game rules, AI judge, admin, fallback puzzles
migrations/                 D1 schema
public/                     the site (index.html, admin.html, css/, js/)
public/js/score.js          scoring, shared by browser + server
public/js/sprites.js        hand-placed pixel art
public/js/pad.js            the field notebook (middle finder, notes, converter, calculator)
```
