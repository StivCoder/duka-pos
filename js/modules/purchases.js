import { getAll, put, receivePurchaseTx } from '../core/db.js';
import { kes, toCents, esc, nairobiDayKey } from '../core/format.js';
import { openDialog, toast } from '../core/ui.js';
import { validatePurchase } from './calc.js';
export async function render(el) {
  let purchases = [], suppliers = [], products = [];
  const load = async () => { [purchases, suppliers, products] = await Promise.all([getAll('purchases'), getAll('suppliers'), getAll('products')]); products = products.filter((p) => !p.archived); };
  const draw = () => {
    const rows = purchases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    el.querySelector('#tbl').innerHTML = rows.length ? `<table><thead><tr><th>Order</th><th>Supplier</th><th>Invoice</th><th>Status</th><th class="num">Total</th><th class="num">Paid</th><th></th></tr></thead><tbody>${rows.map((p) => `<tr><td>${esc(p.id)}</td><td>${esc(p.supplierName)}</td><td>${esc(p.invoiceNo)}</td><td><span class="tag ${p.status === 'received' ? '' : 'low'}">${p.status}</span></td><td class="num">${kes(p.total)}</td><td class="num">${kes(p.paid || 0)}</td><td class="num">${p.status === 'ordered' ? `<button class="btn sm" data-a="recv" data-id="${p.id}">Receive goods</button> <button class="btn sm" data-a="edit" data-id="${p.id}">Edit</button> <button class="btn sm" data-a="cancel" data-id="${p.id}">Cancel</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty"><b>No purchases yet</b>Create a purchase order, then receive the goods to update stock.</div>';
  };
  el.innerHTML = `<div class="bar"><span class="sp"></span><button class="btn pri" id="new">+ New purchase</button></div><div class="card"><div class="tbl-wrap" id="tbl"></div></div>`;
  const receive = async (id, paid, d) => {
    try { await receivePurchaseTx(id, paid); } catch (err) { return (d.querySelector('#err').textContent = err.message); }
    d.close(); toast('Goods received, stock updated'); await load(); draw();
  };
  function newPurchase(po = null) {
    if (!suppliers.length) return toast('Add a supplier first.', 'error');
    if (!products.length) return toast('Add products first.', 'error');
    const row = (l = {}) => `<div class="prow pl" style="grid-template-columns:1fr 90px 120px"><select data-p>${products.map((p) => `<option value="${p.id}" ${p.id === l.productId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><input data-q type="number" min="0" step="any" placeholder="Qty" value="${l.qty ?? ''}"><input data-c type="number" min="0" step="0.01" placeholder="Unit cost KSh" value="${l.unitCost != null ? l.unitCost / 100 : ''}"></div>`;
    const d = openDialog(`<h2>${po ? 'Edit ' + esc(po.id) : 'New purchase'}</h2><div class="fgrid"><label>Supplier<select id="sup">${suppliers.map((s) => `<option value="${s.id}" ${s.id === po?.supplierId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label><label>Supplier invoice no.<input id="inv" value="${esc(po?.invoiceNo)}"></label></div><div id="lines" style="margin-top:10px">${(po?.lines || [{}]).map((l) => row(l)).join('')}</div><button class="btn sm" data-a="addl">+ Add line</button><div class="fgrid" style="margin-top:10px"><label>Paid now (KSh, receive only)<input id="paid" type="number" min="0" step="0.01" value="0"></label><div class="sum" id="tot"></div></div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn" data-a="order">Save as order</button><button class="btn pri" data-a="recv">Save &amp; receive</button></div>`);
    const lines = () => [...d.querySelectorAll('.pl')].map((r) => { const pid = r.querySelector('[data-p]').value; return { productId: pid, name: products.find((p) => p.id === pid).name, qty: Number(r.querySelector('[data-q]').value), unitCost: toCents(r.querySelector('[data-c]').value || 0) }; });
    const total = () => lines().reduce((s, l) => s + Math.round((l.qty || 0) * l.unitCost), 0);
    d.addEventListener('input', () => (d.querySelector('#tot').innerHTML = 'Total: <b>' + kes(total()) + '</b>'));
    d.addEventListener('click', async (e) => {
      const a = e.target.dataset.a; if (a === 'x') d.close();
      if (a === 'addl') d.querySelector('#lines').insertAdjacentHTML('beforeend', row());
      if (a !== 'order' && a !== 'recv') return;
      const sup = suppliers.find((s) => s.id === d.querySelector('#sup').value), ls = lines(), paid = a === 'recv' ? toCents(d.querySelector('#paid').value || 0) : 0;
      const rec = { id: po?.id || 'PO-' + nairobiDayKey(new Date()).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(), supplierId: sup.id, supplierName: sup.name, invoiceNo: d.querySelector('#inv').value.trim(), createdAt: po?.createdAt || new Date().toISOString(), status: 'ordered', lines: ls, total: total() };
      const bad = validatePurchase(rec, paid); if (bad) return (d.querySelector('#err').textContent = bad);
      await put('purchases', rec);
      if (a === 'order') { d.close(); toast('Purchase order saved'); await load(); return draw(); }
      await receive(rec.id, paid, d);
    });
  }
  function cancelPO(id) {
    const d = openDialog(`<h2>Cancel ${esc(id)}</h2><p>No stock or supplier balance changes. The order stays in the list as cancelled.</p><label>Reason (required)<input id="why"></label><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Keep order</button><button class="btn pri" data-a="ok">Cancel order</button></div>`);
    d.addEventListener('click', async (ev) => {
      if (ev.target.dataset.a === 'x') d.close(); if (ev.target.dataset.a !== 'ok') return;
      const why = d.querySelector('#why').value.trim(), cur = (await getAll('purchases')).find((x) => x.id === id);
      if (!why) return (d.querySelector('#err').textContent = 'A reason is required.'); if (!cur || cur.status !== 'ordered') return (d.querySelector('#err').textContent = 'This order can no longer be cancelled.');
      await put('purchases', { ...cur, status: 'cancelled', cancelReason: why, cancelledAt: new Date().toISOString() }); d.close(); toast('Order cancelled'); await load(); draw();
    });
  }
  el.querySelector('#new').addEventListener('click', () => newPurchase());
  el.addEventListener('click', (e) => {
    const A = e.target.dataset.a;
    if (A === 'edit') return newPurchase(purchases.find((x) => x.id === e.target.dataset.id));
    if (A === 'cancel') return cancelPO(e.target.dataset.id);
    if (A !== 'recv' || !e.target.dataset.id) return;
    const id = e.target.dataset.id, p = purchases.find((x) => x.id === id);
    const d = openDialog(`<h2>Receive ${esc(id)}</h2><p>Total ${kes(p.total)}. Stock and costs update on receipt; the unpaid part becomes owed to the supplier.</p><label>Paid now (KSh)<input id="paid" type="number" min="0" step="0.01" value="0"></label><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="go">Receive goods</button></div>`);
    d.addEventListener('click', (ev) => { if (ev.target.dataset.a === 'x') d.close(); if (ev.target.dataset.a === 'go') receive(id, toCents(d.querySelector('#paid').value || 0), d); });
  });
  await load(); draw();
}
