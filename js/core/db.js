import { computeReturn } from './returns.js';
const NAME = 'dukapos', VERSION = 5;
const STORES = ['products', 'sales', 'expenses', 'meta', 'movements', 'customers', 'suppliers', 'purchases', 'ledger', 'audit', 'users', 'shifts', 'categories'];
let dbp;
export function openDB() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export async function getAll(store) { const db = await openDB(); return wrap(db.transaction(store).objectStore(store).getAll()); }
export async function get(store, key) { const db = await openDB(); return wrap(db.transaction(store).objectStore(store).get(key)); }
/** Writes many records across stores in ONE transaction: all succeed or none do. */
export async function putMany(writes) {
  const db = await openDB();
  const names = [...new Set(writes.map((w) => w.store))];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    writes.forEach((w) => tx.objectStore(w.store).put(w.value));
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function put(store, value) { return putMany([{ store, value }]); }
export async function remove(store, key) { const db = await openDB(); return wrap(db.transaction(store, 'readwrite').objectStore(store).delete(key)); }
/** Atomic checkout: duplicate-ID check, stock check, stock decrement and sale save in ONE transaction. */
export async function checkoutTx(sale, allowNegative = false) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'sales', 'movements', 'customers'], 'readwrite');
    const sales = tx.objectStore('sales'), prods = tx.objectStore('products'), mv = tx.objectStore('movements'), custs = tx.objectStore('customers');
    let err = null;
    const fail = (m) => { err = new Error(m); try { tx.abort(); } catch { /* already aborted */ } };
    tx.oncomplete = () => resolve(sale);
    tx.onabort = () => reject(err || tx.error);
    sales.get(sale.id).onsuccess = (e) => {
      if (e.target.result) return fail('This sale (' + sale.id + ') was already completed.');
      let pending = sale.items.length + (sale.customerId ? 1 : 0);
      const done = () => { if (--pending === 0) sales.put(sale); };
      if (sale.customerId) custs.get(sale.customerId).onsuccess = (ev) => {
        const c = ev.target.result; if (!c) return fail('Customer not found.');
        const credit = sale.payments.filter((x) => x.method === 'credit').reduce((s, x) => s + x.amount, 0);
        if (credit > 0 && !(c.creditLimit > 0 && c.creditBalance + credit <= c.creditLimit)) return fail('Credit limit exceeded for ' + c.name + '.');
        c.creditBalance += credit; c.points = (c.points || 0) + (sale.points || 0); custs.put(c); done();
      };
      sale.items.forEach((l) => {
        prods.get(l.productId).onsuccess = (ev) => {
          const p = ev.target.result;
          if (!p || p.archived) return fail(l.name + ' is no longer available.');
          if (!allowNegative && p.stock < l.qty) return fail('Only ' + p.stock + ' of ' + l.name + ' in stock.');
          p.stock -= l.qty; prods.put(p);
          mv.put({ id: sale.id + ':' + l.productId, productId: l.productId, type: 'sale', qty: -l.qty, balance: p.stock, ref: sale.id, at: sale.createdAt });
          done();
        };
      });
    };
  });
}
/** Atomic stock change + movement record. mode 'delta' adds value; mode 'set' sets an exact counted quantity. */
export async function adjustStockTx(productId, { mode = 'delta', value, type, note = '' }) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'movements'], 'readwrite');
    let err = null, result = null;
    tx.oncomplete = () => resolve(result); tx.onabort = () => reject(err || tx.error);
    tx.objectStore('products').get(productId).onsuccess = (e) => {
      const p = e.target.result;
      if (!p) { err = new Error('Product not found.'); return tx.abort(); }
      const delta = mode === 'set' ? value - p.stock : value;
      if (p.stock + delta < 0) { err = new Error('Stock cannot go below zero.'); return tx.abort(); }
      p.stock += delta; tx.objectStore('products').put(p);
      result = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), productId, type, qty: delta, balance: p.stock, note, at: new Date().toISOString() };
      tx.objectStore('movements').put(result);
    };
  });
}
/** Receives a purchase order: stock up, weighted-average cost, supplier balance, movements: all-or-nothing. */
export async function receivePurchaseTx(id, paidNow = 0) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['purchases', 'products', 'movements', 'suppliers', 'ledger'], 'readwrite');
    const [pur, prods, mv, sups, led] = ['purchases', 'products', 'movements', 'suppliers', 'ledger'].map((n) => tx.objectStore(n));
    let err = null; const fail = (m) => { err = new Error(m); try { tx.abort(); } catch { /* aborted */ } };
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(err || tx.error);
    pur.get(id).onsuccess = (e) => {
      const p = e.target.result, at = new Date().toISOString();
      if (!p || p.status !== 'ordered') return fail('This purchase is not waiting to be received.');
      if (paidNow < 0 || paidNow > p.total) return fail('Amount paid cannot exceed the purchase total.');
      let pending = p.lines.length + 1;
      const done = () => { if (--pending === 0) pur.put({ ...p, status: 'received', paid: paidNow, receivedAt: at }); };
      p.lines.forEach((l) => { prods.get(l.productId).onsuccess = (ev) => {
        const pr = ev.target.result; if (!pr) return fail(l.name + ' no longer exists.');
        const base = Math.max(pr.stock, 0), stock = pr.stock + l.qty;
        pr.cost = Math.round((base * pr.cost + l.qty * l.unitCost) / (base + l.qty)); pr.stock = stock; prods.put(pr);
        mv.put({ id: 'rcv:' + id + ':' + l.productId, productId: l.productId, type: 'receive', qty: l.qty, balance: stock, ref: p.invoiceNo || id, at }); done();
      }; });
      sups.get(p.supplierId).onsuccess = (ev) => {
        const s = ev.target.result; if (!s) return fail('Supplier no longer exists.');
        s.balance += p.total - paidNow; sups.put(s);
        if (paidNow > 0) led.put({ id: 'l' + Date.now().toString(36) + 'p', party: 'suppliers', partyId: s.id, amount: paidNow, method: 'at receipt', note: 'Paid on ' + id, at });
        done();
      };
    };
  });
}
/** Records a payment against a customer's credit or a supplier's balance. */
export async function settleBalanceTx({ store, id, amount, method, note = '' }) {
  const field = store === 'customers' ? 'creditBalance' : 'balance', db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([store, 'ledger'], 'readwrite'); let err = null;
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(err || tx.error);
    tx.objectStore(store).get(id).onsuccess = (e) => {
      const r = e.target.result, bad = !r ? 'Record not found.' : !(amount > 0) ? 'Enter an amount above zero.' : amount > r[field] ? 'Amount is more than the balance owed.' : '';
      if (bad) { err = new Error(bad); return tx.abort(); }
      r[field] -= amount; tx.objectStore(store).put(r);
      tx.objectStore('ledger').put({ id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), party: store, partyId: id, amount, method, note, at: new Date().toISOString() });
    };
  });
}
/** Return / cancel a sale: refund maths, restock, customer points/credit, audit record: all-or-nothing. */
export async function returnSaleTx(saleId, { picks, restock = true, method, reason, cancel = false, by = 'local' }) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const names = ['sales', 'products', 'movements', 'customers', 'audit'], tx = db.transaction(names, 'readwrite');
    const [sales, prods, mv, custs, audit] = names.map((n) => tx.objectStore(n));
    let err = null; const fail = (m) => { err = new Error(m); try { tx.abort(); } catch { /* aborted */ } };
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(err || tx.error);
    sales.get(saleId).onsuccess = (e) => {
      const s = e.target.result, at = new Date().toISOString();
      if (!s) return fail('Sale not found.');
      if (s.status === 'cancelled') return fail('This sale was already cancelled.');
      if (!(reason || '').trim()) return fail('A reason is required.');
      if (cancel && (s.returns || []).length) return fail('Only sales with no earlier returns can be cancelled. Use a return instead.');
      if (method === 'credit_balance' && !s.customerId) return fail('This sale has no customer account.');
      let r; try { r = computeReturn(s, cancel ? s.items.map((l) => ({ productId: l.productId, qty: l.qty })) : picks, restock); } catch (x) { return fail(x.message); }
      const rid = 'R-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
      let pending = (restock ? r.lines.length : 0) + (s.customerId ? 1 : 0);
      const finish = () => {
        if (--pending > 0) return;
        const status = r.fullyReturned ? (cancel ? 'cancelled' : 'returned') : 'partially_returned';
        s.returns = [...(s.returns || []), { id: rid, at, lines: r.lines.map(({ productId, name, qty, refund }) => ({ productId, name, qty, refund })), refund: r.refund, refundNet: r.refundNet, cogsBack: r.cogsBack, restock, method, reason: reason.trim() }];
        sales.put({ ...s, status });
        audit.put({ id: rid, at, action: cancel ? 'cancel' : 'return', saleId, refund: r.refund, method, reason: reason.trim(), user: by });
      };
      pending += 0; if (pending === 0) { pending = 1; finish(); return; }
      if (restock) r.lines.forEach((l) => { prods.get(l.productId).onsuccess = (ev) => {
        const p = ev.target.result; if (!p) return fail(l.name + ' no longer exists.');
        p.stock += l.qty; prods.put(p);
        mv.put({ id: 'ret:' + rid + ':' + l.productId, productId: l.productId, type: 'return', qty: l.qty, balance: p.stock, ref: saleId, note: reason.trim(), at }); finish();
      }; });
      if (s.customerId) custs.get(s.customerId).onsuccess = (ev) => {
        const c = ev.target.result; if (!c) return fail('Customer not found.');
        if (method === 'credit_balance') c.creditBalance = Math.max(0, c.creditBalance - r.refund);
        c.points = Math.max(0, (c.points || 0) - Math.floor((s.points || 0) * r.refund / (s.total || 1))); custs.put(c); finish();
      };
    };
  });
}
/** Opens a cash shift; refuses if one is already open (one till). */
export async function openShiftTx(shift) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shifts', 'readwrite'), st = tx.objectStore('shifts'); let err = null;
    tx.oncomplete = () => resolve(shift); tx.onabort = () => reject(err || tx.error);
    st.getAll().onsuccess = (e) => { if (e.target.result.some((s) => s.status === 'open')) { err = new Error('A shift is already open. Close it first.'); return tx.abort(); } st.put(shift); };
  });
}
/** Renames a category and every product using it, atomically. Names are unique (case-insensitive). */
export async function renameCategoryTx(id, newName) {
  const db = await openDB(), name = newName.trim();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['categories', 'products'], 'readwrite'), cats = tx.objectStore('categories'), prods = tx.objectStore('products'); let err = null;
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(err || tx.error);
    cats.getAll().onsuccess = (e) => {
      const all = e.target.result, c = all.find((x) => x.id === id);
      if (!c) { err = new Error('Category not found.'); return tx.abort(); }
      if (!name) { err = new Error('Name is required.'); return tx.abort(); }
      if (all.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) { err = new Error('Another category already has that name.'); return tx.abort(); }
      cats.put({ ...c, name });
      prods.getAll().onsuccess = (ev) => ev.target.result.filter((p) => p.category === c.name).forEach((p) => prods.put({ ...p, category: name }));
    };
  });
}
/** Imports products with opening-stock movements and any new categories, all-or-nothing. */
export async function importProductsTx(products) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['products', 'movements', 'categories'], 'readwrite'), at = new Date().toISOString();
    tx.oncomplete = () => resolve(products.length); tx.onabort = tx.onerror = () => reject(tx.error);
    const cats = tx.objectStore('categories');
    cats.getAll().onsuccess = (e) => {
      const have = new Set(e.target.result.map((c) => c.name.toLowerCase()));
      for (const n of products.map((p) => p.category).filter(Boolean)) if (!have.has(n.toLowerCase())) { have.add(n.toLowerCase()); cats.put({ id: 'k' + Math.random().toString(36).slice(2, 9), name: n, parentId: null }); }
    };
    products.forEach((p) => { tx.objectStore('products').put(p); if (p.stock) tx.objectStore('movements').put({ id: 'open:' + p.id, productId: p.id, type: 'opening', qty: p.stock, balance: p.stock, note: 'CSV import', at }); });
  });
}
/** Replaces ALL data with a backup. The file is fully validated first; the swap itself is one transaction. */
export async function restoreTx(data) {
  if (!data || typeof data !== 'object' || !STORES.some((s) => Array.isArray(data[s]))) throw new Error('This file does not look like a DukaPOS backup.');
  for (const s of STORES) for (const r of data[s] || []) { const k = s === 'meta' ? 'key' : 'id'; if (!r || typeof r !== 'object' || r[k] == null) throw new Error('Backup is damaged: a record in "' + s + '" has no ' + k + '. Nothing was changed.'); }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    STORES.forEach((s) => { const st = tx.objectStore(s); st.clear(); (data[s] || []).forEach((r) => st.put(r)); });
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
export { STORES };
