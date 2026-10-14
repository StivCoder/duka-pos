(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __glob = (map) => (path) => {
    var fn = map[path];
    if (fn) return fn();
    throw new Error("Module not found in bundle: " + path);
  };
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // js/core/format.js
  var TZ, money, toCents, kes, nairobiDayKey, timeOf, esc;
  var init_format = __esm({
    "js/core/format.js"() {
      TZ = "Africa/Nairobi";
      money = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      toCents = (shillings) => Math.round(Number(shillings) * 100);
      kes = (cents) => "KSh " + money.format((cents || 0) / 100);
      nairobiDayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(d));
      timeOf = (d) => new Intl.DateTimeFormat("en-KE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d));
      esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    }
  });

  // js/core/returns.js
  function remainingQty(sale, productId) {
    const sold = sale.items.find((l) => l.productId === productId)?.qty || 0;
    const back = (sale.returns || []).flatMap((r) => r.lines).filter((l) => l.productId === productId).reduce((s, l) => s + l.qty, 0);
    return sold - back;
  }
  function computeReturn(sale, picks, restock = true) {
    const chosen = picks.filter((p) => p.qty > 0);
    if (!chosen.length) throw new Error("Choose at least one item to return.");
    const subtotal = sale.subtotal || sale.items.reduce((s, l) => s + Math.round(l.qty * l.unitPrice), 0), ratio = subtotal > 0 ? sale.total / subtotal : 1;
    const lines = chosen.map((p) => {
      const l = sale.items.find((x) => x.productId === p.productId);
      if (!l) throw new Error("Item was not on this sale.");
      if (p.qty > remainingQty(sale, p.productId)) throw new Error("Cannot return more than was sold of " + l.name + ".");
      return { productId: l.productId, name: l.name, qty: p.qty, refund: Math.round(p.qty * l.unitPrice * ratio), cost: Math.round(p.qty * l.unitCost) };
    });
    const prior = (sale.returns || []).reduce((s, r) => s + r.refund, 0);
    const fullyReturned = sale.items.every((l) => remainingQty(sale, l.productId) === (chosen.find((p) => p.productId === l.productId)?.qty || 0));
    let refund = lines.reduce((s, l) => s + l.refund, 0);
    if (fullyReturned) refund = sale.total - prior;
    const refundNet = sale.total > 0 ? Math.round(refund * (sale.total - (sale.tax || 0)) / sale.total) : 0;
    return { lines, refund, refundNet, cogsBack: restock ? lines.reduce((s, l) => s + l.cost, 0) : 0, fullyReturned };
  }
  var init_returns = __esm({
    "js/core/returns.js"() {
    }
  });

  // js/core/db.js
  function openDB() {
    dbp ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === "meta" ? "key" : "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  async function getAll(store) {
    const db = await openDB();
    return wrap(db.transaction(store).objectStore(store).getAll());
  }
  async function get(store, key) {
    const db = await openDB();
    return wrap(db.transaction(store).objectStore(store).get(key));
  }
  async function putMany(writes) {
    const db = await openDB();
    const names = [...new Set(writes.map((w) => w.store))];
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, "readwrite");
      writes.forEach((w) => tx.objectStore(w.store).put(w.value));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async function put(store, value) {
    return putMany([{ store, value }]);
  }
  async function remove(store, key) {
    const db = await openDB();
    return wrap(db.transaction(store, "readwrite").objectStore(store).delete(key));
  }
  async function checkoutTx(sale, allowNegative = false) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["products", "sales", "movements", "customers"], "readwrite");
      const sales = tx.objectStore("sales"), prods = tx.objectStore("products"), mv = tx.objectStore("movements"), custs = tx.objectStore("customers");
      let err = null;
      const fail = (m) => {
        err = new Error(m);
        try {
          tx.abort();
        } catch {
        }
      };
      tx.oncomplete = () => resolve(sale);
      tx.onabort = () => reject(err || tx.error);
      sales.get(sale.id).onsuccess = (e) => {
        if (e.target.result) return fail("This sale (" + sale.id + ") was already completed.");
        let pending = sale.items.length + (sale.customerId ? 1 : 0);
        const done = () => {
          if (--pending === 0) sales.put(sale);
        };
        if (sale.customerId) custs.get(sale.customerId).onsuccess = (ev) => {
          const c = ev.target.result;
          if (!c) return fail("Customer not found.");
          const credit = sale.payments.filter((x) => x.method === "credit").reduce((s, x) => s + x.amount, 0);
          if (credit > 0 && !(c.creditLimit > 0 && c.creditBalance + credit <= c.creditLimit)) return fail("Credit limit exceeded for " + c.name + ".");
          c.creditBalance += credit;
          c.points = (c.points || 0) + (sale.points || 0);
          custs.put(c);
          done();
        };
        sale.items.forEach((l) => {
          prods.get(l.productId).onsuccess = (ev) => {
            const p = ev.target.result;
            if (!p || p.archived) return fail(l.name + " is no longer available.");
            if (!allowNegative && p.stock < l.qty) return fail("Only " + p.stock + " of " + l.name + " in stock.");
            p.stock -= l.qty;
            prods.put(p);
            mv.put({ id: sale.id + ":" + l.productId, productId: l.productId, type: "sale", qty: -l.qty, balance: p.stock, ref: sale.id, at: sale.createdAt });
            done();
          };
        });
      };
    });
  }
  async function adjustStockTx(productId, { mode = "delta", value, type, note = "" }) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["products", "movements"], "readwrite");
      let err = null, result = null;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(err || tx.error);
      tx.objectStore("products").get(productId).onsuccess = (e) => {
        const p = e.target.result;
        if (!p) {
          err = new Error("Product not found.");
          return tx.abort();
        }
        const delta = mode === "set" ? value - p.stock : value;
        if (p.stock + delta < 0) {
          err = new Error("Stock cannot go below zero.");
          return tx.abort();
        }
        p.stock += delta;
        tx.objectStore("products").put(p);
        result = { id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), productId, type, qty: delta, balance: p.stock, note, at: (/* @__PURE__ */ new Date()).toISOString() };
        tx.objectStore("movements").put(result);
      };
    });
  }
  async function receivePurchaseTx(id, paidNow = 0) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["purchases", "products", "movements", "suppliers", "ledger"], "readwrite");
      const [pur, prods, mv, sups, led] = ["purchases", "products", "movements", "suppliers", "ledger"].map((n) => tx.objectStore(n));
      let err = null;
      const fail = (m) => {
        err = new Error(m);
        try {
          tx.abort();
        } catch {
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(err || tx.error);
      pur.get(id).onsuccess = (e) => {
        const p = e.target.result, at = (/* @__PURE__ */ new Date()).toISOString();
        if (!p || p.status !== "ordered") return fail("This purchase is not waiting to be received.");
        if (paidNow < 0 || paidNow > p.total) return fail("Amount paid cannot exceed the purchase total.");
        let pending = p.lines.length + 1;
        const done = () => {
          if (--pending === 0) pur.put({ ...p, status: "received", paid: paidNow, receivedAt: at });
        };
        p.lines.forEach((l) => {
          prods.get(l.productId).onsuccess = (ev) => {
            const pr = ev.target.result;
            if (!pr) return fail(l.name + " no longer exists.");
            const base = Math.max(pr.stock, 0), stock = pr.stock + l.qty;
            pr.cost = Math.round((base * pr.cost + l.qty * l.unitCost) / (base + l.qty));
            pr.stock = stock;
            prods.put(pr);
            mv.put({ id: "rcv:" + id + ":" + l.productId, productId: l.productId, type: "receive", qty: l.qty, balance: stock, ref: p.invoiceNo || id, at });
            done();
          };
        });
        sups.get(p.supplierId).onsuccess = (ev) => {
          const s = ev.target.result;
          if (!s) return fail("Supplier no longer exists.");
          s.balance += p.total - paidNow;
          sups.put(s);
          if (paidNow > 0) led.put({ id: "l" + Date.now().toString(36) + "p", party: "suppliers", partyId: s.id, amount: paidNow, method: "at receipt", note: "Paid on " + id, at });
          done();
        };
      };
    });
  }
  async function settleBalanceTx({ store, id, amount, method, note = "" }) {
    const field = store === "customers" ? "creditBalance" : "balance", db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([store, "ledger"], "readwrite");
      let err = null;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(err || tx.error);
      tx.objectStore(store).get(id).onsuccess = (e) => {
        const r = e.target.result, bad = !r ? "Record not found." : !(amount > 0) ? "Enter an amount above zero." : amount > r[field] ? "Amount is more than the balance owed." : "";
        if (bad) {
          err = new Error(bad);
          return tx.abort();
        }
        r[field] -= amount;
        tx.objectStore(store).put(r);
        tx.objectStore("ledger").put({ id: "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), party: store, partyId: id, amount, method, note, at: (/* @__PURE__ */ new Date()).toISOString() });
      };
    });
  }
  async function returnSaleTx(saleId, { picks, restock = true, method, reason, cancel = false, by = "local" }) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const names = ["sales", "products", "movements", "customers", "audit"], tx = db.transaction(names, "readwrite");
      const [sales, prods, mv, custs, audit] = names.map((n) => tx.objectStore(n));
      let err = null;
      const fail = (m) => {
        err = new Error(m);
        try {
          tx.abort();
        } catch {
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(err || tx.error);
      sales.get(saleId).onsuccess = (e) => {
        const s = e.target.result, at = (/* @__PURE__ */ new Date()).toISOString();
        if (!s) return fail("Sale not found.");
        if (s.status === "cancelled") return fail("This sale was already cancelled.");
        if (!(reason || "").trim()) return fail("A reason is required.");
        if (cancel && (s.returns || []).length) return fail("Only sales with no earlier returns can be cancelled. Use a return instead.");
        if (method === "credit_balance" && !s.customerId) return fail("This sale has no customer account.");
        let r;
        try {
          r = computeReturn(s, cancel ? s.items.map((l) => ({ productId: l.productId, qty: l.qty })) : picks, restock);
        } catch (x) {
          return fail(x.message);
        }
        const rid = "R-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
        let pending = (restock ? r.lines.length : 0) + (s.customerId ? 1 : 0);
        const finish = () => {
          if (--pending > 0) return;
          const status = r.fullyReturned ? cancel ? "cancelled" : "returned" : "partially_returned";
          s.returns = [...s.returns || [], { id: rid, at, lines: r.lines.map(({ productId, name, qty, refund }) => ({ productId, name, qty, refund })), refund: r.refund, refundNet: r.refundNet, cogsBack: r.cogsBack, restock, method, reason: reason.trim() }];
          sales.put({ ...s, status });
          audit.put({ id: rid, at, action: cancel ? "cancel" : "return", saleId, refund: r.refund, method, reason: reason.trim(), user: by });
        };
        pending += 0;
        if (pending === 0) {
          pending = 1;
          finish();
          return;
        }
        if (restock) r.lines.forEach((l) => {
          prods.get(l.productId).onsuccess = (ev) => {
            const p = ev.target.result;
            if (!p) return fail(l.name + " no longer exists.");
            p.stock += l.qty;
            prods.put(p);
            mv.put({ id: "ret:" + rid + ":" + l.productId, productId: l.productId, type: "return", qty: l.qty, balance: p.stock, ref: saleId, note: reason.trim(), at });
            finish();
          };
        });
        if (s.customerId) custs.get(s.customerId).onsuccess = (ev) => {
          const c = ev.target.result;
          if (!c) return fail("Customer not found.");
          if (method === "credit_balance") c.creditBalance = Math.max(0, c.creditBalance - r.refund);
          c.points = Math.max(0, (c.points || 0) - Math.floor((s.points || 0) * r.refund / (s.total || 1)));
          custs.put(c);
          finish();
        };
      };
    });
  }
  async function openShiftTx(shift) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("shifts", "readwrite"), st = tx.objectStore("shifts");
      let err = null;
      tx.oncomplete = () => resolve(shift);
      tx.onabort = () => reject(err || tx.error);
      st.getAll().onsuccess = (e) => {
        if (e.target.result.some((s) => s.status === "open")) {
          err = new Error("A shift is already open. Close it first.");
          return tx.abort();
        }
        st.put(shift);
      };
    });
  }
  async function renameCategoryTx(id, newName) {
    const db = await openDB(), name = newName.trim();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["categories", "products"], "readwrite"), cats = tx.objectStore("categories"), prods = tx.objectStore("products");
      let err = null;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(err || tx.error);
      cats.getAll().onsuccess = (e) => {
        const all = e.target.result, c = all.find((x) => x.id === id);
        if (!c) {
          err = new Error("Category not found.");
          return tx.abort();
        }
        if (!name) {
          err = new Error("Name is required.");
          return tx.abort();
        }
        if (all.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) {
          err = new Error("Another category already has that name.");
          return tx.abort();
        }
        cats.put({ ...c, name });
        prods.getAll().onsuccess = (ev) => ev.target.result.filter((p) => p.category === c.name).forEach((p) => prods.put({ ...p, category: name }));
      };
    });
  }
  async function importProductsTx(products) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["products", "movements", "categories"], "readwrite"), at = (/* @__PURE__ */ new Date()).toISOString();
      tx.oncomplete = () => resolve(products.length);
      tx.onabort = tx.onerror = () => reject(tx.error);
      const cats = tx.objectStore("categories");
      cats.getAll().onsuccess = (e) => {
        const have = new Set(e.target.result.map((c) => c.name.toLowerCase()));
        for (const n of products.map((p) => p.category).filter(Boolean)) if (!have.has(n.toLowerCase())) {
          have.add(n.toLowerCase());
          cats.put({ id: "k" + Math.random().toString(36).slice(2, 9), name: n, parentId: null });
        }
      };
      products.forEach((p) => {
        tx.objectStore("products").put(p);
        if (p.stock) tx.objectStore("movements").put({ id: "open:" + p.id, productId: p.id, type: "opening", qty: p.stock, balance: p.stock, note: "CSV import", at });
      });
    });
  }
  async function restoreTx(data) {
    if (!data || typeof data !== "object" || !STORES.some((s) => Array.isArray(data[s]))) throw new Error("This file does not look like a DukaPOS backup.");
    for (const s of STORES) for (const r of data[s] || []) {
      const k = s === "meta" ? "key" : "id";
      if (!r || typeof r !== "object" || r[k] == null) throw new Error('Backup is damaged: a record in "' + s + '" has no ' + k + ". Nothing was changed.");
    }
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES, "readwrite");
      STORES.forEach((s) => {
        const st = tx.objectStore(s);
        st.clear();
        (data[s] || []).forEach((r) => st.put(r));
      });
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  }
  var NAME, VERSION, STORES, dbp, wrap;
  var init_db = __esm({
    "js/core/db.js"() {
      init_returns();
      NAME = "dukapos";
      VERSION = 5;
      STORES = ["products", "sales", "expenses", "meta", "movements", "customers", "suppliers", "purchases", "ledger", "audit", "users", "shifts", "categories"];
      wrap = (r) => new Promise((res, rej) => {
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
  });

  // js/core/session.js
  async function hashPin(pin, salt) {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pin));
    return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  var ROLES, PERMS, KEY, TTL, getSession, setSession, clearSession, can, validPin, newSalt;
  var init_session = __esm({
    "js/core/session.js"() {
      ROLES = ["cashier", "supervisor", "admin"];
      PERMS = { "pos.sell": "cashier", "pos.discount": "supervisor", "products.view": "cashier", "products.edit": "supervisor", "categories.manage": "supervisor", "inventory.view": "cashier", "inventory.adjust": "supervisor", "sales.view": "cashier", "sales.return": "supervisor", "sales.cancel": "supervisor", "customers.manage": "cashier", "suppliers.manage": "supervisor", "purchases.manage": "supervisor", "expenses.manage": "supervisor", "cash.manage": "cashier", "reports.view": "supervisor", "users.manage": "admin", "settings.edit": "admin" };
      KEY = "dukapos.session";
      TTL = 12 * 36e5;
      getSession = () => {
        try {
          const s = JSON.parse(localStorage.getItem(KEY));
          return s && Date.now() - s.at < TTL ? s : null;
        } catch {
          return null;
        }
      };
      setSession = (u) => localStorage.setItem(KEY, JSON.stringify({ userId: u.id, name: u.name, role: u.role, at: Date.now() }));
      clearSession = () => localStorage.removeItem(KEY);
      can = (perm, s = getSession()) => !!s && ROLES.indexOf(s.role) >= ROLES.indexOf(PERMS[perm] ?? "admin");
      validPin = (p) => /^\d{4,6}$/.test(p);
      newSalt = () => crypto.randomUUID();
    }
  });

  // js/modules/calc.js
  var calc_exports = {};
  __export(calc_exports, {
    UNITS: () => UNITS,
    computeTotals: () => computeTotals,
    pointsFor: () => pointsFor,
    rowsToProducts: () => rowsToProducts,
    settlePayments: () => settlePayments,
    validateProduct: () => validateProduct,
    validatePurchase: () => validatePurchase
  });
  function computeTotals({ lines, discount, taxRate = 0, taxInclusive = true }) {
    const subtotal = lines.reduce((s, l) => s + Math.round(l.qty * l.unitPrice), 0);
    let d = discount?.type === "amount" ? Math.round(discount.value || 0) : Math.round(subtotal * (discount?.value || 0) / 100);
    d = Math.max(0, Math.min(d, subtotal));
    const net = subtotal - d;
    const tax = taxInclusive ? Math.round(net - net / (1 + taxRate / 100)) : Math.round(net * taxRate / 100);
    return { subtotal, discount: d, tax, total: taxInclusive ? net : net + tax };
  }
  function settlePayments(total, pays, opts2 = {}) {
    const p = pays.filter((x) => x.amount > 0);
    if (!p.length) return { ok: false, error: "Enter a payment amount." };
    if (p.some((x) => x.method === "credit") && !opts2.customerId) return { ok: false, error: "Select a customer to sell on credit." };
    if (p.some((x) => x.method === "mpesa" && !(x.ref || "").trim())) return { ok: false, error: "Enter the M-Pesa transaction code." };
    const other = p.filter((x) => x.method !== "cash").reduce((s, x) => s + x.amount, 0);
    const cash = p.filter((x) => x.method === "cash").reduce((s, x) => s + x.amount, 0);
    if (other > total) return { ok: false, error: "Card/M-Pesa amounts exceed the total." };
    const due = total - other;
    if (cash < due) return { ok: false, error: "Short by " + (due - cash) + " cents", short: due - cash };
    const change = cash - due;
    const recorded = p.filter((x) => x.method !== "cash").map((x) => ({ method: x.method, amount: x.amount, ref: (x.ref || "").trim(), status: x.method === "mpesa" ? "unverified" : x.method === "credit" ? "on_account" : "external" }));
    if (due > 0) recorded.unshift({ method: "cash", amount: due, status: "received" });
    return { ok: true, change, tendered: cash, recorded };
  }
  function validateProduct(f, others, selfId) {
    if (!f.name.trim()) return "Product name is required.";
    if (!(f.price >= 0) || !(f.cost >= 0)) return "Prices must be zero or more.";
    if (!(f.stock >= 0) || !(f.reorder >= 0)) return "Stock figures must be zero or more.";
    const dup = (k) => f[k] && others.some((o) => o.id !== selfId && o[k] && o[k].toLowerCase() === f[k].toLowerCase());
    if (dup("sku")) return "Another product already uses that SKU.";
    if (dup("barcode")) return "Another product already uses that barcode.";
    return null;
  }
  function validatePurchase({ supplierId, lines, total }, paid = 0) {
    if (!supplierId) return "Choose a supplier.";
    if (!lines.length) return "Add at least one product.";
    if (lines.some((l) => !l.productId || !(l.qty > 0))) return "Every line needs a product and a quantity above zero.";
    if (lines.some((l) => !(l.unitCost >= 0))) return "Unit costs cannot be negative.";
    if (new Set(lines.map((l) => l.productId)).size !== lines.length) return "Each product can appear only once.";
    if (paid < 0 || paid > total) return "Amount paid cannot exceed the purchase total.";
    return null;
  }
  function rowsToProducts(rows, existing) {
    const head = (rows[0] || []).map((h) => h.trim().toLowerCase());
    for (const need of ["name", "price", "cost"]) if (!head.includes(need)) throw new Error("Missing required column: " + need);
    const valid = [], errors = [], at = (r, k) => (r[head.indexOf(k)] ?? "").trim();
    rows.slice(1).forEach((r, i) => {
      const row = i + 2, num = (k, d) => at(r, k) === "" ? d : Number(at(r, k));
      if (at(r, "cost") === "") return errors.push({ row, msg: "Cost price is required (profit depends on it)." });
      const unit = at(r, "unit") || "piece";
      if (!UNITS.includes(unit)) return errors.push({ row, msg: 'Unknown unit "' + unit + '".' });
      const f = { name: at(r, "name"), sku: at(r, "sku"), barcode: at(r, "barcode"), unit, category: at(r, "category"), price: toCents(num("price", NaN)), cost: toCents(num("cost", NaN)), stock: num("stock", 0), reorder: num("reorder", 5) };
      const bad = validateProduct(f, [...existing, ...valid], null);
      if (bad) return errors.push({ row, msg: bad });
      valid.push({ ...f, id: "p" + Date.now().toString(36) + i.toString(36) + Math.random().toString(36).slice(2, 4), archived: false });
    });
    return { valid, errors };
  }
  var pointsFor, UNITS;
  var init_calc = __esm({
    "js/modules/calc.js"() {
      init_format();
      pointsFor = (total) => Math.floor(total / 1e4);
      UNITS = ["piece", "packet", "carton", "kg", "litre", "tray", "bottle"];
    }
  });

  // js/core/ui.js
  function openDialog(html) {
    const d = document.createElement("dialog");
    d.innerHTML = html;
    document.body.appendChild(d);
    d.addEventListener("close", () => d.remove());
    d.showModal();
    return d;
  }
  function toast(msg, type = "") {
    const box = document.getElementById("toasts") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "toasts" }));
    const t = Object.assign(document.createElement("div"), { className: "toast " + type, textContent: msg });
    box.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }
  function confirmDialog(msg) {
    return new Promise((resolve) => {
      const d = openDialog(`<p>${msg}</p><div class="row"><button class="btn" data-v="0">Cancel</button><button class="btn pri" data-v="1">Confirm</button></div>`);
      d.addEventListener("click", (e) => {
        const v = e.target.dataset?.v;
        if (v !== void 0) {
          resolve(v === "1");
          d.close();
        }
      });
      d.addEventListener("cancel", () => resolve(false));
    });
  }
  var init_ui = __esm({
    "js/core/ui.js"() {
    }
  });

  // js/core/cashmath.js
  function cashSummary(shift, { sales, expenses, ledger }, nowIso) {
    const to = shift.closedAt || nowIso, inW = (t) => t >= shift.openedAt && t <= to, sum = (a) => a.reduce((s, x) => s + x, 0);
    const cashSales = sum(sales.filter((s) => inW(s.createdAt)).flatMap((s) => s.payments).filter((p) => p.method === "cash").map((p) => p.amount));
    const cashRefunds = sum(sales.flatMap((s) => s.returns || []).filter((r) => r.method === "cash" && inW(r.at)).map((r) => r.refund));
    const cashIn = sum(shift.movements.filter((m) => m.type === "in").map((m) => m.amount)), cashOut = sum(shift.movements.filter((m) => m.type === "out").map((m) => m.amount));
    const expenseCash = sum(expenses.filter((e) => !e.voided && e.method === "cash" && inW(e.recordedAt || e.createdAt)).map((e) => e.amount));
    const lc = ledger.filter((l) => l.method === "cash" && inW(l.at));
    const customerCash = sum(lc.filter((l) => l.party === "customers").map((l) => l.amount)), supplierCash = sum(lc.filter((l) => l.party === "suppliers").map((l) => l.amount));
    const expected = shift.openingFloat + cashSales - cashRefunds + cashIn - cashOut - expenseCash + customerCash - supplierCash;
    return { cashSales, cashRefunds, cashIn, cashOut, expenseCash, customerCash, supplierCash, expected };
  }
  var init_cashmath = __esm({
    "js/core/cashmath.js"() {
    }
  });

  // js/modules/cash.js
  var cash_exports = {};
  __export(cash_exports, {
    render: () => render
  });
  async function render(el) {
    const draw = async () => {
      const [shifts, sales, expenses, ledger] = await Promise.all([getAll("shifts"), getAll("sales"), getAll("expenses"), getAll("ledger")]);
      const open = shifts.find((s) => s.status === "open"), now = (/* @__PURE__ */ new Date()).toISOString(), data = { sales, expenses, ledger };
      const hist = shifts.filter((s) => s.status === "closed").sort((a, b) => b.closedAt.localeCompare(a.closedAt));
      const sm = open && cashSummary(open, data, now), row = (l, v, sign = "") => `<tr><td>${l}</td><td class="num">${sign}${kes(v)}</td></tr>`;
      el.innerHTML = `${open ? `<div class="card" style="margin-bottom:16px"><h2>Open shift: ${esc(open.userName)}, since ${when(open.openedAt)}</h2><table><tbody>${row("Opening float", open.openingFloat)}${row("Cash sales", sm.cashSales, "+")}${row("Cash customer payments", sm.customerCash, "+")}${row("Cash in", sm.cashIn, "+")}${row("Cash refunds", sm.cashRefunds, "\u2212")}${row("Cash expenses", sm.expenseCash, "\u2212")}${row("Cash paid to suppliers", sm.supplierCash, "\u2212")}${row("Cash out", sm.cashOut, "\u2212")}<tr><td><b>Expected cash in drawer</b></td><td class="num"><b>${kes(sm.expected)}</b></td></tr></tbody></table><div class="row"><button class="btn" data-a="in">Cash in</button><button class="btn" data-a="out">Cash out</button><button class="btn pri" data-a="close">Close shift</button></div></div>` : `<div class="card" style="margin-bottom:16px"><h2>No open shift</h2><div class="fgrid"><label>Opening float (KSh)<input id="fl" type="number" min="0" step="0.01" value="0"></label></div><p class="err" id="err"></p><div class="row"><button class="btn pri" data-a="open">Open shift</button></div></div>`}
    <div class="card"><h2>Closed shifts</h2>${hist.length ? `<div class="tbl-wrap"><table><thead><tr><th>Closed</th><th>Cashier</th><th class="num">Expected</th><th class="num">Counted</th><th class="num">Difference</th></tr></thead><tbody>${hist.map((s) => `<tr><td>${when(s.closedAt)}</td><td>${esc(s.userName)}</td><td class="num">${kes(s.expectedCash)}</td><td class="num">${kes(s.countedCash)}</td><td class="num">${s.variance === 0 ? "Balanced" : (s.variance > 0 ? "Over " : "Short ") + kes(Math.abs(s.variance))}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><b>No closed shifts yet</b>Close a shift to reconcile counted cash against expected cash.</div>'}</div>`;
      el.onclick = async (e) => {
        const a = e.target.dataset.a;
        if (!a) return;
        const me = getSession();
        if (a === "open") {
          const fl = toCents(el.querySelector("#fl").value || 0);
          if (!(fl >= 0)) return;
          try {
            await openShiftTx({ id: "SH-" + Date.now().toString(36).toUpperCase(), userId: me.userId, userName: me.name, openedAt: (/* @__PURE__ */ new Date()).toISOString(), openingFloat: fl, status: "open", movements: [] });
          } catch (err) {
            return toast(err.message, "error");
          }
          toast("Shift opened");
          draw();
        }
        if (a === "in" || a === "out") {
          const d = openDialog(`<h2>Cash ${a}</h2><div class="fgrid"><label>Amount (KSh)<input id="am" type="number" min="0" step="0.01"></label><label>Reason (required)<input id="why"></label></div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Save</button></div>`);
          d.addEventListener("click", async (ev) => {
            if (ev.target.dataset.a === "x") d.close();
            if (ev.target.dataset.a !== "ok") return;
            const amount = toCents(d.querySelector("#am").value), why = d.querySelector("#why").value.trim(), s = await get("shifts", open.id);
            if (!(amount > 0)) return d.querySelector("#err").textContent = "Enter an amount above zero.";
            if (!why) return d.querySelector("#err").textContent = "A reason is required.";
            if (a === "out" && amount > cashSummary(s, data, (/* @__PURE__ */ new Date()).toISOString()).expected) return d.querySelector("#err").textContent = "That is more cash than the drawer should hold.";
            await put("shifts", { ...s, movements: [...s.movements, { id: "m" + Date.now().toString(36), at: (/* @__PURE__ */ new Date()).toISOString(), type: a, amount, reason: why, by: me.name }] });
            d.close();
            toast("Recorded");
            draw();
          });
        }
        if (a === "close") {
          const d = openDialog(`<h2>Close shift</h2><p>Expected in drawer: <b>${kes(sm.expected)}</b></p><label>Counted cash (KSh)<input id="ct" type="number" min="0" step="0.01"></label><div class="sum" id="df"></div><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Close shift</button></div>`);
          d.addEventListener("input", () => {
            const v = toCents(d.querySelector("#ct").value || 0) - sm.expected;
            d.querySelector("#df").textContent = v === 0 ? "Balanced" : (v > 0 ? "Over by " : "Short by ") + kes(Math.abs(v));
          });
          d.addEventListener("click", async (ev) => {
            if (ev.target.dataset.a === "x") d.close();
            if (ev.target.dataset.a !== "ok") return;
            const raw = d.querySelector("#ct").value;
            if (raw === "" || !(Number(raw) >= 0)) return d.querySelector("#df").textContent = "Enter the counted cash.";
            const s = await get("shifts", open.id), closedAt = (/* @__PURE__ */ new Date()).toISOString(), fin = cashSummary({ ...s, closedAt }, data, closedAt), counted = toCents(raw);
            await put("shifts", { ...s, status: "closed", closedAt, expectedCash: fin.expected, countedCash: counted, variance: counted - fin.expected, closedBy: me.name });
            d.close();
            toast("Shift closed");
            draw();
          });
        }
      };
    };
    await draw();
  }
  var when;
  var init_cash = __esm({
    "js/modules/cash.js"() {
      init_db();
      init_format();
      init_ui();
      init_cashmath();
      init_session();
      when = (d) => new Date(d).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
    }
  });

  // js/modules/categories.js
  var categories_exports = {};
  __export(categories_exports, {
    render: () => render2
  });
  async function render2(el) {
    let cats = [], products = [];
    const load = async () => {
      products = await getAll("products");
      cats = await getAll("categories");
      if (!cats.length) {
        const names = [...new Set(products.map((p) => p.category).filter(Boolean))];
        for (const n of names) await put("categories", { id: "k" + Math.random().toString(36).slice(2, 8), name: n, parentId: null });
        cats = await getAll("categories");
      }
    };
    const used = (c) => products.filter((p) => p.category === c.name).length, kids = (c) => cats.filter((x) => x.parentId === c.id);
    const rowsFor = (parent, depth) => cats.filter((c) => (c.parentId || null) === parent).sort((a, b) => a.name.localeCompare(b.name)).flatMap((c) => [`<tr><td style="padding-left:${8 + depth * 24}px">${depth ? "\u21B3 " : ""}${esc(c.name)}</td><td class="num">${used(c)}</td><td class="num"><button class="btn sm" data-a="sub" data-id="${c.id}">+ Subcategory</button> <button class="btn sm" data-a="ren" data-id="${c.id}">Rename</button> <button class="btn sm" data-a="del" data-id="${c.id}">Delete</button></td></tr>`, ...rowsFor(c.id, depth + 1)]);
    const draw = () => {
      el.querySelector("#tbl").innerHTML = cats.length ? `<table><thead><tr><th>Category</th><th class="num">Products</th><th></th></tr></thead><tbody>${rowsFor(null, 0).join("")}</tbody></table>` : '<div class="empty"><b>No categories yet</b>Add one so products can be grouped and filtered at the POS.</div>';
    };
    el.innerHTML = `<div class="bar"><span class="sp"></span><button class="btn pri" id="add">+ Add category</button></div><div class="card"><div class="tbl-wrap" id="tbl"></div></div>`;
    const ask = (title, val, ok) => {
      const d = openDialog(`<h2>${title}</h2><label>Name<input id="n" value="${esc(val)}"></label><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Save</button></div>`);
      d.addEventListener("click", async (e) => {
        if (e.target.dataset.a === "x") d.close();
        if (e.target.dataset.a !== "ok") return;
        try {
          await ok(d.querySelector("#n").value.trim());
        } catch (err) {
          return d.querySelector("#err").textContent = err.message;
        }
        d.close();
        await load();
        draw();
      });
    };
    const create = (parentId) => async (name) => {
      if (!name) throw new Error("Name is required.");
      if (cats.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new Error("A category with that name already exists.");
      await put("categories", { id: "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), name, parentId });
      toast("Category added");
    };
    el.querySelector("#add").addEventListener("click", () => ask("Add category", "", create(null)));
    el.addEventListener("click", async (e) => {
      const { a, id } = e.target.dataset, c = cats.find((x) => x.id === id);
      if (a === "sub") ask("Add subcategory of " + c.name, "", create(c.id));
      if (a === "ren") ask("Rename category", c.name, async (n) => {
        await renameCategoryTx(c.id, n);
        toast("Renamed, products updated");
      });
      if (a === "del") {
        if (used(c) || kids(c).length) return toast("Cannot delete: it has products or subcategories.", "error");
        if (await confirmDialog('Delete "' + esc(c.name) + '"?')) {
          await remove("categories", c.id);
          await load();
          draw();
        }
      }
    });
    await load();
    draw();
  }
  var init_categories = __esm({
    "js/modules/categories.js"() {
      init_db();
      init_format();
      init_ui();
    }
  });

  // js/modules/parties.js
  var parties_exports = {};
  __export(parties_exports, {
    histTable: () => histTable,
    partyPage: () => partyPage
  });
  async function partyPage(el, cfg) {
    let rows = [];
    const draw = async () => {
      rows = (await getAll(cfg.store)).sort((a, b) => a.name.localeCompare(b.name));
      el.querySelector("#tbl").innerHTML = rows.length ? `<table><thead><tr><th>Name</th><th>Phone</th>${cfg.cols.map((c) => `<th class="num">${c.h}</th>`).join("")}<th class="num">${cfg.balanceLabel}</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.phone)}</td>${cfg.cols.map((c) => `<td class="num">${c.v(r)}</td>`).join("")}<td class="num">${kes(r[cfg.field])}</td><td class="num"><button class="btn sm" data-a="edit" data-id="${r.id}">Edit</button> <button class="btn sm" data-a="pay" data-id="${r.id}">${cfg.payLabel}</button> <button class="btn sm" data-a="hist" data-id="${r.id}">History</button></td></tr>`).join("")}</tbody></table>` : `<div class="empty"><b>No ${cfg.plural} yet</b>${cfg.hint}</div>`;
    };
    el.innerHTML = `<div class="bar"><span class="sp"></span><button class="btn pri" id="add">+ Add ${cfg.one}</button></div><div class="card"><div class="tbl-wrap" id="tbl"></div></div>`;
    function form(r) {
      const d = openDialog(`<h2>${r ? "Edit" : "Add"} ${cfg.one}</h2><div class="fgrid"><label>Name<input id="f_name" value="${esc(r?.name)}"></label><label>Phone<input id="f_phone" value="${esc(r?.phone)}"></label>${cfg.fields.map((f) => `<label>${f.label}<input id="f_${f.k}" ${f.money ? 'type="number" min="0" step="0.01"' : ""} value="${f.money ? (r?.[f.k] || 0) / 100 : esc(r?.[f.k])}"></label>`).join("")}</div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="save">Save</button></div>`);
      d.addEventListener("click", async (e) => {
        if (e.target.dataset.a === "x") d.close();
        if (e.target.dataset.a !== "save") return;
        const g = (k) => d.querySelector("#f_" + k).value, name = g("name").trim();
        if (!name) return d.querySelector("#err").textContent = "Name is required.";
        const extra = {};
        for (const f of cfg.fields) {
          const v = f.money ? toCents(g(f.k) || 0) : g(f.k).trim();
          if (f.money && v < 0) return d.querySelector("#err").textContent = f.label + " cannot be negative.";
          extra[f.k] = v;
        }
        await put(cfg.store, { ...r || { id: cfg.prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), [cfg.field]: 0, ...cfg.defaults }, name, phone: g("phone").trim(), ...extra });
        d.close();
        toast(cfg.one + " saved");
        draw();
      });
    }
    function pay(r) {
      const d = openDialog(`<h2>${cfg.payLabel}: ${esc(r.name)}</h2><p>${cfg.balanceLabel}: <b>${kes(r[cfg.field])}</b></p><div class="fgrid"><label>Amount (KSh)<input id="p_amt" type="number" min="0" step="0.01"></label><label>Method<select id="p_m"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option></select></label><label style="grid-column:1/-1">Note<input id="p_n"></label></div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Record payment</button></div>`);
      d.addEventListener("click", async (e) => {
        if (e.target.dataset.a === "x") d.close();
        if (e.target.dataset.a !== "ok") return;
        try {
          await settleBalanceTx({ store: cfg.store, id: r.id, amount: toCents(d.querySelector("#p_amt").value), method: d.querySelector("#p_m").value, note: d.querySelector("#p_n").value.trim() });
        } catch (err) {
          return d.querySelector("#err").textContent = err.message;
        }
        d.close();
        toast("Payment recorded");
        draw();
      });
    }
    async function history(r) {
      const led = (await getAll("ledger")).filter((x) => x.partyId === r.id).sort((a, b) => b.at.localeCompare(a.at));
      const d = openDialog(`<h2>${esc(r.name)}</h2>${await cfg.history(r)}<h2 style="margin-top:14px">Payments</h2>${led.length ? `<table><tbody>${led.map((x) => `<tr><td>${when2(x.at)}</td><td>${esc(x.method)}</td><td>${esc(x.note)}</td><td class="num">${kes(x.amount)}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">No payments recorded.</div>'}<div class="row"><button class="btn" data-a="x">Close</button></div>`);
      d.addEventListener("click", (e) => {
        if (e.target.dataset.a === "x") d.close();
      });
    }
    el.querySelector("#add").addEventListener("click", () => form(null));
    el.addEventListener("click", (e) => {
      const { a, id } = e.target.dataset, r = rows.find((x) => x.id === id);
      if (a === "edit") form(r);
      if (a === "pay") pay(r);
      if (a === "hist") history(r);
    });
    await draw();
  }
  var when2, histTable;
  var init_parties = __esm({
    "js/modules/parties.js"() {
      init_db();
      init_format();
      init_ui();
      when2 = (d) => new Date(d).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
      histTable = (head, rows) => rows.length ? `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>` : '<div class="empty">Nothing yet.</div>';
    }
  });

  // js/modules/customers.js
  var customers_exports = {};
  __export(customers_exports, {
    render: () => render3
  });
  var render3;
  var init_customers = __esm({
    "js/modules/customers.js"() {
      init_db();
      init_format();
      init_parties();
      render3 = (el) => partyPage(el, {
        store: "customers",
        prefix: "c",
        one: "customer",
        plural: "customers",
        field: "creditBalance",
        balanceLabel: "Credit owed",
        payLabel: "Take payment",
        hint: "Add regular customers to track purchases, loyalty points and credit.",
        defaults: { points: 0, creditLimit: 0 },
        fields: [{ k: "creditLimit", label: "Credit limit (KSh, 0 = no credit)", money: true }],
        cols: [{ h: "Points", v: (r) => r.points || 0 }, { h: "Credit limit", v: (r) => kes(r.creditLimit) }],
        history: async (r) => histTable(["Sale", "Date", "Total"], (await getAll("sales")).filter((s) => s.customerId === r.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => [esc(s.id), new Date(s.createdAt).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" }), kes(s.total)]))
      });
    }
  });

  // js/modules/summary.js
  var summary_exports = {};
  __export(summary_exports, {
    addDays: () => addDays,
    periodRange: () => periodRange,
    summarize: () => summarize,
    summarizeRange: () => summarizeRange
  });
  function addDays(key, n) {
    const d = /* @__PURE__ */ new Date(key + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function periodRange(kind, today, custom = {}) {
    if (kind === "today") return [today, today];
    if (kind === "yesterday") return [addDays(today, -1), addDays(today, -1)];
    if (kind === "week") return [addDays(today, -(((/* @__PURE__ */ new Date(today + "T00:00:00Z")).getUTCDay() + 6) % 7)), today];
    if (kind === "month") return [today.slice(0, 8) + "01", today];
    const [a, b] = [custom.from || today, custom.to || today];
    return a <= b ? [a, b] : [b, a];
  }
  function summarizeRange({ sales, expenses, products }, from, to) {
    const mine = sales.filter((s) => inRange(s.createdAt, from, to)), live = mine.filter((s) => s.status !== "cancelled");
    let revenue = 0, cogs = 0, refunds = 0;
    const byProduct = /* @__PURE__ */ new Map(), payments = {}, byCategory = {};
    for (const s of mine) {
      revenue += s.total - (s.tax || 0);
      cogs += s.items.reduce((c, l) => c + Math.round(l.qty * l.unitCost), 0);
    }
    for (const s of sales) for (const r of s.returns || []) if (inRange(r.at, from, to)) {
      revenue -= r.refundNet;
      cogs -= r.cogsBack;
      refunds += r.refund;
    }
    for (const s of live) {
      const back = {};
      for (const r of s.returns || []) for (const l of r.lines) back[l.productId] = (back[l.productId] || 0) + l.qty;
      for (const l of s.items) byProduct.set(l.name, (byProduct.get(l.name) || 0) + l.qty - (back[l.productId] || 0));
      for (const p of s.payments) payments[p.method] = (payments[p.method] || 0) + p.amount;
    }
    const exp = expenses.filter((e) => !e.voided && inRange(e.createdAt, from, to));
    for (const e of exp) byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    const expTotal = exp.reduce((s, e) => s + e.amount, 0);
    return {
      revenue,
      cogs,
      grossProfit: revenue - cogs,
      expenses: expTotal,
      netProfit: revenue - cogs - expTotal,
      refunds,
      count: live.length,
      payments,
      byCategory,
      top: [...byProduct].filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5),
      recent: live.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
      low: products.filter((p) => !p.archived && p.stock <= p.reorder),
      stockValue: products.filter((p) => !p.archived).reduce((s, p) => s + Math.round(p.stock * p.cost), 0),
      sales: live
    };
  }
  var inRange, summarize;
  var init_summary = __esm({
    "js/modules/summary.js"() {
      init_format();
      inRange = (d, from, to) => {
        const k = nairobiDayKey(d);
        return k >= from && k <= to;
      };
      summarize = (data, day) => summarizeRange(data, day, day);
    }
  });

  // js/modules/dashboard.js
  var dashboard_exports = {};
  __export(dashboard_exports, {
    render: () => render4
  });
  async function render4(el) {
    const [sales, expenses, products] = await Promise.all([getAll("sales"), getAll("expenses"), getAll("products")]);
    const s = summarize({ sales, expenses, products }, nairobiDayKey(/* @__PURE__ */ new Date()));
    const demo = [...sales, ...products].some((r) => r.isDemo);
    el.innerHTML = `
    ${demo ? '<div class="banner"><b>Demo data.</b> Figures below come from sample products and sales, not a real shop.</div>' : ""}
    <div class="grid kpis">
      ${kpi("Revenue today", s.revenue, s.count + " transactions")}
      ${kpi("Gross profit", s.grossProfit, "Revenue minus cost of goods", "good")}
      ${kpi("Expenses", s.expenses, "Operating costs today")}
      ${kpi("Net profit", s.netProfit, "Gross profit minus expenses", s.netProfit < 0 ? "bad" : "good")}
    </div>
    <div class="grid two">
      <section class="card"><h2>Top-selling products</h2>${s.top.length ? `<table><tbody>${s.top.map(([n, q]) => `<tr><td>${esc(n)}</td><td class="num">${q} sold</td></tr>`).join("")}</tbody></table>` : empty("No sales yet today", "Completed sales will appear here.")}</section>
      <section class="card"><h2>Low-stock alerts</h2>${s.low.length ? `<table><tbody>${s.low.map((p) => `<tr><td>${esc(p.name)}</td><td class="num"><span class="tag low">${p.stock} left</span></td></tr>`).join("")}</tbody></table>` : empty("Stock levels are healthy", "Nothing is at or below its reorder level.")}</section>
    </div>
    <section class="card" style="margin-top:16px"><h2>Recent transactions</h2>${s.recent.length ? `<div class="tbl-wrap"><table><thead><tr><th>Ref</th><th>Time</th><th>Payment</th><th class="num">Total</th></tr></thead><tbody>${s.recent.map((t) => `<tr><td>${esc(t.id)}</td><td>${timeOf(t.createdAt)}</td><td>${esc(t.payments.map((p) => p.method).join(" + "))}</td><td class="num">${kes(t.total)}</td></tr>`).join("")}</tbody></table></div>` : empty("No transactions yet", "Sales made at the POS will be listed here.")}</section>`;
  }
  var kpi, empty;
  var init_dashboard = __esm({
    "js/modules/dashboard.js"() {
      init_db();
      init_format();
      init_summary();
      kpi = (label, v, note, cls = "") => `<div class="card kpi ${cls}"><div class="n">${label}</div><div class="v">${kes(v)}</div><div class="n">${note}</div></div>`;
      empty = (t, s) => `<div class="empty"><b>${t}</b>${s}</div>`;
    }
  });

  // js/modules/expenses.js
  var expenses_exports = {};
  __export(expenses_exports, {
    render: () => render5
  });
  async function render5(el) {
    let list = [];
    const audit = async (action, x, detail) => put("audit", { id: "A" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), at: (/* @__PURE__ */ new Date()).toISOString(), action, expenseId: x.id, detail, user: getSession().name });
    const draw = async () => {
      list = (await getAll("expenses")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
      const log = (await getAll("audit")).filter((a) => a.action.startsWith("expense.")).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
      el.querySelector("#list").innerHTML = list.length ? `<table><thead><tr><th>Date</th><th>Category</th><th>Method</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead><tbody>${list.map((x) => `<tr class="${x.voided ? "dim" : ""}"><td>${nairobiDayKey(x.createdAt)}</td><td>${esc(x.category)}</td><td>${esc(x.method)}</td><td>${esc(x.note)}</td><td class="num">${x.voided ? "<s>" + kes(x.amount) + '</s> <span class="tag low">voided</span>' : kes(x.amount)}</td><td class="num">${x.voided ? "" : `<button class="btn sm" data-a="edit" data-id="${x.id}">Edit</button> <button class="btn sm" data-a="void" data-id="${x.id}">Void</button>`}</td></tr>`).join("")}</tbody></table>` : '<div class="empty"><b>No expenses recorded</b>Add rent, transport, wages and other costs so net profit is accurate.</div>';
      el.querySelector("#log").innerHTML = log.length ? `<table><tbody>${log.map((a) => `<tr><td>${new Date(a.at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</td><td>${a.action.replace("expense.", "")}</td><td>${esc(a.detail)}</td><td>${esc(a.user)}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">No edits or voids yet.</div>';
    };
    el.innerHTML = `<div class="card" style="margin-bottom:16px"><h2>Record expense</h2><div class="fgrid"><label>Amount (KSh)<input id="a" type="number" min="0" step="0.01"></label><label>Date<input id="d" type="date" value="${nairobiDayKey(/* @__PURE__ */ new Date())}"></label><label>Category<select id="c">${opts(CATS)}</select></label><label>Paid by<select id="m"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option></select></label><label style="grid-column:1/-1">Note<input id="n"></label></div><p class="err" id="err"></p><div class="row"><button class="btn pri" id="save">Save expense</button></div></div><div class="card"><h2>Latest expenses</h2><div class="tbl-wrap" id="list"></div></div><div class="card" style="margin-top:16px"><h2>Edit and void log</h2><div class="tbl-wrap" id="log"></div></div>`;
    el.querySelector("#save").addEventListener("click", async () => {
      const amount = toCents(el.querySelector("#a").value), date = el.querySelector("#d").value, err = el.querySelector("#err");
      if (!(amount > 0)) return err.textContent = "Enter an amount greater than zero.";
      if (!date) return err.textContent = "Choose a date.";
      err.textContent = "";
      await put("expenses", { id: "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), createdAt: isoAt(date), recordedAt: (/* @__PURE__ */ new Date()).toISOString(), category: el.querySelector("#c").value, method: el.querySelector("#m").value, note: el.querySelector("#n").value.trim(), amount });
      el.querySelector("#a").value = "";
      el.querySelector("#n").value = "";
      toast("Expense saved");
      draw();
    });
    el.addEventListener("click", (e) => {
      const { a, id } = e.target.dataset, x = list.find((r) => r.id === id);
      if (!x || !["edit", "void"].includes(a)) return;
      const d = openDialog(a === "edit" ? `<h2>Edit expense</h2><div class="fgrid"><label>Amount (KSh)<input id="e_a" type="number" min="0" step="0.01" value="${x.amount / 100}"></label><label>Date<input id="e_d" type="date" value="${nairobiDayKey(x.createdAt)}"></label><label>Category<select id="e_c">${opts(CATS, x.category)}</select></label><label>Paid by<select id="e_m">${["cash", "mpesa", "bank"].map((m) => `<option ${m === x.method ? "selected" : ""}>${m}</option>`).join("")}</select></label><label style="grid-column:1/-1">Note<input id="e_n" value="${esc(x.note)}"></label></div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Save changes</button></div>` : `<h2>Void expense</h2><p>${esc(x.category)} \xB7 ${kes(x.amount)}. It stays in the log but no longer counts in reports or cash.</p><label>Reason (required)<input id="why"></label><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Void expense</button></div>`);
      d.addEventListener("click", async (ev) => {
        if (ev.target.dataset.a === "x") d.close();
        if (ev.target.dataset.a !== "ok") return;
        const err = (m) => d.querySelector("#err").textContent = m, g = (i) => d.querySelector("#" + i).value;
        if (a === "void") {
          if (!g("why").trim()) return err("A reason is required.");
          await put("expenses", { ...x, voided: true, voidReason: g("why").trim(), voidedAt: (/* @__PURE__ */ new Date()).toISOString() });
          await audit("expense.void", x, kes(x.amount) + " \xB7 " + g("why").trim());
        } else {
          const amount = toCents(g("e_a"));
          if (!(amount > 0)) return err("Enter an amount greater than zero.");
          if (!g("e_d")) return err("Choose a date.");
          await put("expenses", { ...x, amount, createdAt: isoAt(g("e_d")), category: g("e_c"), method: g("e_m"), note: g("e_n").trim() });
          await audit("expense.edit", x, kes(x.amount) + " \u2192 " + kes(amount));
        }
        d.close();
        toast("Saved");
        draw();
      });
    });
    await draw();
  }
  var CATS, opts, isoAt;
  var init_expenses = __esm({
    "js/modules/expenses.js"() {
      init_db();
      init_format();
      init_ui();
      init_session();
      CATS = ["Rent", "Transport", "Electricity", "Wages", "Packaging", "Airtime & data", "Licences", "Other"];
      opts = (list, cur) => list.map((c) => `<option ${c === cur ? "selected" : ""}>${c}</option>`).join("");
      isoAt = (date) => (/* @__PURE__ */ new Date(date + "T12:00:00+03:00")).toISOString();
    }
  });

  // js/modules/inventory.js
  var inventory_exports = {};
  __export(inventory_exports, {
    render: () => render6
  });
  async function render6(el) {
    const draw = async () => {
      const [products, moves] = [(await getAll("products")).filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name)), (await getAll("movements")).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25)];
      const names = Object.fromEntries(products.map((p) => [p.id, p.name])), value = products.reduce((s, p) => s + Math.round(p.stock * p.cost), 0);
      el.innerHTML = `<div class="card kpi" style="margin-bottom:16px"><div class="n">Stock value (at cost)</div><div class="v">${kes(value)}</div></div>
      <div class="card"><h2>Stock balances</h2><div class="tbl-wrap"><table><thead><tr><th>Product</th><th class="num">On hand</th><th class="num">Reorder at</th><th class="num">Value at cost</th><th></th></tr></thead><tbody>${products.map((p) => `<tr><td>${esc(p.name)}${p.stock <= p.reorder ? ' <span class="tag low">low</span>' : ""}</td><td class="num">${p.stock} ${esc(p.unit)}</td><td class="num">${p.reorder}</td><td class="num">${kes(Math.round(p.stock * p.cost))}</td><td class="num">${can("inventory.adjust") ? `<button class="btn sm" data-id="${p.id}">Adjust</button>` : ""}</td></tr>`).join("")}</tbody></table></div></div>
      <div class="card" style="margin-top:16px"><h2>Recent stock movements</h2>${moves.length ? `<div class="tbl-wrap"><table><thead><tr><th>When</th><th>Product</th><th>Type</th><th class="num">Change</th><th class="num">Balance</th><th>Note</th></tr></thead><tbody>${moves.map((m) => `<tr><td>${new Date(m.at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</td><td>${esc(names[m.productId] || m.productId)}</td><td>${esc(m.type === "sale" ? "Sale" : TYPES[m.type]?.[0] || m.type)}</td><td class="num">${m.qty > 0 ? "+" : ""}${m.qty}</td><td class="num">${m.balance}</td><td>${esc(m.note || m.ref || "")}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><b>No movements yet</b>Sales and adjustments are logged here.</div>'}</div>`;
    };
    el.addEventListener("click", (e) => {
      const id = e.target.dataset.id;
      if (!id || !can("inventory.adjust")) return;
      const d = openDialog(`<h2>Adjust stock</h2><div class="fgrid"><label>Reason<select id="t">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select></label><label>Quantity<input id="q" type="number" min="0" step="any"></label><label style="grid-column:1/-1">Note (required except for received stock)<input id="n"></label></div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Save</button></div>`);
      d.addEventListener("click", async (ev) => {
        const a = ev.target.dataset.a;
        if (a === "x") d.close();
        if (a !== "ok") return;
        const type = d.querySelector("#t").value, q = Number(d.querySelector("#q").value), note = d.querySelector("#n").value.trim(), [, sign] = TYPES[type];
        const bad = !(q >= 0) || sign !== 0 && q === 0 ? "Enter a quantity." : type !== "receive" && !note ? "A note is required for this reason." : "";
        if (bad) return d.querySelector("#err").textContent = bad;
        try {
          await adjustStockTx(id, type === "count" ? { mode: "set", value: q, type, note } : { value: sign * q, type, note });
        } catch (err) {
          return d.querySelector("#err").textContent = err.message;
        }
        d.close();
        toast("Stock updated");
        draw();
      });
    });
    draw();
  }
  var TYPES;
  var init_inventory = __esm({
    "js/modules/inventory.js"() {
      init_db();
      init_format();
      init_session();
      init_ui();
      TYPES = { receive: ["Stock received", 1], adjust_up: ["Adjustment: add", 1], adjust_down: ["Adjustment: remove", -1], damaged: ["Damaged / expired", -1], count: ["Stock count (set exact quantity)", 0] };
    }
  });

  // js/modules/login.js
  var login_exports = {};
  __export(login_exports, {
    render: () => render7
  });
  async function render7(app) {
    const all = await getAll("users"), users = all.filter((u) => u.active), setup = !all.length, cur = getSession();
    app.innerHTML = `<div class="auth"><img src="../assets/logo.svg" alt="" width="48" height="48"><h1>DukaPOS</h1>${setup ? `<p>First run: create the administrator account.</p><label>Your name<input id="n" autocomplete="off"></label><label>PIN (4-6 digits)<input id="p1" type="password" inputmode="numeric" maxlength="6"></label><label>Repeat PIN<input id="p2" type="password" inputmode="numeric" maxlength="6"></label>` : `${cur ? `<p>Signed in as <b>${esc(cur.name)}</b>. <a href="#" id="out">Sign out</a></p>` : ""}<label>User<select id="u">${users.map((u) => `<option value="${u.id}">${esc(u.name)} (${u.role})</option>`).join("")}</select></label><label>PIN<input id="p1" type="password" inputmode="numeric" maxlength="6" autofocus></label>`}<p class="err" id="err"></p><button class="btn pri big" id="go">${setup ? "Create administrator" : "Sign in"}</button><small>Local prototype: this PIN is stored in the browser and is not real security.</small></div>`;
    const $ = (s) => app.querySelector(s), fail = (m) => $("#err").textContent = m, enter = (u) => {
      setSession(u);
      location.href = u.role === "cashier" ? "pos.html" : "dashboard.html";
    };
    app.querySelector("#out")?.addEventListener("click", (e) => {
      e.preventDefault();
      clearSession();
      location.reload();
    });
    async function go() {
      const pin = $("#p1").value;
      if (setup) {
        if (!$("#n").value.trim()) return fail("Enter your name.");
        if (!validPin(pin)) return fail("PIN must be 4 to 6 digits.");
        if (pin !== $("#p2").value) return fail("PINs do not match.");
        const salt = newSalt(), u2 = { id: "u" + Date.now().toString(36), name: $("#n").value.trim(), role: "admin", active: true, salt, pinHash: await hashPin(pin, salt) };
        await put("users", u2);
        return enter(u2);
      }
      const lock = JSON.parse(sessionStorage.getItem(LOCK) || '{"n":0,"until":0}');
      if (Date.now() < lock.until) return fail("Too many attempts. Wait " + Math.ceil((lock.until - Date.now()) / 1e3) + "s.");
      const u = users.find((x) => x.id === $("#u").value);
      if (u && await hashPin(pin, u.salt) === u.pinHash) {
        sessionStorage.removeItem(LOCK);
        return enter(u);
      }
      lock.n += 1;
      if (lock.n >= 5) {
        lock.until = Date.now() + 3e4;
        lock.n = 0;
      }
      sessionStorage.setItem(LOCK, JSON.stringify(lock));
      fail("Wrong PIN.");
    }
    $("#go").addEventListener("click", go);
    app.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
  }
  var LOCK;
  var init_login = __esm({
    "js/modules/login.js"() {
      init_db();
      init_format();
      init_session();
      LOCK = "dukapos.lock";
    }
  });

  // js/modules/pending.js
  var pending_exports = {};
  __export(pending_exports, {
    render: () => render8
  });
  function render8(el, route) {
    el.innerHTML = `<div class="card empty"><b>${esc(route.title)} is not built yet</b>Scheduled for Phase ${route.phase}. Nothing on this screen is functional.</div>`;
  }
  var init_pending = __esm({
    "js/modules/pending.js"() {
      init_format();
    }
  });

  // js/modules/receipt.js
  var receipt_exports = {};
  __export(receipt_exports, {
    receiptHTML: () => receiptHTML,
    showReceipt: () => showReceipt
  });
  function receiptHTML(s, st) {
    return `<div class="receipt"><h3>${esc(st.shopName)}</h3>${st.phone ? `<div>${esc(st.phone)}</div>` : ""}<div>${when3(s.createdAt)}</div><div>Ref: ${esc(s.id)}</div>${s.customerName ? `<div>Customer: ${esc(s.customerName)}</div>` : ""}<hr>
  ${s.items.map((l) => `<div class="rl"><span>${l.qty} x ${esc(l.name)}</span><span>${kes(Math.round(l.qty * l.unitPrice))}</span></div><div class="rs">@ ${kes(l.unitPrice)}</div>`).join("")}<hr>
  <div class="rl"><span>Subtotal</span><span>${kes(s.subtotal)}</span></div>
  ${s.discount ? `<div class="rl"><span>Discount</span><span>-${kes(s.discount)}</span></div>` : ""}
  ${s.taxRate ? `<div class="rl"><span>Tax ${s.taxRate}% ${s.taxInclusive ? "(incl.)" : ""}</span><span>${kes(s.tax)}</span></div>` : ""}
  <div class="rl b"><span>TOTAL</span><span>${kes(s.total)}</span></div><hr>
  ${s.payments.map((p) => `<div class="rl"><span>${LBL[p.method] || p.method}${p.ref ? " " + esc(p.ref) : ""}</span><span>${kes(p.amount)}</span></div>`).join("")}
  ${s.change ? `<div class="rl"><span>Change</span><span>${kes(s.change)}</span></div>` : ""}<p class="rs">Thank you for shopping with us.</p></div>`;
  }
  function showReceipt(sale, settings) {
    const d = openDialog(`${receiptHTML(sale, settings)}<div class="row noprint"><button class="btn" data-a="x">Close</button><button class="btn pri" data-a="p">Print</button></div>`);
    d.addEventListener("click", (e) => {
      if (e.target.dataset.a === "x") d.close();
      if (e.target.dataset.a === "p") window.print();
    });
  }
  var when3, LBL;
  var init_receipt = __esm({
    "js/modules/receipt.js"() {
      init_format();
      init_ui();
      when3 = (d) => new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
      LBL = { cash: "Cash", mpesa: "M-Pesa (not verified)", card: "Card (external)", credit: "On credit (owed)" };
    }
  });

  // js/services/settings.js
  async function loadSettings() {
    return { ...DEFAULTS, ...(await get("meta", "settings"))?.value || {} };
  }
  var DEFAULTS;
  var init_settings = __esm({
    "js/services/settings.js"() {
      init_db();
      DEFAULTS = { shopName: "My Duka", phone: "", taxRate: 0, taxInclusive: true, allowNegativeStock: false };
    }
  });

  // js/modules/pos.js
  var pos_exports = {};
  __export(pos_exports, {
    render: () => render9
  });
  async function render9(el) {
    const st = await loadSettings();
    let products = (await getAll("products")).filter((p) => !p.archived);
    let customers = await getAll("customers"), cat = "";
    const noShift = !(await getAll("shifts")).some((s) => s.status === "open");
    let cart = (await get("meta", "cart"))?.value || fresh(), q = "", busy = false;
    const save = () => put("meta", { key: "cart", value: cart });
    const totals = () => computeTotals({ lines: cart.lines, discount: cart.discount, taxRate: st.taxRate, taxInclusive: st.taxInclusive });
    el.innerHTML = `<div class="pos"><section>${noShift ? '<div class="banner">No cash shift is open. Open one in Cash Management so cash sales are reconciled.</div>' : ""}<div class="chips" id="chips"></div><input id="q" type="search" placeholder="Search, or scan a barcode and press Enter" autocomplete="off"><div id="grid" class="pgrid"></div></section><aside class="card" id="cart"></aside></div>`;
    const $ = (s) => el.querySelector(s);
    const match = () => products.filter((p) => (!cat || p.category === cat) && [p.name, p.sku, p.barcode, p.category].some((x) => (x || "").toLowerCase().includes(q.toLowerCase())));
    const drawChips = () => {
      const names = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
      $("#chips").innerHTML = names.length ? ["", ...names].map((n) => `<button class="chip ${n === cat ? "on" : ""}" data-a="cat" data-id="${esc(n)}">${n ? esc(n) : "All"}</button>`).join("") : "";
    };
    const drawGrid = () => {
      const m = match();
      $("#grid").innerHTML = m.length ? m.map((p) => `<button class="pbtn" data-a="add" data-id="${p.id}" ${p.stock <= 0 && !st.allowNegativeStock ? "disabled" : ""}><b>${esc(p.name)}</b><span>${kes(p.price)}</span><small>${p.stock} ${esc(p.unit)} left</small></button>`).join("") : '<div class="empty"><b>No matching products</b>Check the spelling or barcode.</div>';
    };
    const drawCart = () => {
      const t = totals(), d = cart.discount;
      $("#cart").innerHTML = `<h2>Cart</h2>${cart.lines.length ? cart.lines.map((l) => `<div class="cl"><div class="cn">${esc(l.name)}<small>${kes(l.unitPrice)} / ${esc(l.unit)}</small></div><div class="qty"><button class="btn sm" data-a="dec" data-id="${l.productId}">\u2212</button><input data-a="qty" data-id="${l.productId}" type="number" min="0" step="any" value="${l.qty}"><button class="btn sm" data-a="inc" data-id="${l.productId}">+</button></div><div class="num">${kes(Math.round(l.qty * l.unitPrice))}</div><button class="btn sm" data-a="rm" data-id="${l.productId}" aria-label="Remove">\u2715</button></div>`).join("") : '<div class="empty"><b>Cart is empty</b>Tap a product or scan a barcode.</div>'}
      <label class="disc">Customer <select data-a="cust"><option value="">Walk-in</option>${customers.map((c) => `<option value="${c.id}" ${c.id === cart.customerId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
      <div class="disc">Discount <select data-a="dtype" ${can("pos.discount") ? "" : 'disabled title="Needs supervisor"'}><option value="percent" ${d.type === "percent" ? "selected" : ""}>%</option><option value="amount" ${d.type === "amount" ? "selected" : ""}>KSh</option></select><input data-a="dval" ${can("pos.discount") ? "" : "disabled"} type="number" min="0" step="any" value="${d.type === "amount" ? d.value / 100 : d.value}"></div>
      <div class="tot"><div><span>Subtotal</span><span>${kes(t.subtotal)}</span></div>${t.discount ? `<div><span>Discount</span><span>-${kes(t.discount)}</span></div>` : ""}${st.taxRate ? `<div><span>Tax ${st.taxRate}%${st.taxInclusive ? " (incl.)" : ""}</span><span>${kes(t.tax)}</span></div>` : ""}<div class="grand"><span>Total</span><span>${kes(t.total)}</span></div></div>
      <div class="row"><button class="btn" data-a="park">Park</button><button class="btn" data-a="parked">Parked</button><button class="btn" data-a="clear">Clear</button></div><button class="btn pri big" data-a="pay" ${cart.lines.length ? "" : "disabled"}>Pay ${kes(t.total)}</button>`;
    };
    const draw = () => {
      drawChips();
      drawGrid();
      drawCart();
      save();
    };
    function add(id) {
      const p = products.find((x) => x.id === id);
      if (!p) return;
      const line = cart.lines.find((l) => l.productId === id), next = (line?.qty || 0) + 1;
      if (!st.allowNegativeStock && next > p.stock) return toast(`Only ${p.stock} of ${p.name} in stock.`, "error");
      if (line) line.qty = next;
      else cart.lines.push({ productId: id, name: p.name, unit: p.unit, qty: 1, unitPrice: p.price, unitCost: p.cost });
      draw();
    }
    function setQty(id, qty) {
      const p = products.find((x) => x.id === id);
      if (!(qty > 0)) cart.lines = cart.lines.filter((l) => l.productId !== id);
      else if (!st.allowNegativeStock && qty > p.stock) {
        toast(`Only ${p.stock} of ${p.name} in stock.`, "error");
      } else cart.lines.find((l) => l.productId === id).qty = qty;
      draw();
    }
    async function park() {
      if (!cart.lines.length) return toast("Nothing to park.", "error");
      const list = (await get("meta", "parked"))?.value || [];
      await put("meta", { key: "parked", value: [...list, { ...cart, parkedAt: (/* @__PURE__ */ new Date()).toISOString() }] });
      cart = fresh();
      draw();
      toast("Sale parked");
    }
    async function showParked() {
      const list = (await get("meta", "parked"))?.value || [];
      const d = openDialog(`<h2>Parked sales</h2>${list.length ? list.map((c, i) => `<div class="cl"><div class="cn">${c.lines.length} item(s)<small>${new Date(c.parkedAt).toLocaleTimeString("en-KE", { timeZone: "Africa/Nairobi" })}</small></div><div class="num">${kes(computeTotals({ ...c, taxRate: st.taxRate, taxInclusive: st.taxInclusive }).total)}</div><button class="btn sm" data-a="res" data-i="${i}">Resume</button><button class="btn sm" data-a="del" data-i="${i}">Delete</button></div>`).join("") : '<div class="empty"><b>No parked sales</b></div>'}<div class="row"><button class="btn" data-a="x">Close</button></div>`);
      d.addEventListener("click", async (e) => {
        const { a, i } = e.target.dataset;
        if (!a) return;
        if (a === "x") return d.close();
        const rest = list.filter((_, k) => k !== Number(i)), pick = list[i];
        await put("meta", { key: "parked", value: cart.lines.length && a === "res" ? [...rest, { ...cart, parkedAt: (/* @__PURE__ */ new Date()).toISOString() }] : rest });
        if (a === "res") {
          cart = { saleId: pick.saleId, lines: pick.lines, discount: pick.discount, customerId: pick.customerId };
          draw();
        }
        d.close();
      });
    }
    function pay() {
      const t = totals();
      let rows = [{ method: "cash", amount: String(t.total / 100), ref: "" }];
      const d = openDialog(`<h2>Payment \xB7 ${kes(t.total)}</h2><div id="rows"></div><button class="btn sm" data-a="add">+ Split payment</button><div id="sum" class="sum"></div><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Complete sale</button></div>`);
      const read = () => rows.map((r, i) => ({ method: d.querySelector(`[data-m="${i}"]`).value, amount: toCents(d.querySelector(`[data-v="${i}"]`).value || 0), ref: d.querySelector(`[data-r="${i}"]`).value }));
      const sum = () => {
        const s = settlePayments(t.total, read(), { customerId: cart.customerId });
        d.querySelector("#sum").innerHTML = s.ok ? `Change to give: <b>${kes(s.change)}</b>` : `<span class="err">${s.short ? "Short by " + kes(s.short) : s.error}</span>`;
        return s;
      };
      const drawRows = () => {
        d.querySelector("#rows").innerHTML = rows.map((r, i) => `<div class="prow"><select data-m="${i}"><option value="cash" ${r.method === "cash" ? "selected" : ""}>Cash</option><option value="mpesa" ${r.method === "mpesa" ? "selected" : ""}>M-Pesa</option><option value="card" ${r.method === "card" ? "selected" : ""}>Card</option><option value="credit" ${r.method === "credit" ? "selected" : ""}>On credit</option></select><input data-v="${i}" type="number" min="0" step="0.01" value="${r.amount}"><input data-r="${i}" placeholder="${r.method === "mpesa" ? "M-Pesa code (required)" : "Reference (optional)"}" value="${esc(r.ref)}"></div>`).join("");
        sum();
      };
      d.addEventListener("input", sum);
      d.addEventListener("change", (e) => {
        if (e.target.dataset.m !== void 0) {
          rows = read().map((r) => ({ ...r, amount: String(r.amount / 100) }));
          drawRows();
        }
      });
      d.addEventListener("click", async (e) => {
        const a = e.target.dataset.a;
        if (a === "x") d.close();
        if (a === "add") {
          rows = [...read().map((r) => ({ ...r, amount: String(r.amount / 100) })), { method: "mpesa", amount: "", ref: "" }];
          drawRows();
        }
        if (a !== "ok" || busy) return;
        const s = sum();
        if (!s.ok) return toast(s.short ? "Payment is short." : s.error, "error");
        busy = true;
        e.target.disabled = true;
        const cust = customers.find((c) => c.id === cart.customerId);
        const sale = { id: cart.saleId, createdAt: (/* @__PURE__ */ new Date()).toISOString(), status: "completed", cashier: getSession().name, cashierId: getSession().userId, items: cart.lines.map((l) => ({ ...l })), subtotal: t.subtotal, discount: t.discount, tax: t.tax, taxRate: st.taxRate, taxInclusive: st.taxInclusive, total: t.total, payments: s.recorded, tendered: s.tendered, change: s.change, ...cust ? { customerId: cust.id, customerName: cust.name, points: pointsFor(t.total) } : {} };
        try {
          await checkoutTx(sale, st.allowNegativeStock);
        } catch (err) {
          busy = false;
          e.target.disabled = false;
          return toast(err.message, "error");
        }
        await remove("meta", "cart");
        cart = fresh();
        products = (await getAll("products")).filter((p) => !p.archived);
        customers = await getAll("customers");
        busy = false;
        draw();
        d.close();
        showReceipt(sale, st);
      });
      drawRows();
    }
    el.addEventListener("click", (e) => {
      const { a, id } = e.target.dataset, l = cart.lines.find((x) => x.productId === id);
      if (a === "cat") {
        cat = id;
        draw();
      }
      if (a === "add") add(id);
      if (a === "inc") setQty(id, l.qty + 1);
      if (a === "dec") setQty(id, l.qty - 1);
      if (a === "rm") setQty(id, 0);
      if (a === "park") park();
      if (a === "parked") showParked();
      if (a === "pay") pay();
      if (a === "clear" && cart.lines.length) {
        cart = fresh();
        draw();
      }
    });
    el.addEventListener("change", (e) => {
      const { a, id } = e.target.dataset;
      if (a === "cust") {
        cart.customerId = e.target.value || null;
        draw();
      }
      if (a === "qty") setQty(id, Number(e.target.value));
      if (a === "dtype") {
        cart.discount = { type: e.target.value, value: 0 };
        draw();
      }
      if (a === "dval") {
        const v = Math.max(0, Number(e.target.value) || 0);
        cart.discount.value = cart.discount.type === "amount" ? toCents(v) : Math.min(v, 100);
        draw();
      }
    });
    $("#q").addEventListener("input", (e) => {
      q = e.target.value;
      drawGrid();
    });
    $("#q").addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !q.trim()) return;
      const exact = products.find((p) => [p.barcode, p.sku].some((x) => x && x.toLowerCase() === q.trim().toLowerCase())), m = match();
      const hit = exact || (m.length === 1 ? m[0] : null);
      if (hit) {
        add(hit.id);
        q = "";
        e.target.value = "";
        drawGrid();
      } else toast('No single match for "' + q + '".', "error");
    });
    draw();
    $("#q").focus();
  }
  var newId, fresh;
  var init_pos = __esm({
    "js/modules/pos.js"() {
      init_db();
      init_format();
      init_calc();
      init_receipt();
      init_settings();
      init_ui();
      init_session();
      newId = () => `S-${nairobiDayKey(/* @__PURE__ */ new Date()).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      fresh = () => ({ saleId: newId(), lines: [], discount: { type: "percent", value: 0 } });
    }
  });

  // js/core/csv.js
  function parseCsv(text) {
    const rows = [];
    let row = [], f = "", q = false;
    text = text.replace(/^\uFEFF/, "");
    const endRow = () => {
      row.push(f);
      f = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            f += '"';
            i++;
          } else q = false;
        } else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") {
        row.push(f);
        f = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        endRow();
      } else f += c;
    }
    if (q) throw new Error("The file has an unclosed quote.");
    endRow();
    return rows;
  }
  var csvCell;
  var init_csv = __esm({
    "js/core/csv.js"() {
      csvCell = (v) => {
        let s = String(v ?? "");
        if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      };
    }
  });

  // js/modules/products.js
  var products_exports = {};
  __export(products_exports, {
    render: () => render10
  });
  async function render10(el) {
    let products = await getAll("products"), q = "", arch = false;
    el.innerHTML = `<div class="bar"><input id="q" type="search" placeholder="Search name, SKU or barcode"><label><input type="checkbox" id="arch"> Show archived</label><span class="sp"></span><button class="btn" id="exp">Export CSV</button><button class="btn" id="imp">Import CSV</button><input type="file" id="impf" accept=".csv,text/csv" hidden><button class="btn pri" id="add">+ Add product</button></div><div class="card"><div class="tbl-wrap" id="tbl"></div></div>`;
    const draw = () => {
      const rows = products.filter((p) => (arch || !p.archived) && [p.name, p.sku, p.barcode].some((x) => (x || "").toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name));
      el.querySelector("#tbl").innerHTML = rows.length ? `<table><thead><tr><th>Name</th><th>SKU</th><th>Unit</th><th class="num">Price</th><th class="num">Cost</th><th class="num">Stock</th><th></th></tr></thead><tbody>${rows.map((p) => `<tr class="${p.archived ? "dim" : ""}"><td>${esc(p.name)}${p.archived ? ' <span class="tag">archived</span>' : ""}${p.stock <= p.reorder && !p.archived ? ' <span class="tag low">low</span>' : ""}</td><td>${esc(p.sku)}</td><td>${esc(p.unit)}</td><td class="num">${kes(p.price)}</td><td class="num">${kes(p.cost)}</td><td class="num">${p.stock}</td><td class="num">${can("products.edit") ? `<button class="btn sm" data-a="edit" data-id="${p.id}">Edit</button> <button class="btn sm" data-a="arc" data-id="${p.id}">${p.archived ? "Restore" : "Archive"}</button>` : ""}</td></tr>`).join("")}</tbody></table>` : '<div class="empty"><b>No products found</b>Add a product or change the search.</div>';
    };
    async function form(p = null) {
      const names = (await getAll("categories")).map((c) => c.name).sort();
      if (p?.category && !names.includes(p.category)) names.push(p.category);
      const catOpts = ["", ...names].map((n) => `<option ${n === (p?.category || "") ? "selected" : ""}>${esc(n)}</option>`).join("");
      const v = p || { name: "", sku: "", barcode: "", unit: "piece", category: "", price: 0, cost: 0, stock: 0, reorder: 5 };
      const d = openDialog(`<h2>${p ? "Edit" : "Add"} product</h2><div class="fgrid">
      <label>Name<input id="f_name" value="${esc(v.name)}"></label><label>Category<select id="f_category">${catOpts}</select></label>
      <label>SKU<input id="f_sku" value="${esc(v.sku)}"></label><label>Barcode<input id="f_barcode" value="${esc(v.barcode)}"></label>
      <label>Unit<select id="f_unit">${UNITS2.map((u) => `<option ${u === v.unit ? "selected" : ""}>${u}</option>`).join("")}</select></label><label>Reorder level<input id="f_reorder" type="number" min="0" value="${v.reorder}"></label>
      <label>Selling price (KSh)<input id="f_price" type="number" min="0" step="0.01" value="${v.price / 100}"></label><label>Cost price (KSh)<input id="f_cost" type="number" min="0" step="0.01" value="${v.cost / 100}"></label>
      <label>Stock on hand<input id="f_stock" type="number" min="0" step="any" value="${v.stock}"></label></div><p class="err" id="err"></p>
      <div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="save">Save</button></div>`);
      d.addEventListener("click", async (e) => {
        if (e.target.dataset.a === "x") d.close();
        if (e.target.dataset.a !== "save") return;
        const g = (k) => d.querySelector("#f_" + k).value;
        const f = { name: g("name"), category: g("category").trim(), sku: g("sku").trim(), barcode: g("barcode").trim(), unit: g("unit"), reorder: Number(g("reorder")), price: toCents(g("price")), cost: toCents(g("cost")), stock: Number(g("stock")) };
        const err = validateProduct(f, products, p?.id);
        if (err) {
          d.querySelector("#err").textContent = err;
          return;
        }
        const rec = { ...p || { id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), archived: false }, ...f, name: f.name.trim() };
        await put("products", rec);
        products = await getAll("products");
        d.close();
        draw();
        toast("Product saved");
      });
    }
    el.addEventListener("click", async (e) => {
      const { a, id } = e.target.dataset, p = products.find((x) => x.id === id);
      if (a === "edit") form(p);
      if (a === "arc" && (p.archived || await confirmDialog(`Archive "${esc(p.name)}"? It will no longer be sold, but its history is kept.`))) {
        await put("products", { ...p, archived: !p.archived });
        products = await getAll("products");
        draw();
      }
    });
    el.querySelector("#q").addEventListener("input", (e) => {
      q = e.target.value;
      draw();
    });
    el.querySelector("#arch").addEventListener("change", (e) => {
      arch = e.target.checked;
      draw();
    });
    el.querySelector("#add").addEventListener("click", () => form());
    el.querySelector("#exp").addEventListener("click", () => {
      const head = ["name", "sku", "barcode", "unit", "category", "price", "cost", "stock", "reorder"];
      const body = products.map((p) => [p.name, p.sku, p.barcode, p.unit, p.category, p.price / 100, p.cost / 100, p.stock, p.reorder].map(csvCell).join(","));
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([[head.map(csvCell).join(","), ...body].join("\n")], { type: "text/csv" })), download: "dukapos-products.csv" });
      a.click();
    });
    if (!can("products.edit")) {
      el.querySelector("#add").remove();
      el.querySelector("#imp").remove();
    }
    el.querySelector("#imp")?.addEventListener("click", () => el.querySelector("#impf").click());
    el.querySelector("#impf").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      let res;
      try {
        res = rowsToProducts(parseCsv(await file.text()), products);
      } catch (err) {
        return toast(err.message, "error");
      }
      const d = openDialog(`<h2>Import products</h2><p><b>${res.valid.length}</b> ready to import, <b>${res.errors.length}</b> with problems (skipped).</p>${res.errors.length ? `<div class="tbl-wrap"><table><tbody>${res.errors.slice(0, 8).map((x) => `<tr><td>Row ${x.row}</td><td>${esc(x.msg)}</td></tr>`).join("")}</tbody></table></div>` : ""}<p style="color:var(--grey)">Columns: name, price, cost (required); sku, barcode, unit, category, stock, reorder. Stock becomes opening stock.</p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok" ${res.valid.length ? "" : "disabled"}>Import ${res.valid.length}</button></div>`);
      d.addEventListener("click", async (ev) => {
        if (ev.target.dataset.a === "x") d.close();
        if (ev.target.dataset.a !== "ok") return;
        await importProductsTx(res.valid);
        products = await getAll("products");
        d.close();
        draw();
        toast(res.valid.length + " products imported");
      });
    });
    draw();
  }
  var UNITS2;
  var init_products = __esm({
    "js/modules/products.js"() {
      init_db();
      init_format();
      init_ui();
      init_calc();
      init_csv();
      init_session();
      UNITS2 = ["piece", "packet", "carton", "kg", "litre", "tray", "bottle"];
    }
  });

  // js/modules/purchases.js
  var purchases_exports = {};
  __export(purchases_exports, {
    render: () => render11
  });
  async function render11(el) {
    let purchases = [], suppliers = [], products = [];
    const load = async () => {
      [purchases, suppliers, products] = await Promise.all([getAll("purchases"), getAll("suppliers"), getAll("products")]);
      products = products.filter((p) => !p.archived);
    };
    const draw = () => {
      const rows = purchases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      el.querySelector("#tbl").innerHTML = rows.length ? `<table><thead><tr><th>Order</th><th>Supplier</th><th>Invoice</th><th>Status</th><th class="num">Total</th><th class="num">Paid</th><th></th></tr></thead><tbody>${rows.map((p) => `<tr><td>${esc(p.id)}</td><td>${esc(p.supplierName)}</td><td>${esc(p.invoiceNo)}</td><td><span class="tag ${p.status === "received" ? "" : "low"}">${p.status}</span></td><td class="num">${kes(p.total)}</td><td class="num">${kes(p.paid || 0)}</td><td class="num">${p.status === "ordered" ? `<button class="btn sm" data-a="recv" data-id="${p.id}">Receive goods</button> <button class="btn sm" data-a="edit" data-id="${p.id}">Edit</button> <button class="btn sm" data-a="cancel" data-id="${p.id}">Cancel</button>` : ""}</td></tr>`).join("")}</tbody></table>` : '<div class="empty"><b>No purchases yet</b>Create a purchase order, then receive the goods to update stock.</div>';
    };
    el.innerHTML = `<div class="bar"><span class="sp"></span><button class="btn pri" id="new">+ New purchase</button></div><div class="card"><div class="tbl-wrap" id="tbl"></div></div>`;
    const receive = async (id, paid, d) => {
      try {
        await receivePurchaseTx(id, paid);
      } catch (err) {
        return d.querySelector("#err").textContent = err.message;
      }
      d.close();
      toast("Goods received, stock updated");
      await load();
      draw();
    };
    function newPurchase(po = null) {
      if (!suppliers.length) return toast("Add a supplier first.", "error");
      if (!products.length) return toast("Add products first.", "error");
      const row = (l = {}) => `<div class="prow pl" style="grid-template-columns:1fr 90px 120px"><select data-p>${products.map((p) => `<option value="${p.id}" ${p.id === l.productId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select><input data-q type="number" min="0" step="any" placeholder="Qty" value="${l.qty ?? ""}"><input data-c type="number" min="0" step="0.01" placeholder="Unit cost KSh" value="${l.unitCost != null ? l.unitCost / 100 : ""}"></div>`;
      const d = openDialog(`<h2>${po ? "Edit " + esc(po.id) : "New purchase"}</h2><div class="fgrid"><label>Supplier<select id="sup">${suppliers.map((s) => `<option value="${s.id}" ${s.id === po?.supplierId ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label><label>Supplier invoice no.<input id="inv" value="${esc(po?.invoiceNo)}"></label></div><div id="lines" style="margin-top:10px">${(po?.lines || [{}]).map((l) => row(l)).join("")}</div><button class="btn sm" data-a="addl">+ Add line</button><div class="fgrid" style="margin-top:10px"><label>Paid now (KSh, receive only)<input id="paid" type="number" min="0" step="0.01" value="0"></label><div class="sum" id="tot"></div></div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn" data-a="order">Save as order</button><button class="btn pri" data-a="recv">Save &amp; receive</button></div>`);
      const lines = () => [...d.querySelectorAll(".pl")].map((r) => {
        const pid = r.querySelector("[data-p]").value;
        return { productId: pid, name: products.find((p) => p.id === pid).name, qty: Number(r.querySelector("[data-q]").value), unitCost: toCents(r.querySelector("[data-c]").value || 0) };
      });
      const total = () => lines().reduce((s, l) => s + Math.round((l.qty || 0) * l.unitCost), 0);
      d.addEventListener("input", () => d.querySelector("#tot").innerHTML = "Total: <b>" + kes(total()) + "</b>");
      d.addEventListener("click", async (e) => {
        const a = e.target.dataset.a;
        if (a === "x") d.close();
        if (a === "addl") d.querySelector("#lines").insertAdjacentHTML("beforeend", row());
        if (a !== "order" && a !== "recv") return;
        const sup = suppliers.find((s) => s.id === d.querySelector("#sup").value), ls = lines(), paid = a === "recv" ? toCents(d.querySelector("#paid").value || 0) : 0;
        const rec = { id: po?.id || "PO-" + nairobiDayKey(/* @__PURE__ */ new Date()).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(), supplierId: sup.id, supplierName: sup.name, invoiceNo: d.querySelector("#inv").value.trim(), createdAt: po?.createdAt || (/* @__PURE__ */ new Date()).toISOString(), status: "ordered", lines: ls, total: total() };
        const bad = validatePurchase(rec, paid);
        if (bad) return d.querySelector("#err").textContent = bad;
        await put("purchases", rec);
        if (a === "order") {
          d.close();
          toast("Purchase order saved");
          await load();
          return draw();
        }
        await receive(rec.id, paid, d);
      });
    }
    function cancelPO(id) {
      const d = openDialog(`<h2>Cancel ${esc(id)}</h2><p>No stock or supplier balance changes. The order stays in the list as cancelled.</p><label>Reason (required)<input id="why"></label><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Keep order</button><button class="btn pri" data-a="ok">Cancel order</button></div>`);
      d.addEventListener("click", async (ev) => {
        if (ev.target.dataset.a === "x") d.close();
        if (ev.target.dataset.a !== "ok") return;
        const why = d.querySelector("#why").value.trim(), cur = (await getAll("purchases")).find((x) => x.id === id);
        if (!why) return d.querySelector("#err").textContent = "A reason is required.";
        if (!cur || cur.status !== "ordered") return d.querySelector("#err").textContent = "This order can no longer be cancelled.";
        await put("purchases", { ...cur, status: "cancelled", cancelReason: why, cancelledAt: (/* @__PURE__ */ new Date()).toISOString() });
        d.close();
        toast("Order cancelled");
        await load();
        draw();
      });
    }
    el.querySelector("#new").addEventListener("click", () => newPurchase());
    el.addEventListener("click", (e) => {
      const A = e.target.dataset.a;
      if (A === "edit") return newPurchase(purchases.find((x) => x.id === e.target.dataset.id));
      if (A === "cancel") return cancelPO(e.target.dataset.id);
      if (A !== "recv" || !e.target.dataset.id) return;
      const id = e.target.dataset.id, p = purchases.find((x) => x.id === id);
      const d = openDialog(`<h2>Receive ${esc(id)}</h2><p>Total ${kes(p.total)}. Stock and costs update on receipt; the unpaid part becomes owed to the supplier.</p><label>Paid now (KSh)<input id="paid" type="number" min="0" step="0.01" value="0"></label><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="go">Receive goods</button></div>`);
      d.addEventListener("click", (ev) => {
        if (ev.target.dataset.a === "x") d.close();
        if (ev.target.dataset.a === "go") receive(id, toCents(d.querySelector("#paid").value || 0), d);
      });
    });
    await load();
    draw();
  }
  var init_purchases = __esm({
    "js/modules/purchases.js"() {
      init_db();
      init_format();
      init_ui();
      init_calc();
    }
  });

  // js/modules/reports.js
  var reports_exports = {};
  __export(reports_exports, {
    render: () => render12
  });
  async function render12(el) {
    const data = { sales: await getAll("sales"), expenses: await getAll("expenses"), products: await getAll("products") }, today = nairobiDayKey(/* @__PURE__ */ new Date());
    el.innerHTML = `<div class="bar"><label>Period <select id="k"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="week">This week (Mon-today)</option><option value="month">This month</option><option value="custom">Custom dates</option></select></label><span id="cu" hidden><input id="from" type="date" value="${today}"> to <input id="to" type="date" value="${today}"></span><span class="sp"></span><button class="btn" id="csv">Export sales CSV</button></div><div id="out"></div>`;
    const $ = (s) => el.querySelector(s);
    let cur;
    const tbl = (head, rows, empty2) => rows.length ? `<table><thead><tr>${head.map((h, i) => `<th class="${i ? "num" : ""}">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? "num" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table>` : `<div class="empty">${empty2}</div>`;
    const draw = () => {
      const [from, to] = periodRange($("#k").value, today, { from: $("#from").value, to: $("#to").value });
      const s = cur = summarizeRange(data, from, to);
      cur.range = [from, to];
      $("#cu").hidden = $("#k").value !== "custom";
      const kpi2 = (l, v, n, c = "") => `<div class="card kpi ${c}"><div class="n">${l}</div><div class="v">${kes(v)}</div><div class="n">${n}</div></div>`;
      $("#out").innerHTML = `<p style="color:var(--grey)">${from === to ? from : from + " to " + to} (Africa/Nairobi)</p><div class="grid kpis">${kpi2("Revenue", s.revenue, "After refunds, excluding tax")}${kpi2("Gross profit", s.grossProfit, "Revenue minus cost of goods")}${kpi2("Expenses", s.expenses, "Operating costs")}${kpi2("Net profit", s.netProfit, "Gross profit minus expenses", s.netProfit < 0 ? "bad" : "")}</div>
    <div class="grid two"><section class="card"><h2>Summary</h2>${tbl(["Measure", ""], [["Transactions", s.count], ["Cost of goods sold", kes(s.cogs)], ["Refunds paid out", kes(s.refunds)], ["Stock value now (at cost)", kes(s.stockValue)]], "")}</section>
    <section class="card"><h2>Payment methods (collected at sale)</h2>${tbl(["Method", "Amount"], Object.entries(s.payments).map(([m, a]) => [LBL2[m] || esc(m), kes(a)]), "No sales in this period.")}</section>
    <section class="card"><h2>Best-selling products</h2>${tbl(["Product", "Qty sold"], s.top.map(([n, q]) => [esc(n), q]), "No sales in this period.")}</section>
    <section class="card"><h2>Expenses by category</h2>${tbl(["Category", "Amount"], Object.entries(s.byCategory).map(([c, a]) => [esc(c), kes(a)]), "No expenses in this period.")}</section></div>`;
    };
    el.addEventListener("change", draw);
    el.addEventListener("input", (e) => {
      if (e.target.type === "date") draw();
    });
    $("#csv").addEventListener("click", () => {
      const rows = [["reference", "date", "customer", "status", "total_kes", "payments"], ...cur.sales.map((x) => [x.id, x.createdAt, x.customerName || "", x.status, x.total / 100, x.payments.map((p) => p.method).join("+")])];
      Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" })), download: `dukapos-sales-${cur.range[0]}_${cur.range[1]}.csv` }).click();
    });
    draw();
  }
  var LBL2;
  var init_reports = __esm({
    "js/modules/reports.js"() {
      init_db();
      init_format();
      init_csv();
      init_summary();
      LBL2 = { cash: "Cash", mpesa: "M-Pesa (not verified)", card: "Card (external)", credit: "On credit" };
    }
  });

  // js/modules/sales.js
  var sales_exports = {};
  __export(sales_exports, {
    render: () => render13
  });
  async function render13(el) {
    const st = await loadSettings();
    let sales = [], audit = [], q = "";
    const load = async () => {
      sales = (await getAll("sales")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      audit = (await getAll("audit")).filter((a) => a.action === "return" || a.action === "cancel").sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);
    };
    el.innerHTML = `<div class="bar"><input id="q" type="search" placeholder="Search by reference, customer or payment method"></div><div class="card"><div class="tbl-wrap" id="tbl"></div></div><div class="card" style="margin-top:16px"><h2>Audit log (returns and cancellations)</h2><div class="tbl-wrap" id="aud"></div></div>`;
    const draw = () => {
      const r = sales.filter((s) => (s.id + (s.customerName || "") + s.payments.map((p) => p.method)).toLowerCase().includes(q.toLowerCase()));
      el.querySelector("#tbl").innerHTML = r.length ? `<table><thead><tr><th>Ref</th><th>Date</th><th>Payment</th><th>Status</th><th class="num">Total</th><th></th></tr></thead><tbody>${r.map((s) => {
        const open = s.status !== "cancelled" && s.status !== "returned";
        return `<tr><td>${esc(s.id)}${s.customerName ? "<br><small>" + esc(s.customerName) + "</small>" : ""}</td><td>${when4(s.createdAt)}</td><td>${esc(s.payments.map((p) => p.method).join(" + "))}</td><td><span class="tag ${s.status === "completed" ? "" : "low"}">${s.status.replace("_", " ")}</span></td><td class="num">${kes(s.total)}</td><td class="num"><button class="btn sm" data-a="rcpt" data-id="${s.id}">Receipt</button>${open && can("sales.return") ? ` <button class="btn sm" data-a="ret" data-id="${s.id}">Return</button>` : ""}${open && can("sales.cancel") && !(s.returns || []).length ? ` <button class="btn sm" data-a="void" data-id="${s.id}">Cancel</button>` : ""}</td></tr>`;
      }).join("")}</tbody></table>` : '<div class="empty"><b>No sales found</b>Completed sales appear here.</div>';
      el.querySelector("#aud").innerHTML = audit.length ? `<table><thead><tr><th>When</th><th>Action</th><th>Sale</th><th>Reason</th><th class="num">Refund</th></tr></thead><tbody>${audit.map((a) => `<tr><td>${when4(a.at)}</td><td>${a.action}</td><td>${esc(a.saleId)}</td><td>${esc(a.reason)}</td><td class="num">${kes(a.refund)}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">No returns or cancellations yet.</div>';
    };
    function refundDialog(s, cancel) {
      const items = s.items.filter((l) => remainingQty(s, l.productId) > 0);
      const d = openDialog(`<h2>${cancel ? "Cancel" : "Return items from"} ${esc(s.id)}</h2>${cancel ? "<p>The whole sale is reversed and all items go back to stock (if restock is ticked).</p>" : items.map((l) => `<div class="cl" style="grid-template-columns:1fr 90px"><div class="cn">${esc(l.name)}<small>sold ${l.qty}, returnable ${remainingQty(s, l.productId)}</small></div><input data-rq="${l.productId}" type="number" min="0" max="${remainingQty(s, l.productId)}" step="any" value="0"></div>`).join("")}
      <div class="fgrid" style="margin-top:10px"><label>Refund method<select id="rm"><option value="cash">Cash</option><option value="mpesa">M-Pesa (sent manually)</option><option value="card">Card (external)</option>${s.customerId ? '<option value="credit_balance">Reduce customer credit owed</option>' : ""}</select></label><label>Put items back in stock<select id="rs"><option value="1">Yes</option><option value="0">No (damaged)</option></select></label><label style="grid-column:1/-1">Reason (required)<input id="why"></label></div><div class="sum" id="prev"></div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Close</button><button class="btn pri" data-a="ok">${cancel ? "Cancel sale" : "Process return"}</button></div>`);
      const picks = () => [...d.querySelectorAll("[data-rq]")].map((i) => ({ productId: i.dataset.rq, qty: Number(i.value) }));
      const preview = () => {
        try {
          const r = computeReturn(s, cancel ? s.items.map((l) => ({ productId: l.productId, qty: remainingQty(s, l.productId) })) : picks(), d.querySelector("#rs").value === "1");
          d.querySelector("#prev").innerHTML = "Refund: <b>" + kes(r.refund) + "</b>";
        } catch (e) {
          d.querySelector("#prev").textContent = e.message;
        }
      };
      d.addEventListener("input", preview);
      d.addEventListener("change", preview);
      preview();
      d.addEventListener("click", async (e) => {
        if (e.target.dataset.a === "x") d.close();
        if (e.target.dataset.a !== "ok") return;
        try {
          await returnSaleTx(s.id, { picks: picks(), restock: d.querySelector("#rs").value === "1", method: d.querySelector("#rm").value, reason: d.querySelector("#why").value, cancel, by: getSession().name });
        } catch (err) {
          return d.querySelector("#err").textContent = err.message;
        }
        d.close();
        toast(cancel ? "Sale cancelled" : "Return processed");
        await load();
        draw();
      });
    }
    el.addEventListener("input", (e) => {
      if (e.target.id === "q") {
        q = e.target.value;
        draw();
      }
    });
    el.addEventListener("click", (e) => {
      const { a, id } = e.target.dataset, s = sales.find((x) => x.id === id);
      if (a === "rcpt") showReceipt(s, st);
      if (a === "ret") refundDialog(s, false);
      if (a === "void") refundDialog(s, true);
    });
    await load();
    draw();
  }
  var when4;
  var init_sales = __esm({
    "js/modules/sales.js"() {
      init_db();
      init_format();
      init_receipt();
      init_settings();
      init_ui();
      init_session();
      init_returns();
      when4 = (d) => new Date(d).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
    }
  });

  // js/modules/settings.js
  var settings_exports = {};
  __export(settings_exports, {
    render: () => render14
  });
  async function render14(el) {
    const s = await loadSettings();
    el.innerHTML = `<div class="card"><h2>Shop profile and tax</h2><div class="fgrid"><label>Shop name<input id="name" value="${esc(s.shopName)}"></label><label>Phone (on receipts)<input id="phone" value="${esc(s.phone)}"></label><label>Tax rate % (0 = no tax)<input id="tax" type="number" min="0" max="100" step="0.01" value="${s.taxRate}"></label><label>Prices already include tax<select id="incl"><option value="1" ${s.taxInclusive ? "selected" : ""}>Yes (inclusive)</option><option value="0" ${s.taxInclusive ? "" : "selected"}>No (add tax on top)</option></select></label><label>Allow selling below zero stock<select id="neg"><option value="0" ${s.allowNegativeStock ? "" : "selected"}>No</option><option value="1" ${s.allowNegativeStock ? "selected" : ""}>Yes</option></select></label></div><p class="err" id="err"></p><div class="row"><button class="btn pri" id="save">Save settings</button></div></div>
  <div class="card" style="margin-top:16px"><h2>Data</h2><div class="row" style="justify-content:flex-start"><button class="btn" id="bk">Download backup (JSON)</button><button class="btn" id="demo">Remove demo data</button><button class="btn" id="rs">Restore from backup\u2026</button><input type="file" id="rf" accept=".json,application/json" hidden></div></div>`;
    const q = (i) => el.querySelector("#" + i);
    q("save").addEventListener("click", async () => {
      const tax = Number(q("tax").value);
      if (!q("name").value.trim()) return q("err").textContent = "Shop name is required.";
      if (!(tax >= 0 && tax <= 100)) return q("err").textContent = "Tax rate must be between 0 and 100.";
      await put("meta", { key: "settings", value: { shopName: q("name").value.trim(), phone: q("phone").value.trim(), taxRate: tax, taxInclusive: q("incl").value === "1", allowNegativeStock: q("neg").value === "1" } });
      q("err").textContent = "";
      toast("Settings saved");
    });
    const exportBackup = async () => {
      const out = { _format: "dukapos-backup", _exportedAt: (/* @__PURE__ */ new Date()).toISOString() };
      for (const k of STORES) out[k] = await getAll(k);
      Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" })), download: "dukapos-backup-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json" }).click();
    };
    q("bk").addEventListener("click", exportBackup);
    q("rs").addEventListener("click", () => q("rf").click());
    q("rf").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch {
        return toast("That file is not valid JSON.", "error");
      }
      const counts = ["products", "sales", "customers"].map((k) => (data[k] || []).length + " " + k).join(", ");
      if (!await confirmDialog("Replace ALL current data with this backup (" + counts + ")? A safety copy of your current data downloads first, then the app reloads.")) return;
      try {
        await exportBackup();
        await restoreTx(data);
      } catch (err) {
        return toast(err.message, "error");
      }
      toast("Backup restored");
      setTimeout(() => location.reload(), 600);
    });
    q("demo").addEventListener("click", async () => {
      if (!await confirmDialog("Remove all demo products, sales and expenses? Your own records are kept.")) return;
      const demoProducts = new Set((await getAll("products")).filter((p) => p.isDemo).map((p) => p.id));
      for (const st of ["products", "sales", "expenses", "movements"]) for (const r of await getAll(st)) if (r.isDemo || demoProducts.has(r.productId)) await remove(st, r.id);
      toast("Demo data removed");
    });
  }
  var init_settings2 = __esm({
    "js/modules/settings.js"() {
      init_db();
      init_settings();
      init_format();
      init_ui();
    }
  });

  // js/modules/suppliers.js
  var suppliers_exports = {};
  __export(suppliers_exports, {
    render: () => render15
  });
  var render15;
  var init_suppliers = __esm({
    "js/modules/suppliers.js"() {
      init_db();
      init_format();
      init_parties();
      render15 = (el) => partyPage(el, {
        store: "suppliers",
        prefix: "s",
        one: "supplier",
        plural: "suppliers",
        field: "balance",
        balanceLabel: "We owe",
        payLabel: "Pay supplier",
        hint: "Add the wholesalers and distributors you buy stock from.",
        defaults: {},
        fields: [{ k: "contact", label: "Contact person" }],
        cols: [{ h: "Contact", v: (r) => esc(r.contact) }],
        history: async (r) => histTable(["Order", "Invoice", "Status", "Total"], (await getAll("purchases")).filter((p) => p.supplierId === r.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => [esc(p.id), esc(p.invoiceNo), p.status, kes(p.total)]))
      });
    }
  });

  // js/modules/users.js
  var users_exports = {};
  __export(users_exports, {
    render: () => render16
  });
  async function render16(el) {
    let users = [];
    const me = getSession();
    const draw = async () => {
      users = (await getAll("users")).sort((a, b) => a.name.localeCompare(b.name));
      el.querySelector("#tbl").innerHTML = `<table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${users.map((u) => `<tr><td>${esc(u.name)}${u.id === me.userId ? " (you)" : ""}</td><td>${u.role}</td><td><span class="tag ${u.active ? "" : "low"}">${u.active ? "active" : "disabled"}</span></td><td class="num"><button class="btn sm" data-a="edit" data-id="${u.id}">Edit / reset PIN</button>${u.id === me.userId ? "" : ` <button class="btn sm" data-a="tog" data-id="${u.id}">${u.active ? "Disable" : "Enable"}</button>`}</td></tr>`).join("")}</tbody></table>`;
    };
    const adminsLeft = (skipId) => users.filter((u) => u.active && u.role === "admin" && u.id !== skipId).length;
    el.innerHTML = `<div class="bar"><span class="sp"></span><button class="btn pri" id="add">+ Add user</button></div><div class="card"><div class="tbl-wrap" id="tbl"></div></div><div class="card" style="margin-top:16px"><h2>Permissions by role</h2><div class="tbl-wrap"><table><thead><tr><th>Permission</th>${ROLES.map((r) => `<th class="num">${r}</th>`).join("")}</tr></thead><tbody>${Object.entries(PERMS).map(([p, min]) => `<tr><td>${p}</td>${ROLES.map((r) => `<td class="num">${ROLES.indexOf(r) >= ROLES.indexOf(min) ? "&#10003;" : "&ndash;"}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p style="color:var(--grey)">Checks run in the browser for this prototype. The backend must enforce the same rules on every request.</p></div>`;
    function form(u) {
      const d = openDialog(`<h2>${u ? "Edit" : "Add"} user</h2><div class="fgrid"><label>Name<input id="n" value="${esc(u?.name)}"></label><label>Role<select id="r">${ROLES.map((r) => `<option ${u?.role === r ? "selected" : ""}>${r}</option>`).join("")}</select></label><label style="grid-column:1/-1">${u ? "New PIN (leave blank to keep)" : "PIN (4-6 digits)"}<input id="p" type="password" inputmode="numeric" maxlength="6"></label></div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Save</button></div>`);
      d.addEventListener("click", async (e) => {
        if (e.target.dataset.a === "x") d.close();
        if (e.target.dataset.a !== "ok") return;
        const name = d.querySelector("#n").value.trim(), role = d.querySelector("#r").value, pin = d.querySelector("#p").value, err = (m) => d.querySelector("#err").textContent = m;
        if (!name) return err("Name is required.");
        if ((!u || pin) && !validPin(pin)) return err("PIN must be 4 to 6 digits.");
        if (users.some((x) => x.id !== u?.id && x.name.toLowerCase() === name.toLowerCase())) return err("That name is already used.");
        if (u && u.role === "admin" && role !== "admin" && !adminsLeft(u.id)) return err("There must be at least one active administrator.");
        const salt = pin ? newSalt() : u.salt, rec = { ...u || { id: "u" + Date.now().toString(36), active: true }, name, role, salt, pinHash: pin ? await hashPin(pin, salt) : u.pinHash };
        await put("users", rec);
        d.close();
        toast("User saved");
        draw();
      });
    }
    el.querySelector("#add").addEventListener("click", () => form(null));
    el.addEventListener("click", async (e) => {
      const { a, id } = e.target.dataset, u = users.find((x) => x.id === id);
      if (a === "edit") form(u);
      if (a === "tog") {
        if (u.active && u.role === "admin" && !adminsLeft(u.id)) return toast("There must be at least one active administrator.", "error");
        await put("users", { ...u, active: !u.active });
        draw();
      }
    });
    await draw();
  }
  var init_users = __esm({
    "js/modules/users.js"() {
      init_db();
      init_format();
      init_session();
      init_ui();
    }
  });

  // js/core/shell.js
  init_format();

  // js/services/seed.js
  init_db();
  var P = [
    ["Unga Jogoo 2kg", "Maize flour", "packet", 21e3, 18500, 40, 10],
    ["Sugar Mumias 1kg", "Sugar", "packet", 17500, 15500, 8, 12],
    ["Cooking Oil Fresh Fry 1L", "Oils", "bottle", 38e3, 33e3, 25, 8],
    ["Milk KCC 500ml", "Dairy", "packet", 6500, 5500, 60, 20],
    ["Bread Supaloaf 400g", "Bakery", "piece", 6500, 5600, 30, 10],
    ["Eggs (tray of 30)", "Eggs", "tray", 52e3, 46e3, 6, 4],
    ["Rice Pishori 1kg", "Grains", "kg", 24e3, 20500, 35, 10],
    ["Tea Leaves Ketepa 250g", "Beverages", "packet", 14e3, 11800, 22, 8],
    ["Soap Omo 500g", "Household", "packet", 21500, 18e3, 3, 6],
    ["Toothpaste Colgate", "Personal care", "piece", 15e3, 12500, 18, 6],
    ["Soda Coca-Cola 500ml", "Beverages", "bottle", 7e3, 5500, 80, 24],
    ["Airtime Safaricom KSh 50", "Services", "piece", 5e3, 4800, 100, 20]
  ];
  async function seedIfEmpty() {
    if (await get("meta", "seeded")) return false;
    const products = P.map(([name, category, unit, price, cost, stock, reorder], i) => ({ id: "p" + (i + 1), name, category, unit, price, cost, stock, reorder, archived: false, isDemo: true }));
    const now = Date.now(), sales = [];
    for (let i = 0; i < 14; i++) {
      const items = [0, 1, 2].slice(0, 1 + i % 3).map((k) => {
        const p = products[(i * 3 + k * 5) % products.length], qty = 1 + (i + k) % 3;
        return { productId: p.id, name: p.name, qty, unitPrice: p.price, unitCost: p.cost };
      });
      const total = items.reduce((s, l) => s + l.qty * l.unitPrice, 0);
      const method = ["cash", "mpesa", "cash", "card"][i % 4];
      sales.push({ id: "DEMO-" + String(i + 1).padStart(4, "0"), createdAt: new Date(now - i * 47 * 6e4).toISOString(), status: "completed", items, total, payments: [{ method, amount: total }], isDemo: true });
    }
    const expenses = [{ id: "e1", createdAt: new Date(now - 36e5).toISOString(), category: "Transport", amount: 3e4, method: "cash", note: "Stock delivery", isDemo: true }];
    await putMany([...products.map((value) => ({ store: "products", value })), ...sales.map((value) => ({ store: "sales", value })), ...expenses.map((value) => ({ store: "expenses", value })), { store: "meta", value: { key: "seeded", at: (/* @__PURE__ */ new Date()).toISOString() } }]);
    return true;
  }

  // js/core/shell.js
  init_db();
  init_session();

  // import("../modules/**/*.js") in js/core/shell.js
  var globImport_modules_js = __glob({
    "../modules/calc.js": () => Promise.resolve().then(() => (init_calc(), calc_exports)),
    "../modules/cash.js": () => Promise.resolve().then(() => (init_cash(), cash_exports)),
    "../modules/categories.js": () => Promise.resolve().then(() => (init_categories(), categories_exports)),
    "../modules/customers.js": () => Promise.resolve().then(() => (init_customers(), customers_exports)),
    "../modules/dashboard.js": () => Promise.resolve().then(() => (init_dashboard(), dashboard_exports)),
    "../modules/expenses.js": () => Promise.resolve().then(() => (init_expenses(), expenses_exports)),
    "../modules/inventory.js": () => Promise.resolve().then(() => (init_inventory(), inventory_exports)),
    "../modules/login.js": () => Promise.resolve().then(() => (init_login(), login_exports)),
    "../modules/parties.js": () => Promise.resolve().then(() => (init_parties(), parties_exports)),
    "../modules/pending.js": () => Promise.resolve().then(() => (init_pending(), pending_exports)),
    "../modules/pos.js": () => Promise.resolve().then(() => (init_pos(), pos_exports)),
    "../modules/products.js": () => Promise.resolve().then(() => (init_products(), products_exports)),
    "../modules/purchases.js": () => Promise.resolve().then(() => (init_purchases(), purchases_exports)),
    "../modules/receipt.js": () => Promise.resolve().then(() => (init_receipt(), receipt_exports)),
    "../modules/reports.js": () => Promise.resolve().then(() => (init_reports(), reports_exports)),
    "../modules/sales.js": () => Promise.resolve().then(() => (init_sales(), sales_exports)),
    "../modules/settings.js": () => Promise.resolve().then(() => (init_settings2(), settings_exports)),
    "../modules/summary.js": () => Promise.resolve().then(() => (init_summary(), summary_exports)),
    "../modules/suppliers.js": () => Promise.resolve().then(() => (init_suppliers(), suppliers_exports)),
    "../modules/users.js": () => Promise.resolve().then(() => (init_users(), users_exports))
  });

  // js/core/shell.js
  var I = {
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    cart: "M3 4h3l2 11h10l2-8H7M9 20h.01M17 20h.01",
    box: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
    tag: "M3 12V3h9l9 9-9 9zM7.5 7.5h.01",
    stack: "M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4",
    truck: "M2 6h11v10H2zM13 9h5l3 3v4h-8M6 19h.01M17 19h.01",
    users: "M16 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7M21 20v-2a4 4 0 00-3-3.8",
    wallet: "M3 7h18v13H3zM3 7l3-4h12l3 4M16 13h2",
    list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    chart: "M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-9",
    cash: "M2 6h20v12H2zM12 9a3 3 0 100 6 3 3 0 000-6",
    shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
    cog: "M12 9a3 3 0 100 6 3 3 0 000-6M12 2v3M12 19v3M2 12h3M19 12h3"
  };
  var ROUTES = [
    { id: "dashboard", title: "Dashboard", icon: "grid", phase: 1, mod: "dashboard" },
    { id: "pos", mod: "pos", title: "Point of Sale", icon: "cart", phase: 3 },
    { id: "products", mod: "products", title: "Products", icon: "box", phase: 2 },
    { id: "categories", mod: "categories", title: "Categories", icon: "tag", phase: 2 },
    { id: "inventory", mod: "inventory", title: "Inventory", icon: "stack", phase: 2 },
    { id: "purchases", mod: "purchases", title: "Purchases", icon: "truck", phase: 4 },
    { id: "suppliers", mod: "suppliers", title: "Suppliers", icon: "truck", phase: 4 },
    { id: "customers", mod: "customers", title: "Customers", icon: "users", phase: 4 },
    { id: "expenses", mod: "expenses", title: "Expenses", icon: "wallet", phase: 4 },
    { id: "sales", mod: "sales", title: "Sales History", icon: "list", phase: 5 },
    { id: "reports", mod: "reports", title: "Reports", icon: "chart", phase: 5 },
    { id: "cash", mod: "cash", title: "Cash Management", icon: "cash", phase: 4 },
    { id: "users", mod: "users", title: "Users & Permissions", icon: "shield", phase: 5 },
    { id: "login", mod: "login", title: "Login / PIN", icon: "shield", phase: 5, hidden: true },
    { id: "settings", mod: "settings", title: "Settings", icon: "cog", phase: 6 }
  ];
  var NEED = { dashboard: "reports.view", pos: "pos.sell", products: "products.view", categories: "categories.manage", inventory: "inventory.view", purchases: "purchases.manage", suppliers: "suppliers.manage", customers: "customers.manage", expenses: "expenses.manage", sales: "sales.view", reports: "reports.view", cash: "cash.manage", users: "users.manage", settings: "settings.edit" };
  async function boot() {
    const id = document.body.dataset.page, route = ROUTES.find((r) => r.id === id) || ROUTES[0], app = document.getElementById("app");
    try {
      if (id === "login") return (await Promise.resolve().then(() => (init_login(), login_exports))).render(app);
      const saved = getSession(), user = saved && await get("users", saved.userId);
      if (!user || !user.active) {
        clearSession();
        location.replace("login.html");
        return;
      }
      setSession(user);
      const sess = getSession();
      app.innerHTML = `<div class="shell"><aside class="sidebar" id="sidebar" aria-label="Main navigation"><a class="brand" href="${can("reports.view", sess) ? "dashboard" : "pos"}.html"><img src="../assets/logo.svg" alt="" width="34" height="34"><span>DukaPOS</span></a><nav>${ROUTES.filter((r) => !r.hidden && can(NEED[r.id], sess)).map((r) => `<a href="${r.id}.html" class="${r.id === route.id ? "active" : ""}"><svg viewBox="0 0 24 24"><path d="${I[r.icon]}"/></svg>${esc(r.title)}</a>`).join("")}</nav></aside>
    <div class="main"><header class="topbar"><button class="icon-btn menu-btn" id="menuBtn" aria-label="Toggle menu">&#9776;</button><h1>${esc(route.title)}</h1><div class="status" id="netStatus" role="status"></div><div class="status"><span class="pill">${esc(sess.name)} \xB7 ${sess.role}</span><button class="btn sm" id="logout">Sign out</button></div></header><main id="view" tabindex="-1"><div class="loading">Loading\u2026</div></main>
    <footer class="footer">DukaPOS \xB7 built under Vectra Core \xB7 local prototype: sign-in is not real security until the backend exists</footer></div></div>`;
      const net = () => {
        const on = navigator.onLine;
        document.getElementById("netStatus").innerHTML = `<span class="pill ${on ? "" : "warn"}">${on ? "Online" : "Offline"}</span><span class="pill warn">Sync: not connected</span>`;
      };
      net();
      addEventListener("online", net);
      addEventListener("offline", net);
      document.getElementById("menuBtn").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
      document.getElementById("logout").addEventListener("click", () => {
        clearSession();
        location.href = "login.html";
      });
      document.title = route.title + " \xB7 DukaPOS";
      const view = document.getElementById("view");
      if (!can(NEED[route.id], sess)) {
        view.innerHTML = `<div class="card empty"><b>Access denied</b>Your role (${sess.role}) cannot open ${esc(route.title)}. Ask a supervisor or administrator.</div>`;
        return;
      }
      await seedIfEmpty();
      const m = await globImport_modules_js(`../modules/${route.mod || "pending"}.js`);
      await m.render(view, route);
    } catch (err) {
      console.error(err);
      app.insertAdjacentHTML("beforeend", `<div class="card empty"><b>Could not load this screen</b>${esc(err.message)}</div>`);
    }
  }

  // js/boot.js
  boot();
})();
