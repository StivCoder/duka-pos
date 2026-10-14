import { getAll, put } from '../core/db.js';
import { kes, toCents, esc, nairobiDayKey } from '../core/format.js';
import { toast, openDialog } from '../core/ui.js';
import { getSession } from '../core/session.js';
const CATS = ['Rent', 'Transport', 'Electricity', 'Wages', 'Packaging', 'Airtime & data', 'Licences', 'Other'];
const opts = (list, cur) => list.map((c) => `<option ${c === cur ? 'selected' : ''}>${c}</option>`).join('');
const isoAt = (date) => new Date(date + 'T12:00:00+03:00').toISOString();
export async function render(el) {
  let list = [];
  const audit = async (action, x, detail) => put('audit', { id: 'A' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), at: new Date().toISOString(), action, expenseId: x.id, detail, user: getSession().name });
  const draw = async () => {
    list = (await getAll('expenses')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
    const log = (await getAll('audit')).filter((a) => a.action.startsWith('expense.')).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
    el.querySelector('#list').innerHTML = list.length ? `<table><thead><tr><th>Date</th><th>Category</th><th>Method</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead><tbody>${list.map((x) => `<tr class="${x.voided ? 'dim' : ''}"><td>${nairobiDayKey(x.createdAt)}</td><td>${esc(x.category)}</td><td>${esc(x.method)}</td><td>${esc(x.note)}</td><td class="num">${x.voided ? '<s>' + kes(x.amount) + '</s> <span class="tag low">voided</span>' : kes(x.amount)}</td><td class="num">${x.voided ? '' : `<button class="btn sm" data-a="edit" data-id="${x.id}">Edit</button> <button class="btn sm" data-a="void" data-id="${x.id}">Void</button>`}</td></tr>`).join('')}</tbody></table>` : '<div class="empty"><b>No expenses recorded</b>Add rent, transport, wages and other costs so net profit is accurate.</div>';
    el.querySelector('#log').innerHTML = log.length ? `<table><tbody>${log.map((a) => `<tr><td>${new Date(a.at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}</td><td>${a.action.replace('expense.', '')}</td><td>${esc(a.detail)}</td><td>${esc(a.user)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No edits or voids yet.</div>';
  };
  el.innerHTML = `<div class="card" style="margin-bottom:16px"><h2>Record expense</h2><div class="fgrid"><label>Amount (KSh)<input id="a" type="number" min="0" step="0.01"></label><label>Date<input id="d" type="date" value="${nairobiDayKey(new Date())}"></label><label>Category<select id="c">${opts(CATS)}</select></label><label>Paid by<select id="m"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option></select></label><label style="grid-column:1/-1">Note<input id="n"></label></div><p class="err" id="err"></p><div class="row"><button class="btn pri" id="save">Save expense</button></div></div><div class="card"><h2>Latest expenses</h2><div class="tbl-wrap" id="list"></div></div><div class="card" style="margin-top:16px"><h2>Edit and void log</h2><div class="tbl-wrap" id="log"></div></div>`;
  el.querySelector('#save').addEventListener('click', async () => {
    const amount = toCents(el.querySelector('#a').value), date = el.querySelector('#d').value, err = el.querySelector('#err');
    if (!(amount > 0)) return (err.textContent = 'Enter an amount greater than zero.'); if (!date) return (err.textContent = 'Choose a date.'); err.textContent = '';
    await put('expenses', { id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), createdAt: isoAt(date), recordedAt: new Date().toISOString(), category: el.querySelector('#c').value, method: el.querySelector('#m').value, note: el.querySelector('#n').value.trim(), amount });
    el.querySelector('#a').value = ''; el.querySelector('#n').value = ''; toast('Expense saved'); draw();
  });
  el.addEventListener('click', (e) => {
    const { a, id } = e.target.dataset, x = list.find((r) => r.id === id); if (!x || !['edit', 'void'].includes(a)) return;
    const d = openDialog(a === 'edit' ? `<h2>Edit expense</h2><div class="fgrid"><label>Amount (KSh)<input id="e_a" type="number" min="0" step="0.01" value="${x.amount / 100}"></label><label>Date<input id="e_d" type="date" value="${nairobiDayKey(x.createdAt)}"></label><label>Category<select id="e_c">${opts(CATS, x.category)}</select></label><label>Paid by<select id="e_m">${['cash', 'mpesa', 'bank'].map((m) => `<option ${m === x.method ? 'selected' : ''}>${m}</option>`).join('')}</select></label><label style="grid-column:1/-1">Note<input id="e_n" value="${esc(x.note)}"></label></div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Save changes</button></div>` : `<h2>Void expense</h2><p>${esc(x.category)} · ${kes(x.amount)}. It stays in the log but no longer counts in reports or cash.</p><label>Reason (required)<input id="why"></label><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Void expense</button></div>`);
    d.addEventListener('click', async (ev) => {
      if (ev.target.dataset.a === 'x') d.close(); if (ev.target.dataset.a !== 'ok') return; const err = (m) => (d.querySelector('#err').textContent = m), g = (i) => d.querySelector('#' + i).value;
      if (a === 'void') { if (!g('why').trim()) return err('A reason is required.'); await put('expenses', { ...x, voided: true, voidReason: g('why').trim(), voidedAt: new Date().toISOString() }); await audit('expense.void', x, kes(x.amount) + ' · ' + g('why').trim()); }
      else { const amount = toCents(g('e_a')); if (!(amount > 0)) return err('Enter an amount greater than zero.'); if (!g('e_d')) return err('Choose a date.');
        await put('expenses', { ...x, amount, createdAt: isoAt(g('e_d')), category: g('e_c'), method: g('e_m'), note: g('e_n').trim() }); await audit('expense.edit', x, kes(x.amount) + ' → ' + kes(amount)); }
      d.close(); toast('Saved'); draw();
    });
  });
  await draw();
}
