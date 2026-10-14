import { getAll, put } from '../core/db.js';
import { esc } from '../core/format.js';
import { ROLES, PERMS, hashPin, newSalt, validPin, getSession } from '../core/session.js';
import { openDialog, toast } from '../core/ui.js';
export async function render(el) {
  let users = []; const me = getSession();
  const draw = async () => {
    users = (await getAll('users')).sort((a, b) => a.name.localeCompare(b.name));
    el.querySelector('#tbl').innerHTML = `<table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${users.map((u) => `<tr><td>${esc(u.name)}${u.id === me.userId ? ' (you)' : ''}</td><td>${u.role}</td><td><span class="tag ${u.active ? '' : 'low'}">${u.active ? 'active' : 'disabled'}</span></td><td class="num"><button class="btn sm" data-a="edit" data-id="${u.id}">Edit / reset PIN</button>${u.id === me.userId ? '' : ` <button class="btn sm" data-a="tog" data-id="${u.id}">${u.active ? 'Disable' : 'Enable'}</button>`}</td></tr>`).join('')}</tbody></table>`;
  };
  const adminsLeft = (skipId) => users.filter((u) => u.active && u.role === 'admin' && u.id !== skipId).length;
  el.innerHTML = `<div class="bar"><span class="sp"></span><button class="btn pri" id="add">+ Add user</button></div><div class="card"><div class="tbl-wrap" id="tbl"></div></div><div class="card" style="margin-top:16px"><h2>Permissions by role</h2><div class="tbl-wrap"><table><thead><tr><th>Permission</th>${ROLES.map((r) => `<th class="num">${r}</th>`).join('')}</tr></thead><tbody>${Object.entries(PERMS).map(([p, min]) => `<tr><td>${p}</td>${ROLES.map((r) => `<td class="num">${ROLES.indexOf(r) >= ROLES.indexOf(min) ? '&#10003;' : '&ndash;'}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p style="color:var(--grey)">Checks run in the browser for this prototype. The backend must enforce the same rules on every request.</p></div>`;
  function form(u) {
    const d = openDialog(`<h2>${u ? 'Edit' : 'Add'} user</h2><div class="fgrid"><label>Name<input id="n" value="${esc(u?.name)}"></label><label>Role<select id="r">${ROLES.map((r) => `<option ${u?.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label><label style="grid-column:1/-1">${u ? 'New PIN (leave blank to keep)' : 'PIN (4-6 digits)'}<input id="p" type="password" inputmode="numeric" maxlength="6"></label></div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Save</button></div>`);
    d.addEventListener('click', async (e) => {
      if (e.target.dataset.a === 'x') d.close(); if (e.target.dataset.a !== 'ok') return;
      const name = d.querySelector('#n').value.trim(), role = d.querySelector('#r').value, pin = d.querySelector('#p').value, err = (m) => (d.querySelector('#err').textContent = m);
      if (!name) return err('Name is required.'); if ((!u || pin) && !validPin(pin)) return err('PIN must be 4 to 6 digits.');
      if (users.some((x) => x.id !== u?.id && x.name.toLowerCase() === name.toLowerCase())) return err('That name is already used.');
      if (u && u.role === 'admin' && role !== 'admin' && !adminsLeft(u.id)) return err('There must be at least one active administrator.');
      const salt = pin ? newSalt() : u.salt, rec = { ...(u || { id: 'u' + Date.now().toString(36), active: true }), name, role, salt, pinHash: pin ? await hashPin(pin, salt) : u.pinHash };
      await put('users', rec); d.close(); toast('User saved'); draw();
    });
  }
  el.querySelector('#add').addEventListener('click', () => form(null));
  el.addEventListener('click', async (e) => {
    const { a, id } = e.target.dataset, u = users.find((x) => x.id === id);
    if (a === 'edit') form(u);
    if (a === 'tog') { if (u.active && u.role === 'admin' && !adminsLeft(u.id)) return toast('There must be at least one active administrator.', 'error'); await put('users', { ...u, active: !u.active }); draw(); }
  });
  await draw();
}
