// The one way every page talks to the API. A dropped connection or a garbled reply (the network
// blipped, or Cloudflare answered with an error page instead of ours) is retried on its own, sending
// the same request again, so a player never has to retype or reselect an answer. Retried POSTs carry
// `retry: n` so the server can recognise an answer it already recorded and hand back the same result.
const LOST = 'Lost the connection there. Try again?';
const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);
const WAITS = [600, 1500, 3000];   // before retry 1, 2, 3

const wait = ms => new Promise(r => setTimeout(r, ms));

function notice(on) {
  const t = document.getElementById('toast');
  if (!t) return;
  if (on) { t.textContent = 'Reconnecting…'; t.classList.add('show'); clearTimeout(t._h); }
  else if (t.textContent === 'Reconnecting…') t.classList.remove('show');
}

/**
 * GET when `body` is undefined, otherwise a JSON POST. Resolves to the reply's JSON, or throws an
 * Error (with .status) carrying the server's message.
 */
export async function api(path, body, { retries = WAITS.length } = {}) {
  for (let attempt = 0; ; attempt++) {
    const send = body === undefined ? body : attempt ? { ...body, retry: attempt } : body;
    const opt = send === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(send) };
    let res = null, data = null;
    try {
      res = await fetch('/api/' + path, { credentials: 'same-origin', ...opt });
      data = await res.json().catch(() => null);
    } catch { /* the network dropped: retried below */ }
    // Our own error replies are JSON with an `error`; anything else that failed is worth another go.
    const ours = data && typeof data === 'object';
    const transient = !res || !ours || (TRANSIENT.has(res.status) && !(ours && data.error && res.status < 500));
    if (transient && attempt < retries) {
      if (attempt === 0) notice(true);
      await wait(WAITS[attempt]);
      continue;
    }
    if (attempt) notice(false);
    if (res && ours && res.ok && !data.error) return data;
    const e = new Error(ours && data.error ? data.error : LOST);
    e.status = res ? res.status : 0;
    throw e;
  }
}
