function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calcItemTotals({ quantity, price_per_unit, days }) {
  const kit_total = round2(Number(quantity) * Number(price_per_unit));
  const line_total = round2(kit_total * Number(days));
  return { kit_total, line_total };
}

export function calcEstimateTotals({ items, discount_percent, tax_enabled, tax_percent }) {
  const subtotal = round2(items.reduce((sum, item) => sum + Number(item.line_total || 0), 0));
  const discount_amount = round2(subtotal * (Number(discount_percent || 0) / 100));
  const total_after_discount = round2(subtotal - discount_amount);
  const tax_amount = tax_enabled ? round2(total_after_discount * (Number(tax_percent || 0) / 100)) : 0;
  const grand_total = round2(total_after_discount + tax_amount);

  return {
    subtotal,
    discount_amount,
    total_after_discount,
    tax_amount,
    grand_total
  };
}
