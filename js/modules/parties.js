import { getAll, put, settleBalanceTx } from '../core/db.js';
import { kes, toCents, esc } from '../core/format.js';
import { openDialog, toast } from '../core/ui.js';
const when = (d) => new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
/** Shared screen for customers and suppliers: list, add/edit, record payment, history. */
export async function partyPage(el, cfg) {
  let rows = [];
  const draw = async () => {
    rows = (await getAll(cfg.store)).sort((a, b) => a.name.localeCompare(b.name));
    el.querySelector('#tbl').innerHTML = rows.length ? `<table><thead><tr><th>Name</th><th>Phone</th>${cfg.cols.map((c) => `<th class="num">${c.h}</th>`).join('')}<th class="num">${cfg.balanceLabel}</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.phone)}</td>${cfg.cols.map((c) => `<td class="num">${c.v(r)}</td>`).join('')}<td class="num">${kes(r[cfg.field])}</td><td class="num"><button class="btn sm" data-a="edit" data-id="${r.id}">Edit</button> <button class="btn sm" data-a="pay" data-id="${r.id}">${cfg.payLabel}</button> <button class="btn sm" data-a="hist" data-id="${r.id}">History</button></td></tr>`).join('')}</tbody></table>` : `<div class="empty"><b>No ${cfg.plural} yet</b>${cfg.hint}</div>`;
  };
  el.innerHTML = `<div class="bar"><span class="sp"></span><button class="btn pri" id="add">+ Add ${cfg.one}</button></div><div class="card"><div class="tbl-wrap" id="tbl"></div></div>`;
  function form(r) {
    const d = openDialog(`<h2>${r ? 'Edit' : 'Add'} ${cfg.one}</h2><div class="fgrid"><label>Name<input id="f_name" value="${esc(r?.name)}"></label><label>Phone<input id="f_phone" value="${esc(r?.phone)}"></label>${cfg.fields.map((f) => `<label>${f.label}<input id="f_${f.k}" ${f.money ? 'type="number" min="0" step="0.01"' : ''} value="${f.money ? (r?.[f.k] || 0) / 100 : esc(r?.[f.k])}"></label>`).join('')}</div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="save">Save</button></div>`);
    d.addEventListener('click', async (e) => {
      if (e.target.dataset.a === 'x') d.close(); if (e.target.dataset.a !== 'save') return;
      const g = (k) => d.querySelector('#f_' + k).value, name = g('name').trim();
      if (!name) return (d.querySelector('#err').textContent = 'Name is required.');
      const extra = {}; for (const f of cfg.fields) { const v = f.money ? toCents(g(f.k) || 0) : g(f.k).trim(); if (f.money && v < 0) return (d.querySelector('#err').textContent = f.label + ' cannot be negative.'); extra[f.k] = v; }
      await put(cfg.store, { ...(r || { id: cfg.prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), [cfg.field]: 0, ...cfg.defaults }), name, phone: g('phone').trim(), ...extra });
      d.close(); toast(cfg.one + ' saved'); draw();
    });
  }
  function pay(r) {
    const d = openDialog(`<h2>${cfg.payLabel}: ${esc(r.name)}</h2><p>${cfg.balanceLabel}: <b>${kes(r[cfg.field])}</b></p><div class="fgrid"><label>Amount (KSh)<input id="p_amt" type="number" min="0" step="0.01"></label><label>Method<select id="p_m"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option></select></label><label style="grid-column:1/-1">Note<input id="p_n"></label></div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Record payment</button></div>`);
    d.addEventListener('click', async (e) => {
      if (e.target.dataset.a === 'x') d.close(); if (e.target.dataset.a !== 'ok') return;
      try { await settleBalanceTx({ store: cfg.store, id: r.id, amount: toCents(d.querySelector('#p_amt').value), method: d.querySelector('#p_m').value, note: d.querySelector('#p_n').value.trim() }); }
      catch (err) { return (d.querySelector('#err').textContent = err.message); }
      d.close(); toast('Payment recorded'); draw();
    });
  }
  async function history(r) {
    const led = (await getAll('ledger')).filter((x) => x.partyId === r.id).sort((a, b) => b.at.localeCompare(a.at));
    const d = openDialog(`<h2>${esc(r.name)}</h2>${await cfg.history(r)}<h2 style="margin-top:14px">Payments</h2>${led.length ? `<table><tbody>${led.map((x) => `<tr><td>${when(x.at)}</td><td>${esc(x.method)}</td><td>${esc(x.note)}</td><td class="num">${kes(x.amount)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No payments recorded.</div>'}<div class="row"><button class="btn" data-a="x">Close</button></div>`);
    d.addEventListener('click', (e) => { if (e.target.dataset.a === 'x') d.close(); });
  }
  el.querySelector('#add').addEventListener('click', () => form(null));
  el.addEventListener('click', (e) => { const { a, id } = e.target.dataset, r = rows.find((x) => x.id === id); if (a === 'edit') form(r); if (a === 'pay') pay(r); if (a === 'hist') history(r); });
  await draw();
}
export const histTable = (head, rows) => rows.length ? `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<div class="empty">Nothing yet.</div>';
