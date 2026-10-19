# Next games for WK Game Suite: what makes these fun, and ideas

Written 2026-10-18 after reading SPEC.md, VENN_SPEC.md, POLLY_SPEC.md and the suite plan. Part 1 is a working theory of why daily games like these hook people. Part 2 is a checklist built from it. Part 3 is nine game ideas that fit the suite's stack (Cloudflare free tier, AI drafts and admin approves, a pixel mascot and world per game), each tested against the checklist. Part 4 ranks them.

---

## 1. Why these games are fun

### 1.1 The famous ones, in one line each
| Game | The hook |
|---|---|
| **Wordle** | Six guesses where every guess gives you rich feedback, so each one is a small deduction. The share grid tells the story of your solve without giving away the answer. |
| **Connections** | Red herrings that seem obvious until you see the real grouping. That "oh, *that's* the link" moment, plus a color ramp from easy to devious. |
| **Krillion** | You name something, and the rarer your *valid* answer, the more you score. Going deeper is riskier. The reveal shows what everyone else said. |
| **Noillirk** | Krillion reversed: guess the most common answer. It's really a game of modelling other people's minds. |
| **Chainle** | One word that links clues, scored on how *close* you got, not just right or wrong. Afterwards it explains the links. |
| **Contexto / Semantle** | Every guess gets a "how warm" number, so there are no dead ends. You feel yourself closing in. |
| **Globle / Worldle** | Distance-based feedback on a map. Wrong guesses still teach you something, and you learn geography by accident. |
| **Wikitrivia / Timeguessr** | Placing things in time. The fun is in the surprises ("Oxford is older than the Aztec Empire"). |
| **Pinpoint (LinkedIn)** | Clues are revealed one at a time, so guessing early is a gamble that pays more. |
| **Spelling Bee** | No loss state, a visible ladder of ranks, and "one more word" pull. |
| **GeoGuessr** | A graded distance score that feels fair, plus a satisfying line from your pin to the truth. |

### 1.2 What they all share (and how your three games already do it)

1. **One rule, one sentence.** "Name something in the middle." "Name things in the overlap." "Guess what America said." If the rule needs a tutorial, the game loses most people on day one. All three of yours pass.

2. **Every guess teaches you something.** Bare right/wrong turns a game into luck or binary search. Wordle's colors, Contexto's ranks and Summit's *score without direction* (the fog) turn each guess into evidence. Summit's fog is your best mechanic: it gives you exactly half the information, so the second guess is a real deduction.

3. **Graded scoring, not pass/fail.** "I got 870" starts more conversations than "I got it." Partial credit means a bad day still feels like playing, not losing. Summit, Venn and Polly all grade. The best curves are steep near perfect, so a 100 feels earned (Summit's 1.05× zone, Polly's 2-point zone).

4. **The answer is yours.** Open input (Krillion, Summit, Venn) lets people express taste and knowledge, so the reveal ("you said *a dairy cow*, someone said *a grand piano*") is a story about *you*. Multiple choice can't do this. Your AI judge is the thing that makes open input cheap, and it's the suite's biggest advantage over most daily games.

5. **The reveal is the payoff.** The best moment comes *after* you answer: the real number, the source, what others said, the surprising fact. Polly's townsfolk walking to their sides and Summit's cabin riding out of the fog are exactly this. If the reveal is a number in a box, the game is half as good.

6. **Everyone gets the same short puzzle once a day.** Scarcity makes it a ritual, not a time sink. Three stages in about five minutes is the sweet spot your games have landed on.

7. **A ramp inside the day.** Easy → medium → hard (Summit's Foothills → Peak, Connections' colors) gives a quick win first, then a challenge. Ending on the hard one makes the share line more interesting.

8. **A spoiler-free share that tells a story.** A Wordle grid shows the *journey*. Summit's `❌❌🟩` row (two rejections, then a hit) and the → for a second guess are good examples. The share line should make someone who hasn't played curious.

9. **Near misses.** "So close" is more motivating than a win. Graded scoring creates near misses for free ("7 off!"). Polly's "Exact!" label and Venn's "Close! Fits 2 of 3" both lean into this.

10. **Skill that grows.** Calibration (Summit, Polly), vocabulary (Venn) and geography (Globle) all improve with play, so streaks feel like progress, not just habit.

11. **A believable source of truth.** Graded scoring only feels fair when you trust the answer key. Polly's rule that every number comes from a real poll page, and Summit's appeal flow, matter more than they look. Any new game needs an answer key that players can't easily argue with, or a complaint flow for when they do.

