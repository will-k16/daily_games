// Polly finds its own questions. Feeds (RSS / Atom, or sitemaps) from allowlisted pollsters list new report pages;
// each page is queued, fetched, read by the extractor, and every candidate goes through the same server check as
// a pasted URL. The ones with nothing left to doubt are approved on their own; the rest wait as drafts.
// Runs from the admin's "Find polls now", and in the background (after a player's page loads) whenever the bank is low.
import { HttpError, nowISO, clampStr } from './util.js';
import { activeSources, sourceForUrl, fetchPage, extractCandidates, checkCandidate } from './polly-ai.js';
import { allSources, fieldsFrom, insertQ, approvalProblems, bankInfo } from './polly-admin.js';
import { autoFill } from './polly.js';

const FEED_HOURS = 6;          // re-read each feed at most this often
const BACKGROUND_HOURS = 3;    // background runs at most this often
const FEED_MAX_BYTES = 600000; // big sitemaps are read only this far
const RECENT_DAYS = 60;        // pages older than this (when the feed dates them) are left alone
const PER_FEED = 15;           // newest pages taken from each feed per read
const MAX_ATTEMPTS = 3;
const DRAFT_CAP = 40;            // background runs pause while this many drafts are waiting for review

/* ───────────── Settings ───────────── */

async function meta(env, key, fallback = '') {
  const r = await env.DB.prepare(`SELECT value FROM polly_meta WHERE key = ?`).bind(key).first();
  return r ? r.value : fallback;
}
const setMeta = (env, key, value) => env.DB.prepare(`INSERT OR REPLACE INTO polly_meta (key, value) VALUES (?, ?)`).bind(key, String(value)).run();

/* ───────────── Reading feeds (pure, tested) ───────────── */

const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&#0?38;|&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(m[1]) : ''; };

/** Drops tracking parameters and the #fragment so the same page is only queued once. */
export function cleanUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    [...x.searchParams.keys()].filter(k => /^(utm_|fbclid|gclid|mc_)/i.test(k)).forEach(k => x.searchParams.delete(k));
    return x.toString();
  } catch { return ''; }
}

/** Pages that never hold a poll result: newsletters, staff pages, methods, PDFs, topic indexes… */
const NOT_A_POLL = /\/(newsletter|newsletters|staff|people|person|about|careers|jobs|events|contact|topics?|tags?|category|author|search|feed|podcasts?|videos?|press|methods?|methodology)(\/|$)|acknowledg|appendix|topline|questionnaire|\.pdf($|\?)|\/pdf-/i;
export const looksLikePoll = u => !NOT_A_POLL.test(u);

/** Links (with dates when the feed gives them) from an RSS / Atom feed or a sitemap. */
export function feedLinks(xml) {
  const out = [];
  const add = (url, date, title = '') => { const u = cleanUrl(decode(url)); if (u) out.push({ url: u, date: toDate(date), title: clampStr(decode(title), 200) }); };
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) add(tag(m[0], 'link') || tag(m[0], 'guid'), tag(m[0], 'pubDate') || tag(m[0], 'dc:date'), tag(m[0], 'title'));
  for (const m of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const href = (m[0].match(/<link\b[^>]*href="([^"]+)"/i) || [])[1];
    add(href || '', tag(m[0], 'updated') || tag(m[0], 'published'), tag(m[0], 'title'));
  }
  for (const m of xml.matchAll(/<url>[\s\S]*?<\/url>/gi)) add(tag(m[0], 'loc'), tag(m[0], 'lastmod'));
  const seen = new Set();
  return out.filter(x => !seen.has(x.url) && seen.add(x.url));
}
function toDate(s) { const t = Date.parse(s); return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10); }

/** The newest poll-looking, allowlisted pages from a feed. */
export function pickPages(links, sources, today = new Date().toISOString().slice(0, 10), per = PER_FEED) {
  const cutoff = new Date(Date.parse(today) - RECENT_DAYS * 86400000).toISOString().slice(0, 10);
  return links.filter(l => sourceForUrl(sources, l.url) && looksLikePoll(l.url) && (!l.date || l.date >= cutoff))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, per);
}

