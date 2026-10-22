// Lifeline's people: turning a typed name into a real person with birth and death dates. The built-in
// list (lifeline-people.js) answers famous names with no network at all; anything else is searched on
// English Wikipedia, and the matching Wikidata items give the dates. Every person found is kept in
// lifeline_people and every search in lifeline_searches, so a name is only ever looked up once.
import { HttpError, nowISO, normalize, safeJson } from './util.js';
import { PEOPLE } from './lifeline-people.js';

const UA = { 'user-agent': 'WK-Game-Suite/1.0 (https://wk-game-suite.pages.dev; daily history game)', accept: 'application/json' };
const HUMAN = 'Q5';
const MAX_PICKS = 4;
const FAMOUS_GAP = 4;          // the top match wins outright when it's in 4x as many Wikipedias as the next

/** Lower case, no accents, no punctuation: "Frédéric Chopin" → "frederic chopin". */
export const nameKey = s => normalize(String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, ' '))
  .replace(/\b(saint|st)\b/g, 'st').replace(/\s+/g, ' ').trim();

/** Wikidata descriptions often end with the years "(1809–1865)", which would give the game away. */
export const cleanDesc = s => String(s || '').replace(/\s*\([^)]*\d{3,4}[^)]*\)\s*$/, '').replace(/\s*,?\s*\b\d{3,4}\s*[–-]\s*\d{3,4}\b.*$/, '').trim().slice(0, 90);

const fromBuiltin = p => ({ qid: p.q, name: p.n, descr: p.s, birth: p.b, birthPrec: p.bp, death: p.d, deathPrec: p.dp, links: p.l, source: 'builtin' });
const fromRow = r => ({ qid: r.qid, name: r.name, descr: r.descr, birth: r.birth, birthPrec: r.birth_prec, death: r.death, deathPrec: r.death_prec, links: r.links, source: r.source });

let INDEX = null;
function builtinIndex() {
  if (INDEX) return INDEX;
  INDEX = { byKey: new Map(), byQid: new Map() };
  for (const p of PEOPLE) {
    INDEX.byQid.set(p.q, p);
    for (const k of new Set([p.n, ...(p.a || [])].map(nameKey))) {
      if (!k) continue;
      if (!INDEX.byKey.has(k)) INDEX.byKey.set(k, []);
      INDEX.byKey.get(k).push(p);
    }
  }
  return INDEX;
}

/* ───────────── Wikidata ───────────── */

async function getJson(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** The best-ranked value of a time claim: { date, prec } or null. */
function timeClaim(claims, prop) {
  const list = (claims[prop] || []).filter(c => c.mainsnak && c.mainsnak.snaktype === 'value' && c.rank !== 'deprecated');
  const c = list.find(x => x.rank === 'preferred') || list[0];
  if (!c) return null;
  const v = c.mainsnak.datavalue.value;
  return { date: v.time.replace(/^\+/, '').replace(/T.*$/, ''), prec: v.precision };
}

/** Wikidata items → people (humans only; anyone without a birth date is still returned, so the game can say why). */
async function entities(ids) {
  if (!ids.length) return [];
  const url = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({
    action: 'wbgetentities', ids: ids.join('|'), props: 'claims|labels|descriptions|sitelinks', languages: 'en', languagefallback: '1', format: 'json'
  });
  const d = await getJson(url);
  return ids.map(id => d.entities && d.entities[id]).filter(e => e && !e.missing).map(e => {
    const human = (e.claims.P31 || []).some(c => c.mainsnak.datavalue && c.mainsnak.datavalue.value.id === HUMAN);
    const b = timeClaim(e.claims, 'P569'), dd = timeClaim(e.claims, 'P570');
    return {
      qid: e.id, human, name: (e.labels.en || {}).value || (e.sitelinks.enwiki || {}).title || e.id,
      descr: cleanDesc((e.descriptions.en || {}).value), birth: b ? b.date : '', birthPrec: b ? b.prec : 11,
      death: dd ? dd.date : '', deathPrec: dd ? dd.prec : 11, links: Object.keys(e.sitelinks || {}).length, source: 'wikidata'
    };
  });
}

/** English Wikipedia's search, in its order, as Wikidata ids. */
async function searchIds(text) {
  const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: text, gsrlimit: '8', gsrnamespace: '0', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', format: 'json'
  });
  const d = await getJson(url);
  const pages = Object.values((d.query && d.query.pages) || {}).sort((a, b) => a.index - b.index);
  return [...new Set(pages.map(p => p.pageprops && p.pageprops.wikibase_item).filter(Boolean))];
}

async function remember(env, people) {
  const stmts = people.filter(p => p.human && p.source === 'wikidata').map(p => env.DB.prepare(`INSERT INTO lifeline_people (qid, name, descr, birth, birth_prec, death, death_prec, links, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'wikidata', ?) ON CONFLICT(qid) DO UPDATE SET name = excluded.name, descr = excluded.descr, links = excluded.links,
      birth = CASE WHEN lifeline_people.source = 'admin' THEN lifeline_people.birth ELSE excluded.birth END,
      birth_prec = CASE WHEN lifeline_people.source = 'admin' THEN lifeline_people.birth_prec ELSE excluded.birth_prec END,
      death = CASE WHEN lifeline_people.source = 'admin' THEN lifeline_people.death ELSE excluded.death END,
      death_prec = CASE WHEN lifeline_people.source = 'admin' THEN lifeline_people.death_prec ELSE excluded.death_prec END,
      updated_at = excluded.updated_at`).bind(p.qid, p.name, p.descr, p.birth, p.birthPrec, p.death, p.deathPrec, p.links, nowISO()));
  if (stmts.length) await env.DB.batch(stmts);
}

