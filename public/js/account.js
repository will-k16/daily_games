// The account modal, shared by the suite home page and every game: Google or email + password.
// One account covers the whole suite, so sign-in always comes back to the page it started from.

import { setModalGuard } from './modal.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// What was typed into the account forms, kept (in memory only) if the modal is closed by accident.
const draft = {};
const EYE = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" fill="none" stroke="currentColor" stroke-width="2"/><rect x="8" y="8" width="4" height="4" fill="currentColor"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" fill="none" stroke="currentColor" stroke-width="2"/><rect x="8" y="8" width="4" height="4" fill="currentColor"/><path d="M3 17 17 3" stroke="currentColor" stroke-width="2"/></svg>';

/** A password box with an eye button that shows what's been typed. */
const pwField = (name, placeholder, auto, extra = '') => `<div class="pwwrap">
  <input class="pin" type="password" name="${name}" placeholder="${placeholder}" autocomplete="${auto}" ${extra} required>
  <button class="pweye" type="button" aria-label="Show password" aria-pressed="false" tabindex="-1">${EYE}</button></div>`;

/** Wires the eye buttons, restores and saves the draft, and asks before closing a form that has typing in it. */
function keepDraft(form, key) {
  const d = draft[key] || (draft[key] = {});
  form.querySelectorAll('input:not([hidden])').forEach(i => {
    if (d[i.name] != null && i.type !== 'hidden') i.value = d[i.name];
    i.addEventListener('input', () => { d[i.name] = i.value; });
  });
  form.querySelectorAll('.pweye').forEach(b => b.onclick = () => {
    const show = b.getAttribute('aria-pressed') !== 'true';
    // One eye shows every password box in the form, so "confirm" can be checked against the first.
    form.querySelectorAll('.pweye').forEach(o => {
      o.previousElementSibling.type = show ? 'text' : 'password';
      o.setAttribute('aria-pressed', String(show));
      o.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      o.innerHTML = show ? EYE_OFF : EYE;
    });
    b.previousElementSibling.focus();
  });
  setModalGuard(() => [...form.querySelectorAll('input:not([hidden])')].some(i => i.value && i.defaultValue !== i.value));
  return () => { delete draft[key]; };
}

/** Checks the two new-password boxes match; shows the message and returns false if not. */
function confirmed(form, msg) {
  if (!form.confirm || form.confirm.value === form.password.value) return true;
  msg.innerHTML = '<div class="note bad">The two passwords don’t match.</div>';
  form.confirm.focus();
  return false;
}

/**
 * ui: { me, api, openModal, closeModal, toast, $ }. `note` shows a warning at the top (e.g. Google failed).
 * Calls ui.onPassword() after a password is saved so the page can update its copy of `me`.
 */
