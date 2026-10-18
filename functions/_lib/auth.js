import { HttpError, nowISO, todayUTC, parseCookies, cookie, randomId, safeJson } from './util.js';

const PID = 'jr_pid', SESS = 'jr_sess', OAUTH = 'jr_oauth';
const YEAR = 60 * 60 * 24 * 400;
const SESSION_DAYS = 60;

const isLocal = url => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
const secureFor = url => url.protocol === 'https:';

export function adminEmails(env) {
  return String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Works out who is calling. Every visitor gets a player row (anonymous until they sign in).
 * Returns { player, email, signedIn, isAdmin, setCookies: [] }.
 */
export async function identify(request, env) {
  const url = new URL(request.url);
  const c = parseCookies(request);
  const setCookies = [];
  const db = env.DB;
  let player = null;

  if (c[SESS]) {
    const row = await db.prepare(
      `SELECT p.* FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token = ? AND s.expires_at > ?`
    ).bind(c[SESS], nowISO()).first();
    if (row) player = row;
    else setCookies.push(cookie(SESS, '', { maxAge: 0, secure: secureFor(url) }));
  }

  if (!player && /^p_[a-z0-9]{16,48}$/.test(c[PID] || '')) {
    const row = await db.prepare(`SELECT * FROM players WHERE id = ?`).bind(c[PID]).first();
    // A device cookie that belongs to a signed-in account only works with a live session.
    if (row && !row.google_sub) player = row;
    else if (!row) {
      await db.prepare(`INSERT OR IGNORE INTO players (id, created_at, last_seen) VALUES (?, ?, ?)`).bind(c[PID], nowISO(), nowISO()).run();
      player = { id: c[PID], google_sub: null, email: null, last_seen: nowISO() };
    }
  }

  if (!player) {
    const id = randomId('p_', 16);
    await db.prepare(`INSERT INTO players (id, created_at, last_seen) VALUES (?, ?, ?)`).bind(id, nowISO(), nowISO()).run();
    player = { id, google_sub: null, email: null, last_seen: nowISO() };
    setCookies.push(cookie(PID, id, { maxAge: YEAR, secure: secureFor(url) }));
  } else if (String(player.last_seen || '').slice(0, 10) !== todayUTC()) {
    await db.prepare(`UPDATE players SET last_seen = ? WHERE id = ?`).bind(nowISO(), player.id).run();
  }

  const email = player.email ? String(player.email).toLowerCase() : '';
  // Admin needs an email someone proved they own (Google, or the localhost dev login). Anyone can
  // type any address into the sign-up form, so password-only accounts never count.
  const verified = /^(google|dev):/.test(player.google_sub || '');
  return {
    player,
    email,
    signedIn: !!player.google_sub,
    verified,
    hasPassword: !!player.password_hash,
    isAdmin: verified && !!email && adminEmails(env).includes(email),
    setCookies
  };
}

/* ───────────── Google sign-in ───────────── */

function redirect(location, cookies = []) {
  const h = new Headers({ location, 'cache-control': 'no-store' });
  cookies.forEach(c => h.append('set-cookie', c));
  return new Response(null, { status: 302, headers: h });
}

const safeReturn = r => (typeof r === 'string' && r.startsWith('/') && !r.startsWith('//')) ? r : '/';
// Sign-in always lands on a fresh page load of one of the game's home pages.
const HOMES = ['/', '/summit.html', '/summit'];
const homeFor = r => HOMES.includes(String(r || '').split(/[?#]/)[0]) ? String(r).split(/[?#]/)[0] : '/';

export function googleStart(request, env) {
  const url = new URL(request.url);
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(500, 'Google sign-in is not set up yet.');
  const state = randomId('s', 16);
  const ret = safeReturn(url.searchParams.get('return'));
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: url.origin + '/api/auth/callback',
    response_type: 'code',
    scope: 'openid email',
    state,
    prompt: 'select_account'
  });
  return redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params,
    [cookie(OAUTH, JSON.stringify({ state, ret }), { maxAge: 600, secure: secureFor(url) })]);
}

export async function googleCallback(request, env, who) {
  const url = new URL(request.url);
  const saved = safeJson(parseCookies(request)[OAUTH] || '', null);
  const clear = cookie(OAUTH, '', { maxAge: 0, secure: secureFor(url) });
  if (!saved || saved.state !== url.searchParams.get('state') || !url.searchParams.get('code')) {
    return redirect('/?signin=failed', [clear]);
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: url.searchParams.get('code'),
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: url.origin + '/api/auth/callback',
      grant_type: 'authorization_code'
    })
  });
  if (!res.ok) return redirect('/?signin=failed', [clear]);
  const tok = await res.json();
  // The token came straight from Google over TLS, so decoding (not re-verifying) the payload is safe.
  const payload = safeJson(atob(String(tok.id_token || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), null);
  const okIss = payload && ['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss);
  if (!payload || !okIss || payload.aud !== env.GOOGLE_CLIENT_ID || !payload.email_verified) {
    return redirect('/?signin=failed', [clear]);
  }
  const cookies = await signIn(env, who, 'google:' + payload.sub, String(payload.email).toLowerCase(), secureFor(url));
  // Always land on a fresh home page so the whole app reloads signed in.
  return redirect(homeFor(saved.ret) + '?signedin=1', [clear, ...cookies]);
}

/** Localhost-only shortcut for testing, enabled by DEV_LOGIN_EMAIL in .dev.vars. */
export async function devLogin(request, env, who) {
  const url = new URL(request.url);
  if (!env.DEV_LOGIN_EMAIL || !isLocal(url)) throw new HttpError(404, 'Not found');
  const email = String(env.DEV_LOGIN_EMAIL).toLowerCase();
  const cookies = await signIn(env, who, 'dev:' + email, email, secureFor(url));
  return redirect(homeFor(url.searchParams.get('return')) + '?signedin=1', cookies);
}

async function signIn(env, who, sub, email, secure) {
  const db = env.DB;
  const anon = who.player;
  let account = await db.prepare(`SELECT * FROM players WHERE google_sub = ?`).bind(sub).first();

  if (!account && sub.startsWith('google:')) {
    // Someone made a password account with this email before ever using Google. Google just proved
    // who owns the address, so that account becomes theirs. Its password is wiped, because whoever
    // typed it never proved anything; the owner can set a new one from the Account menu.
    const claimed = await db.prepare(`SELECT * FROM players WHERE google_sub = ?`).bind('email:' + email).first();
    if (claimed) {
      await db.prepare(`UPDATE players SET google_sub = ?, password_hash = NULL WHERE id = ?`).bind(sub, claimed.id).run();
      await db.prepare(`DELETE FROM sessions WHERE player_id = ?`).bind(claimed.id).run();
      account = { ...claimed, google_sub: sub };
    }
  }

  if (!account && !anon.google_sub) {
    // First sign-in: this device's anonymous player simply becomes the account.
    await db.prepare(`UPDATE players SET google_sub = ?, email = ? WHERE id = ?`).bind(sub, email, anon.id).run();
    account = { ...anon, google_sub: sub, email };
  } else if (!account) {
    const id = randomId('p_', 16);
    await db.prepare(`INSERT INTO players (id, google_sub, email, created_at, last_seen) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, sub, email, nowISO(), nowISO()).run();
    account = { id };
  } else {
    await db.prepare(`UPDATE players SET email = ? WHERE id = ?`).bind(email, account.id).run();
    if (anon.id !== account.id && !anon.google_sub) {
      // Bring over anything this device played that the account hasn't.
      await db.batch([
        db.prepare(`UPDATE plays SET player_id = ? WHERE player_id = ? AND NOT EXISTS
          (SELECT 1 FROM plays q WHERE q.player_id = ? AND q.puzzle_id = plays.puzzle_id AND q.mode = plays.mode)`)
          .bind(account.id, anon.id, account.id),
        db.prepare(`UPDATE complaints SET player_id = ? WHERE player_id = ?`).bind(account.id, anon.id),
        db.prepare(`UPDATE OR IGNORE purchases SET player_id = ? WHERE player_id = ?`).bind(account.id, anon.id),
        db.prepare(`UPDATE players SET skipper = (SELECT skipper FROM players WHERE id = ?) WHERE id = ? AND skipper = '{}'`).bind(anon.id, account.id)
      ]);
    }
  }

  const token = randomId('t', 24);
  const exp = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await db.prepare(`INSERT INTO sessions (token, player_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(token, account.id, nowISO(), exp).run();
  return [cookie(SESS, token, { maxAge: SESSION_DAYS * 86400, secure })];
}

/* ───────────── Email + password ───────────── */

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const ITER = 100000;          // the most PBKDF2 rounds Cloudflare Workers allow
const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
const unhex = h => new Uint8Array((h.match(/../g) || []).map(b => parseInt(b, 16)));

async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${hex(salt)}$${await pbkdf2(password, salt, ITER)}`;
}
async function checkPassword(password, stored) {
  const [kind, iter, salt, want] = String(stored || '').split('$');
  if (kind !== 'pbkdf2' || !want) return false;
  const got = await pbkdf2(password, unhex(salt), Number(iter));
  let diff = got.length ^ want.length;
  for (let i = 0; i < Math.min(got.length, want.length); i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

function readCredentials(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'That email doesn\'t look right.');
  return { email, password };
}
function checkNewPassword(password) {
  if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters for your password.');
  if (password.length > 200) throw new HttpError(400, 'That password is too long.');
}

/** Slows down password guessing: 10 misses per email, or 40 per network, in 15 minutes. Returns a "record a miss" function. */
async function throttle(env, request, email) {
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  const e = 'e:' + email, ip = 'ip:' + (request.headers.get('cf-connecting-ip') || 'local');
  const row = await env.DB.prepare(`SELECT SUM(key = ?) AS e, SUM(key = ?) AS i FROM login_fails WHERE created_at > ? AND key IN (?, ?)`)
    .bind(e, ip, since, e, ip).first();
  if (row && (row.e >= 10 || row.i >= 40)) throw new HttpError(429, 'Too many tries. Wait a few minutes and try again.');
  return () => env.DB.batch([
    env.DB.prepare(`INSERT INTO login_fails (key, created_at) VALUES (?, ?), (?, ?)`).bind(e, nowISO(), ip, nowISO()),
    env.DB.prepare(`DELETE FROM login_fails WHERE created_at < ?`).bind(new Date(Date.now() - 86400000).toISOString())
  ]);
}

function jsonWithCookies(data, cookies) {
  const h = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  cookies.forEach(c => h.append('set-cookie', c));
  return new Response(JSON.stringify(data), { headers: h });
}

/** Makes a new account with an email and password. */
export async function register(request, env, who, body) {
  const { email, password } = readCredentials(body);
  checkNewPassword(password);
  const taken = await env.DB.prepare(`SELECT password_hash FROM players WHERE email = ? AND google_sub IS NOT NULL ORDER BY password_hash IS NULL LIMIT 1`).bind(email).first();
  if (taken) {
    throw new HttpError(409, taken.password_hash
      ? 'There\'s already an account with that email. Try signing in instead.'
      : 'That email already signs in with Google. Use Google once, then add a password from the Account menu.');
  }
  const sub = 'email:' + email;
  const cookies = await signIn(env, who, sub, email, secureFor(new URL(request.url)));
  await env.DB.prepare(`UPDATE players SET password_hash = ? WHERE google_sub = ?`).bind(await hashPassword(password), sub).run();
  return jsonWithCookies({ ok: true }, cookies);
}

/** Signs in with an email and password. */
export async function passwordLogin(request, env, who, body) {
  const { email, password } = readCredentials(body);
  const miss = await throttle(env, request, email);
  const account = await env.DB.prepare(`SELECT * FROM players WHERE email = ? AND password_hash IS NOT NULL ORDER BY created_at LIMIT 1`).bind(email).first();
  if (!account || !(await checkPassword(password, account.password_hash))) {
    await miss();
    throw new HttpError(401, 'That email and password don\'t match.');
  }
  const cookies = await signIn(env, who, account.google_sub, email, secureFor(new URL(request.url)));
  return jsonWithCookies({ ok: true }, cookies);
}

/** Adds or changes the password on the account you're signed in to. */
export async function setPassword(env, who, body) {
  if (!who.signedIn) throw new HttpError(401, 'Sign in first.');
  const password = String(body.password || '');
  checkNewPassword(password);
  if (who.hasPassword && !(await checkPassword(String(body.current || ''), who.player.password_hash))) {
    throw new HttpError(401, 'Your current password isn\'t right.');
  }
  // One password per email, so email sign-in always knows which account you mean.
  const other = await env.DB.prepare(`SELECT id FROM players WHERE email = ? AND password_hash IS NOT NULL AND id != ?`).bind(who.email, who.player.id).first();
  if (other) throw new HttpError(409, 'Another account already uses this email with a password.');
  await env.DB.prepare(`UPDATE players SET password_hash = ? WHERE id = ?`).bind(await hashPassword(password), who.player.id).run();
  return { ok: true };
}

export async function logout(request, env) {
  const url = new URL(request.url);
  const c = parseCookies(request);
  if (c[SESS]) await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(c[SESS]).run();
  // Start this device fresh as a new anonymous player.
  const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  h.append('set-cookie', cookie(SESS, '', { maxAge: 0, secure: secureFor(url) }));
  h.append('set-cookie', cookie(PID, '', { maxAge: 0, secure: secureFor(url) }));
  return new Response(JSON.stringify({ ok: true }), { headers: h });
}