/* ───────────── Looking people up ───────────── */

/** One person by Wikidata id: an admin fix first, then the built-in list, then what was kept, then Wikidata. */
export async function personById(env, qid) {
  if (!/^Q\d{1,12}$/.test(String(qid || ''))) return null;
  const row = await env.DB.prepare(`SELECT * FROM lifeline_people WHERE qid = ?`).bind(qid).first();
  if (row && row.source === 'admin') return fromRow(row);
  const b = builtinIndex().byQid.get(qid);
  if (b) return fromBuiltin(b);
  if (row) return fromRow(row);
  let got;
  try { got = await entities([qid]); } catch { throw new HttpError(503, 'Wikipedia didn\'t answer just now. Try again in a moment.'); }
  const p = got.find(x => x.human);
  if (p) await remember(env, [p]);
  return p || null;
}

/**
 * A typed name → { person } when it's clear who they meant, { choices: [person…] } when several people
 * fit, or { none: true }. Everyone returned is a real human on Wikidata.
 */
export async function findPerson(env, input) {
  const key = nameKey(input);
  if (!key) return { none: true };
  const ix = builtinIndex();
  const admin = async list => Promise.all(list.map(p => personById(env, p.q)));
  // 1. The built-in list: an exact name or alias.
  const exact = (ix.byKey.get(key) || []).slice().sort((a, b) => b.l - a.l);
  if (exact.length === 1 || (exact.length > 1 && exact[0].l >= FAMOUS_GAP * exact[1].l)) return { person: (await admin([exact[0]]))[0] };
  if (exact.length > 1) return { choices: await admin(exact.slice(0, MAX_PICKS)) };

  // 2. A search we've already done.
  const seen = await env.DB.prepare(`SELECT * FROM lifeline_searches WHERE norm = ?`).bind(key).first();
  if (seen) {
    const ids = safeJson(seen.qids, []);
    if (!ids.length) return { none: true };
    if (seen.pick) return { person: await personById(env, seen.pick) };
    return { choices: (await Promise.all(ids.map(q => personById(env, q)))).filter(Boolean) };
  }

  // 3. Wikipedia's search, then Wikidata for who each result is.
  let people;
  try {
    const ids = await searchIds(String(input).slice(0, 80));
    people = (await entities(ids.slice(0, 8))).filter(p => p.human);
  } catch { throw new HttpError(503, 'Wikipedia didn\'t answer just now. Try again in a moment.'); }
  await remember(env, people);
  // Prefer people whose name matches what was typed; a famous match wins outright, otherwise ask.
  // Closest first: the exact name, then names containing what was typed, then the same surname, then anyone found.
  const k = p => nameKey(p.name), last = s => s.split(' ').pop();
  const tiers = [people.filter(p => k(p) === key), people.filter(p => k(p).includes(key) || key.includes(k(p))), people.filter(p => last(k(p)) === last(key)), people];
  const named = tiers.find(t => t.length) || [];
  const pool = named.slice(0, MAX_PICKS * 2);
  const ranked = pool.slice().sort((a, b) => b.links - a.links);
  let pick = '';
  if (ranked.length === 1) pick = ranked[0].qid;
  else if (ranked.length > 1) {
    const top = ranked[0], next = ranked[1];
    // The first search result that is also by far the most famous is surely the one.
    if (top.links >= FAMOUS_GAP * Math.max(1, next.links) || (pool[0].qid === top.qid && nameKey(top.name) === key && top.links >= 2 * next.links)) pick = top.qid;
  }
  const keep = pick ? [pick] : ranked.slice(0, MAX_PICKS).map(p => p.qid);
  await env.DB.prepare(`INSERT OR REPLACE INTO lifeline_searches (norm, qids, pick, updated_at) VALUES (?, ?, ?, ?)`)
    .bind(key, JSON.stringify(keep), pick, nowISO()).run();
  if (!keep.length) return { none: true };
  if (pick) return { person: ranked.find(p => p.qid === pick) };
  return { choices: ranked.slice(0, MAX_PICKS) };
}

/** People in the built-in list whose name contains `q` (for the admin's people tab). */
export function builtinMatches(q, n = 20) {
  const k = nameKey(q);
  return PEOPLE.filter(p => nameKey(p.n).includes(k)).slice(0, n).map(fromBuiltin);
}
export const builtinPerson = qid => { const p = builtinIndex().byQid.get(qid); return p ? fromBuiltin(p) : null; };
export const builtinByName = name => { const l = builtinIndex().byKey.get(nameKey(name)); return l && l.length ? fromBuiltin(l.slice().sort((a, b) => b.l - a.l)[0]) : null; };
