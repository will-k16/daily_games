# Puzzle prompts

How to use these:

1. Open **/admin** → the game → **Import**, and press **Copy avoid list**.
2. Copy the game's prompt below (everything inside the grey box) into an LLM. Replace the parts in `[[DOUBLE BRACKETS]]`, and paste the avoid list where it says.
3. Paste the LLM's answer into the Import box. Edit anything you like (it's plain text), press **Check**, then **Add to calendar**.

Tips:
- Use a strong model (ChatGPT, Claude, Gemini). **Polly needs one that can browse the web** (ChatGPT with search, Perplexity, Gemini, Claude with web search), because every number has to come from a real page.
- Ask for 7–14 days at a time. If the answer gets cut off, say "continue", then paste both parts.
- Anything Check flags is skipped; the rest still goes in. Fix the flagged lines and paste them again.
- Summit and Venn days without a `date:` line go on the next days that have nothing approved yet, starting tomorrow. Add `date: YYYY-MM-DD` to a day to put it on a specific date.

---

## Summit

Each day has three stages (easy, medium, hard). A stage is two real things that differ a lot in one measurable property; players name something whose value sits at the **geometric middle** (√(small × big)).

```text
You write puzzles for "Summit", a daily web game. Each puzzle shows a "too small" real thing and a "too big" real thing that differ in ONE measurable property. Players try to name a third real thing whose value sits at the GEOMETRIC middle of the two: √(small × big). Example: a paper clip (1 g) and a grand piano (450 kg) → the middle is about 670 g, so a basketball or a can of soup works.

Write [[NUMBER, e.g. 10]] days. Each day has exactly three stages: easy, medium and hard.

PROPERTIES (use exactly one of these words per stage; "what it means" is how the value is measured):
- weight: weight (mass)
- height: height
- length: length (longest dimension)
- speed: typical top speed (animals, vehicles, people, sports, natural phenomena)
- price: typical price in US dollars today (things people buy: products, vehicles, homes, tickets, famous auction items)
- distance: length of a route, or how far apart two places are (routes, trips, races, famous journeys, distances in space)
- volume: volume or capacity
- age: how long ago it was made, built, born or founded, as of today (buildings, landmarks, inventions, companies, artworks, natural features, trees)
- population: number of people who live there (towns, cities, states, countries, islands, continents)
- duration: how long it typically lasts (events, activities, movies, songs, sports games, natural events, trips)
- capacity: how many people it can hold or seat (vehicles, rooms, venues, stadiums, ships, aircraft, elevators)
- calories: food energy of a typical serving or whole item (foods, snacks, drinks, meals)
- area: area
- lifespan: typical lifespan (animals, plants, insects, long-lived living things)
- build: how long it typically takes to make or build one, start to finish (meals, products, vehicles, ships, buildings, bridges, monuments, artworks)
- power: typical power output or use (appliances, devices, vehicles, engines, light bulbs, power plants)
- data: typical digital file or storage size (photos, songs, movies, video games, documents, apps, datasets)
- words: number of words in it (books, poems, speeches, songs, documents, famous articles)
- copies: total copies or units sold worldwide (books, albums, video games, consoles, phones)

DIFFICULTY:
- easy: both items are things almost everyone knows; the bigger value is 1,000× to 10,000,000× the smaller; lots of everyday things sit near the middle.
- medium: familiar items; the bigger value is 100× to 100,000× the smaller.
- hard: less everyday but well documented items; the bigger value is only 30× to 1,000× the smaller; fewer obvious things near the middle, but still answerable.

RULES:
- Items are REAL (nothing fictional), specific, and recognizable to a typical teenager. Write them with an article: "a harp", "the Eiffel Tower", "a bowling ball".
- Both items naturally HAVE the property and are measured the obvious way (no "calories of a paper clip", no "power of a houseplant").
- Each item has one clear, well-documented typical value. Be accurate. Give the value as a number with a unit.
- Never put numbers or units in an item's name: not "a 5-kilometer race", "a two-liter bottle", "a 10-story building".
- Make pairings fun and surprising: the two items come from different worlds (a snail and a fighter jet, not two kinds of car).
- Use a different property for each stage of a day, and vary properties across days.
- Avoid the most overused picks (house cats, mice, elephants, blue whales, soda cans, Mount Everest) unless nothing else fits.
- Don't use any of these items (already used): [[PASTE THE AVOID LIST HERE]]

UNITS you can use (pick what reads naturally):
weight: mg, g, kg, t (tonnes), oz, lb, ton (US) · height/length/distance: mm, cm, m, km, in, ft, yd, mi · area: cm2, m2, ha, km2, sq ft, acres, sq mi · volume: mL, L, m3, tsp, tbsp, fl oz, cups, gallons · duration/build: seconds, minutes, hours, days, weeks, years · age/lifespan: years · speed: m/s, km/h, mph, knots · calories: Cal · power: W, kW, MW, GW, hp · data: B, KB, MB, GB, TB · price: $ (e.g. $1.50, $400 million) · population/capacity/words/copies: a plain number (e.g. 37 million).

OUTPUT FORMAT (follow exactly; no other text before or after, no markdown, no numbering):
DAY
easy | <property> | <small item> = <value> <unit> | <big item> = <value> <unit> | <one short note naming 2 or 3 real things near the middle>
medium | <property> | <small item> = <value> <unit> | <big item> = <value> <unit> | <note>
hard | <property> | <small item> = <value> <unit> | <big item> = <value> <unit> | <note>

EXAMPLE OF ONE DAY:
DAY
easy | weight | a paper clip = 1 g | a grand piano = 450 kg | a basketball, a can of soup
medium | height | a coffee mug = 10 cm | the Eiffel Tower = 330 m | a giraffe, a two-story house
hard | lifespan | a mayfly = 1 day | a horse = 30 years | a hamster, a goldfish

Repeat the DAY block for every day.
```

