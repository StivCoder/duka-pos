import { getAll, get, put, remove, checkoutTx } from '../core/db.js';
import { kes, toCents, esc, nairobiDayKey } from '../core/format.js';
import { computeTotals, settlePayments, pointsFor } from './calc.js';
import { showReceipt } from './receipt.js';
import { loadSettings } from '../services/settings.js';
import { openDialog, toast } from '../core/ui.js';
import { can, getSession } from '../core/session.js';
const newId = () => `S-${nairobiDayKey(new Date()).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
const fresh = () => ({ saleId: newId(), lines: [], discount: { type: 'percent', value: 0 } });
export async function render(el) {
  const st = await loadSettings();
  let products = (await getAll('products')).filter((p) => !p.archived);
  let customers = await getAll('customers'), cat = '';
  const noShift = !(await getAll('shifts')).some((s) => s.status === 'open');
  let cart = (await get('meta', 'cart'))?.value || fresh(), q = '', busy = false;
  const save = () => put('meta', { key: 'cart', value: cart });
  const totals = () => computeTotals({ lines: cart.lines, discount: cart.discount, taxRate: st.taxRate, taxInclusive: st.taxInclusive });
  el.innerHTML = `<div class="pos"><section>${noShift ? '<div class="banner">No cash shift is open. Open one in Cash Management so cash sales are reconciled.</div>' : ''}<div class="chips" id="chips"></div><input id="q" type="search" placeholder="Search, or scan a barcode and press Enter" autocomplete="off"><div id="grid" class="pgrid"></div></section><aside class="card" id="cart"></aside></div>`;
  const $ = (s) => el.querySelector(s);
  const match = () => products.filter((p) => (!cat || p.category === cat) && [p.name, p.sku, p.barcode, p.category].some((x) => (x || '').toLowerCase().includes(q.toLowerCase())));
  const drawChips = () => { const names = [...new Set(products.map((p) => p.category).filter(Boolean))].sort(); $('#chips').innerHTML = names.length ? ['', ...names].map((n) => `<button class="chip ${n === cat ? 'on' : ''}" data-a="cat" data-id="${esc(n)}">${n ? esc(n) : 'All'}</button>`).join('') : ''; };
  const drawGrid = () => {
    const m = match();
    $('#grid').innerHTML = m.length ? m.map((p) => `<button class="pbtn" data-a="add" data-id="${p.id}" ${p.stock <= 0 && !st.allowNegativeStock ? 'disabled' : ''}><b>${esc(p.name)}</b><span>${kes(p.price)}</span><small>${p.stock} ${esc(p.unit)} left</small></button>`).join('') : '<div class="empty"><b>No matching products</b>Check the spelling or barcode.</div>';
  };
  const drawCart = () => {
    const t = totals(), d = cart.discount;
    $('#cart').innerHTML = `<h2>Cart</h2>${cart.lines.length ? cart.lines.map((l) => `<div class="cl"><div class="cn">${esc(l.name)}<small>${kes(l.unitPrice)} / ${esc(l.unit)}</small></div><div class="qty"><button class="btn sm" data-a="dec" data-id="${l.productId}">−</button><input data-a="qty" data-id="${l.productId}" type="number" min="0" step="any" value="${l.qty}"><button class="btn sm" data-a="inc" data-id="${l.productId}">+</button></div><div class="num">${kes(Math.round(l.qty * l.unitPrice))}</div><button class="btn sm" data-a="rm" data-id="${l.productId}" aria-label="Remove">✕</button></div>`).join('') : '<div class="empty"><b>Cart is empty</b>Tap a product or scan a barcode.</div>'}
      <label class="disc">Customer <select data-a="cust"><option value="">Walk-in</option>${customers.map((c) => `<option value="${c.id}" ${c.id === cart.customerId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <div class="disc">Discount <select data-a="dtype" ${can('pos.discount') ? '' : 'disabled title="Needs supervisor"'}><option value="percent" ${d.type === 'percent' ? 'selected' : ''}>%</option><option value="amount" ${d.type === 'amount' ? 'selected' : ''}>KSh</option></select><input data-a="dval" ${can('pos.discount') ? '' : 'disabled'} type="number" min="0" step="any" value="${d.type === 'amount' ? d.value / 100 : d.value}"></div>
      <div class="tot"><div><span>Subtotal</span><span>${kes(t.subtotal)}</span></div>${t.discount ? `<div><span>Discount</span><span>-${kes(t.discount)}</span></div>` : ''}${st.taxRate ? `<div><span>Tax ${st.taxRate}%${st.taxInclusive ? ' (incl.)' : ''}</span><span>${kes(t.tax)}</span></div>` : ''}<div class="grand"><span>Total</span><span>${kes(t.total)}</span></div></div>
      <div class="row"><button class="btn" data-a="park">Park</button><button class="btn" data-a="parked">Parked</button><button class="btn" data-a="clear">Clear</button></div><button class="btn pri big" data-a="pay" ${cart.lines.length ? '' : 'disabled'}>Pay ${kes(t.total)}</button>`;
  };
  const draw = () => { drawChips(); drawGrid(); drawCart(); save(); };
  function add(id) {
    const p = products.find((x) => x.id === id); if (!p) return;
    const line = cart.lines.find((l) => l.productId === id), next = (line?.qty || 0) + 1;
    if (!st.allowNegativeStock && next > p.stock) return toast(`Only ${p.stock} of ${p.name} in stock.`, 'error');
    if (line) line.qty = next; else cart.lines.push({ productId: id, name: p.name, unit: p.unit, qty: 1, unitPrice: p.price, unitCost: p.cost });
    draw();
  }
  function setQty(id, qty) {
    const p = products.find((x) => x.id === id);
    if (!(qty > 0)) cart.lines = cart.lines.filter((l) => l.productId !== id);
    else if (!st.allowNegativeStock && qty > p.stock) { toast(`Only ${p.stock} of ${p.name} in stock.`, 'error'); }
    else cart.lines.find((l) => l.productId === id).qty = qty;
    draw();
  }
  async function park() {
    if (!cart.lines.length) return toast('Nothing to park.', 'error');
    const list = (await get('meta', 'parked'))?.value || [];
    await put('meta', { key: 'parked', value: [...list, { ...cart, parkedAt: new Date().toISOString() }] });
    cart = fresh(); draw(); toast('Sale parked');
  }
  async function showParked() {
    const list = (await get('meta', 'parked'))?.value || [];
    const d = openDialog(`<h2>Parked sales</h2>${list.length ? list.map((c, i) => `<div class="cl"><div class="cn">${c.lines.length} item(s)<small>${new Date(c.parkedAt).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi' })}</small></div><div class="num">${kes(computeTotals({ ...c, taxRate: st.taxRate, taxInclusive: st.taxInclusive }).total)}</div><button class="btn sm" data-a="res" data-i="${i}">Resume</button><button class="btn sm" data-a="del" data-i="${i}">Delete</button></div>`).join('') : '<div class="empty"><b>No parked sales</b></div>'}<div class="row"><button class="btn" data-a="x">Close</button></div>`);
    d.addEventListener('click', async (e) => {
      const { a, i } = e.target.dataset; if (!a) return; if (a === 'x') return d.close();
      const rest = list.filter((_, k) => k !== Number(i)), pick = list[i];
      await put('meta', { key: 'parked', value: cart.lines.length && a === 'res' ? [...rest, { ...cart, parkedAt: new Date().toISOString() }] : rest });
      if (a === 'res') { cart = { saleId: pick.saleId, lines: pick.lines, discount: pick.discount, customerId: pick.customerId }; draw(); }
      d.close();
    });
  }
  function pay() {
    const t = totals(); let rows = [{ method: 'cash', amount: String(t.total / 100), ref: '' }];
    const d = openDialog(`<h2>Payment · ${kes(t.total)}</h2><div id="rows"></div><button class="btn sm" data-a="add">+ Split payment</button><div id="sum" class="sum"></div><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Complete sale</button></div>`);
    const read = () => rows.map((r, i) => ({ method: d.querySelector(`[data-m="${i}"]`).value, amount: toCents(d.querySelector(`[data-v="${i}"]`).value || 0), ref: d.querySelector(`[data-r="${i}"]`).value }));
    const sum = () => { const s = settlePayments(t.total, read(), { customerId: cart.customerId }); d.querySelector('#sum').innerHTML = s.ok ? `Change to give: <b>${kes(s.change)}</b>` : `<span class="err">${s.short ? 'Short by ' + kes(s.short) : s.error}</span>`; return s; };
    const drawRows = () => { d.querySelector('#rows').innerHTML = rows.map((r, i) => `<div class="prow"><select data-m="${i}"><option value="cash" ${r.method === 'cash' ? 'selected' : ''}>Cash</option><option value="mpesa" ${r.method === 'mpesa' ? 'selected' : ''}>M-Pesa</option><option value="card" ${r.method === 'card' ? 'selected' : ''}>Card</option><option value="credit" ${r.method === 'credit' ? 'selected' : ''}>On credit</option></select><input data-v="${i}" type="number" min="0" step="0.01" value="${r.amount}"><input data-r="${i}" placeholder="${r.method === 'mpesa' ? 'M-Pesa code (required)' : 'Reference (optional)'}" value="${esc(r.ref)}"></div>`).join(''); sum(); };
    d.addEventListener('input', sum);
    d.addEventListener('change', (e) => { if (e.target.dataset.m !== undefined) { rows = read().map((r) => ({ ...r, amount: String(r.amount / 100) })); drawRows(); } });
    d.addEventListener('click', async (e) => {
      const a = e.target.dataset.a;
      if (a === 'x') d.close();
      if (a === 'add') { rows = [...read().map((r) => ({ ...r, amount: String(r.amount / 100) })), { method: 'mpesa', amount: '', ref: '' }]; drawRows(); }
      if (a !== 'ok' || busy) return;
      const s = sum(); if (!s.ok) return toast(s.short ? 'Payment is short.' : s.error, 'error');
      busy = true; e.target.disabled = true;
      const cust = customers.find((c) => c.id === cart.customerId);
      const sale = { id: cart.saleId, createdAt: new Date().toISOString(), status: 'completed', cashier: getSession().name, cashierId: getSession().userId, items: cart.lines.map((l) => ({ ...l })), subtotal: t.subtotal, discount: t.discount, tax: t.tax, taxRate: st.taxRate, taxInclusive: st.taxInclusive, total: t.total, payments: s.recorded, tendered: s.tendered, change: s.change, ...(cust ? { customerId: cust.id, customerName: cust.name, points: pointsFor(t.total) } : {}) };
      try { await checkoutTx(sale, st.allowNegativeStock); }
      catch (err) { busy = false; e.target.disabled = false; return toast(err.message, 'error'); }
      await remove('meta', 'cart'); cart = fresh(); products = (await getAll('products')).filter((p) => !p.archived); customers = await getAll('customers'); busy = false; draw(); d.close(); showReceipt(sale, st);
    });
    drawRows();
  }
  el.addEventListener('click', (e) => {
    const { a, id } = e.target.dataset, l = cart.lines.find((x) => x.productId === id);
    if (a === 'cat') { cat = id; draw(); }
    if (a === 'add') add(id); if (a === 'inc') setQty(id, l.qty + 1); if (a === 'dec') setQty(id, l.qty - 1); if (a === 'rm') setQty(id, 0);
    if (a === 'park') park(); if (a === 'parked') showParked(); if (a === 'pay') pay();
    if (a === 'clear' && cart.lines.length) { cart = fresh(); draw(); }
  });
  el.addEventListener('change', (e) => {
    const { a, id } = e.target.dataset;
    if (a === 'cust') { cart.customerId = e.target.value || null; draw(); }
    if (a === 'qty') setQty(id, Number(e.target.value));
    if (a === 'dtype') { cart.discount = { type: e.target.value, value: 0 }; draw(); }
    if (a === 'dval') { const v = Math.max(0, Number(e.target.value) || 0); cart.discount.value = cart.discount.type === 'amount' ? toCents(v) : Math.min(v, 100); draw(); }
  });
  $('#q').addEventListener('input', (e) => { q = e.target.value; drawGrid(); });
  $('#q').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !q.trim()) return;
    const exact = products.find((p) => [p.barcode, p.sku].some((x) => x && x.toLowerCase() === q.trim().toLowerCase())), m = match();
    const hit = exact || (m.length === 1 ? m[0] : null);
    if (hit) { add(hit.id); q = ''; e.target.value = ''; drawGrid(); } else toast('No single match for "' + q + '".', 'error');
  });
  draw(); $('#q').focus();
}
