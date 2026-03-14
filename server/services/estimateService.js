import pool from '../db/pool.js';
import { calcItemTotals, calcEstimateTotals } from './estimateCalculations.js';

export async function getCatalogItemAvailableCount(catalogItemId) {
  if (!catalogItemId) return null;

  const [catalogRows] = await pool.execute(
    'SELECT name, category FROM items WHERE id = ? LIMIT 1',
    [catalogItemId]
  );
  const catalogItem = catalogRows[0];
  if (!catalogItem) return null;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS available_count
     FROM items
     WHERE name = ?
       AND category = ?
       AND status = 'available'
       AND COALESCE(is_archived, 0) = 0`,
    [catalogItem.name, catalogItem.category]
  );

  return Number(countRows[0]?.available_count || 0);
}

export async function createEstimate(data) {
  const [result] = await pool.execute(
    `INSERT INTO estimates
      (project_id, estimate_number, title, start_date, end_date, discount_percent, tax_enabled, tax_percent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.project_id,
      data.estimate_number,
      data.title || null,
      data.start_date || null,
      data.end_date || null,
      Number(data.discount_percent || 0),
      data.tax_enabled ? 1 : 0,
      Number(data.tax_percent || 0)
    ]
  );

  return getEstimateById(result.insertId);
}

export async function getEstimateById(id) {
  const [rows] = await pool.execute('SELECT * FROM estimates WHERE id = ?', [id]);
  if (!rows[0]) return null;
  const estimate = rows[0];
  const [items] = await pool.execute('SELECT * FROM estimate_items WHERE estimate_id = ? ORDER BY position_order, id', [id]);
  return { ...estimate, items };
}

export async function listEstimatesByProject(projectId) {
  const [rows] = await pool.execute(
    'SELECT * FROM estimates WHERE project_id = ? ORDER BY created_at DESC, id DESC',
    [projectId]
  );
  return rows;
}

export async function updateEstimate(id, data) {
  await pool.execute(
    `UPDATE estimates
     SET estimate_number=?, title=?, start_date=?, end_date=?, discount_percent=?, tax_enabled=?, tax_percent=?
     WHERE id=?`,
    [
      data.estimate_number,
      data.title || null,
      data.start_date || null,
      data.end_date || null,
      Number(data.discount_percent || 0),
      data.tax_enabled ? 1 : 0,
      Number(data.tax_percent || 0),
      id
    ]
  );

  await recalculateEstimateTotals(id);
  return getEstimateById(id);
}

export async function archiveEstimate(id) {
  await pool.execute('UPDATE estimates SET is_archived = 1 WHERE id = ?', [id]);
  return getEstimateById(id);
}

export async function addEstimateItem(estimateId, payload) {
  const totals = calcItemTotals(payload);
  const [result] = await pool.execute(
    `INSERT INTO estimate_items
      (estimate_id, category, item_name, quantity, price_per_unit, kit_total, days, line_total, position_order, source_type, catalog_item_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      estimateId,
      payload.category,
      payload.item_name,
      Number(payload.quantity),
      Number(payload.price_per_unit),
      totals.kit_total,
      Number(payload.days),
      totals.line_total,
      Number(payload.position_order || 0),
      payload.source_type || 'manual',
      payload.catalog_item_id || null,
      payload.notes || null
    ]
  );

  await recalculateEstimateTotals(estimateId);
  const [rows] = await pool.execute('SELECT * FROM estimate_items WHERE id = ?', [result.insertId]);
  return rows[0];
}

export async function updateEstimateItem(id, payload) {
  const [existsRows] = await pool.execute('SELECT estimate_id FROM estimate_items WHERE id = ?', [id]);
  if (!existsRows[0]) return null;
  const estimateId = existsRows[0].estimate_id;

  const totals = calcItemTotals(payload);
  await pool.execute(
    `UPDATE estimate_items
     SET category=?, item_name=?, quantity=?, price_per_unit=?, kit_total=?, days=?, line_total=?, position_order=?, source_type=?, catalog_item_id=?, notes=?
     WHERE id=?`,
    [
      payload.category,
      payload.item_name,
      Number(payload.quantity),
      Number(payload.price_per_unit),
      totals.kit_total,
      Number(payload.days),
      totals.line_total,
      Number(payload.position_order || 0),
      payload.source_type || 'manual',
      payload.catalog_item_id || null,
      payload.notes || null,
      id
    ]
  );

  await recalculateEstimateTotals(estimateId);
  const [rows] = await pool.execute('SELECT * FROM estimate_items WHERE id = ?', [id]);
  return rows[0] || null;
}

export async function deleteEstimateItem(id) {
  const [existsRows] = await pool.execute('SELECT estimate_id FROM estimate_items WHERE id = ?', [id]);
  if (!existsRows[0]) return;
  const estimateId = existsRows[0].estimate_id;
  await pool.execute('DELETE FROM estimate_items WHERE id = ?', [id]);
  await recalculateEstimateTotals(estimateId);
}

export async function reorderEstimateItems(estimateId, orderedIds = []) {
  for (let idx = 0; idx < orderedIds.length; idx += 1) {
    await pool.execute(
      'UPDATE estimate_items SET position_order = ? WHERE id = ? AND estimate_id = ?',
      [idx + 1, orderedIds[idx], estimateId]
    );
  }

  return getEstimateById(estimateId);
}

export async function recalculateEstimateTotals(estimateId) {
  const [estimateRows] = await pool.execute('SELECT * FROM estimates WHERE id = ?', [estimateId]);
  if (!estimateRows[0]) return null;

  const estimate = estimateRows[0];
  const [items] = await pool.execute('SELECT line_total FROM estimate_items WHERE estimate_id = ?', [estimateId]);

  const totals = calcEstimateTotals({
    items,
    discount_percent: estimate.discount_percent,
    tax_enabled: Boolean(estimate.tax_enabled),
    tax_percent: estimate.tax_percent
  });

  await pool.execute(
    `UPDATE estimates SET subtotal=?, discount_amount=?, total_after_discount=?, tax_amount=?, grand_total=? WHERE id=?`,
    [totals.subtotal, totals.discount_amount, totals.total_after_discount, totals.tax_amount, totals.grand_total, estimateId]
  );

  return totals;
}
