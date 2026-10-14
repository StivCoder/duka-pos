import 'fake-indexeddb/auto';
import test from 'node:test'; import assert from 'node:assert/strict';
import { putMany, get, getAll, checkoutTx, receivePurchaseTx, settleBalanceTx } from '../js/core/db.js';
import { settlePayments, pointsFor, validatePurchase } from '../js/modules/calc.js';
const base = async () => putMany([{ store: 'products', value: { id: 'a', name: 'Unga', stock: 10, cost: 100, price: 150, archived: false } }, { store: 'suppliers', value: { id: 's1', name: 'Sup', balance: 0 } }, { store: 'customers', value: { id: 'c1', name: 'Wanjiku', creditBalance: 0, creditLimit: 500, points: 0 } }]);
const po = (id, qty, unitCost) => ({ id, supplierId: 's1', invoiceNo: 'INV1', status: 'ordered', total: qty * unitCost, lines: [{ productId: 'a', name: 'Unga', qty, unitCost }] });
test('receiving goods: stock, weighted-average cost, supplier balance, movement; no double receive', async () => {
  await base(); await putMany([{ store: 'purchases', value: po('P1', 10, 200) }]);
  await receivePurchaseTx('P1', 500);
  const p = await get('products', 'a'); assert.equal(p.stock, 20); assert.equal(p.cost, 150);
  assert.equal((await get('suppliers', 's1')).balance, 1500); assert.equal((await get('purchases', 'P1')).status, 'received');
  assert.ok((await getAll('movements')).some((m) => m.type === 'receive' && m.qty === 10));
  await assert.rejects(receivePurchaseTx('P1', 0), /not waiting/); assert.equal((await get('products', 'a')).stock, 20);
});
test('overpaying a purchase is rejected and changes nothing', async () => {
  await putMany([{ store: 'purchases', value: po('P2', 1, 100) }]);
  await assert.rejects(receivePurchaseTx('P2', 999), /exceed/); assert.equal((await get('purchases', 'P2')).status, 'ordered'); assert.equal((await get('products', 'a')).stock, 20);
});
test('supplier payments reduce balance, cannot exceed it', async () => {
  await settleBalanceTx({ store: 'suppliers', id: 's1', amount: 400, method: 'cash' }); assert.equal((await get('suppliers', 's1')).balance, 1100);
  await assert.rejects(settleBalanceTx({ store: 'suppliers', id: 's1', amount: 5000, method: 'cash' }), /more than/);
});
test('credit sale: limit enforced, balance and points updated atomically', async () => {
  const sale = (id, amt) => ({ id, customerId: 'c1', points: 1, items: [{ productId: 'a', name: 'Unga', qty: 1, unitPrice: amt }], total: amt, payments: [{ method: 'credit', amount: amt }] });
  await checkoutTx(sale('X1', 300)); let c = await get('customers', 'c1'); assert.equal(c.creditBalance, 300); assert.equal(c.points, 1);
  const stock = (await get('products', 'a')).stock;
  await assert.rejects(checkoutTx(sale('X2', 300)), /Credit limit/); assert.equal((await get('customers', 'c1')).creditBalance, 300); assert.equal((await get('products', 'a')).stock, stock);
  await settleBalanceTx({ store: 'customers', id: 'c1', amount: 300, method: 'mpesa' }); assert.equal((await get('customers', 'c1')).creditBalance, 0);
});
test('pure rules', () => {
  assert.equal(pointsFor(25000), 2); assert.equal(settlePayments(1000, [{ method: 'credit', amount: 1000 }]).ok, false);
  assert.equal(settlePayments(1000, [{ method: 'credit', amount: 1000 }], { customerId: 'c' }).recorded[0].status, 'on_account');
  assert.match(validatePurchase({ supplierId: 's', lines: [{ productId: 'a', qty: 0, unitCost: 1 }], total: 0 }), /quantity/);
});
