import { esc } from '../core/format.js';
// Honest placeholder for screens not built yet. No fake buttons.
export function render(el, route) {
  el.innerHTML = `<div class="card empty"><b>${esc(route.title)} is not built yet</b>Scheduled for Phase ${route.phase}. Nothing on this screen is functional.</div>`;
}
