# Lifeline: game spec

Lifeline is the fourth game in WK Game Suite, at `/lifeline`. Lifeline #1 is `LIFELINE_LAUNCH_DATE` (2026-10-23, 7 pm US Central); before then the page shows a countdown and the home card says "Opens tonight".

## The game
- Each day has **three rounds**: easy, medium and hard. Each round is a pair of real historical events, shown by name. Their dates are hidden until the player turns on **Show the events' dates** (no penalty; the choice is remembered on the device).
- The player names **one real person** who was alive for both events. **One guess per round**, locked in.
- New events at midnight UTC. One attempt per round per day; past days can be replayed from the archive for half the WK Bucks.

## Who counts
- Any real person on Wikipedia. A name is looked up in the built-in list of about 700 famous people first (no network), then on English Wikipedia's search, with Wikidata giving birth and death dates. Every lookup is cached in `lifeline_people` / `lifeline_searches`.
- Fictional characters, animals and anything that isn't a human on Wikidata are refused ("Couldn't find a real person…"). So is anyone without a birth date, or born before 1900 with no death date. A refusal doesn't use up the guess.
- **Which one did you mean?** When a name fits several people and none is far more famous (4× as many Wikipedia languages), the player picks from up to four, shown with Wikipedia's short description (any years in it are stripped).
- Someone alive today counts up to today.

## Scoring (0–1,000 a round, 3,000 a day)
Dates give the benefit of the doubt: a year-only date covers the whole year (a month-only date the whole month), and the person's life runs from the earliest day they could have been born to the latest day they could have died.
- **Alive for both:** 1,000.
- **Alive for one:** 500, plus up to 250 for how much of the gap between the events they lived through (so someone who died a week before the second event gets about 750).
- **Alive for neither, but lived between them:** up to 250, for how much of the gap their life fills.
- **Lived wholly before or after both:** up to 100 for coming close (out to half the gap, at least 10 years), otherwise 0.

Share squares: 🟩 alive for both, 🟨 alive for one, 🟧 some points, 🟥 none.

## Race the jerboa
- A long-eared jerboa in pixel art, like the other pets. The timeline is a desert at the time of day you're playing.
- On a guess, the timeline zooms out to fit the whole life if needed, Race hops to the birth date, then leaps to the death date (or today) along an arc, leaving a dashed trail. Birth and death years appear on the track.
- **Race's shop** (WK Bucks): fur color, hats, socks, the color of the jump trail (rainbow included), and a name tag to rename Race. Race also lives in the pet corner, on a dune in a patch of desert.

## WK Bucks
1 per 100 points on a daily round, +5 for a perfect 1,000, +5 for finishing all three. Archive rounds pay 1 per 200.

## Results
After each guess: the score, the person and their dates, which events they were alive for and why it scored what it did, up to three well-known people who were alive for both, what other players named, and (once 5 people have played) how everyone did. "Dates look wrong?" sends a report to the admin.

## Making the days
- A day with nothing approved uses its newest draft, then the built-in bank (`functions/_lib/lifeline-bank.js`): 12 days whose example people were all checked against Wikidata dates.
- **AI drafts** (admin calendar, and automatically while people play when fewer than 4 of the next 7 days are ready): the AI writes a day; each event's year is checked against its Wikidata item, and each example person is looked up and scored, keeping only those really alive for both. A pair with no example that checks out is thrown away and asked for again.
- **Import:** paste an LLM's answer in the format from `prompts/PROMPTS.md`.
- **Difficulty:** round 1 is two modern events 20–45 years apart; round 2 is 45–70 years apart; round 3 is before 1750 (any era, BCE included), where few famous people lived through both. (Gaps of 80+ years were tried and dropped: almost no famous person lived through both.)

## Reports and fixes
Admin → Lifeline → Reports: fix the person's dates (rescores every play that named them) or dismiss. Admin → Lifeline → People: fix anyone's dates directly. Admin fixes always win over Wikidata.
