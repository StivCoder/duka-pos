import 'fake-indexeddb/auto';
import test from 'node:test'; import assert from 'node:assert/strict';
import { putMany, get, getAll, checkoutTx, returnSaleTx } from '../js/core/db.js';
import { computeReturn } from '../js/core/returns.js'; import { periodRange, summarizeRange, addDays } from '../js/modules/summary.js';
const sale = { subtotal: 20000, discount: 2000, tax: 0, total: 18000, items: [{ productId: 'a', name: 'A', qty: 2, unitPrice: 10000, unitCost: 7000 }] };
test('refund is proportional (discount returned pro rata) and a full return equals the sale total', () => {
  assert.equal(computeReturn(sale, [{ productId: 'a', qty: 1 }]).refund, 9000);
  const full = computeReturn({ ...sale, returns: [{ lines: [{ productId: 'a', qty: 1 }], refund: 9000 }] }, [{ productId: 'a', qty: 1 }]); assert.equal(full.refund, 9000); assert.ok(full.fullyReturned);
  assert.throws(() => computeReturn(sale, [{ productId: 'a', qty: 3 }]), /more than was sold/); assert.throws(() => computeReturn(sale, []), /at least one/);
});
test('return flow: restock, status, audit, limits, cancel rules, customer points/credit', async () => {
  await putMany([{ store: 'products', value: { id: 'a', name: 'A', stock: 10, archived: false } }, { store: 'customers', value: { id: 'c1', name: 'W', creditBalance: 0, creditLimit: 100000, points: 0 } }]);
  const mk = (id, qty) => ({ id, status: 'completed', createdAt: new Date().toISOString(), customerId: 'c1', points: 2, subtotal: qty * 10000, discount: 0, tax: 0, total: qty * 10000, items: [{ productId: 'a', name: 'A', qty, unitPrice: 10000, unitCost: 7000 }], payments: [{ method: 'credit', amount: qty * 10000 }] });
  await checkoutTx(mk('S1', 2)); await checkoutTx(mk('S2', 1)); assert.equal((await get('products', 'a')).stock, 7);
  await returnSaleTx('S1', { picks: [{ productId: 'a', qty: 1 }], method: 'credit_balance', reason: 'wrong item' });
  assert.equal((await get('products', 'a')).stock, 8); assert.equal((await get('sales', 'S1')).status, 'partially_returned');
  assert.equal((await get('customers', 'c1')).creditBalance, 20000); // 30000 owed - 10000 refunded
  await assert.rejects(returnSaleTx('S1', { picks: [{ productId: 'a', qty: 2 }], method: 'cash', reason: 'x' }), /more than was sold/);
  await assert.rejects(returnSaleTx('S1', { cancel: true, method: 'cash', reason: 'x' }), /no earlier returns/);
  await assert.rejects(returnSaleTx('S2', { picks: [{ productId: 'a', qty: 1 }], method: 'cash', reason: ' ' }), /reason/);
  await returnSaleTx('S2', { cancel: true, method: 'credit_balance', reason: 'customer changed mind' });
  assert.equal((await get('sales', 'S2')).status, 'cancelled'); assert.equal((await get('products', 'a')).stock, 9);
  await assert.rejects(returnSaleTx('S2', { cancel: true, method: 'cash', reason: 'again' }), /already cancelled/);
  await returnSaleTx('S1', { picks: [{ productId: 'a', qty: 1 }], method: 'cash', reason: 'damaged', restock: false });
  assert.equal((await get('products', 'a')).stock, 9); assert.equal((await get('sales', 'S1')).status, 'returned');
  assert.equal((await getAll('audit')).length, 3);
});
test('periods and refund-aware reporting', () => {
  assert.deepEqual(periodRange('week', '2026-10-14'), ['2026-10-12', '2026-10-14']); assert.deepEqual(periodRange('month', '2026-10-14'), ['2026-10-01', '2026-10-14']);
  assert.deepEqual(periodRange('custom', '2026-10-14', { from: '2026-10-10', to: '2026-10-05' }), ['2026-10-05', '2026-10-10']); assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  const at = new Date().toISOString(), day = at.slice(0, 10), s = { status: 'partially_returned', createdAt: at, total: 20000, tax: 0, items: [{ productId: 'a', name: 'A', qty: 2, unitPrice: 10000, unitCost: 7000 }], payments: [{ method: 'cash', amount: 20000 }], returns: [{ at, refund: 10000, refundNet: 10000, cogsBack: 7000, lines: [{ productId: 'a', qty: 1 }] }] };
  const r = summarizeRange({ sales: [s], expenses: [], products: [] }, day, day); assert.equal(r.revenue, 10000); assert.equal(r.grossProfit, 3000); assert.deepEqual(r.top, [['A', 1]]);
});
