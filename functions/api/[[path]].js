import { HttpError, json } from '../_lib/util.js';
import { identify, googleStart, googleCallback, devLogin, logout, register, passwordLogin, setPassword } from '../_lib/auth.js';
import * as wardrobe from '../_lib/wardrobe.js';
import * as game from '../_lib/game.js';
import * as admin from '../_lib/admin.js';

const ROUTES = {
  'GET today': (c) => game.today(c.env, c.who, c.waitUntil),
  'GET room': (c) => game.room(c.env, c.who, c.q.get('id'), c.q.get('mode') || 'daily'),
  'POST guess': (c) => game.guess(c.env, c.who, c.body, c.waitUntil),
  'POST decide': (c) => game.decide(c.env, c.who, c.body),
  'POST giveup': (c) => game.giveUp(c.env, c.who, c.body),
  'GET best': (c) => game.bestAnswer(c.env, c.who, c.q.get('id'), c.q.get('mode') || 'daily', c.waitUntil),
  'POST auth/password': (c) => setPassword(c.env, c.who, c.body),
  'GET skipper': (c) => wardrobe.get(c.env, c.who),
  'POST skipper/buy': (c) => wardrobe.buy(c.env, c.who, c.body),
  'POST skipper/wear': (c) => wardrobe.wear(c.env, c.who, c.body),
  'POST complaint': (c) => game.complain(c.env, c.who, c.body),
  'POST notifications/seen': (c) => game.markSeen(c.env, c.who, c.body),
  'GET stats': (c) => game.stats(c.env, c.who),
  'GET archive': (c) => game.archiveList(c.env, c.who),
  'GET archive/day': (c) => game.archiveDay(c.env, c.who, c.q.get('date')),
  'POST unlimited/new': (c) => game.newUnlimited(c.env, c.who),

  'GET admin/dashboard': (c) => admin.dashboard(c.env, c.who),
  'POST admin/clovers': (c) => admin.grantClovers(c.env, c.who, c.body),
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
  'POST admin/answers/delete': (c) => admin.deleteAnswer(c.env, c.body)
};

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

    if (request.method === 'POST') {
      // Basic CSRF guard: JSON bodies only, from this site.
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) throw new HttpError(403, 'Bad origin.');
      if (!(request.headers.get('content-type') || '').includes('application/json')) throw new HttpError(415, 'Send JSON.');
    }
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    if (path === 'auth/register' && request.method === 'POST') return withCookies(await register(request, env, who, body), who.setCookies);
    if (path === 'auth/signin' && request.method === 'POST') return withCookies(await passwordLogin(request, env, who, body), who.setCookies);

    const handler = ROUTES[request.method + ' ' + path];
    if (!handler) throw new HttpError(404, 'Not found');
    if (path.startsWith('admin/')) admin.requireAdmin(who);
    const data = await handler({ env, who, q: url.searchParams, body, request, waitUntil });
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
