import { getAll, put, remove, restoreTx, STORES } from '../core/db.js';
import { loadSettings } from '../services/settings.js';
import { esc } from '../core/format.js';
import { toast, confirmDialog } from '../core/ui.js';
export async function render(el) {
  const s = await loadSettings();
  el.innerHTML = `<div class="card"><h2>Shop profile and tax</h2><div class="fgrid"><label>Shop name<input id="name" value="${esc(s.shopName)}"></label><label>Phone (on receipts)<input id="phone" value="${esc(s.phone)}"></label><label>Tax rate % (0 = no tax)<input id="tax" type="number" min="0" max="100" step="0.01" value="${s.taxRate}"></label><label>Prices already include tax<select id="incl"><option value="1" ${s.taxInclusive ? 'selected' : ''}>Yes (inclusive)</option><option value="0" ${s.taxInclusive ? '' : 'selected'}>No (add tax on top)</option></select></label><label>Allow selling below zero stock<select id="neg"><option value="0" ${s.allowNegativeStock ? '' : 'selected'}>No</option><option value="1" ${s.allowNegativeStock ? 'selected' : ''}>Yes</option></select></label></div><p class="err" id="err"></p><div class="row"><button class="btn pri" id="save">Save settings</button></div></div>
  <div class="card" style="margin-top:16px"><h2>Data</h2><div class="row" style="justify-content:flex-start"><button class="btn" id="bk">Download backup (JSON)</button><button class="btn" id="demo">Remove demo data</button><button class="btn" id="rs">Restore from backup…</button><input type="file" id="rf" accept=".json,application/json" hidden></div></div>`;
  const q = (i) => el.querySelector('#' + i);
  q('save').addEventListener('click', async () => {
    const tax = Number(q('tax').value);
    if (!q('name').value.trim()) return (q('err').textContent = 'Shop name is required.');
    if (!(tax >= 0 && tax <= 100)) return (q('err').textContent = 'Tax rate must be between 0 and 100.');
    await put('meta', { key: 'settings', value: { shopName: q('name').value.trim(), phone: q('phone').value.trim(), taxRate: tax, taxInclusive: q('incl').value === '1', allowNegativeStock: q('neg').value === '1' } });
    q('err').textContent = ''; toast('Settings saved');
  });
  const exportBackup = async () => {
    const out = { _format: 'dukapos-backup', _exportedAt: new Date().toISOString() }; for (const k of STORES) out[k] = await getAll(k);
    Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })), download: 'dukapos-backup-' + new Date().toISOString().slice(0, 10) + '.json' }).click();
  };
  q('bk').addEventListener('click', exportBackup);
  q('rs').addEventListener('click', () => q('rf').click());
  q('rf').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    let data; try { data = JSON.parse(await file.text()); } catch { return toast('That file is not valid JSON.', 'error'); }
    const counts = ['products', 'sales', 'customers'].map((k) => (data[k] || []).length + ' ' + k).join(', ');
    if (!(await confirmDialog('Replace ALL current data with this backup (' + counts + ')? A safety copy of your current data downloads first, then the app reloads.'))) return;
    try { await exportBackup(); await restoreTx(data); } catch (err) { return toast(err.message, 'error'); }
    toast('Backup restored'); setTimeout(() => location.reload(), 600);
  });
  q('demo').addEventListener('click', async () => {
    if (!(await confirmDialog('Remove all demo products, sales and expenses? Your own records are kept.'))) return;
    const demoProducts = new Set((await getAll('products')).filter((p) => p.isDemo).map((p) => p.id));
    for (const st of ['products', 'sales', 'expenses', 'movements']) for (const r of await getAll(st)) if (r.isDemo || demoProducts.has(r.productId)) await remove(st, r.id);
    toast('Demo data removed');
  });
}
