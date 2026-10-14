import { esc } from './format.js';
import { seedIfEmpty } from '../services/seed.js';
import { get } from './db.js';
import { can, getSession, setSession, clearSession } from './session.js';
const I = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', cart: 'M3 4h3l2 11h10l2-8H7M9 20h.01M17 20h.01',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8', tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01', stack: 'M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4',
  truck: 'M2 6h11v10H2zM13 9h5l3 3v4h-8M6 19h.01M17 19h.01', users: 'M16 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7M21 20v-2a4 4 0 00-3-3.8',
  wallet: 'M3 7h18v13H3zM3 7l3-4h12l3 4M16 13h2', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', chart: 'M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-9',
  cash: 'M2 6h20v12H2zM12 9a3 3 0 100 6 3 3 0 000-6', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', cog: 'M12 9a3 3 0 100 6 3 3 0 000-6M12 2v3M12 19v3M2 12h3M19 12h3',
};
export const ROUTES = [
  { id: 'dashboard', title: 'Dashboard', icon: 'grid', phase: 1, mod: 'dashboard' }, { id: 'pos', mod: 'pos', title: 'Point of Sale', icon: 'cart', phase: 3 },
  { id: 'products', mod: 'products', title: 'Products', icon: 'box', phase: 2 }, { id: 'categories', mod: 'categories', title: 'Categories', icon: 'tag', phase: 2 },
  { id: 'inventory', mod: 'inventory', title: 'Inventory', icon: 'stack', phase: 2 }, { id: 'purchases', mod: 'purchases', title: 'Purchases', icon: 'truck', phase: 4 },
  { id: 'suppliers', mod: 'suppliers', title: 'Suppliers', icon: 'truck', phase: 4 }, { id: 'customers', mod: 'customers', title: 'Customers', icon: 'users', phase: 4 },
  { id: 'expenses', mod: 'expenses', title: 'Expenses', icon: 'wallet', phase: 4 }, { id: 'sales', mod: 'sales', title: 'Sales History', icon: 'list', phase: 5 },
  { id: 'reports', mod: 'reports', title: 'Reports', icon: 'chart', phase: 5 }, { id: 'cash', mod: 'cash', title: 'Cash Management', icon: 'cash', phase: 4 },
  { id: 'users', mod: 'users', title: 'Users & Permissions', icon: 'shield', phase: 5 }, { id: 'login', mod: 'login', title: 'Login / PIN', icon: 'shield', phase: 5, hidden: true },
  { id: 'settings', mod: 'settings', title: 'Settings', icon: 'cog', phase: 6 },
];

const NEED = { dashboard: 'reports.view', pos: 'pos.sell', products: 'products.view', categories: 'categories.manage', inventory: 'inventory.view', purchases: 'purchases.manage', suppliers: 'suppliers.manage', customers: 'customers.manage', expenses: 'expenses.manage', sales: 'sales.view', reports: 'reports.view', cash: 'cash.manage', users: 'users.manage', settings: 'settings.edit' };
/** Shared application shell: every page in /pages calls boot() with its own data-page id. */
export async function boot() {
  const id = document.body.dataset.page, route = ROUTES.find((r) => r.id === id) || ROUTES[0], app = document.getElementById('app');
  try {
    if (id === 'login') return (await import('../modules/login.js')).render(app);
    const saved = getSession(), user = saved && await get('users', saved.userId);
    if (!user || !user.active) { clearSession(); location.replace('login.html'); return; }
    setSession(user); const sess = getSession();
    app.innerHTML = `<div class="shell"><aside class="sidebar" id="sidebar" aria-label="Main navigation"><a class="brand" href="${can('reports.view', sess) ? 'dashboard' : 'pos'}.html"><img src="../assets/logo.svg" alt="" width="34" height="34"><span>DukaPOS</span></a><nav>${ROUTES.filter((r) => !r.hidden && can(NEED[r.id], sess)).map((r) => `<a href="${r.id}.html" class="${r.id === route.id ? 'active' : ''}"><svg viewBox="0 0 24 24"><path d="${I[r.icon]}"/></svg>${esc(r.title)}</a>`).join('')}</nav></aside>
    <div class="main"><header class="topbar"><button class="icon-btn menu-btn" id="menuBtn" aria-label="Toggle menu">&#9776;</button><h1>${esc(route.title)}</h1><div class="status" id="netStatus" role="status"></div><div class="status"><span class="pill">${esc(sess.name)} · ${sess.role}</span><button class="btn sm" id="logout">Sign out</button></div></header><main id="view" tabindex="-1"><div class="loading">Loading…</div></main>
    <footer class="footer">DukaPOS · built under Vectra Core · local prototype: sign-in is not real security until the backend exists</footer></div></div>`;
    const net = () => { const on = navigator.onLine; document.getElementById('netStatus').innerHTML = `<span class="pill ${on ? '' : 'warn'}">${on ? 'Online' : 'Offline'}</span><span class="pill warn">Sync: not connected</span>`; };
    net(); addEventListener('online', net); addEventListener('offline', net);
    document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
    document.getElementById('logout').addEventListener('click', () => { clearSession(); location.href = 'login.html'; });
    document.title = route.title + ' · DukaPOS';
    const view = document.getElementById('view');
    if (!can(NEED[route.id], sess)) { view.innerHTML = `<div class="card empty"><b>Access denied</b>Your role (${sess.role}) cannot open ${esc(route.title)}. Ask a supervisor or administrator.</div>`; return; }
    await seedIfEmpty();
    const m = await import(`../modules/${route.mod || 'pending'}.js`);
    await m.render(view, route);
  } catch (err) { console.error(err); app.insertAdjacentHTML('beforeend', `<div class="card empty"><b>Could not load this screen</b>${esc(err.message)}</div>`); }
}