12. **A character and a world.** Krillion's sinking krill, Skipper, Mel, Polly: a mascot reacting to your score turns a number into a feeling, and makes the game feel handmade instead of generated.

### 1.3 Constraints specific to this suite
- **Tiny crowd.** A few players right now. Anything scored *against other players* (Krillion's rarity, Noillirk's commonness) breaks until there are dozens a day. Crowd comparisons already wait for 5 players. A new game's *score* can't depend on the crowd; it needs an outside answer key (a poll, Wikipedia, a map, an AI estimate) and can show the crowd as a bonus.
- **One admin.** Puzzle creation must be "AI drafts, Will approves" with a fallback bank, and approving a day should take a minute, not ten.
- **Free tier.** Cache every AI verdict. No paid APIs, no image licensing headaches.
- **Variety across the suite.** Summit is *magnitude*, Venn is *recall under time pressure*, Polly is *modelling people*. Missing so far: **time**, **place**, **words and association**, **deduction from clues**, **taste and obscurity**, **ordering**, **visual memory**.

---

## 2. Checklist for any new idea

A new game should get a yes on all of these:

1. Can the rule be said in one sentence?
2. Does each guess give feedback you can reason from?
3. Is the score graded, with a steep top end?
4. Is there open input (or at least a choice that expresses something personal)?
5. Is the reveal worth waiting for? Does it teach something?
6. Is a day 3–6 minutes?
7. Is there a believable answer key that doesn't need a big crowd?
8. Can the AI draft a day that Will approves in a minute, with a fallback bank?
9. Does it cover a skill the other games don't?
10. Is there a mascot and world whose reaction makes the score feel like something?

---

## 3. Ideas

Each idea lists: the pitch, how a day works, scoring, why it's fun (with checklist numbers), how it's built on the current stack, the mascot and world, the share line, and the risks.

---

### 3.1 Hop: the word-chain pond ⭐ top pick
**Pitch:** "Hop from one word to the other."

**A day:** 3 ponds (easy → hard). Each pond has a **start** word and an **end** word on lily pads, e.g. HONEY → SHIP. You type words to hop across. Each hop must make a **common compound word or two-word phrase** with the word before it, in that order:

`HONEY → MOON (honeymoon) → LIGHT (moonlight) → SHIP (lightship)`

- Any route counts. The judge checks each hop as you make it.
- A rejected hop costs nothing (like Summit's rejections), but each pond allows only 5 rejections, which keeps people from spamming.
- You can hop back one pad (undo). Undos show in the share line as a splash.
- At most 8 hops. If you can't finish, you score partial credit for getting within one hop of the end (the last word links straight to the end).

**Scoring:** golf. Each pond has a **par** (the shortest route the AI and admin found).
- Finish under par → **100** plus an "Eagle!" badge (you found a route nobody had)
- At par → 100
- Each hop over par → −15
- Unfinished → 0, or 20 if your last pad was one hop from the end
- Day out of 300

**Why it's fun:** a pure "aha" game (2, 4). Many routes exist, so the reveal, where you see the routes other players took, the shortest one known, and the strangest one, is a story about how different minds connect words (5). Undo and rejections make near misses (9). No other game in the suite is about words.

**Build:**
- Judge: one cached AI call per **pair** ("Is 'moon light' a common English compound or two-word phrase? Return yes/no and the joined form"). Pairs repeat a lot across players, so the cache fills fast. A complaint flow like Venn's covers bad calls.
- Generation: the AI drafts start/end pairs with at least one route of length 3–6 and the route itself. A server check judges every hop in the AI's route before the admin sees it. Optionally, a free phrase list (Wiktionary compounds) can run a breadth-first search to confirm the shortest known route.
- Player routes that beat par update the "shortest known" shown in the reveal (but the day's par stays fixed, like Venn's).

**Mascot and world:** **Pip**, a frog in a pond at dusk. Lily pads appear as you add words and Pip hops across them; a rejected word is a pad that sinks with a plop. Fireflies on a perfect pond. Shop: Pip's hats, pad skins, a little boat.

**Share:**
```
Hop #4 🐸 260/300
🌱 HONEY→SHIP 🟢🟢🟢 par 3 · 100
🌿 SNOW→TABLE 🟢🟢🟢🟢💦🟢 par 4 · 85
🌳 PAPER→STAR 🟢🟢🟢🟢🟢 par 3 · 70
```

**Risks:** "is that a real phrase?" arguments. Keep the rule tight ("a compound or phrase you'd find in a dictionary"), and lean on complaints. Rule for plurals and hyphens: they count.

---

### 3.2 Then: the timeline ⭐ top pick
**Pitch:** "Put history in order."

**A day:** one themed deck of 7 cards ("Snacks", "Inventions", "Video games", "Things older than you'd think"). The first card is placed on the timeline with its year showing. Each new card comes up without its year, and you tap the gap where it belongs. Then its year is revealed and it slides into its true place.

**Scoring:** each of the 6 placed cards scores up to 50:
- right gap → 50
- off by one gap → 25
- off by two → 10
- further → 0
- Day out of 300. (Gaps instead of years make it fair across themes. Being "one off" between 1902 and 1903 is forgiven.)

**Why it's fun:** the timeline fills up, so each card is harder than the last and uses everything you've learned so far (2, 7). The reveal is full of surprises: "Oreos (1912) are older than sliced bread (1928)" (5). Tapping a gap is the easiest input in the suite, so it suits phones and newcomers. Time is a skill none of the other games cover (9).

**Build:**
- No AI at play time. The answer key is just a year per card.
- Generation: the AI drafts a theme and 7 cards with years and a one-line "did you know". The server checks each year against Wikidata (inception or point in time) where a match exists and flags mismatches for the admin. The admin approves.
- A good theme mixes famous-old and surprising-young things and avoids clusters (no two cards within 3 years).

**Mascot and world:** **Tock**, an old tortoise who runs a museum archive. Each card is a framed exhibit hung on a long gallery wall; the wall scrolls as the timeline grows. Tock adjusts glasses and nods on a right placement. Shop: Tock's shell patterns, a monocle, gallery wallpaper.

**Share:**
```
Then #9 🐢 225/300 · Snacks
🟩🟩🟨🟩⬜🟩
```

**Risks:** dates are sometimes fuzzy ("invented" vs "first sold"). The card text says which ("Oreo first sold"), and the server check against Wikidata catches most mistakes.

---

### 3.3 Dig: rare answers, scored by Wikipedia ⭐ top pick
**Pitch:** "Name the deep cut."

This is Krillion's best idea (rarer is better, but too rare doesn't count) with an answer key that works with three players: **Wikipedia pageviews**, a real, public number.

