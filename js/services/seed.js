import { get, putMany } from '../core/db.js';
// DEMO DATA ONLY. Prices are cents. Every record is flagged isDemo so it can be cleared later.
const P = [
  ['Unga Jogoo 2kg', 'Maize flour', 'packet', 21000, 18500, 40, 10], ['Sugar Mumias 1kg', 'Sugar', 'packet', 17500, 15500, 8, 12],
  ['Cooking Oil Fresh Fry 1L', 'Oils', 'bottle', 38000, 33000, 25, 8], ['Milk KCC 500ml', 'Dairy', 'packet', 6500, 5500, 60, 20],
  ['Bread Supaloaf 400g', 'Bakery', 'piece', 6500, 5600, 30, 10], ['Eggs (tray of 30)', 'Eggs', 'tray', 52000, 46000, 6, 4],
  ['Rice Pishori 1kg', 'Grains', 'kg', 24000, 20500, 35, 10], ['Tea Leaves Ketepa 250g', 'Beverages', 'packet', 14000, 11800, 22, 8],
  ['Soap Omo 500g', 'Household', 'packet', 21500, 18000, 3, 6], ['Toothpaste Colgate', 'Personal care', 'piece', 15000, 12500, 18, 6],
  ['Soda Coca-Cola 500ml', 'Beverages', 'bottle', 7000, 5500, 80, 24], ['Airtime Safaricom KSh 50', 'Services', 'piece', 5000, 4800, 100, 20],
];
export async function seedIfEmpty() {
  if (await get('meta', 'seeded')) return false;
  const products = P.map(([name, category, unit, price, cost, stock, reorder], i) => ({ id: 'p' + (i + 1), name, category, unit, price, cost, stock, reorder, archived: false, isDemo: true }));
  const now = Date.now(), sales = [];
  for (let i = 0; i < 14; i++) {
    const items = [0, 1, 2].slice(0, 1 + (i % 3)).map((k) => {
      const p = products[(i * 3 + k * 5) % products.length], qty = 1 + ((i + k) % 3);
      return { productId: p.id, name: p.name, qty, unitPrice: p.price, unitCost: p.cost };
    });
    const total = items.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const method = ['cash', 'mpesa', 'cash', 'card'][i % 4];
    sales.push({ id: 'DEMO-' + String(i + 1).padStart(4, '0'), createdAt: new Date(now - i * 47 * 60000).toISOString(), status: 'completed', items, total, payments: [{ method, amount: total }], isDemo: true });
  }
  const expenses = [{ id: 'e1', createdAt: new Date(now - 3600000).toISOString(), category: 'Transport', amount: 30000, method: 'cash', note: 'Stock delivery', isDemo: true }];
  await putMany([...products.map((value) => ({ store: 'products', value })), ...sales.map((value) => ({ store: 'sales', value })), ...expenses.map((value) => ({ store: 'expenses', value })), { store: 'meta', value: { key: 'seeded', at: new Date().toISOString() } }]);
  return true;
}