---

## Venn

Each day has two rounds. Round 1 is two circles; round 2 is three circles. Players get 90 seconds to name things that fit **all** circles. Par = 60% of the "typical" count you give.

```text
You write puzzles for "Venn", a daily word game for everyone, not trivia buffs. Each round is a Venn diagram of categories. Players get 90 seconds to type as many real things as they can that fit ALL the categories at once.

Write [[NUMBER, e.g. 10]] days. Each day has:
- Round 1 (R1): exactly 2 categories.
- Round 2 (R2): exactly 3 categories (only the very center counts, so it must still have plenty of common answers).

RULES:
- EASY to get started: an ordinary adult should think of several answers in the first 10 seconds.
- Use broad, familiar categories. At least one per round is a big everyday topic group (animals, foods people eat, things found in a house or kitchen, sports, vehicles, clothing, toys and games, famous people, countries, jobs). The others are simple properties anyone can check at a glance (a common color, round, bigger than a person, made of wood or metal, has wheels, found at the beach, starts with a common letter).
- The four allowed kinds: properties (colored orange, round, made of wood), time and place (invented after 1950, from Japan), word play (starts with B, has a double letter), topic groups (foods, animals, sports equipment, famous people). Prefer the easy end.
- Each category is ONE full, plain phrase that's unambiguous on its own: "Things colored orange", never just "Orange". No examples or labels in it.
- The categories in a round must really be different (not "Made of metal" + "Colored silver") and must not overlap almost completely.
- Too hard (never do this): "Things that are naturally blue" + "Foods"; "Mammals" + "Things that can fly" + "Things found in Australia" (only bats); anything whose answers are mostly species, breeds, varieties or brand-new products.
- No category may repeat within the batch, and don't use any of these recently used categories (or close rewordings): [[PASTE THE AVOID LIST HERE]]
- answers: list at least 25 (R1) or 10 (R2) DIFFERENT COMMON things that fit ALL the round's categories: plain everyday words a kid or grandparent would know ("carrot", "pumpkin", "basketball"). One thing each; no variants, no species or variety names, no fictional characters, nothing you'd have to look up. If you can't list that many, the categories are too narrow: pick broader ones.
- typical: your honest estimate of how many answers a typical player finds in 90 seconds (usually 6–12 for R1, 3–7 for R2).

OUTPUT FORMAT (follow exactly; no other text before or after, no markdown, no numbering; separate answers with semicolons and circles with |):
DAY
R1: <category> | <category>
R1 typical: <number>
R1 answers: <answer>; <answer>; <answer>; ...
R2: <category> | <category> | <category>
R2 typical: <number>
R2 answers: <answer>; <answer>; ...

EXAMPLE OF ONE DAY:
DAY
R1: Things colored orange | Foods people eat
R1 typical: 9
R1 answers: carrot; pumpkin; orange; sweet potato; mango; apricot; cantaloupe; peach; cheddar cheese; papaya; butternut squash; tangerine; salmon; nectarine; persimmon; cheese puffs; orange juice; macaroni and cheese; candy corn; apricot jam; marmalade; kumquat; Cheetos; Doritos; Fanta
R2: Animals | Things that can fly | Things colored black
R2 typical: 5
R2 answers: crow; raven; bat; fly; blackbird; vulture; housefly; beetle; ant; wasp

Repeat the DAY block for every day.
```