/**
 * Approved on its own only when nothing is left to doubt: the page was fetched by the server (not pasted), every
 * number, the poll date and the sample size were found on it, it isn't time-sensitive, and it meets every approval
 * rule (lengths, under 10 years old).
 */
export function canAutoApprove(chk, f, sources) {
  return chk.ok && chk.dateChecked && chk.sampleChecked && !f.time_sensitive && f.entry === 'auto-checked' && approvalProblems(f, sources).length === 0;
}

/* ───────────── Feeds → queue ───────────── */

async function readFeed(env, feed, sources) {
  const res = await fetch(feed.url, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; WKGameSuite/1.0; +https://wk-game-suite.pages.dev)', accept: 'application/rss+xml, application/xml, text/xml, */*' } });
  if (!res.ok) throw new Error(`answered ${res.status}`);
  // Big sitemaps: only the start is read (it keeps the CPU time small).
  const reader = res.body.getReader(), dec = new TextDecoder();
  let xml = '', bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length; xml += dec.decode(value, { stream: true });
    if (bytes > FEED_MAX_BYTES) { reader.cancel().catch(() => {}); break; }
  }
  return pickPages(feedLinks(xml), sources);
}

/** Reads every feed that's due and queues the pages it hasn't seen. Returns how many were queued. */
export async function refreshFeeds(env, { force = false } = {}) {
  const db = env.DB, sources = await activeSources(env);
  const since = new Date(Date.now() - FEED_HOURS * 3600000).toISOString();
  const feeds = (await db.prepare(`SELECT f.* FROM polly_feeds f JOIN polly_sources s ON s.id = f.source_id
      WHERE f.active = 1 AND s.active = 1 AND (? OR f.last_checked IS NULL OR f.last_checked < ?)`).bind(force ? 1 : 0, since).all()).results;
  let queued = 0;
  for (const feed of feeds) {
    try {
      const pages = await readFeed(env, feed, sources);
      for (const p of pages) {
        const r = await db.prepare(`INSERT OR IGNORE INTO polly_pages (url, source_id, title, published, status, found_at) VALUES (?, ?, ?, ?, 'queued', ?)`)
          .bind(p.url, sourceForUrl(sources, p.url).id, p.title, p.date, nowISO()).run();
        queued += r.meta.changes || 0;
      }
      await db.prepare(`UPDATE polly_feeds SET last_checked = ?, last_error = '' WHERE id = ?`).bind(nowISO(), feed.id).run();
    } catch (e) {
      await db.prepare(`UPDATE polly_feeds SET last_checked = ?, last_error = ? WHERE id = ?`).bind(nowISO(), clampStr(e.message, 200), feed.id).run();
    }
  }
  return queued;
}

/* ───────────── Queue → questions ───────────── */

/** Reads one page and stores what passes the check: approved when nothing is left to doubt, otherwise a draft. */
async function processPage(env, page, sources, autoApprove) {
  const db = env.DB;
  await db.prepare(`UPDATE polly_pages SET attempts = attempts + 1, checked_at = ? WHERE url = ?`).bind(nowISO(), page.url).run();
  const src = sourceForUrl(sources.filter(s => s.active), page.url);
  if (!src) { await finish(env, page.url, 'skipped', 0, 0, 0, 'Not on the allowlist any more.'); return { added: 0, drafted: 0 }; }
  let text;
  try { text = await fetchPage(env, page.url, sources.filter(s => s.active)); }
  catch (e) { await finish(env, page.url, 'failed', 0, 0, 0, e.message); return { added: 0, drafted: 0 }; }
  const raw = await extractCandidates(env, { source: src.name, url: page.url, text });
  const known = (await db.prepare(`SELECT lower(original_wording) AS w FROM polly_questions WHERE url = ?`).bind(page.url).all()).results.map(r => r.w);
  let added = 0, drafted = 0, failed = 0;
  for (const c of raw) {
    const chk = checkCandidate(c, text);
    if (!chk.ok) { failed++; continue; }
    if (known.includes(chk.q.original_wording.toLowerCase())) continue;
    const f = fieldsFrom({ ...chk.q, source_id: src.id, url: page.url, entry: 'auto-checked' }, sources, 'auto-checked');
    const ok = autoApprove && canAutoApprove(chk, f, sources);
    const row = await insertQ(env, f, ok ? 'approved' : 'draft').run();
    if (ok) await db.prepare(`UPDATE polly_questions SET approved_at = ? WHERE id = ?`).bind(nowISO(), row.meta.last_row_id).run();
    known.push(chk.q.original_wording.toLowerCase());
    if (ok) added++; else drafted++;
  }
  await finish(env, page.url, 'done', added, drafted, failed, raw.length ? '' : 'No two-sided US results on this page.');
  return { added, drafted };
}

