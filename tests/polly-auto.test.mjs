// Polly finding its own questions: feed parsing, which pages are taken, the auto-approve rule, and one full run
// against a local D1 with a fake feed and a fake poll page (the AI runs in MOCK_AI mode).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getPlatformProxy } from 'wrangler';
import { feedLinks, pickPages, cleanUrl, looksLikePoll, canAutoApprove, discover, queue, status } from '../functions/_lib/polly-auto.js';
import { checkCandidate } from '../functions/_lib/polly-ai.js';
import { fieldsFrom } from '../functions/_lib/polly-admin.js';

const SOURCES = [{ id: 1, name: 'Pew Research Center', domains: ['pewresearch.org'], active: 1 }, { id: 2, name: 'Gallup', domains: ['gallup.com', 'news.gallup.com'], active: 1 }];

test('feeds: RSS, Atom and sitemaps, with tracking parameters dropped', () => {
  const rss = `<rss><channel><item><title><![CDATA[Toilet paper: over or under?]]></title><link>https://www.pewresearch.org/short-reads/2026/10/16/tp/?utm_source=rss&#038;utm_medium=rss</link><pubDate>Fri, 16 Oct 2026 14:00:00 +0000</pubDate></item>
    <item><title>Weekly</title><link>https://www.pewresearch.org/newsletter/weekly-roundup/weekly-10-17-26/</link><pubDate>Sat, 17 Oct 2026 10:00:00 +0000</pubDate></item></channel></rss>`;
  const links = feedLinks(rss);
  assert.equal(links[0].url, 'https://www.pewresearch.org/short-reads/2026/10/16/tp/');
  assert.equal(links[0].date, '2026-10-16');
  assert.equal(links[0].title, 'Toilet paper: over or under?');
  const atom = '<feed><entry><title>A</title><link rel="alternate" href="https://news.gallup.com/poll/1/a.aspx"/><updated>2026-10-10T00:00:00Z</updated></entry></feed>';
  assert.deepEqual(feedLinks(atom).map(l => [l.url, l.date]), [['https://news.gallup.com/poll/1/a.aspx', '2026-10-10']]);
  const map = '<urlset><url><loc>https://news.gallup.com/poll/715907/x.aspx</loc><lastmod>2026-10-15</lastmod></url><url><loc>https://news.gallup.com/poll/1/old.aspx</loc><lastmod>2019-01-01</lastmod></url></urlset>';
  const picked = pickPages([...feedLinks(map), ...links, { url: 'https://evil.example/poll', date: '2026-10-16' }], SOURCES, '2026-10-18');
  assert.deepEqual(picked.map(p => p.url), ['https://www.pewresearch.org/short-reads/2026/10/16/tp/', 'https://news.gallup.com/poll/715907/x.aspx']);
  assert.ok(!looksLikePoll('https://news.gallup.com/poll/715910/pdf-americans-views.aspx'));
  assert.ok(!looksLikePoll('https://www.pewresearch.org/race-and-ethnicity/2026/10/16/acknowledgments-86/'));
  assert.equal(cleanUrl('https://a.org/x?id=3&utm_campaign=y#top'), 'https://a.org/x?id=3');
});

test('auto-approve only when nothing is left to doubt', () => {
  const page = 'Survey of 1,024 U.S. adults conducted Aug. 4-11, 2025. Do you prefer toilet paper to be hung over or under the roll? Over 59 % Under 14 % No preference 21 % Not sure 6 %';
  const c = { original_wording: 'Do you prefer toilet paper to be hung over or under the roll?', short: 'Toilet paper: over or under the roll?', left_label: 'Over', right_label: 'Under',
    left_raw: 59, right_raw: 14, unsure_raw: 6, population: 'US adults', poll_end_date: '2025-08-11', sample_size: 1024, topic: 'life', time_sensitive: false, evidence: 'Over 59 % Under 14 % No preference 21 % Not sure 6 %' };
  const f = (x, chk) => fieldsFrom({ ...chk.q, source_id: 1, url: 'https://www.pewresearch.org/a', entry: 'auto-checked', ...x }, SOURCES, 'auto-checked');
  const ok = checkCandidate(c, page);
  assert.ok(canAutoApprove(ok, f({}, ok), SOURCES));
  const noDate = checkCandidate({ ...c, poll_end_date: '2025-09-01' }, page);
  assert.ok(noDate.ok && !canAutoApprove(noDate, f({}, noDate), SOURCES));          // the date isn't on the page
  const ts = checkCandidate({ ...c, time_sensitive: true }, page);
  assert.ok(!canAutoApprove(ts, f({}, ts), SOURCES));                               // time-sensitive waits for a person
  const long = checkCandidate({ ...c, left_label: 'Over the top of the roll' }, page);
  assert.ok(!canAutoApprove(long, f({}, long), SOURCES));                           // needs trimming first
  assert.ok(!canAutoApprove(ok, f({ entry: 'admin-pasted' }, ok), SOURCES));        // pasted text isn't fetched by the server
});

let proxy, env, dir, realFetch;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wk-polly-auto-'));
  proxy = await getPlatformProxy({ persist: { path: dir } });
  env = { ...proxy.env, MOCK_AI: '1' };
  for (const f of readdirSync('migrations').filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join('migrations', f), 'utf8').split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    for (const s of sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) await env.DB.prepare(s).run();
  }
  const today = new Date().toUTCString();
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    const reply = (body, type) => { const r = new Response(body, { headers: { 'content-type': type } }); Object.defineProperty(r, 'url', { value: u }); return r; };
    if (u === 'https://www.pewresearch.org/feed/') return reply(`<rss><channel><item><title>Texting at the movies</title><link>https://www.pewresearch.org/short-reads/movies/</link><pubDate>${today}</pubDate></item></channel></rss>`, 'application/rss+xml');
    if (u.startsWith('https://www.pewresearch.org/short-reads/movies')) return reply('<html><body><p>Survey of 1,024 U.S. adults.</p><p>Respondents were asked "Is it OK to text during a movie?" Overall, 12% said yes, 85% said no and 3% were not sure.</p><p>' + 'More text. '.repeat(20) + '</p></body></html>', 'text/html');
    return reply('nope', 'text/plain');
  };
}, { timeout: 60000 });
after(async () => { globalThis.fetch = realFetch; if (proxy) await proxy.dispose(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* still locked on Windows */ } });

test('a run reads the feed, queues the page, and turns it into questions', async () => {
  const r = await discover(env, { maxPages: 3 });
  assert.equal(r.queued, 1);
  assert.equal(r.read, 1);
  assert.equal(r.added + r.drafted, 1);                 // the mock gives no poll date, so it waits as a draft
  const q = await env.DB.prepare(`SELECT * FROM polly_questions`).first();
  assert.equal(q.real, 12);
  assert.equal(q.entry, 'auto-checked');
  assert.equal(q.status, 'draft');
  const again = await discover(env, { maxPages: 3, forceFeeds: true });
  assert.equal(again.queued, 0);                         // the same page is never read twice
  assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM polly_questions`).first()).n, 1);
});

test('pasted links are queued (off-list ones refused); status reports feeds and pages', async () => {
  const r = await queue(env, { urls: 'https://www.pewresearch.org/short-reads/other/\nhttps://evil.example.com/x' });
  assert.equal(r.queued, 1);
  assert.deepEqual(r.refused, ['https://evil.example.com/x']);
  const s = await status(env);
  assert.equal(s.feeds.length, 3);
  assert.ok(s.pages.length >= 2);
  assert.equal(s.autoApprove, false);                   // off by default: everything waits for the admin
});