---

## Polly

Polly needs **real** poll numbers. The site opens every question's source page and checks the numbers are written on it: questions it can verify are approved and scheduled, anything else waits in the Bank as a draft. So the prompt's job is to make the LLM copy numbers and sentences **exactly** from real pages.

```text
You are helping me fill a "guess the poll" game with REAL US poll results. You must browse the web. Every number you give must be copied exactly from a real web page you opened. Never estimate, round, or recall numbers from memory. If a page doesn't state it, skip that result.

Find [[NUMBER, e.g. 15]] poll questions.

WHERE (only these sites, or their subdomains): pewresearch.org, news.gallup.com, gallup.com, today.yougov.com, yougov.com, apnorc.org, ipsos.com, maristpoll.marist.edu, poll.qu.edu, monmouth.edu, ssrs.com, norc.org, gss.norc.org.
- Use normal web articles (HTML), not PDFs, images or toplines. YouGov's daily survey result pages (one question each) are great.
- Polls from the last 3 years, ideally the last 12 months.

WHAT COUNTS:
- A result for ALL US adults (or a national sample of adult citizens / registered voters). Never a subgroup (Republicans, parents, young adults, women, one state). If a chart breaks a result out by group, use only its "Total" / "All adults" / "U.S. adults" row.
- Either a two-sided split ("62% prefer X, 38% prefer Y"; "45% yes, 30% no, 25% not sure"), or ONE share of all adults ("44% of U.S. adults have used ChatGPT"). For one share, give only the left number; the right side is "everyone else".
- Prefer fun, everyday questions that stay true over time: habits, preferences, food, money, work, technology, relationships, beliefs, would-you-rather. At most 2 about politics, and no questions about specific politicians, candidates, elections or breaking news.
- Don't reuse any of these (already in the game): [[PASTE THE AVOID LIST HERE]]

EACH FIELD:
- short: a plain question of 90 characters or fewer that means exactly what the poll asked.
- left / right: the poll's OWN answer options, each 14 characters or fewer, never loaded words (if it asked approve/disapprove, write Approve / Disapprove). Write "Label = number" with the percentage exactly as on the page. For a one-share result write the right side as just a label (e.g. "Haven't").
- unsure: everyone who picked neither side, added up (e.g. "No preference 21%" + "Not sure 6%" = 27). Leave the line out if the page gives none.
- wording: the exact question wording as written on the page.
- source: the pollster's name.
- url: the exact address of the page the numbers are on (no tracking parameters).
- ended: the last day the poll was in the field, as YYYY-MM-DD (from the page).
- sample: how many adults were surveyed (from the page), digits only.
- topic: one of life, beliefs, money, politics.
- time-sensitive: "no", or "yes - <why>" only if it's about a current officeholder, an election, a candidate or specific recent news.
- evidence: one sentence or table row copied EXACTLY, character for character, from the page, that contains the numbers you used. It must include the left number (and the right and unsure numbers if you gave them).

OUTPUT FORMAT (follow exactly; no other text before or after, no markdown, no numbering):
QUESTION
short: <question>
left: <label> = <number>
right: <label> = <number>
unsure: <number>
wording: <exact wording>
source: <pollster>
url: <url>
ended: <YYYY-MM-DD>
sample: <number>
topic: <life|beliefs|money|politics>
time-sensitive: <no | yes - reason>
evidence: <exact sentence from the page>

EXAMPLE:
QUESTION
short: Do you prefer toilet paper hung over or under the roll?
left: Over = 59
right: Under = 14
unsure: 27
wording: Do you prefer toilet paper to be hung over or under the roll?
source: YouGov
url: https://today.yougov.com/topics/society/survey-results/daily/2025/08/11/abcd/1
ended: 2025-08-11
sample: 1024
topic: life
time-sensitive: no
evidence: Over 59 % Under 14 % No preference 21 % Not sure 6 %

Repeat the QUESTION block for every question.
```

The site checks at most 15 questions per paste (it opens each source page), so paste bigger batches in parts.
