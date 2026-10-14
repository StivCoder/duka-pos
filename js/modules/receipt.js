import { kes, esc } from '../core/format.js';
import { openDialog } from '../core/ui.js';
const when = (d) => new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
const LBL = { cash: 'Cash', mpesa: 'M-Pesa (not verified)', card: 'Card (external)', credit: 'On credit (owed)' };
export function receiptHTML(s, st) {
  return `<div class="receipt"><h3>${esc(st.shopName)}</h3>${st.phone ? `<div>${esc(st.phone)}</div>` : ''}<div>${when(s.createdAt)}</div><div>Ref: ${esc(s.id)}</div>${s.customerName ? `<div>Customer: ${esc(s.customerName)}</div>` : ''}<hr>
  ${s.items.map((l) => `<div class="rl"><span>${l.qty} x ${esc(l.name)}</span><span>${kes(Math.round(l.qty * l.unitPrice))}</span></div><div class="rs">@ ${kes(l.unitPrice)}</div>`).join('')}<hr>
  <div class="rl"><span>Subtotal</span><span>${kes(s.subtotal)}</span></div>
  ${s.discount ? `<div class="rl"><span>Discount</span><span>-${kes(s.discount)}</span></div>` : ''}
  ${s.taxRate ? `<div class="rl"><span>Tax ${s.taxRate}% ${s.taxInclusive ? '(incl.)' : ''}</span><span>${kes(s.tax)}</span></div>` : ''}
  <div class="rl b"><span>TOTAL</span><span>${kes(s.total)}</span></div><hr>
  ${s.payments.map((p) => `<div class="rl"><span>${LBL[p.method] || p.method}${p.ref ? ' ' + esc(p.ref) : ''}</span><span>${kes(p.amount)}</span></div>`).join('')}
  ${s.change ? `<div class="rl"><span>Change</span><span>${kes(s.change)}</span></div>` : ''}<p class="rs">Thank you for shopping with us.</p></div>`;
}
export function showReceipt(sale, settings) {
  const d = openDialog(`${receiptHTML(sale, settings)}<div class="row noprint"><button class="btn" data-a="x">Close</button><button class="btn pri" data-a="p">Print</button></div>`);
  d.addEventListener('click', (e) => { if (e.target.dataset.a === 'x') d.close(); if (e.target.dataset.a === 'p') window.print(); });
}
