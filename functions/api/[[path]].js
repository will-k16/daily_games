import { HttpError, json, safeJson } from '../_lib/util.js';
import { identify, googleStart, googleCallback, devLogin, logout, register, passwordLogin, setPassword } from '../_lib/auth.js';
import * as bucks from '../_lib/bucks.js';
import * as game from '../_lib/game.js';
import * as venn from '../_lib/venn.js';
import * as polly from '../_lib/polly.js';
import * as suite from '../_lib/suite.js';
import * as admin from '../_lib/admin.js';
import * as vennAdmin from '../_lib/venn-admin.js';
import * as pollyAdmin from '../_lib/polly-admin.js';
import * as pollyAuto from '../_lib/polly-auto.js';
import * as importer from '../_lib/importer.js';
import * as lifeline from '../_lib/lifeline.js';
import * as lifelineAdmin from '../_lib/lifeline-admin.js';

const ROUTES = {
  // Suite
  'GET suite/today': (c) => suite.today(c.env, c.who),
  'GET suite/share': (c) => suite.share(c.env, c.who, c.url.host),
  'GET suite/history': (c) => suite.history(c.env, c.who),

  // Summit
  'GET today': (c) => game.today(c.env, c.who, c.waitUntil),
  'GET room': (c) => game.room(c.env, c.who, c.q.get('id'), c.q.get('mode') || 'daily'),
  'POST guess': (c) => game.guess(c.env, c.who, c.body, c.waitUntil),
  'POST decide': (c) => game.decide(c.env, c.who, c.body),
  'POST giveup': (c) => game.giveUp(c.env, c.who, c.body),
  'GET best': (c) => game.bestAnswer(c.env, c.who, c.q.get('id'), c.q.get('mode') || 'daily', c.waitUntil),
  'POST auth/password': (c) => setPassword(c.env, c.who, c.body),
  'GET skipper': (c) => bucks.get(c.env, c.who, 'skipper'),
  'POST skipper/buy': (c) => bucks.buy(c.env, c.who, c.body, 'skipper'),
  'POST skipper/wear': (c) => bucks.wear(c.env, c.who, c.body, 'skipper'),
  'POST complaint': (c) => game.complain(c.env, c.who, c.body),
  'POST notifications/seen': (c) => game.markSeen(c.env, c.who, c.body),
  'GET stats': (c) => game.stats(c.env, c.who),
  'GET archive': (c) => game.archiveList(c.env, c.who),
  'GET archive/day': (c) => game.archiveDay(c.env, c.who, c.q.get('date')),
  'POST unlimited/new': (c) => game.newUnlimited(c.env, c.who),

  // Venn
  'GET venn/today': (c) => venn.today(c.env, c.who),
  'POST venn/start': (c) => venn.start(c.env, c.who, c.body),
  'POST venn/answer': (c) => venn.answer(c.env, c.who, c.body),
  'POST venn/confirm': (c) => venn.confirm(c.env, c.who, c.body),
  'POST venn/pause': (c) => venn.pause(c.env, c.who, c.body),
  'POST venn/resume': (c) => venn.resume(c.env, c.who, c.body),
  'POST venn/done': (c) => venn.done(c.env, c.who, c.body),
  'GET venn/results': (c) => venn.resultsFor(c.env, c.who, c.q.get('id'), c.q.get('mode')),
  'POST venn/complaint': (c) => venn.complain(c.env, c.who, c.body),
  'GET venn/stats': (c) => venn.stats(c.env, c.who),
  'GET venn/archive': (c) => venn.archiveList(c.env, c.who),
  'GET venn/archive/day': (c) => venn.archiveDay(c.env, c.who, c.q.get('date')),
  'POST venn/unlimited/new': (c) => venn.newUnlimited(c.env, c.who),
  'GET mel': (c) => bucks.get(c.env, c.who, 'mel'),
  'POST mel/buy': (c) => bucks.buy(c.env, c.who, c.body, 'mel'),
  'POST mel/wear': (c) => bucks.wear(c.env, c.who, c.body, 'mel'),

  // Lifeline
  // After the page is served, a few days of drafts are kept ready ahead.
  'GET lifeline/today': (c) => { c.waitUntil(lifelineAdmin.maybeGenerate(c.env)); return lifeline.today(c.env, c.who); },
  'POST lifeline/guess': (c) => lifeline.guess(c.env, c.who, c.body),
  'POST lifeline/report': (c) => lifeline.report(c.env, c.who, c.body),
  'POST lifeline/notifications/seen': (c) => lifeline.markSeen(c.env, c.who, c.body),
  'GET lifeline/stats': (c) => lifeline.stats(c.env, c.who),
  'GET lifeline/archive': (c) => lifeline.archiveList(c.env, c.who),
  'GET lifeline/archive/day': (c) => lifeline.archiveDay(c.env, c.who, c.q.get('date')),
  'GET race': (c) => bucks.get(c.env, c.who, 'race'),
  'POST race/buy': (c) => bucks.buy(c.env, c.who, c.body, 'race'),
  'POST race/wear': (c) => bucks.wear(c.env, c.who, c.body, 'race'),

  // Polly
  // After the page is served, Polly quietly finds more questions when the bank is low.
  'GET polly/today': (c) => { c.waitUntil(pollyAuto.maybeDiscover(c.env)); return polly.today(c.env, c.who); },
  'POST polly/lock': (c) => polly.lock(c.env, c.who, c.body),
  'GET polly/summary': (c) => polly.summary(c.env, c.who, c.q),
  'POST polly/report': (c) => polly.report(c.env, c.who, c.body),
  'GET polly/stats': (c) => polly.stats(c.env, c.who),
  'GET polly/archive': (c) => polly.archiveList(c.env, c.who),
  'GET polly/archive/day': (c) => polly.archiveDay(c.env, c.who, c.q.get('date')),
  'POST polly/archive/lock': (c) => polly.archiveLock(c.env, c.who, c.body),
  'POST polly/unlimited/next': (c) => polly.unlimitedNext(c.env, c.who),
  'POST polly/unlimited/lock': (c) => polly.unlimitedLock(c.env, c.who, c.body),
  'GET polly': (c) => bucks.get(c.env, c.who, 'polly'),
  'POST polly/buy': (c) => bucks.buy(c.env, c.who, c.body, 'polly'),
  'POST polly/wear': (c) => bucks.wear(c.env, c.who, c.body, 'polly'),

  // Admin: suite + Summit
  'GET admin/suite': (c) => admin.suite(c.env, c.who),
  'POST admin/bucks': (c) => admin.grantBucks(c.env, c.who, c.body),
  'GET admin/dashboard': (c) => admin.dashboard(c.env, c.who),
  'GET admin/calendar': (c) => admin.calendar(c.env, c.q),
  'POST admin/generate': (c) => admin.generateDrafts(c.env, c.body),
  'POST admin/generate-slot': (c) => admin.generateSlot(c.env, c.body),
  'POST admin/puzzle': (c) => admin.savePuzzle(c.env, c.body),
  'POST admin/puzzle/status': (c) => admin.setPuzzleStatus(c.env, c.body),
  'POST admin/puzzle/delete': (c) => admin.deletePuzzle(c.env, c.body),
  'GET admin/complaints': (c) => admin.complaints(c.env, c.q),
  'POST admin/complaints/resolve': (c) => admin.resolveComplaint(c.env, c.body),
  'GET admin/answers': (c) => admin.answers(c.env, c.q),
  'POST admin/answers': (c) => admin.saveAnswer(c.env, c.body),
  'POST admin/answers/delete': (c) => admin.deleteAnswer(c.env, c.body),

  // Admin: Venn
  'GET admin/venn/dashboard': (c) => vennAdmin.dashboard(c.env),
  'GET admin/venn/calendar': (c) => vennAdmin.calendar(c.env, c.q),
  'POST admin/venn/generate': (c) => vennAdmin.generate(c.env, c.body),
  'POST admin/venn/puzzle': (c) => vennAdmin.savePuzzle(c.env, c.body),
  'POST admin/venn/puzzle/delete': (c) => vennAdmin.deletePuzzle(c.env, c.body),
  'GET admin/venn/complaints': (c) => vennAdmin.complaints(c.env, c.q),
  'POST admin/venn/complaints/resolve': (c) => vennAdmin.resolveComplaint(c.env, c.body),
  'GET admin/venn/judgments': (c) => vennAdmin.judgments(c.env, c.q),
  'POST admin/venn/judgments': (c) => vennAdmin.saveJudgment(c.env, c.body),
  'POST admin/venn/judgments/delete': (c) => vennAdmin.deleteJudgment(c.env, c.body),

  // Admin: Polly
  'GET admin/polly/dashboard': (c) => pollyAdmin.dashboard(c.env),
  'POST admin/polly/extract': (c) => pollyAdmin.extract(c.env, c.body),
  'POST admin/polly/drafts': (c) => pollyAdmin.saveDrafts(c.env, c.body),
  'POST admin/polly/question': (c) => pollyAdmin.saveQuestion(c.env, c.body),
  'GET admin/polly/bank': (c) => pollyAdmin.bank(c.env, c.q),
  'GET admin/polly/calendar': (c) => pollyAdmin.calendar(c.env),
  'POST admin/polly/schedule': (c) => pollyAdmin.schedule(c.env, c.body),
  'GET admin/polly/reports': (c) => pollyAdmin.reports(c.env, c.q),
  'POST admin/polly/reports/resolve': (c) => pollyAdmin.resolveReport(c.env, c.body),
  'GET admin/polly/sources': (c) => pollyAdmin.sources(c.env),
  'POST admin/polly/sources': (c) => pollyAdmin.saveSource(c.env, c.body),
  'GET admin/polly/auto': (c) => pollyAuto.status(c.env),
  'POST admin/polly/auto/run': (c) => pollyAuto.run(c.env, c.body),
  'POST admin/polly/auto/queue': (c) => pollyAuto.queue(c.env, c.body),
  'POST admin/polly/auto/settings': (c) => pollyAuto.settings(c.env, c.body),
  'POST admin/polly/feeds': (c) => pollyAuto.saveFeed(c.env, c.body),

  // Admin: Lifeline
  'GET admin/lifeline/dashboard': (c) => lifelineAdmin.dashboard(c.env),
  'GET admin/lifeline/calendar': (c) => lifelineAdmin.calendar(c.env, c.q),
  'POST admin/lifeline/generate': (c) => lifelineAdmin.generate(c.env, c.body),
  'POST admin/lifeline/puzzle': (c) => lifelineAdmin.savePuzzle(c.env, c.body),
  'POST admin/lifeline/puzzle/delete': (c) => lifelineAdmin.deletePuzzle(c.env, c.body),
  'GET admin/lifeline/reports': (c) => lifelineAdmin.reports(c.env, c.q),
  'POST admin/lifeline/reports/resolve': (c) => lifelineAdmin.resolveReport(c.env, c.body),
  'GET admin/lifeline/people': (c) => lifelineAdmin.people(c.env, c.q),
  'POST admin/lifeline/people': (c) => lifelineAdmin.savePerson(c.env, c.body),

  // Admin: paste-in puzzles for every game
  'POST admin/import/summit': (c) => importer.importSummit(c.env, c.body),
  'POST admin/import/venn': (c) => importer.importVenn(c.env, c.body),
  'POST admin/import/polly': (c) => importer.importPolly(c.env, c.body),
  'POST admin/import/lifeline': (c) => lifelineAdmin.importLifeline(c.env, c.body),
  'GET admin/import/avoid': (c) => (c.q.get('game') === 'lifeline' ? lifelineAdmin.avoid(c.env) : importer.avoidList(c.env, c.q))
};

