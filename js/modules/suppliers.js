import { getAll } from '../core/db.js';
import { kes, esc } from '../core/format.js';
import { partyPage, histTable } from './parties.js';
export const render = (el) => partyPage(el, {
  store: 'suppliers', prefix: 's', one: 'supplier', plural: 'suppliers', field: 'balance', balanceLabel: 'We owe', payLabel: 'Pay supplier',
  hint: 'Add the wholesalers and distributors you buy stock from.', defaults: {},
  fields: [{ k: 'contact', label: 'Contact person' }],
  cols: [{ h: 'Contact', v: (r) => esc(r.contact) }],
  history: async (r) => histTable(['Order', 'Invoice', 'Status', 'Total'], (await getAll('purchases')).filter((p) => p.supplierId === r.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => [esc(p.id), esc(p.invoiceNo), p.status, kes(p.total)])),
});
