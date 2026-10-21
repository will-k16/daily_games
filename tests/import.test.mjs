// Paste-in puzzles: the parsers for the formats in prompts/PROMPTS.md, and an import into a local D1.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getPlatformProxy } from 'wrangler';
import { blocks, parseValue, parseSummit, parseVenn, parsePolly, importSummit, importVenn } from '../functions/_lib/importer.js';
import { todayUTC, addDays } from '../functions/_lib/util.js';

const SUMMIT = `Here you go:
\`\`\`
DAY 1
easy | weight | a paper clip = 1 g | a grand piano = 450 kg | a bowling ball (~7 kg) sits near the middle
medium | height | a coffee mug = 10 cm | the Eiffel Tower = 330 m
hard | population | a small village = 300 people | Tokyo = 37 million

DAY 2
date: 2030-01-05
easy | top speed | a garden snail = 0.003 mph | a cheetah = 70 mph
medium | age | a smartphone = 2 years | the Great Pyramid = 4,500 years
hard | price | a pack of gum = $1.50 | a Boeing 747 = $400 million
\`\`\``;

const VENN = `DAY
R1: Things colored orange | Foods people eat
R1 typical: 9
R1 answers: carrot; pumpkin; orange; cheddar cheese; sweet potato; mango; apricot; cantaloupe; peach; Cheetos
R2: Animals | Things that can fly | Things colored black
R2 typical: 6
R2 answers: crow; raven; bat; fly; blackbird; crow; ant
---
R1: Things with wheels | Toys
R1 par: 4`;

const POLLY = `QUESTION
short: Would you rather be 10 minutes early or 10 minutes late?
left: Early = 71
right: Late = 24
unsure: 5
wording: "Would you rather be 10 minutes early or 10 minutes late?"
source: YouGov
url: https://today.yougov.com/topics/society/survey-results/daily/2025/08/11/abcd
ended: 2025-08-11
sample: 1,024
topic: life
time-sensitive: no
evidence: "71% of Americans would rather be 10 minutes early, 24% would rather be late"

QUESTION
short: Have you ever used ChatGPT?
left: Have used = 44
right: Haven't
url: https://www.pewresearch.org/x
evidence: 44% of U.S. adults say they have used ChatGPT`;

test('blocks: headers, fences, bullets and chatter are handled', () => {
  const b = blocks(SUMMIT);
  assert.equal(b.length, 3);           // the chatter before the first DAY is its own (bad) block, then two days
  assert.equal(blocks('- DAY\n- a\n\n- b\n---\nc').length, 2);
});

test('values: units turn into each property\'s base unit', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) / b < 1e-6, `${a} ≈ ${b}`);
  near(parseValue('450 kg', 'weight').value, 450);
  near(parseValue('1 g', 'weight').value, .001);
  near(parseValue('3 lbs', 'weight').value, 1.360776);
  near(parseValue('330 m', 'height').value, 330);
  near(parseValue('10 cm', 'height').value, .1);
  near(parseValue('37 million', 'population').value, 37e6);
  near(parseValue('300 people', 'population').value, 300);
  near(parseValue('70 mph', 'speed').value, 31.2928);
  near(parseValue('4,500 years', 'age').value, 4500);
  near(parseValue('$400 million', 'price').value, 4e8);
  near(parseValue('2 hours', 'duration').value, 7200);
  near(parseValue('5 GB', 'data').value, 5e9);
  near(parseValue('2,500 square feet', 'area').value, 232.2575);
  near(parseValue('3 gallons', 'volume').value, 11.35623);
  assert.match(parseValue('12 furlongs', 'height').error, /Unknown unit/);
  assert.match(parseValue('lots', 'weight').error, /Couldn't read/);
});

