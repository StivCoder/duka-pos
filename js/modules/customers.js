import { getAll } from '../core/db.js';
import { kes, esc } from '../core/format.js';
import { partyPage, histTable } from './parties.js';
export const render = (el) => partyPage(el, {
  store: 'customers', prefix: 'c', one: 'customer', plural: 'customers', field: 'creditBalance', balanceLabel: 'Credit owed', payLabel: 'Take payment',
  hint: 'Add regular customers to track purchases, loyalty points and credit.', defaults: { points: 0, creditLimit: 0 },
  fields: [{ k: 'creditLimit', label: 'Credit limit (KSh, 0 = no credit)', money: true }],
  cols: [{ h: 'Points', v: (r) => r.points || 0 }, { h: 'Credit limit', v: (r) => kes(r.creditLimit) }],
  history: async (r) => histTable(['Sale', 'Date', 'Total'], (await getAll('sales')).filter((s) => s.customerId === r.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => [esc(s.id), new Date(s.createdAt).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi' }), kes(s.total)])),
});
