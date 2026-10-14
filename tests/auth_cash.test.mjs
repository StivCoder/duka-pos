import 'fake-indexeddb/auto';
import test from 'node:test'; import assert from 'node:assert/strict';
import { can, PERMS, ROLES, hashPin, validPin } from '../js/core/session.js';
import { cashSummary } from '../js/core/cashmath.js';
import { putMany, get, openShiftTx, renameCategoryTx } from '../js/core/db.js';
test('role permissions', () => {
  const s = (role) => ({ role });
  assert.ok(can('pos.sell', s('cashier'))); assert.ok(!can('pos.discount', s('cashier'))); assert.ok(can('pos.discount', s('supervisor')));
  assert.ok(!can('settings.edit', s('supervisor'))); assert.ok(can('settings.edit', s('admin'))); assert.ok(!can('pos.sell', null)); assert.ok(!can('unknown.perm', s('supervisor')));
  assert.ok(Object.values(PERMS).every((r) => ROLES.includes(r)));
});
test('pin hashing is salted and PIN format is enforced', async () => {
  assert.notEqual(await hashPin('1234', 'a'), await hashPin('1234', 'b')); assert.equal(await hashPin('1234', 'a'), await hashPin('1234', 'a'));
  assert.ok(validPin('1234') && validPin('123456')); assert.ok(!validPin('12') && !validPin('12ab') && !validPin('1234567'));
});
test('expected cash: float + cash sales + in - refunds - out - cash expenses +/- ledger; only inside the window; credit/M-Pesa ignored', () => {
  const shift = { openedAt: '2026-01-01T08:00:00.000Z', openingFloat: 50000, movements: [{ type: 'in', amount: 10000 }, { type: 'out', amount: 4000 }] }, now = '2026-01-01T18:00:00.000Z';
  const sales = [{ createdAt: '2026-01-01T09:00:00.000Z', payments: [{ method: 'cash', amount: 30000 }, { method: 'mpesa', amount: 99999 }], returns: [{ at: '2026-01-01T10:00:00.000Z', method: 'cash', refund: 5000 }, { at: '2026-01-01T10:30:00.000Z', method: 'mpesa', refund: 7000 }] }, { createdAt: '2025-12-31T09:00:00.000Z', payments: [{ method: 'cash', amount: 88888 }] }];
  const expenses = [{ method: 'cash', amount: 2000, createdAt: '2026-01-01T12:00:00.000Z', recordedAt: '2026-01-01T11:00:00.000Z' }, { method: 'mpesa', amount: 9000, createdAt: '2026-01-01T12:00:00.000Z' }];
  const ledger = [{ party: 'customers', method: 'cash', amount: 3000, at: '2026-01-01T13:00:00.000Z' }, { party: 'suppliers', method: 'cash', amount: 6000, at: '2026-01-01T14:00:00.000Z' }, { party: 'suppliers', method: 'mpesa', amount: 1, at: '2026-01-01T14:00:00.000Z' }];
  assert.equal(cashSummary(shift, { sales, expenses, ledger }, now).expected, 50000 + 30000 - 5000 + 10000 - 4000 - 2000 + 3000 - 6000);
});
test('only one shift can be open at a time', async () => {
  const sh = (id) => ({ id, status: 'open', openingFloat: 0, movements: [], openedAt: new Date().toISOString() });
  await openShiftTx(sh('A')); await assert.rejects(openShiftTx(sh('B')), /already open/);
  await putMany([{ store: 'shifts', value: { ...sh('A'), status: 'closed' } }]); await openShiftTx(sh('B'));
});
test('renaming a category updates products atomically and keeps names unique', async () => {
  await putMany([{ store: 'categories', value: { id: 'k1', name: 'Drinks' } }, { store: 'categories', value: { id: 'k2', name: 'Food' } }, { store: 'products', value: { id: 'p1', category: 'Drinks' } }]);
  await renameCategoryTx('k1', 'Beverages'); assert.equal((await get('products', 'p1')).category, 'Beverages'); assert.equal((await get('categories', 'k1')).name, 'Beverages');
  await assert.rejects(renameCategoryTx('k1', 'food'), /already has that name/); assert.equal((await get('products', 'p1')).category, 'Beverages');
});
