import test from 'node:test'; import assert from 'node:assert/strict';
import { summarize } from '../js/modules/summary.js'; import { kes, toCents } from '../js/core/format.js';
const now = new Date().toISOString(), day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
const sale = (status) => ({ id: 'a', createdAt: now, status, total: 20000, items: [{ name: 'X', qty: 2, unitPrice: 10000, unitCost: 7000 }], payments: [] });
test('profit uses cost, and net profit subtracts expenses', () => {
  const r = summarize({ sales: [sale('completed')], expenses: [{ createdAt: now, amount: 1000 }], products: [] }, day);
  assert.equal(r.revenue, 20000); assert.equal(r.grossProfit, 6000); assert.equal(r.netProfit, 5000);
});
test('a cancelled sale nets to zero once its refund is recorded', () => { const c = { ...sale('cancelled'), returns: [{ at: now, refund: 20000, refundNet: 20000, cogsBack: 14000, lines: [] }] }; const r = summarize({ sales: [c], expenses: [], products: [] }, day); assert.equal(r.revenue, 0); assert.equal(r.grossProfit, 0); assert.equal(r.count, 0); });
test('low stock detected at reorder level', () => assert.equal(summarize({ sales: [], expenses: [], products: [{ stock: 5, reorder: 5 }] }, day).low.length, 1));
test('money has no float drift', () => { assert.equal(toCents(19.99), 1999); assert.equal(kes(1999), 'KSh 19.99'); });
