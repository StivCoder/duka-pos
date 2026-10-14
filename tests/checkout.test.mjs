import 'fake-indexeddb/auto';
import test from 'node:test'; import assert from 'node:assert/strict';
import { putMany, getAll, get, checkoutTx } from '../js/core/db.js';
import { computeTotals, settlePayments, validateProduct } from '../js/modules/calc.js';
const sale = (id, qty) => ({ id, items: [{ productId: 'a', name: 'Unga', qty, unitPrice: 100, unitCost: 80 }], total: qty * 100 });
test('checkout decrements stock once; duplicate id rejected', async () => {
  await putMany([{ store: 'products', value: { id: 'a', name: 'Unga', stock: 5, archived: false } }]);
  await checkoutTx(sale('S1', 2));
  assert.equal((await get('products', 'a')).stock, 3);
  await assert.rejects(checkoutTx(sale('S1', 2)), /already completed/);
  assert.equal((await get('products', 'a')).stock, 3);
});
test('oversell rejected and nothing is saved', async () => {
  await assert.rejects(checkoutTx(sale('S2', 9)), /Only 3/);
  assert.equal((await get('products', 'a')).stock, 3); assert.equal((await getAll('sales')).length, 1);
});
test('tax and discount maths', () => {
  assert.deepEqual(computeTotals({ lines: [{ qty: 1, unitPrice: 11600 }], taxRate: 16, taxInclusive: true }), { subtotal: 11600, discount: 0, tax: 1600, total: 11600 });
  assert.equal(computeTotals({ lines: [{ qty: 1, unitPrice: 10000 }], taxRate: 16, taxInclusive: false }).total, 11600);
  assert.equal(computeTotals({ lines: [{ qty: 2, unitPrice: 5000 }], discount: { type: 'percent', value: 10 } }).total, 9000);
  assert.equal(computeTotals({ lines: [{ qty: 1, unitPrice: 5000 }], discount: { type: 'amount', value: 99999 } }).total, 0);
});
test('payments: change, split, short, unverified mpesa', () => {
  assert.equal(settlePayments(8000, [{ method: 'cash', amount: 10000 }]).change, 2000);
  const s = settlePayments(8000, [{ method: 'mpesa', amount: 5000, ref: 'QWE123' }, { method: 'cash', amount: 3000 }]);
  assert.ok(s.ok); assert.equal(s.recorded.find((p) => p.method === 'mpesa').status, 'unverified');
  assert.equal(settlePayments(8000, [{ method: 'cash', amount: 7000 }]).ok, false);
  assert.equal(settlePayments(8000, [{ method: 'mpesa', amount: 8000, ref: '' }]).ok, false);
});
test('product validation', () => assert.match(validateProduct({ name: 'X', sku: 'A', price: 1, cost: 1, stock: 0, reorder: 0 }, [{ id: 'z', sku: 'a' }]), /SKU/));
import { adjustStockTx } from '../js/core/db.js';
test('stock adjustments are logged, set exact counts, and cannot go negative', async () => {
  await adjustStockTx('a', { value: -1, type: 'damaged', note: 'broken' });
  assert.equal((await get('products', 'a')).stock, 2);
  await adjustStockTx('a', { mode: 'set', value: 10, type: 'count', note: 'recount' });
  assert.equal((await get('products', 'a')).stock, 10);
  await assert.rejects(adjustStockTx('a', { value: -11, type: 'damaged', note: 'x' }), /below zero/);
  assert.equal((await get('products', 'a')).stock, 10);
  const mv = await getAll('movements'); assert.ok(mv.some((m) => m.type === 'sale' && m.qty === -2)); assert.ok(mv.some((m) => m.type === 'count' && m.balance === 10));
});