test('Summit days: three stages each, with dates and errors', () => {
  const days = parseSummit(SUMMIT);
  assert.equal(days.length, 3);
  assert.ok(days[0].errors.length);    // the chatter line
  assert.equal(days[1].stages.length, 3);
  assert.equal(days[1].stages[0].property, 'weight');
  assert.equal(days[1].stages[0].note, 'a bowling ball (~7 kg) sits near the middle');
  assert.equal(days[2].date, '2030-01-05');
  assert.equal(days[2].stages[0].property, 'speed');
  const bad = parseSummit('DAY\neasy | weight | a pea = 1 g | a bean = 2 g\nmedium | smell | a = 1 | b = 2');
  assert.match(bad[0].errors.join(' '), /20×/);
  assert.match(bad[0].errors.join(' '), /isn't a Summit property/);
});

test('Venn days: circles, par from typical, answers, warnings', () => {
  const days = parseVenn(VENN);
  assert.equal(days.length, 2);
  const [r1, r2] = days[0].rounds;
  assert.deepEqual(r1.circles, ['Things colored orange', 'Foods people eat']);
  assert.equal(r1.par, 7);                  // par = 75% of typical 9
  assert.match(r1.warning, /only 10 answers/);
  assert.equal(r2.circles.length, 3);
  assert.equal(r2.answers.filter(a => a === 'crow').length, 1);
  assert.equal(days[1].rounds[0].par, 4);
  assert.match(parseVenn('DAY\nR2: A | B')[0].errors[0], /exactly 3 circles/);
});

test('Polly questions: every field, and a one-share question', () => {
  const [a, b] = parsePolly(POLLY);
  assert.deepEqual(a.errors, []);
  assert.equal(a.q.left_raw, 71);
  assert.equal(a.q.right_raw, 24);
  assert.equal(a.q.sample_size, 1024);
  assert.equal(a.q.real, 75);
  assert.equal(a.q.original_wording, 'Would you rather be 10 minutes early or 10 minutes late?');
  assert.deepEqual(b.errors, []);
  assert.equal(b.q.right_raw, null);               // one-share: the server makes it 100 minus the left
  assert.match(parsePolly('QUESTION\nshort: x')[0].errors.join(' '), /left side/);
});

let proxy, env, dir;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wk-import-'));
  proxy = await getPlatformProxy({ persist: { path: dir } });
  env = proxy.env;
  for (const f of readdirSync('migrations').filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join('migrations', f), 'utf8').split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    for (const s of sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) await env.DB.prepare(s).run();
  }
}, { timeout: 60000 });
after(async () => { if (proxy) await proxy.dispose(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* still locked on Windows */ } });

test('Summit import: a check changes nothing; adding fills tomorrow onward, approved', async () => {
  const dry = await importSummit(env, { text: SUMMIT, dryRun: true });
  assert.equal(dry.added, 0);
  assert.equal(dry.days[1].date, addDays(todayUTC(), 1));
  assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM puzzles`).first()).n, 0);
  const r = await importSummit(env, { text: SUMMIT });
  assert.equal(r.added, 6);
  const rows = (await env.DB.prepare(`SELECT date, slot, status FROM puzzles ORDER BY date, slot`).all()).results;
  assert.deepEqual(rows.map(x => x.status), Array(6).fill('approved'));
  assert.equal(rows[3].date, '2030-01-05');
  // The next paste goes after the days already filled.
  const next = await importSummit(env, { text: 'DAY\neasy | weight | a paper clip = 1 g | a grand piano = 450 kg', dryRun: true });
  assert.equal(next.days[0].date, addDays(todayUTC(), 2));
});

test('Venn import: both rounds approved on the next free day', async () => {
  const r = await importVenn(env, { text: VENN });
  assert.equal(r.added, 3);
  const rows = (await env.DB.prepare(`SELECT date, round, status, par FROM venn_puzzles ORDER BY date, round`).all()).results;
  assert.equal(rows[0].date, addDays(todayUTC(), 1));
  assert.equal(rows[2].date, addDays(todayUTC(), 2));
  assert.ok(rows.every(x => x.status === 'approved'));
});
