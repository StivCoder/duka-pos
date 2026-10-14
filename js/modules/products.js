import { getAll, put, importProductsTx } from '../core/db.js';
import { kes, toCents, esc } from '../core/format.js';
import { openDialog, toast, confirmDialog } from '../core/ui.js';
import { validateProduct, rowsToProducts } from './calc.js';
import { parseCsv, csvCell } from '../core/csv.js';
import { can } from '../core/session.js';
const UNITS = ['piece', 'packet', 'carton', 'kg', 'litre', 'tray', 'bottle'];
export async function render(el) {
  let products = await getAll('products'), q = '', arch = false;
  el.innerHTML = `<div class="bar"><input id="q" type="search" placeholder="Search name, SKU or barcode"><label><input type="checkbox" id="arch"> Show archived</label><span class="sp"></span><button class="btn" id="exp">Export CSV</button><button class="btn" id="imp">Import CSV</button><input type="file" id="impf" accept=".csv,text/csv" hidden><button class="btn pri" id="add">+ Add product</button></div><div class="card"><div class="tbl-wrap" id="tbl"></div></div>`;
  const draw = () => {
    const rows = products.filter((p) => (arch || !p.archived) && [p.name, p.sku, p.barcode].some((x) => (x || '').toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name));
    el.querySelector('#tbl').innerHTML = rows.length ? `<table><thead><tr><th>Name</th><th>SKU</th><th>Unit</th><th class="num">Price</th><th class="num">Cost</th><th class="num">Stock</th><th></th></tr></thead><tbody>${rows.map((p) => `<tr class="${p.archived ? 'dim' : ''}"><td>${esc(p.name)}${p.archived ? ' <span class="tag">archived</span>' : ''}${p.stock <= p.reorder && !p.archived ? ' <span class="tag low">low</span>' : ''}</td><td>${esc(p.sku)}</td><td>${esc(p.unit)}</td><td class="num">${kes(p.price)}</td><td class="num">${kes(p.cost)}</td><td class="num">${p.stock}</td><td class="num">${can('products.edit') ? `<button class="btn sm" data-a="edit" data-id="${p.id}">Edit</button> <button class="btn sm" data-a="arc" data-id="${p.id}">${p.archived ? 'Restore' : 'Archive'}</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty"><b>No products found</b>Add a product or change the search.</div>';
  };
  async function form(p = null) {
    const names = (await getAll('categories')).map((c) => c.name).sort(); if (p?.category && !names.includes(p.category)) names.push(p.category);
    const catOpts = ['', ...names].map((n) => `<option ${n === (p?.category || '') ? 'selected' : ''}>${esc(n)}</option>`).join('');
    const v = p || { name: '', sku: '', barcode: '', unit: 'piece', category: '', price: 0, cost: 0, stock: 0, reorder: 5 };
    const d = openDialog(`<h2>${p ? 'Edit' : 'Add'} product</h2><div class="fgrid">
      <label>Name<input id="f_name" value="${esc(v.name)}"></label><label>Category<select id="f_category">${catOpts}</select></label>
      <label>SKU<input id="f_sku" value="${esc(v.sku)}"></label><label>Barcode<input id="f_barcode" value="${esc(v.barcode)}"></label>
      <label>Unit<select id="f_unit">${UNITS.map((u) => `<option ${u === v.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></label><label>Reorder level<input id="f_reorder" type="number" min="0" value="${v.reorder}"></label>
      <label>Selling price (KSh)<input id="f_price" type="number" min="0" step="0.01" value="${v.price / 100}"></label><label>Cost price (KSh)<input id="f_cost" type="number" min="0" step="0.01" value="${v.cost / 100}"></label>
      <label>Stock on hand<input id="f_stock" type="number" min="0" step="any" value="${v.stock}"></label></div><p class="err" id="err"></p>
      <div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="save">Save</button></div>`);
    d.addEventListener('click', async (e) => {
      if (e.target.dataset.a === 'x') d.close();
      if (e.target.dataset.a !== 'save') return;
      const g = (k) => d.querySelector('#f_' + k).value;
      const f = { name: g('name'), category: g('category').trim(), sku: g('sku').trim(), barcode: g('barcode').trim(), unit: g('unit'), reorder: Number(g('reorder')), price: toCents(g('price')), cost: toCents(g('cost')), stock: Number(g('stock')) };
      const err = validateProduct(f, products, p?.id);
      if (err) { d.querySelector('#err').textContent = err; return; }
      const rec = { ...(p || { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), archived: false }), ...f, name: f.name.trim() };
      await put('products', rec); products = await getAll('products'); d.close(); draw(); toast('Product saved');
    });
  }
  el.addEventListener('click', async (e) => {
    const { a, id } = e.target.dataset, p = products.find((x) => x.id === id);
    if (a === 'edit') form(p);
    if (a === 'arc' && (p.archived || await confirmDialog(`Archive "${esc(p.name)}"? It will no longer be sold, but its history is kept.`))) { await put('products', { ...p, archived: !p.archived }); products = await getAll('products'); draw(); }
  });
  el.querySelector('#q').addEventListener('input', (e) => { q = e.target.value; draw(); });
  el.querySelector('#arch').addEventListener('change', (e) => { arch = e.target.checked; draw(); });
  el.querySelector('#add').addEventListener('click', () => form());
  el.querySelector('#exp').addEventListener('click', () => {
    const head = ['name', 'sku', 'barcode', 'unit', 'category', 'price', 'cost', 'stock', 'reorder'];
    const body = products.map((p) => [p.name, p.sku, p.barcode, p.unit, p.category, p.price / 100, p.cost / 100, p.stock, p.reorder].map(csvCell).join(','));
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([[head.map(csvCell).join(','), ...body].join('\n')], { type: 'text/csv' })), download: 'dukapos-products.csv' }); a.click();
  });
  if (!can('products.edit')) { el.querySelector('#add').remove(); el.querySelector('#imp').remove(); }
  el.querySelector('#imp')?.addEventListener('click', () => el.querySelector('#impf').click());
  el.querySelector('#impf').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    let res; try { res = rowsToProducts(parseCsv(await file.text()), products); } catch (err) { return toast(err.message, 'error'); }
    const d = openDialog(`<h2>Import products</h2><p><b>${res.valid.length}</b> ready to import, <b>${res.errors.length}</b> with problems (skipped).</p>${res.errors.length ? `<div class="tbl-wrap"><table><tbody>${res.errors.slice(0, 8).map((x) => `<tr><td>Row ${x.row}</td><td>${esc(x.msg)}</td></tr>`).join('')}</tbody></table></div>` : ''}<p style="color:var(--grey)">Columns: name, price, cost (required); sku, barcode, unit, category, stock, reorder. Stock becomes opening stock.</p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok" ${res.valid.length ? '' : 'disabled'}>Import ${res.valid.length}</button></div>`);
    d.addEventListener('click', async (ev) => { if (ev.target.dataset.a === 'x') d.close(); if (ev.target.dataset.a !== 'ok') return; await importProductsTx(res.valid); products = await getAll('products'); d.close(); draw(); toast(res.valid.length + ' products imported'); });
  });
  draw();
}
