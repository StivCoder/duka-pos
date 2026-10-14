import { get } from '../core/db.js';
// taxRate is a percent; 0 means the shop charges no tax. Edited via Settings screen (Phase 6).
export const DEFAULTS = { shopName: 'My Duka', phone: '', taxRate: 0, taxInclusive: true, allowNegativeStock: false };
export async function loadSettings() { return { ...DEFAULTS, ...((await get('meta', 'settings'))?.value || {}) }; }
