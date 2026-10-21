// The modal shared by the suite home page and every game (the markup lives in each page's HTML).
// Clicking the backdrop, ✕ or Escape closes it, except that a form with something typed in it
// (see setModalGuard) asks first, and a click that started inside the card never closes it.

const $ = s => document.querySelector(s);
let guard = null;

/** fn() → true means closing now would lose something, so ask first. Cleared by the next openModal. */
export function setModalGuard(fn) { guard = fn; }

export function openModal(html) {
  guard = null;
  $('#modalBody').innerHTML = html;
  $('#modal').hidden = false;
}

/** Always closes (for code that has finished with the modal). People closing it go through askClose. */
export function closeModal() {
  guard = null;
  const a = $('#modal .modal-ask'); if (a) a.remove();
  $('#modal').hidden = true;
}

function askClose() {
  if (!guard || !guard()) { closeModal(); return; }
  if ($('#modal .modal-ask')) return;
  const back = document.activeElement;
  const ask = document.createElement('div');
  ask.className = 'modal-ask';
  ask.setAttribute('role', 'alertdialog');
  ask.innerHTML = `<div class="modal-card modal-ask-box"><p><b>Close this?</b><br>What you typed is kept for when you come back.</p>
    <div class="row"><button class="btn sm" type="button" data-keep>Keep going</button><button class="btn alt sm" type="button" data-close>Close</button></div></div>`;
  $('#modal').appendChild(ask);
  const keep = () => { ask.remove(); if (back && back.focus) back.focus(); };
  ask.querySelector('[data-keep]').onclick = keep;
  ask.querySelector('[data-close]').onclick = closeModal;
  ask.querySelector('[data-keep]').focus();
}

let downOnBackdrop = false;
$('#modal').addEventListener('pointerdown', e => { downOnBackdrop = e.target.id === 'modal'; });
// Only a click that both starts and ends on the backdrop closes it, so dragging out of a text box doesn't.
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' && downOnBackdrop) askClose(); downOnBackdrop = false; });
$('#modalX').onclick = askClose;
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || $('#modal').hidden) return;
  const a = $('#modal .modal-ask');
  if (a) a.querySelector('[data-keep]').click(); else askClose();
});
