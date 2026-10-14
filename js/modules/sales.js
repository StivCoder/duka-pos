import { getAll, returnSaleTx } from '../core/db.js';
import { kes, esc } from '../core/format.js';
import { showReceipt } from './receipt.js';
import { loadSettings } from '../services/settings.js';
import { openDialog, toast } from '../core/ui.js';
import { can, getSession } from '../core/session.js';
import { computeReturn, remainingQty } from '../core/returns.js';
const when = (d) => new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
export async function render(el) {
  const st = await loadSettings(); let sales = [], audit = [], q = '';
  const load = async () => { sales = (await getAll('sales')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); audit = (await getAll('audit')).filter((a) => a.action === 'return' || a.action === 'cancel').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15); };
  el.innerHTML = `<div class="bar"><input id="q" type="search" placeholder="Search by reference, customer or payment method"></div><div class="card"><div class="tbl-wrap" id="tbl"></div></div><div class="card" style="margin-top:16px"><h2>Audit log (returns and cancellations)</h2><div class="tbl-wrap" id="aud"></div></div>`;
  const draw = () => {
    const r = sales.filter((s) => (s.id + (s.customerName || '') + s.payments.map((p) => p.method)).toLowerCase().includes(q.toLowerCase()));
    el.querySelector('#tbl').innerHTML = r.length ? `<table><thead><tr><th>Ref</th><th>Date</th><th>Payment</th><th>Status</th><th class="num">Total</th><th></th></tr></thead><tbody>${r.map((s) => { const open = s.status !== 'cancelled' && s.status !== 'returned'; return `<tr><td>${esc(s.id)}${s.customerName ? '<br><small>' + esc(s.customerName) + '</small>' : ''}</td><td>${when(s.createdAt)}</td><td>${esc(s.payments.map((p) => p.method).join(' + '))}</td><td><span class="tag ${s.status === 'completed' ? '' : 'low'}">${s.status.replace('_', ' ')}</span></td><td class="num">${kes(s.total)}</td><td class="num"><button class="btn sm" data-a="rcpt" data-id="${s.id}">Receipt</button>${open && can('sales.return') ? ` <button class="btn sm" data-a="ret" data-id="${s.id}">Return</button>` : ''}${open && can('sales.cancel') && !(s.returns || []).length ? ` <button class="btn sm" data-a="void" data-id="${s.id}">Cancel</button>` : ''}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty"><b>No sales found</b>Completed sales appear here.</div>';
    el.querySelector('#aud').innerHTML = audit.length ? `<table><thead><tr><th>When</th><th>Action</th><th>Sale</th><th>Reason</th><th class="num">Refund</th></tr></thead><tbody>${audit.map((a) => `<tr><td>${when(a.at)}</td><td>${a.action}</td><td>${esc(a.saleId)}</td><td>${esc(a.reason)}</td><td class="num">${kes(a.refund)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No returns or cancellations yet.</div>';
  };
  function refundDialog(s, cancel) {
    const items = s.items.filter((l) => remainingQty(s, l.productId) > 0);
    const d = openDialog(`<h2>${cancel ? 'Cancel' : 'Return items from'} ${esc(s.id)}</h2>${cancel ? '<p>The whole sale is reversed and all items go back to stock (if restock is ticked).</p>' : items.map((l) => `<div class="cl" style="grid-template-columns:1fr 90px"><div class="cn">${esc(l.name)}<small>sold ${l.qty}, returnable ${remainingQty(s, l.productId)}</small></div><input data-rq="${l.productId}" type="number" min="0" max="${remainingQty(s, l.productId)}" step="any" value="0"></div>`).join('')}
      <div class="fgrid" style="margin-top:10px"><label>Refund method<select id="rm"><option value="cash">Cash</option><option value="mpesa">M-Pesa (sent manually)</option><option value="card">Card (external)</option>${s.customerId ? '<option value="credit_balance">Reduce customer credit owed</option>' : ''}</select></label><label>Put items back in stock<select id="rs"><option value="1">Yes</option><option value="0">No (damaged)</option></select></label><label style="grid-column:1/-1">Reason (required)<input id="why"></label></div><div class="sum" id="prev"></div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Close</button><button class="btn pri" data-a="ok">${cancel ? 'Cancel sale' : 'Process return'}</button></div>`);
    const picks = () => [...d.querySelectorAll('[data-rq]')].map((i) => ({ productId: i.dataset.rq, qty: Number(i.value) }));
    const preview = () => { try { const r = computeReturn(s, cancel ? s.items.map((l) => ({ productId: l.productId, qty: remainingQty(s, l.productId) })) : picks(), d.querySelector('#rs').value === '1'); d.querySelector('#prev').innerHTML = 'Refund: <b>' + kes(r.refund) + '</b>'; } catch (e) { d.querySelector('#prev').textContent = e.message; } };
    d.addEventListener('input', preview); d.addEventListener('change', preview); preview();
    d.addEventListener('click', async (e) => {
      if (e.target.dataset.a === 'x') d.close(); if (e.target.dataset.a !== 'ok') return;
      try { await returnSaleTx(s.id, { picks: picks(), restock: d.querySelector('#rs').value === '1', method: d.querySelector('#rm').value, reason: d.querySelector('#why').value, cancel, by: getSession().name }); }
      catch (err) { return (d.querySelector('#err').textContent = err.message); }
      d.close(); toast(cancel ? 'Sale cancelled' : 'Return processed'); await load(); draw();
    });
  }
  el.addEventListener('input', (e) => { if (e.target.id === 'q') { q = e.target.value; draw(); } });
  el.addEventListener('click', (e) => { const { a, id } = e.target.dataset, s = sales.find((x) => x.id === id); if (a === 'rcpt') showReceipt(s, st); if (a === 'ret') refundDialog(s, false); if (a === 'void') refundDialog(s, true); });
  await load(); draw();
}
