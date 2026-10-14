import { getAll } from '../core/db.js';
import { kes, esc, nairobiDayKey } from '../core/format.js';
import { csvCell } from '../core/csv.js';
import { summarizeRange, periodRange } from './summary.js';
const LBL = { cash: 'Cash', mpesa: 'M-Pesa (not verified)', card: 'Card (external)', credit: 'On credit' };
export async function render(el) {
  const data = { sales: await getAll('sales'), expenses: await getAll('expenses'), products: await getAll('products') }, today = nairobiDayKey(new Date());
  el.innerHTML = `<div class="bar"><label>Period <select id="k"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="week">This week (Mon-today)</option><option value="month">This month</option><option value="custom">Custom dates</option></select></label><span id="cu" hidden><input id="from" type="date" value="${today}"> to <input id="to" type="date" value="${today}"></span><span class="sp"></span><button class="btn" id="csv">Export sales CSV</button></div><div id="out"></div>`;
  const $ = (s) => el.querySelector(s); let cur;
  const tbl = (head, rows, empty) => rows.length ? `<table><thead><tr>${head.map((h, i) => `<th class="${i ? 'num' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<div class="empty">${empty}</div>`;
  const draw = () => {
    const [from, to] = periodRange($('#k').value, today, { from: $('#from').value, to: $('#to').value });
    const s = cur = summarizeRange(data, from, to); cur.range = [from, to]; $('#cu').hidden = $('#k').value !== 'custom';
    const kpi = (l, v, n, c = '') => `<div class="card kpi ${c}"><div class="n">${l}</div><div class="v">${kes(v)}</div><div class="n">${n}</div></div>`;
    $('#out').innerHTML = `<p style="color:var(--grey)">${from === to ? from : from + ' to ' + to} (Africa/Nairobi)</p><div class="grid kpis">${kpi('Revenue', s.revenue, 'After refunds, excluding tax')}${kpi('Gross profit', s.grossProfit, 'Revenue minus cost of goods')}${kpi('Expenses', s.expenses, 'Operating costs')}${kpi('Net profit', s.netProfit, 'Gross profit minus expenses', s.netProfit < 0 ? 'bad' : '')}</div>
    <div class="grid two"><section class="card"><h2>Summary</h2>${tbl(['Measure', ''], [['Transactions', s.count], ['Cost of goods sold', kes(s.cogs)], ['Refunds paid out', kes(s.refunds)], ['Stock value now (at cost)', kes(s.stockValue)]], '')}</section>
    <section class="card"><h2>Payment methods (collected at sale)</h2>${tbl(['Method', 'Amount'], Object.entries(s.payments).map(([m, a]) => [LBL[m] || esc(m), kes(a)]), 'No sales in this period.')}</section>
    <section class="card"><h2>Best-selling products</h2>${tbl(['Product', 'Qty sold'], s.top.map(([n, q]) => [esc(n), q]), 'No sales in this period.')}</section>
    <section class="card"><h2>Expenses by category</h2>${tbl(['Category', 'Amount'], Object.entries(s.byCategory).map(([c, a]) => [esc(c), kes(a)]), 'No expenses in this period.')}</section></div>`;
  };
  el.addEventListener('change', draw); el.addEventListener('input', (e) => { if (e.target.type === 'date') draw(); });
  $('#csv').addEventListener('click', () => {
        const rows = [['reference', 'date', 'customer', 'status', 'total_kes', 'payments'], ...cur.sales.map((x) => [x.id, x.createdAt, x.customerName || '', x.status, x.total / 100, x.payments.map((p) => p.method).join('+')])];
    Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' })), download: `dukapos-sales-${cur.range[0]}_${cur.range[1]}.csv` }).click();
  });
  draw();
}