**A day:** 3 categories ("A Beatles song", "A dog breed", "A country in Africa").
- Rounds 1 and 2 are **Deep cut**: name a valid one that as few people look up as possible.
- Round 3 is **Crowd-pleaser**: name the one you think gets the *most* views (the Noillirk twist).
- One answer per round, up to 3 rejections (not real, not in the category, no Wikipedia article).

**Scoring:**
- When the puzzle is made, the server gets the list of members (from the AI and a Wikipedia category) and each one's average monthly views over the last 12 months. That's the distribution.
- **Deep cut:** your score is the share of known members with *more* views than yours, so the least-viewed known member gets 100.
- **Crowd-pleaser:** the reverse.
- The cliff edge: your answer must have **its own Wikipedia article** and be in the category. That's the Krillion tension: the deeper you go, the more likely it doesn't count.

**Why it's fun:** it rewards the thing people love to show off, knowing the B-side (4). The reveal is fascinating: the full list from most to least viewed, with numbers ("'Ob-La-Di, Ob-La-Da' gets more views than 'Let It Be'?") (5). The crowd-pleaser round flips the strategy, so the day has two moods. Taste and obscurity aren't covered by any other game (9).

**Build:**
- Answer → article: Wikipedia's free search API finds the article; an AI call checks that the article *is* that thing and fits the category (cached per category + answer, like Venn).
- Views: the Wikimedia pageviews REST API (free, no key; set a User-Agent). Fetch per answer once and cache.
- Generation: the AI drafts categories with 30+ members; the server fetches views and rejects categories with fewer than 25 members found. Avoid categories where news spikes dominate (use the 12-month median).
- Show the source on the reveal: "Monthly Wikipedia views, last 12 months."

**Mascot and world:** **Rummy**, a raccoon crate-digging in a record shop basement. Rarer answers make Rummy dig deeper into the crates (the score is depth); the crowd-pleaser round brings out the shop's front window display. Shop: Rummy's headphones, beanies, a crate-sticker collection.

**Share:**
```
Dig #2 🦝 212/300
🎵 deep 🟩 94
🐕 deep ❌🟨 61
🌍 crowd 🟨 57
```

**Risks:** players searching the web for obscure answers. That's true of Summit too and harmless in a no-prize daily game. Disambiguation (song vs album with the same name) is handled by the AI check and complaints.

---

### 3.4 Homing: drop the pin
**Pitch:** "Where in the world?"

