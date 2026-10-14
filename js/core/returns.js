// Pure refund maths shared by the UI preview and the database transaction. Amounts are integer cents.
export function remainingQty(sale, productId) {
  const sold = sale.items.find((l) => l.productId === productId)?.qty || 0;
  const back = (sale.returns || []).flatMap((r) => r.lines).filter((l) => l.productId === productId).reduce((s, l) => s + l.qty, 0);
  return sold - back;
}
/** Refund is spread over lines so discounts and tax are returned proportionally. */
export function computeReturn(sale, picks, restock = true) {
  const chosen = picks.filter((p) => p.qty > 0);
  if (!chosen.length) throw new Error('Choose at least one item to return.');
  const subtotal = sale.subtotal || sale.items.reduce((s, l) => s + Math.round(l.qty * l.unitPrice), 0), ratio = subtotal > 0 ? sale.total / subtotal : 1;
  const lines = chosen.map((p) => {
    const l = sale.items.find((x) => x.productId === p.productId);
    if (!l) throw new Error('Item was not on this sale.');
    if (p.qty > remainingQty(sale, p.productId)) throw new Error('Cannot return more than was sold of ' + l.name + '.');
    return { productId: l.productId, name: l.name, qty: p.qty, refund: Math.round(p.qty * l.unitPrice * ratio), cost: Math.round(p.qty * l.unitCost) };
  });
  const prior = (sale.returns || []).reduce((s, r) => s + r.refund, 0);
  const fullyReturned = sale.items.every((l) => remainingQty(sale, l.productId) === (chosen.find((p) => p.productId === l.productId)?.qty || 0));
  let refund = lines.reduce((s, l) => s + l.refund, 0);
  if (fullyReturned) refund = sale.total - prior; // absorb rounding so the sale refunds to exactly its total
  const refundNet = sale.total > 0 ? Math.round(refund * (sale.total - (sale.tax || 0)) / sale.total) : 0;
  return { lines, refund, refundNet, cogsBack: restock ? lines.reduce((s, l) => s + l.cost, 0) : 0, fullyReturned };
}
