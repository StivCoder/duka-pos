import { getAll, adjustStockTx } from '../core/db.js';
import { kes, esc } from '../core/format.js';
import { can } from '../core/session.js';
import { openDialog, toast } from '../core/ui.js';
const TYPES = { receive: ['Stock received', 1], adjust_up: ['Adjustment: add', 1], adjust_down: ['Adjustment: remove', -1], damaged: ['Damaged / expired', -1], count: ['Stock count (set exact quantity)', 0] };
export async function render(el) {
  const draw = async () => {
    const [products, moves] = [(await getAll('products')).filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name)), (await getAll('movements')).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25)];
    const names = Object.fromEntries(products.map((p) => [p.id, p.name])), value = products.reduce((s, p) => s + Math.round(p.stock * p.cost), 0);
    el.innerHTML = `<div class="card kpi" style="margin-bottom:16px"><div class="n">Stock value (at cost)</div><div class="v">${kes(value)}</div></div>
      <div class="card"><h2>Stock balances</h2><div class="tbl-wrap"><table><thead><tr><th>Product</th><th class="num">On hand</th><th class="num">Reorder at</th><th class="num">Value at cost</th><th></th></tr></thead><tbody>${products.map((p) => `<tr><td>${esc(p.name)}${p.stock <= p.reorder ? ' <span class="tag low">low</span>' : ''}</td><td class="num">${p.stock} ${esc(p.unit)}</td><td class="num">${p.reorder}</td><td class="num">${kes(Math.round(p.stock * p.cost))}</td><td class="num">${can('inventory.adjust') ? `<button class="btn sm" data-id="${p.id}">Adjust</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card" style="margin-top:16px"><h2>Recent stock movements</h2>${moves.length ? `<div class="tbl-wrap"><table><thead><tr><th>When</th><th>Product</th><th>Type</th><th class="num">Change</th><th class="num">Balance</th><th>Note</th></tr></thead><tbody>${moves.map((m) => `<tr><td>${new Date(m.at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}</td><td>${esc(names[m.productId] || m.productId)}</td><td>${esc(m.type === 'sale' ? 'Sale' : TYPES[m.type]?.[0] || m.type)}</td><td class="num">${m.qty > 0 ? '+' : ''}${m.qty}</td><td class="num">${m.balance}</td><td>${esc(m.note || m.ref || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>No movements yet</b>Sales and adjustments are logged here.</div>'}</div>`;
  };
  el.addEventListener('click', (e) => {
    const id = e.target.dataset.id; if (!id || !can('inventory.adjust')) return;
    const d = openDialog(`<h2>Adjust stock</h2><div class="fgrid"><label>Reason<select id="t">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label><label>Quantity<input id="q" type="number" min="0" step="any"></label><label style="grid-column:1/-1">Note (required except for received stock)<input id="n"></label></div><p class="err" id="err"></p><div class="row"><button class="btn" data-a="x">Cancel</button><button class="btn pri" data-a="ok">Save</button></div>`);
    d.addEventListener('click', async (ev) => {
      const a = ev.target.dataset.a; if (a === 'x') d.close(); if (a !== 'ok') return;
      const type = d.querySelector('#t').value, q = Number(d.querySelector('#q').value), note = d.querySelector('#n').value.trim(), [, sign] = TYPES[type];
      const bad = !(q >= 0) || (sign !== 0 && q === 0) ? 'Enter a quantity.' : type !== 'receive' && !note ? 'A note is required for this reason.' : '';
      if (bad) return (d.querySelector('#err').textContent = bad);
      try { await adjustStockTx(id, type === 'count' ? { mode: 'set', value: q, type, note } : { value: sign * q, type, note }); }
      catch (err) { return (d.querySelector('#err').textContent = err.message); }
      d.close(); toast('Stock updated'); draw();
    });
  });
  draw();
}