**A day:** 5 places, easy → hard (the Eiffel Tower, Lake Titicaca, the birthplace of the Olympics, the world's saltiest lake…). Tap the map where you think each is. Hard ones may start zoomed out to the world; easy ones too.

**Scoring:** distance-graded, steep near perfect:
- within 25 km → 100
- 0 at 5,000 km
- in between on a log scale (≈80 at 200 km, ≈50 at 800 km)
- Day out of 500 (or 3 places out of 300 to match the others)

**Why it's fun:** instant to understand, the reveal is a satisfying flight line from your pin to the truth with the distance, and you learn geography by accident (5, 10). Place isn't covered by any other game (9).

**Build:**
- No AI at play time; the server just computes great-circle distance.
- Map: a Natural Earth world outline (public domain) drawn as pixel art on a canvas, with pinch-zoom on phones.
- Generation: the AI drafts places; the server pulls coordinates from Wikidata (coordinate location) and refuses places without one; the admin approves.

**Mascot and world:** **Coo**, a homing pigeon with a satchel, on a parchment map with a compass rose. On reveal, Coo flies from your pin to the real spot. Shop: satchel colors, aviator goggles, map styles.

**Share:**
```
Homing #5 🐦 371/500
🟩🟩🟨🟧🟥
```

**Risks:** tapping accuracy on small screens (zoom fixes it), and places that are areas rather than points (score to the nearest edge for lakes and countries).

**Optional twist** for a later version: a final round where you name a city instead of tapping, "Name a city about halfway between Tokyo and Paris" (judged by geocoding, scored by distance), which ties back to Summit's middle idea.

---

### 3.5 Sniff: the clue ladder
**Pitch:** "Guess it in as few clues as you can."

**A day:** 3 mysteries (a thing, a place, a famous person). Each has 5 clues from vague to obvious. You see clue 1 and can guess anytime; each wrong guess reveals the next clue.

**Scoring:** guessed on clue 1 → 100, then 80, 60, 40, 20, missed → 0. Day out of 300.

**The twist that makes it more than Pinpoint:** every wrong guess gets a **warmth meter** (cold, warm, hot) for how close it is in meaning ("tiger" when the answer is "lion" is hot). This gives every guess feedback (2) and creates near misses (9).

**Why it's fun:** a gamble each turn: guess now for more points or wait for another clue. The clues read like a riddle in hindsight (5). Deduction isn't covered by any other game.

**Build:**
- Answer check: exact or fuzzy match against the canonical answer and aliases, then a cached AI call for "is this the same thing?"
- Warmth: a cached AI call returning 0–100 ("how close is X to Y?"), or Cloudflare Workers AI embeddings (free tier) for a cosine score.
- Generation: the AI drafts the answer and 5 clues; the admin edits. The most important rule for drafts: clue 1 must be true of many things, and no clue may contain the answer.

**Mascot and world:** **Scout**, a basset hound detective in a foggy pixel city at night, with a magnifying glass. Warmth is shown by Scout's nose and tail. Shop: deerstalker hats, trench coats, lamp-post styles.

**Share:**
```
Sniff #3 🐶 220/300
🔍 🟥🟩 80
🔍 🟥🟧🟥🟩 40
🔍 🟩 100
```

**Risks:** clue quality makes or breaks it, so admin approval matters more here than anywhere.

---

### 3.6 Stack: put them in order
**Pitch:** "Sort five things by size, speed, age…"

**A day:** 3 stacks. Each shows 5 things and a property ("by weight": a bowling ball, a house cat, a car tire, a bag of flour, a watermelon). Drag them into order and submit. Things in the right spot turn green (Wordle-style). You get 4 tries.

**Scoring:** solved on try 1 → 100, then 75, 50, 25; unsolved → 5 per log in the right spot on the last try. Day out of 300.

**Why it's fun:** it's a Mastermind deduction with real-world knowledge: "these two are right, so the cat must be lighter than the tire" (2). It's the cheapest game here to build, because it can reuse Summit's properties and value cache.

**Build:** no AI at play time. Values come from Summit's `answers` cache (already admin-correctable). Generation picks 5 things with values spread at least 1.3× apart.

**Mascot and world:** **Bucky**, a beaver building a dam from labelled logs. Right logs lock into the dam; a solved stack lets the water pour over. Shop: hard hats, tool belts, river styles.

**Share:**
```
Stack #7 🦫 225/300
⚖️ 🟩🟩⬜⬜🟩 → 🟩🟩🟩🟩🟩 75
```

**Risks:** close values feel unfair. Keep the 1.3× spacing and show values on reveal.

---

### 3.7 Swatch: what color is it?
**Pitch:** "Remember the color of real things."

**A day:** 5 real things with famous colors (a UPS truck, a Tiffany box, a Granny Smith apple, the Simpsons' skin, a school bus). Pick each color on a pixel color picker (hue strip and a lightness/saturation square), then lock in.

**Scoring:** perceptual color distance (CIEDE2000): ΔE ≤ 2 → 100, about 50 at ΔE 15, 0 at ΔE 40. Day out of 500.

**Why it's fun:** everyone is *sure* they know, and they're usually a bit off. The reveal, your swatch next to the real one, is instant and arguable ("I swear it's bluer") (5, 9). Visual memory isn't covered anywhere.

**Build:** the simplest of all. No AI at play time, no external data; the admin enters hex values from official brand guides or reference photos. The scoring is a pure function, easy to unit test.

**Mascot and world:** **Jinx**, a magpie who collects shiny colored things in a nest. Your swatches become trinkets in the nest. Shop: nest decorations, ribbons.

**Share:**
```
Swatch #1 🐦‍⬛ 402/500
🟩🟩🟨🟩🟧
```

**Risks:** screens show color differently, and real objects vary. Use well-documented official colors, and keep the "perfect" zone forgiving.

---

### 3.8 Bookworm: the blacked-out article
**Pitch:** "Uncover the mystery article."

**A day:** one Wikipedia article's opening paragraph (about 120 words), with every word except common ones (the, of, and…) blacked out, including the title. You type words; each one reveals everywhere it appears. Find the title.

**Scoring:** found within 15 guesses → 100, dropping 3 per guess after that; give up → partial credit for the share of the paragraph revealed.

**Why it's fun:** Redactle's hook (a slow dawning of what it's about) in five minutes instead of thirty, because it's only the intro (2, 5).

**Build:** the server fetches the article intro through the Wikipedia REST API, keeps the text, and only reveals words a player has guessed (so the answer never reaches the browser). Wikipedia text is CC BY-SA, so the reveal links to the article with attribution. Generation: the AI picks well-known article titles; the admin approves.

**Mascot and world:** **Inky**, a bookworm eating through black bars in an old library. Shop: reading glasses, bookmarks.

**Risks:** less suited to a three-stage day; better as a single puzzle. It also overlaps a bit with Sniff, so pick one of the two.

---

### 3.9 Herd: guess what the other players said (later, once there's a crowd)
**Pitch:** "Think like the herd."

A Family Feud / Noillirk game: "Name a fruit." You score by how many other players gave the same answer. It only works with dozens of players a day, so park it until the suite has that. Until then, Polly already covers "model other people" with real poll data.

---

## 4. Ranking

Scored against the checklist and the suite's constraints:

| Idea | New skill | Fun ceiling | Build effort | Small-crowd safe | Admin load | Verdict |
|---|---|---|---|---|---|---|
| **Hop** | words, association | very high | medium (pair judge, par) | yes | low | **Build next** |
| **Then** | time | high | low | yes | low (Wikidata check) | **Build next** |
| **Dig** | taste, obscurity | very high | medium (Wikipedia APIs) | yes | low | **Build next** |
| Homing | place | high | medium (map UI) | yes | low | Strong |
| Sniff | deduction | high | low–medium | yes | high (clue writing) | Strong if clue drafts are good |
| Stack | ordering | medium | very low (reuses Summit) | yes | very low | Quick win |
| Swatch | visual memory | medium | very low | yes | low | Quick win |
| Bookworm | deduction | medium | medium | yes | low | Maybe |
| Herd | modelling people | high | low | **no** | low | Later |

**My recommendation:**
1. **Hop** next. It's the most original idea here, it's the suite's first word game, and it plays to the suite's real strength (an AI judge that makes open input cheap). The golf framing (par, under par) is instantly understood.
2. **Then** after that. It's the easiest to play of anything in the suite, needs no AI at play time, and its surprising reveals are very shareable.
3. **Dig** third. It's Krillion's magic without needing a crowd, and Wikipedia pageviews give it a source nobody can argue with.

**Stack** or **Swatch** could be a weekend build if you want something small first.

### 4.1 Things to avoid (lessons from the research)
- **Pass/fail scoring.** Every idea above grades.
- **Scoring against a crowd that doesn't exist yet.** Use an outside answer key; show the crowd as a bonus once 5 people have played.
- **Long sessions.** Cap anything open-ended (Bookworm's intro only, Hop's 8 hops).
- **Licensed images or audio.** Framed- or Heardle-style games need media you can't legally host for free.
- **Wordle clones.** The space is crowded; the suite's edge is AI judging and believable outside data.
- **Answer keys that live in the browser.** Keep doing what Venn does: the server holds the answers.
