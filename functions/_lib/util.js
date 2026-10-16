export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

export const nowISO = () => new Date().toISOString();
export const todayUTC = () => new Date().toISOString().slice(0, 10);

export function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dayIndex = date => Math.floor(new Date(date + 'T00:00:00Z').getTime() / 86400000);
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

export function puzzleNumber(env, date) {
  const launch = isDate(env.LAUNCH_DATE) ? env.LAUNCH_DATE : date;
  return Math.max(1, dayIndex(date) - dayIndex(launch) + 1);
}

export function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9'\- ]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(a|an|the|one|some) /, '').slice(0, 80);
}

export function sameItem(a, b) {
  const x = normalize(a).replace(/e?s$/, ''), y = normalize(b).replace(/e?s$/, '');
  return !!x && x === y;
}

export function randomId(prefix, bytes = 18) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return prefix + Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, bytes * 2);
}

export function parseCookies(request) {
  const out = {};
  (request.headers.get('cookie') || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

export function cookie(name, value, { maxAge, secure = true, httpOnly = true } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  return c;
}

export async function hash(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

export function safeJson(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

export const clampStr = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
