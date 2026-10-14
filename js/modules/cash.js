import { getAll, put, get, openShiftTx } from '../core/db.js';
import { kes, toCents, esc } from '../core/format.js';
import { openDialog, toast } from '../core/ui.js';
import { cashSummary } from '../core/cashmath.js';
import { getSession } from '../core/session.js';
const when = (d) => new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
export async function render(el) {
  const draw = async () => {
    const [shifts, sales, expenses, ledger] = await Promise.all([getAll('shifts'), getAll('sales'), getAll('expenses'), getAll('ledger')]);
    const open = shifts.find((s) => s.status === 'open'), now = new Date().toISOString(), data = { sales, expenses, ledger };
    const hist = shifts.filter((s) => s.status === 'closed').sort((a, b) => b.closedAt.localeCompare(a.closedAt));
    const sm = open && cashSummary(open, data, now), row = (l, v, sign = '') => `<tr><td>${l}</td><td class="num">${sign}${kes(v)}</td></tr>`;
    el.innerHTML = `${open ? `<div class="card" style="margin-bottom:16px"><h2>Open shift: ${esc(open.userName)}, since ${when(open.openedAt)}</h2><table><tbody>${row('Opening float', open.openingFloat)}${row('Cash sales', sm.cashSales, '+')}${row('Cash customer payments', sm.customerCash, '+')}${row('Cash in', sm.cashIn, '+')}${row('Cash refunds', sm.cashRefunds, '−')}${row('Cash expenses', sm.expenseCash, '−')}${row('Cash paid to suppliers', sm.supplierCash, '−')}${row('Cash out', sm.cashOut, '−')}<tr><td><b>Expected cash in drawer</b></td><td class="num"><b>${kes(sm.expected)}</b></td></tr></tbody></table><div class="row"><button class="btn" data-a="in">Cash in</button><button class="btn" data-a="out">Cash out</button><button class="btn pri" data-a="close">Close shift</button></div></div>` : `<div class="card" style="margin-bottom:16px"><h2>No open shift</h2><div class="fgrid"><label>Opening float (KSh)<input id="fl" type="number" min="0" step="0.01" value="0"></label></div><p class="err" id="err"></p><div class="row"><button class="btn pri" data-a="open">Open shift</button></div></div>`}
    <div class="card"><h2>Closed shifts</h2>${hist.length ? `<div class="tbl-wrap"><table><thead><tr><th>Closed</th><th>Cashier</th><th class="num">Expected</th><th class="num">Counted</th><th class="num">Difference</th></tr></thead><tbody>${hist.map((s) => `<tr><td>${when(s.closedAt)}</td><td>${esc(s.userName)}</td><td class="num">${kes(s.expectedCash)}</td><td class="num">${kes(s.countedCash)}</td><td class="num">${s.variance === 0 ? 'Balanced' : (s.variance > 0 ? 'Over ' : 'Short ') + kes(Math.abs(s.variance))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>No closed shifts yet</b>Close a shift to reconcile counted cash against expected cash.</div>'}</div>`;
    el.onclick = async (e) => {
      const a = e.target.dataset.a; if (!a) return; const me = getSession();
      if (a === 'open') { const fl = toCents(el.querySelector('#fl').value || 0); if (!(fl >= 0)) return; try { await openShiftTx({ id: 'SH-' + Date.now().toString(36).toUpperCase(), userId: me.userId, userName: me.name, openedAt: new Date().toISOString(), openingFloat: fl, status: 'open', movements: [] }); } catch (err) { return toast(err.message, 'error'); } toast('Shift opened'); draw(); }
      if (a === 'in' || a === 'out') {
        const d = openDialog(`<h2>Cash ${a}</h2><div class="fgrid"><label>Amount (KSh)<input id="am" type="number" min="0" step="0.01"></label><label>Reason (required)<input id="why"></label></div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Save</button></div>`);
        d.addEventListener('click', async (ev) => {
          if (ev.target.dataset.a === 'x') d.close(); if (ev.target.dataset.a !== 'ok') return;
          const amount = toCents(d.querySelector('#am').value), why = d.querySelector('#why').value.trim(), s = await get('shifts', open.id);
          if (!(amount > 0)) return (d.querySelector('#err').textContent = 'Enter an amount above zero.'); if (!why) return (d.querySelector('#err').textContent = 'A reason is required.');
          if (a === 'out' && amount > cashSummary(s, data, new Date().toISOString()).expected) return (d.querySelector('#err').textContent = 'That is more cash than the drawer should hold.');
          await put('shifts', { ...s, movements: [...s.movements, { id: 'm' + Date.now().toString(36), at: new Date().toISOString(), type: a, amount, reason: why, by: me.name }] }); d.close(); toast('Recorded'); draw();
        });
      }
      if (a === 'close') {
        const d = openDialog(`<h2>Close shift</h2><p>Expected in drawer: <b>${kes(sm.expected)}</b></p><label>Counted cash (KSh)<input id="ct" type="number" min="0" step="0.01"></label><div class="sum" id="df"></div><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Close shift</button></div>`);
        d.addEventListener('input', () => { const v = toCents(d.querySelector('#ct').value || 0) - sm.expected; d.querySelector('#df').textContent = v === 0 ? 'Balanced' : (v > 0 ? 'Over by ' : 'Short by ') + kes(Math.abs(v)); });
        d.addEventListener('click', async (ev) => {
          if (ev.target.dataset.a === 'x') d.close(); if (ev.target.dataset.a !== 'ok') return;
          const raw = d.querySelector('#ct').value; if (raw === '' || !(Number(raw) >= 0)) return (d.querySelector('#df').textContent = 'Enter the counted cash.');
          const s = await get('shifts', open.id), closedAt = new Date().toISOString(), fin = cashSummary({ ...s, closedAt }, data, closedAt), counted = toCents(raw);
          await put('shifts', { ...s, status: 'closed', closedAt, expectedCash: fin.expected, countedCash: counted, variance: counted - fin.expected, closedBy: me.name }); d.close(); toast('Shift closed'); draw();
        });
      }
    };
  };
  await draw();
}