// The pause sent with navigator.sendBeacon as the page hides arrives as text/plain (a beacon can't
// set a JSON content type without a preflight). It's still checked for same origin.
const BEACON_OK = new Set(['venn/pause']);

export async function onRequest(context) {
  const { request, env } = context;
  const waitUntil = p => { try { context.waitUntil(p); } catch { /* not available: let it run */ } };
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  let who = null;
  try {
    if (!env.DB) throw new HttpError(500, 'Database binding "DB" is missing. See README.');
    who = await identify(request, env);

    if (path === 'auth/login') return withCookies(googleStart(request, env), who.setCookies);
    if (path === 'auth/callback') return withCookies(await googleCallback(request, env, who), who.setCookies);
    if (path === 'auth/dev') return withCookies(await devLogin(request, env, who), who.setCookies);
    if (path === 'auth/logout' && request.method === 'POST') return await logout(request, env);

    let body = {};
    if (request.method === 'POST') {
      // Basic CSRF guard: JSON bodies only, from this site.
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) throw new HttpError(403, 'Bad origin.');
      const type = request.headers.get('content-type') || '';
      const beacon = BEACON_OK.has(path) && type.startsWith('text/plain');
      if (!type.includes('application/json') && !beacon) throw new HttpError(415, 'Send JSON.');
      body = beacon ? safeJson(await request.text(), {}) : await request.json().catch(() => ({}));
    }
    if (path === 'auth/register' && request.method === 'POST') return withCookies(await register(request, env, who, body), who.setCookies);
    if (path === 'auth/signin' && request.method === 'POST') return withCookies(await passwordLogin(request, env, who, body), who.setCookies);

    const handler = ROUTES[request.method + ' ' + path];
    if (!handler) throw new HttpError(404, 'Not found');
    if (path.startsWith('admin/')) admin.requireAdmin(who);
    const data = await handler({ env, who, q: url.searchParams, body, request, url, waitUntil });
    return withCookies(json(data), who.setCookies);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e && e.stack || e);
    const msg = e instanceof HttpError ? e.message : 'Something went wrong on our end. Try again.';
    return withCookies(json({ error: msg }, status), who ? who.setCookies : []);
  }
}

/** Adds the identity cookies, but never one that would undo a cookie the response itself sets (e.g. a fresh sign-in). */
function withCookies(res, cookies) {
  if (!cookies || !cookies.length) return res;
  const r = new Response(res.body, res);
  const own = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const ownNames = new Set(own.map(c => c.split('=')[0].trim()));
  cookies.filter(c => !ownNames.has(c.split('=')[0].trim())).forEach(c => r.headers.append('set-cookie', c));
  return r;
}
