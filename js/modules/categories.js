import { getAll, put, remove, renameCategoryTx } from '../core/db.js';
import { esc } from '../core/format.js';
import { openDialog, toast, confirmDialog } from '../core/ui.js';
export async function render(el) {
  let cats = [], products = [];
  const load = async () => {
    products = await getAll('products'); cats = await getAll('categories');
    if (!cats.length) { const names = [...new Set(products.map((p) => p.category).filter(Boolean))]; for (const n of names) await put('categories', { id: 'k' + Math.random().toString(36).slice(2, 8), name: n, parentId: null }); cats = await getAll('categories'); }
  };
  const used = (c) => products.filter((p) => p.category === c.name).length, kids = (c) => cats.filter((x) => x.parentId === c.id);
  const rowsFor = (parent, depth) => cats.filter((c) => (c.parentId || null) === parent).sort((a, b) => a.name.localeCompare(b.name)).flatMap((c) => [`<tr><td style="padding-left:${8 + depth * 24}px">${depth ? '↳ ' : ''}${esc(c.name)}</td><td class="num">${used(c)}</td><td class="num"><button class="btn sm" data-a="sub" data-id="${c.id}">+ Subcategory</button> <button class="btn sm" data-a="ren" data-id="${c.id}">Rename</button> <button class="btn sm" data-a="del" data-id="${c.id}">Delete</button></td></tr>`, ...rowsFor(c.id, depth + 1)]);
  const draw = () => { el.querySelector('#tbl').innerHTML = cats.length ? `<table><thead><tr><th>Category</th><th class="num">Products</th><th></th></tr></thead><tbody>${rowsFor(null, 0).join('')}</tbody></table>` : '<div class="empty"><b>No categories yet</b>Add one so products can be grouped and filtered at the POS.</div>'; };
  el.innerHTML = `<div class="bar"><span class="sp"></span><button class="btn pri" id="add">+ Add category</button></div><div class="card"><div class="tbl-wrap" id="tbl"></div></div>`;
  const ask = (title, val, ok) => { const d = openDialog(`<h2>${title}</h2><label>Name<input id="n" value="${esc(val)}"></label><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Save</button></div>`); d.addEventListener('click', async (e) => { if (e.target.dataset.a === 'x') d.close(); if (e.target.dataset.a !== 'ok') return; try { await ok(d.querySelector('#n').value.trim()); } catch (err) { return (d.querySelector('#err').textContent = err.message); } d.close(); await load(); draw(); }); };
  const create = (parentId) => async (name) => { if (!name) throw new Error('Name is required.'); if (cats.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new Error('A category with that name already exists.'); await put('categories', { id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), name, parentId }); toast('Category added'); };
  el.querySelector('#add').addEventListener('click', () => ask('Add category', '', create(null)));
  el.addEventListener('click', async (e) => {
    const { a, id } = e.target.dataset, c = cats.find((x) => x.id === id);
    if (a === 'sub') ask('Add subcategory of ' + c.name, '', create(c.id));
    if (a === 'ren') ask('Rename category', c.name, async (n) => { await renameCategoryTx(c.id, n); toast('Renamed, products updated'); });
    if (a === 'del') { if (used(c) || kids(c).length) return toast('Cannot delete: it has products or subcategories.', 'error'); if (await confirmDialog('Delete "' + esc(c.name) + '"?')) { await remove('categories', c.id); await load(); draw(); } }
  });
  await load(); draw();
}
