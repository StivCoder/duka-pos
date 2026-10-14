/** Expected drawer cash for a shift. Pure; amounts are integer cents. Everything is matched by time window. */
export function cashSummary(shift, { sales, expenses, ledger }, nowIso) {
  const to = shift.closedAt || nowIso, inW = (t) => t >= shift.openedAt && t <= to, sum = (a) => a.reduce((s, x) => s + x, 0);
  const cashSales = sum(sales.filter((s) => inW(s.createdAt)).flatMap((s) => s.payments).filter((p) => p.method === 'cash').map((p) => p.amount));
  const cashRefunds = sum(sales.flatMap((s) => s.returns || []).filter((r) => r.method === 'cash' && inW(r.at)).map((r) => r.refund));
  const cashIn = sum(shift.movements.filter((m) => m.type === 'in').map((m) => m.amount)), cashOut = sum(shift.movements.filter((m) => m.type === 'out').map((m) => m.amount));
  const expenseCash = sum(expenses.filter((e) => !e.voided && e.method === 'cash' && inW(e.recordedAt || e.createdAt)).map((e) => e.amount));
  const lc = ledger.filter((l) => l.method === 'cash' && inW(l.at));
  const customerCash = sum(lc.filter((l) => l.party === 'customers').map((l) => l.amount)), supplierCash = sum(lc.filter((l) => l.party === 'suppliers').map((l) => l.amount));
  const expected = shift.openingFloat + cashSales - cashRefunds + cashIn - cashOut - expenseCash + customerCash - supplierCash;
  return { cashSales, cashRefunds, cashIn, cashOut, expenseCash, customerCash, supplierCash, expected };
}
