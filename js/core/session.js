// LOCAL PROTOTYPE ONLY. A PIN stored in browser storage is not real security; the FastAPI backend must authenticate
// and authorise every request. can() is the single permission check so it can later mirror a server-side policy.
export const ROLES = ['cashier', 'supervisor', 'admin'];
export const PERMS = { 'pos.sell': 'cashier', 'pos.discount': 'supervisor', 'products.view': 'cashier', 'products.edit': 'supervisor', 'categories.manage': 'supervisor', 'inventory.view': 'cashier', 'inventory.adjust': 'supervisor', 'sales.view': 'cashier', 'sales.return': 'supervisor', 'sales.cancel': 'supervisor', 'customers.manage': 'cashier', 'suppliers.manage': 'supervisor', 'purchases.manage': 'supervisor', 'expenses.manage': 'supervisor', 'cash.manage': 'cashier', 'reports.view': 'supervisor', 'users.manage': 'admin', 'settings.edit': 'admin' };
const KEY = 'dukapos.session', TTL = 12 * 3600e3;
export const getSession = () => { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && Date.now() - s.at < TTL ? s : null; } catch { return null; } };
export const setSession = (u) => localStorage.setItem(KEY, JSON.stringify({ userId: u.id, name: u.name, role: u.role, at: Date.now() }));
export const clearSession = () => localStorage.removeItem(KEY);
export const can = (perm, s = getSession()) => !!s && ROLES.indexOf(s.role) >= ROLES.indexOf(PERMS[perm] ?? 'admin');
export const validPin = (p) => /^\d{4,6}$/.test(p);
export async function hashPin(pin, salt) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export const newSalt = () => crypto.randomUUID();
