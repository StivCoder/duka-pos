import { nairobiDayKey } from '../core/format.js';
/** Pure reporting maths. Revenue is net of tax and refunds; profit always uses COST, never selling price alone. */
const inRange = (d, from, to) => { const k = nairobiDayKey(d); return k >= from && k <= to; };
export function addDays(key, n) { const d = new Date(key + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function periodRange(kind, today, custom = {}) {
  if (kind === 'today') return [today, today];
  if (kind === 'yesterday') return [addDays(today, -1), addDays(today, -1)];
  if (kind === 'week') return [addDays(today, -((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7)), today]; // Monday start
  if (kind === 'month') return [today.slice(0, 8) + '01', today];
  const [a, b] = [custom.from || today, custom.to || today]; return a <= b ? [a, b] : [b, a];
}
export function summarizeRange({ sales, expenses, products }, from, to) {
  const mine = sales.filter((s) => inRange(s.createdAt, from, to)), live = mine.filter((s) => s.status !== 'cancelled');
  let revenue = 0, cogs = 0, refunds = 0; const byProduct = new Map(), payments = {}, byCategory = {};
  for (const s of mine) { revenue += s.total - (s.tax || 0); cogs += s.items.reduce((c, l) => c + Math.round(l.qty * l.unitCost), 0); }
  for (const s of sales) for (const r of s.returns || []) if (inRange(r.at, from, to)) { revenue -= r.refundNet; cogs -= r.cogsBack; refunds += r.refund; }
  for (const s of live) {
    const back = {}; for (const r of s.returns || []) for (const l of r.lines) back[l.productId] = (back[l.productId] || 0) + l.qty;
    for (const l of s.items) byProduct.set(l.name, (byProduct.get(l.name) || 0) + l.qty - (back[l.productId] || 0));
    for (const p of s.payments) payments[p.method] = (payments[p.method] || 0) + p.amount;
  }
  const exp = expenses.filter((e) => !e.voided && inRange(e.createdAt, from, to));
  for (const e of exp) byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  const expTotal = exp.reduce((s, e) => s + e.amount, 0);
  return {
    revenue, cogs, grossProfit: revenue - cogs, expenses: expTotal, netProfit: revenue - cogs - expTotal, refunds, count: live.length, payments, byCategory,
    top: [...byProduct].filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5),
    recent: live.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    low: products.filter((p) => !p.archived && p.stock <= p.reorder),
    stockValue: products.filter((p) => !p.archived).reduce((s, p) => s + Math.round(p.stock * p.cost), 0), sales: live,
  };
}
export const summarize = (data, day) => summarizeRange(data, day, day);
