import { getAll } from '../core/db.js';
import { kes, nairobiDayKey, timeOf, esc } from '../core/format.js';
import { summarize } from './summary.js';
const kpi = (label, v, note, cls = '') => `<div class="card kpi ${cls}"><div class="n">${label}</div><div class="v">${kes(v)}</div><div class="n">${note}</div></div>`;
const empty = (t, s) => `<div class="empty"><b>${t}</b>${s}</div>`;
export async function render(el) {
  const [sales, expenses, products] = await Promise.all([getAll('sales'), getAll('expenses'), getAll('products')]);
  const s = summarize({ sales, expenses, products }, nairobiDayKey(new Date()));
  const demo = [...sales, ...products].some((r) => r.isDemo);
  el.innerHTML = `
    ${demo ? '<div class="banner"><b>Demo data.</b> Figures below come from sample products and sales, not a real shop.</div>' : ''}
    <div class="grid kpis">
      ${kpi('Revenue today', s.revenue, s.count + ' transactions')}
      ${kpi('Gross profit', s.grossProfit, 'Revenue minus cost of goods', 'good')}
      ${kpi('Expenses', s.expenses, 'Operating costs today')}
      ${kpi('Net profit', s.netProfit, 'Gross profit minus expenses', s.netProfit < 0 ? 'bad' : 'good')}
    </div>
    <div class="grid two">
      <section class="card"><h2>Top-selling products</h2>${s.top.length ? `<table><tbody>${s.top.map(([n, q]) => `<tr><td>${esc(n)}</td><td class="num">${q} sold</td></tr>`).join('')}</tbody></table>` : empty('No sales yet today', 'Completed sales will appear here.')}</section>
      <section class="card"><h2>Low-stock alerts</h2>${s.low.length ? `<table><tbody>${s.low.map((p) => `<tr><td>${esc(p.name)}</td><td class="num"><span class="tag low">${p.stock} left</span></td></tr>`).join('')}</tbody></table>` : empty('Stock levels are healthy', 'Nothing is at or below its reorder level.')}</section>
    </div>
    <section class="card" style="margin-top:16px"><h2>Recent transactions</h2>${s.recent.length ? `<div class="tbl-wrap"><table><thead><tr><th>Ref</th><th>Time</th><th>Payment</th><th class="num">Total</th></tr></thead><tbody>${s.recent.map((t) => `<tr><td>${esc(t.id)}</td><td>${timeOf(t.createdAt)}</td><td>${esc(t.payments.map((p) => p.method).join(' + '))}</td><td class="num">${kes(t.total)}</td></tr>`).join('')}</tbody></table></div>` : empty('No transactions yet', 'Sales made at the POS will be listed here.')}</section>`;
}
