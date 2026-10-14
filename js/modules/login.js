import { getAll, put } from '../core/db.js';
import { esc } from '../core/format.js';
import { hashPin, newSalt, validPin, setSession, getSession, clearSession } from '../core/session.js';
const LOCK = 'dukapos.lock';
export async function render(app) {
  const all = await getAll('users'), users = all.filter((u) => u.active), setup = !all.length, cur = getSession();
  app.innerHTML = `<div class="auth"><img src="../assets/logo.svg" alt="" width="48" height="48"><h1>DukaPOS</h1>${setup ? `<p>First run: create the administrator account.</p><label>Your name<input id="n" autocomplete="off"></label><label>PIN (4-6 digits)<input id="p1" type="password" inputmode="numeric" maxlength="6"></label><label>Repeat PIN<input id="p2" type="password" inputmode="numeric" maxlength="6"></label>` : `${cur ? `<p>Signed in as <b>${esc(cur.name)}</b>. <a href="#" id="out">Sign out</a></p>` : ''}<label>User<select id="u">${users.map((u) => `<option value="${u.id}">${esc(u.name)} (${u.role})</option>`).join('')}</select></label><label>PIN<input id="p1" type="password" inputmode="numeric" maxlength="6" autofocus></label>`}<p class="err" id="err"></p><button class="btn pri big" id="go">${setup ? 'Create administrator' : 'Sign in'}</button><small>Local prototype: this PIN is stored in the browser and is not real security.</small></div>`;
  const $ = (s) => app.querySelector(s), fail = (m) => ($('#err').textContent = m), enter = (u) => { setSession(u); location.href = u.role === 'cashier' ? 'pos.html' : 'dashboard.html'; };
  app.querySelector('#out')?.addEventListener('click', (e) => { e.preventDefault(); clearSession(); location.reload(); });
  async function go() {
    const pin = $('#p1').value;
    if (setup) {
      if (!$('#n').value.trim()) return fail('Enter your name.'); if (!validPin(pin)) return fail('PIN must be 4 to 6 digits.'); if (pin !== $('#p2').value) return fail('PINs do not match.');
      const salt = newSalt(), u = { id: 'u' + Date.now().toString(36), name: $('#n').value.trim(), role: 'admin', active: true, salt, pinHash: await hashPin(pin, salt) };
      await put('users', u); return enter(u);
    }
    const lock = JSON.parse(sessionStorage.getItem(LOCK) || '{"n":0,"until":0}');
    if (Date.now() < lock.until) return fail('Too many attempts. Wait ' + Math.ceil((lock.until - Date.now()) / 1000) + 's.');
    const u = users.find((x) => x.id === $('#u').value);
    if (u && (await hashPin(pin, u.salt)) === u.pinHash) { sessionStorage.removeItem(LOCK); return enter(u); }
    lock.n += 1; if (lock.n >= 5) { lock.until = Date.now() + 30000; lock.n = 0; } sessionStorage.setItem(LOCK, JSON.stringify(lock)); fail('Wrong PIN.');
  }
  $('#go').addEventListener('click', go); app.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}