export function showAccount(ui, note) {
  const { me, api, openModal, closeModal, toast } = ui;
  const $ = s => document.querySelector(s);
  const here = location.pathname;
  if (me.signedIn) {
    const has = !!me.hasPassword;
    openModal(`<h2>Account</h2><p>Signed in as <b>${esc(me.email)}</b>. Your stats, streaks, WK Bucks and pets' outfits come with you to any device.</p>
      <form class="authform" id="pwForm" autocomplete="on">
        <h4>${has ? 'Change your password' : 'Add a password'}</h4>
        <p class="sub">${has ? '' : 'Handy if Google sign-in ever acts up: you can sign in with your email and this password instead.'}</p>
        <input type="email" name="username" value="${esc(me.email)}" autocomplete="username" hidden>
        ${has ? pwField('current', 'Current password', 'current-password') : ''}
        ${pwField('password', 'New password (8+ characters)', 'new-password', 'minlength="8"')}
        ${pwField('confirm', 'Type the new password again', 'new-password', 'minlength="8"')}
        <div class="msg" id="pwMsg"></div>
        <div class="row"><button class="btn sm" type="submit">${has ? 'Change password' : 'Save password'}</button><button class="btn alt sm" type="button" id="signout">Sign out</button></div>
      </form>`);
    $('#signout').onclick = async () => { await api('auth/logout', {}).catch(() => {}); location.href = here; };
    const f = $('#pwForm');
    const forget = keepDraft(f, 'pw');
    f.onsubmit = async e => {
      e.preventDefault();
      if (!confirmed(f, $('#pwMsg'))) return;
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        await api('auth/password', { password: f.password.value, current: f.current ? f.current.value : '' });
        me.hasPassword = true; forget(); closeModal(); toast(has ? 'Password changed.' : 'Password saved. You can sign in with it anytime.');
        if (ui.onPassword) ui.onPassword();
      } catch (err) { $('#pwMsg').innerHTML = `<div class="note bad">${esc(err.message)}</div>`; btn.disabled = false; }
    };
    return;
  }
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const ret = encodeURIComponent(here);
  let mode = draft.mode || 'signin';
  const draw = () => {
    const up = mode === 'signup';
    openModal(`<h2>${up ? 'Make an account' : 'Sign in'}</h2>
      ${typeof note === 'string' ? `<div class="note warn" style="margin-bottom:12px">${esc(note)}</div>` : ''}
      <p>You're playing as a guest, so your scores only live on this device. Sign in to keep your streaks, WK Bucks and pets' outfits on your phone and computer. Your email is never shown to anyone.</p>
      <div class="row"><a class="btn" href="/api/auth/login?return=${ret}">Continue with Google</a>${local ? `<a class="btn alt sm" href="/api/auth/dev?return=${ret}">Dev sign-in</a>` : ''}</div>
      <div class="or"><span>or use your email</span></div>
      <form class="authform" id="authForm" autocomplete="on">
        <input class="pin" type="email" name="email" placeholder="Email" autocomplete="email" required>
        ${pwField('password', up ? 'Password (8+ characters)' : 'Password', up ? 'new-password' : 'current-password', up ? 'minlength="8"' : '')}
        ${up ? pwField('confirm', 'Type the password again', 'new-password', 'minlength="8"') : ''}
        <div class="msg" id="authMsg"></div>
        <div class="row"><button class="btn sm" type="submit">${up ? 'Create account' : 'Sign in'}</button>
          <button class="link" type="button" id="authSwap">${up ? 'Already have an account? Sign in' : 'New here? Make an account'}</button></div>
        ${up ? '' : '<p class="sub">Forgot your password? If you also use Google, sign in with Google and set a new one from this menu.</p>'}
      </form>`);
    $('#authSwap').onclick = () => { mode = draft.mode = up ? 'signin' : 'signup'; note = null; draw(); };
    const f = $('#authForm');
    const forget = keepDraft(f, 'auth');
    (f.email.value ? f.password : f.email).focus();
    f.onsubmit = async e => {
      e.preventDefault();
      if (!confirmed(f, $('#authMsg'))) return;
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.classList.add('busy');
      try {
        await api(up ? 'auth/register' : 'auth/signin', { email: f.email.value, password: f.password.value });
        forget(); setModalGuard(null);
        location.href = here + '?signedin=1';
      } catch (err) {
        $('#authMsg').innerHTML = `<div class="note bad">${esc(err.message)}</div>`;
        btn.disabled = false; btn.classList.remove('busy');
      }
    };
  };
  draw();
}

/** Handles ?signedin=1 / ?signin=failed after coming back from sign-in. */
export function signInReturn(ui) {
  const sp = new URLSearchParams(location.search);
  if (sp.get('signedin') === '1') {
    history.replaceState(null, '', location.pathname + location.hash);
    ui.toast(ui.me.signedIn ? `Signed in as ${ui.me.email}` : 'Sign-in didn\'t stick. Try once more.');
  }
  if (sp.get('signin') === 'failed') {
    history.replaceState(null, '', location.pathname + location.hash);
    showAccount(ui, 'Google sign-in didn\'t go through. You can use your email and a password instead.');
  }
}
