// All money is stored as integer cents (KES x 100) to avoid floating-point drift.
const TZ = 'Africa/Nairobi';
const money = new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const toCents = (shillings) => Math.round(Number(shillings) * 100);
export const kes = (cents) => 'KSh ' + money.format((cents || 0) / 100);
export const nairobiDayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d));
export const timeOf = (d) => new Intl.DateTimeFormat('en-KE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
