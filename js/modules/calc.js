import { toCents } from '../core/format.js';
// Pure business logic. All amounts are integer cents.
export function computeTotals({ lines, discount, taxRate = 0, taxInclusive = true }) {
  const subtotal = lines.reduce((s, l) => s + Math.round(l.qty * l.unitPrice), 0);
  let d = discount?.type === 'amount' ? Math.round(discount.value || 0) : Math.round(subtotal * (discount?.value || 0) / 100);
  d = Math.max(0, Math.min(d, subtotal));
  const net = subtotal - d;
  const tax = taxInclusive ? Math.round(net - net / (1 + taxRate / 100)) : Math.round(net * taxRate / 100);
  return { subtotal, discount: d, tax, total: taxInclusive ? net : net + tax };
}
/** Validates a split payment. M-Pesa/card are recorded as unverified/external, never "confirmed". */
export const pointsFor = (total) => Math.floor(total / 10000); // 1 loyalty point per KSh 100
export function settlePayments(total, pays, opts = {}) {
  const p = pays.filter((x) => x.amount > 0);
  if (!p.length) return { ok: false, error: 'Enter a payment amount.' };
  if (p.some((x) => x.method === 'credit') && !opts.customerId) return { ok: false, error: 'Select a customer to sell on credit.' };
  if (p.some((x) => x.method === 'mpesa' && !(x.ref || '').trim())) return { ok: false, error: 'Enter the M-Pesa transaction code.' };
  const other = p.filter((x) => x.method !== 'cash').reduce((s, x) => s + x.amount, 0);
  const cash = p.filter((x) => x.method === 'cash').reduce((s, x) => s + x.amount, 0);
  if (other > total) return { ok: false, error: 'Card/M-Pesa amounts exceed the total.' };
  const due = total - other;
  if (cash < due) return { ok: false, error: 'Short by ' + (due - cash) + ' cents', short: due - cash };
  const change = cash - due;
  const recorded = p.filter((x) => x.method !== 'cash').map((x) => ({ method: x.method, amount: x.amount, ref: (x.ref || '').trim(), status: x.method === 'mpesa' ? 'unverified' : x.method === 'credit' ? 'on_account' : 'external' }));
  if (due > 0) recorded.unshift({ method: 'cash', amount: due, status: 'received' });
  return { ok: true, change, tendered: cash, recorded };
}
export function validateProduct(f, others, selfId) {
  if (!f.name.trim()) return 'Product name is required.';
  if (!(f.price >= 0) || !(f.cost >= 0)) return 'Prices must be zero or more.';
  if (!(f.stock >= 0) || !(f.reorder >= 0)) return 'Stock figures must be zero or more.';
  const dup = (k) => f[k] && others.some((o) => o.id !== selfId && o[k] && o[k].toLowerCase() === f[k].toLowerCase());
  if (dup('sku')) return 'Another product already uses that SKU.';
  if (dup('barcode')) return 'Another product already uses that barcode.';
  return null;
}
export function validatePurchase({ supplierId, lines, total }, paid = 0) {
  if (!supplierId) return 'Choose a supplier.';
  if (!lines.length) return 'Add at least one product.';
  if (lines.some((l) => !l.productId || !(l.qty > 0))) return 'Every line needs a product and a quantity above zero.';
  if (lines.some((l) => !(l.unitCost >= 0))) return 'Unit costs cannot be negative.';
  if (new Set(lines.map((l) => l.productId)).size !== lines.length) return 'Each product can appear only once.';
  if (paid < 0 || paid > total) return 'Amount paid cannot exceed the purchase total.';
  return null;
}
export const UNITS = ['piece', 'packet', 'carton', 'kg', 'litre', 'tray', 'bottle'];
/** Turns parsed CSV rows into products, reporting every bad row instead of failing the whole file. */
export function rowsToProducts(rows, existing) {
  const head = (rows[0] || []).map((h) => h.trim().toLowerCase());
  for (const need of ['name', 'price', 'cost']) if (!head.includes(need)) throw new Error('Missing required column: ' + need);
  const valid = [], errors = [], at = (r, k) => (r[head.indexOf(k)] ?? '').trim();
  rows.slice(1).forEach((r, i) => {
    const row = i + 2, num = (k, d) => (at(r, k) === '' ? d : Number(at(r, k)));
    if (at(r, 'cost') === '') return errors.push({ row, msg: 'Cost price is required (profit depends on it).' });
    const unit = at(r, 'unit') || 'piece';
    if (!UNITS.includes(unit)) return errors.push({ row, msg: 'Unknown unit "' + unit + '".' });
    const f = { name: at(r, 'name'), sku: at(r, 'sku'), barcode: at(r, 'barcode'), unit, category: at(r, 'category'), price: toCents(num('price', NaN)), cost: toCents(num('cost', NaN)), stock: num('stock', 0), reorder: num('reorder', 5) };
    const bad = validateProduct(f, [...existing, ...valid], null); if (bad) return errors.push({ row, msg: bad });
    valid.push({ ...f, id: 'p' + Date.now().toString(36) + i.toString(36) + Math.random().toString(36).slice(2, 4), archived: false });
  });
  return { valid, errors };
}