function finish(env, url, status, added, drafted, failed, note) {
  return env.DB.prepare(`UPDATE polly_pages SET status = ?, added = ?, drafted = ?, failed = ?, note = ?, checked_at = ? WHERE url = ?`)
    .bind(status, added, drafted, failed, clampStr(note, 300), nowISO(), url).run();
}

/** One batch: read due feeds, then up to `maxPages` queued pages (newest first). */
/**
 * One batch: read due feeds, then queued pages (newest first) until `target` new questions are in the bank, `maxPages`
 * pages are read, or time runs out. When the queue runs low the feeds are read again straight away.
 */
export async function discover(env, { maxPages = 3, forceFeeds = false, target = Infinity, budgetMs = 50000 } = {}) {
  const started = Date.now();
  await setMeta(env, 'last_run', nowISO());
  let queued = await refreshFeeds(env, { force: forceFeeds });
  const sources = await allSources(env);
  const autoApprove = (await meta(env, 'auto_approve', '0')) === '1';
  const next = () => env.DB.prepare(`SELECT * FROM polly_pages WHERE status = 'queued' AND attempts < ? ORDER BY published IS NULL, published DESC, found_at DESC LIMIT 1`)
    .bind(MAX_ATTEMPTS).first();
  let added = 0, drafted = 0, read = 0, refreshed = forceFeeds;
  while (read < maxPages && added + drafted < target && Date.now() - started < budgetMs) {
    let p = await next();
    if (!p && !refreshed) { refreshed = true; queued += await refreshFeeds(env, { force: true }); p = await next(); }
    if (!p) break;
    try {
      const r = await processPage(env, p, sources, autoApprove);
      added += r.added; drafted += r.drafted; read++;
    } catch (e) {
      // The AI was busy: leave it queued for the next run (up to 3 tries).
      read++;
      await env.DB.prepare(`UPDATE polly_pages SET note = ? WHERE url = ?`).bind(clampStr(e.message, 300), p.url).run();
      if (/429|swamped|busy/i.test(e.message)) break;
    }
  }
  await env.DB.prepare(`UPDATE polly_pages SET status = 'failed' WHERE status = 'queued' AND attempts >= ?`).bind(MAX_ATTEMPTS).run();
  if (added) await autoFill(env);
  const left = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM polly_pages WHERE status = 'queued'`).first()).n;
  return { queued, read, added, drafted, left };
}

/** Called after a player's page loads: when the bank is low, quietly find more (at most every 3 hours). */
export async function maybeDiscover(env) {
  try {
    const last = await meta(env, 'last_auto', '');
    if (last && Date.now() - Date.parse(last) < BACKGROUND_HOURS * 3600000) return;
    if (!(await bankInfo(env)).low) return;
    // Plenty already waiting for review: don't pile up more drafts.
    const drafts = await env.DB.prepare(`SELECT COUNT(*) AS n FROM polly_questions WHERE status = 'draft'`).first();
    if (drafts.n >= DRAFT_CAP) return;
    await setMeta(env, 'last_auto', nowISO());
    await discover(env, { maxPages: 2 });
  } catch (e) { console.error('polly discover', e && e.message); }
}

/* ───────────── Admin endpoints ───────────── */

export async function status(env) {
  const db = env.DB;
  const [feeds, pages, counts, draftsRow, auto, lastRun, lastAuto, srcs] = await Promise.all([
    db.prepare(`SELECT f.*, s.name AS source FROM polly_feeds f LEFT JOIN polly_sources s ON s.id = f.source_id ORDER BY s.name, f.id`).all(),
    db.prepare(`SELECT * FROM polly_pages ORDER BY COALESCE(checked_at, found_at) DESC LIMIT 40`).all(),
    db.prepare(`SELECT status, COUNT(*) AS n FROM polly_pages GROUP BY status`).all(),
    db.prepare(`SELECT COUNT(*) AS n FROM polly_questions WHERE status = 'draft'`).first(),
    meta(env, 'auto_approve', '0'), meta(env, 'last_run', ''), meta(env, 'last_auto', ''),
    activeSources(env)
  ]);
  return {
    autoApprove: auto === '1', lastRun, lastAuto, drafts: draftsRow.n,
    counts: Object.fromEntries(counts.results.map(r => [r.status, r.n])),
    feeds: feeds.results.map(f => ({ ...f, active: !!f.active })), pages: pages.results,
    sources: srcs.map(s => ({ id: s.id, name: s.name })), bank: await bankInfo(env)
  };
}

/** "Find polls now": keeps reading pages until about 10 new questions are in the bank (at most 12 pages, under a minute). */
export async function run(env, body) {
  const r = await discover(env, { maxPages: 12, target: Math.max(1, Math.min(20, Number(body.target) || 10)), forceFeeds: !!body.forceFeeds });
  return { ...r, ...(await status(env)) };
}

/** Paste many URLs at once: each allowlisted one is queued (or re-queued if it failed before). */
export async function queue(env, body) {
  const sources = await activeSources(env);
  const urls = String(body.urls || '').split(/[\s,]+/).map(cleanUrl).filter(Boolean);
  if (!urls.length) throw new HttpError(400, 'Paste at least one URL.');
  let queued = 0; const refused = [];
  for (const u of urls.slice(0, 100)) {
    const s = sourceForUrl(sources, u);
    if (!s) { refused.push(u); continue; }
    const r = await env.DB.prepare(`INSERT INTO polly_pages (url, source_id, status, found_at) VALUES (?, ?, 'queued', ?)
        ON CONFLICT(url) DO UPDATE SET status = 'queued', attempts = 0 WHERE polly_pages.status IN ('failed', 'skipped')`).bind(u, s.id, nowISO()).run();
    queued += r.meta.changes || 0;
  }
  return { queued, refused, ...(await status(env)) };
}

export async function settings(env, body) {
  if (body.autoApprove !== undefined) await setMeta(env, 'auto_approve', body.autoApprove ? '1' : '0');
  return status(env);
}

/** Add, edit, turn off or remove a feed. Its URL has to be on its source's site. */
export async function saveFeed(env, body) {
  const db = env.DB, id = Number(body.id) || null;
  if (body.remove && id) { await db.prepare(`DELETE FROM polly_feeds WHERE id = ?`).bind(id).run(); return status(env); }
  if (id && body.url === undefined) {
    await db.prepare(`UPDATE polly_feeds SET active = ? WHERE id = ?`).bind(body.active ? 1 : 0, id).run();
    return status(env);
  }
  const sources = await allSources(env);
  const src = sources.find(s => s.id === Number(body.sourceId));
  const url = cleanUrl(String(body.url || '').trim());
  if (!src) throw new HttpError(400, 'Pick the source.');
  if (!url || !sourceForUrl([{ ...src, active: 1 }], url)) throw new HttpError(400, `That feed isn't on ${src.name}'s site.`);
  const kind = body.kind === 'sitemap' || /sitemap/i.test(url) ? 'sitemap' : 'rss';
  if (id) await db.prepare(`UPDATE polly_feeds SET source_id = ?, url = ?, kind = ?, active = ? WHERE id = ?`).bind(src.id, url, kind, body.active === false ? 0 : 1, id).run();
  else await db.prepare(`INSERT OR IGNORE INTO polly_feeds (source_id, url, kind, active, created_at) VALUES (?, ?, ?, 1, ?)`).bind(src.id, url, kind, nowISO()).run();
  return status(env);
}

