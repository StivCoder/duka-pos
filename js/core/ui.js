export function openDialog(html) {
  const d = document.createElement('dialog'); d.innerHTML = html; document.body.appendChild(d);
  d.addEventListener('close', () => d.remove()); d.showModal(); return d;
}
export function toast(msg, type = '') {
  const box = document.getElementById('toasts') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'toasts' }));
  const t = Object.assign(document.createElement('div'), { className: 'toast ' + type, textContent: msg }); box.appendChild(t); setTimeout(() => t.remove(), 3500);
}
export function confirmDialog(msg) {
  return new Promise((resolve) => {
    const d = openDialog(`<p>${msg}</p><div class="row"><button class="btn" data-v="0">Cancel</button><button class="btn pri" data-v="1">Confirm</button></div>`);
    d.addEventListener('click', (e) => { const v = e.target.dataset?.v; if (v !== undefined) { resolve(v === '1'); d.close(); } });
    d.addEventListener('cancel', () => resolve(false));
  });
}
