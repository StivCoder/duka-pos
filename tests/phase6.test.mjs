import 'fake-indexeddb/auto';
import test from 'node:test'; import assert from 'node:assert/strict';
import { parseCsv, csvCell } from '../js/core/csv.js'; import { rowsToProducts } from '../js/modules/calc.js';
import { putMany, get, getAll, importProductsTx, restoreTx, STORES } from '../js/core/db.js'; import { summarizeRange } from '../js/modules/summary.js'; import { cashSummary } from '../js/core/cashmath.js';
test('csv: quotes, embedded commas/newlines, BOM, CRLF; unclosed quote rejected; formulas neutralised', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x,1","he said ""hi""\nbye"\r\n'), [['a', 'b'], ['x,1', 'he said "hi"\nbye']]);
  assert.throws(() => parseCsv('a,"b'), /unclosed/); assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"'); assert.equal(csvCell(-5), '"-5"'); assert.equal(csvCell('a"b'), '"a""b"');
});
test('product import reports bad rows, rejects duplicates and unknown units, converts to cents', () => {
  const rows = parseCsv('name,sku,unit,price,cost,stock\nA,S1,kg,10.50,8,3\nB,S1,kg,5,4,1\nC,,sack,5,4,1\nD,,piece,-1,4,1\nE,,piece,5,,1\nF,,,5,4,');
  const r = rowsToProducts(rows, [{ id: 'z', sku: 'zz' }]);
  assert.deepEqual(r.valid.map((p) => [p.name, p.price, p.cost, p.stock, p.unit]), [['A', 1050, 800, 3, 'kg'], ['F', 500, 400, 0, 'piece']]);
  assert.deepEqual(r.errors.map((e) => e.row), [3, 4, 5, 6]); assert.throws(() => rowsToProducts([['name', 'price']], []), /cost/);
});
test('import writes products, opening-stock movements and new categories together', async () => {
  await importProductsTx([{ id: 'i1', name: 'I', category: 'Snacks', stock: 4, price: 1, cost: 1 }, { id: 'i2', name: 'J', category: 'snacks', stock: 0, price: 1, cost: 1 }]);
  assert.equal((await getAll('products')).length, 2); assert.equal((await getAll('movements')).length, 1); assert.equal((await getAll('categories')).length, 1);
});
test('restore replaces everything; damaged or foreign files change nothing', async () => {
  await putMany([{ store: 'products', value: { id: 'keep', name: 'Old' } }]);
  await assert.rejects(restoreTx({ products: [{ name: 'no id' }] }), /damaged/); await assert.rejects(restoreTx({ hello: 1 }), /does not look like/); await assert.rejects(restoreTx(null), /does not look like/);
  assert.ok(await get('products', 'keep'));
  await restoreTx({ _format: 'dukapos-backup', products: [{ id: 'new', name: 'New' }], meta: [{ key: 'seeded' }] });
  assert.equal(await get('products', 'keep'), undefined); assert.equal((await get('products', 'new')).name, 'New'); assert.equal((await getAll('categories')).length, 0); assert.ok(STORES.includes('audit'));
});
test('voided expenses no longer count in profit or cash', () => {
  const at = new Date().toISOString(), day = at.slice(0, 10), ex = [{ createdAt: at, recordedAt: at, amount: 500, method: 'cash', category: 'X' }, { createdAt: at, recordedAt: at, amount: 900, method: 'cash', category: 'X', voided: true }];
  assert.equal(summarizeRange({ sales: [], expenses: ex, products: [] }, day, day).expenses, 500);
  assert.equal(cashSummary({ openedAt: '2000-01-01T00:00:00.000Z', openingFloat: 0, movements: [] }, { sales: [], expenses: ex, ledger: [] }, '2100-01-01T00:00:00.000Z').expenseCash, 500);
});
