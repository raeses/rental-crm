import {
  addEstimateItem,
  archiveEstimate,
  createEstimate,
  deleteEstimateItem,
  getCatalogItemAvailableCount,
  getEstimateById,
  listEstimatesByProject,
  recalculateEstimateTotals,
  reorderEstimateItems,
  updateEstimate,
  updateEstimateItem
} from '../services/estimateService.js';
import { getProjectById } from '../services/projectService.js';
import { assertNonNegativeNumber, assertPositiveNumber, assertRequiredString, toBool } from '../utils/validation.js';
import { renderEstimatePdf } from '../pdf/estimatePdf.js';

function validateEstimateBody(body) {
  assertRequiredString(body.estimate_number, 'estimate_number');
  assertNonNegativeNumber(body.discount_percent || 0, 'discount_percent');
  assertNonNegativeNumber(body.tax_percent || 0, 'tax_percent');
}

function validateEstimateItemBody(body) {
  assertRequiredString(body.item_name, 'item_name');
  assertRequiredString(body.category, 'category');
  assertPositiveNumber(body.quantity, 'quantity');
  assertNonNegativeNumber(body.price_per_unit, 'price_per_unit');
  assertPositiveNumber(body.days, 'days');
}

async function validateCatalogStock(body) {
  const isCatalogItem = String(body.source_type || 'catalog') === 'catalog' && body.catalog_item_id;
  if (!isCatalogItem) return;

  const availableCount = await getCatalogItemAvailableCount(body.catalog_item_id);
  if (!availableCount) {
    throw new Error('Эта техника больше недоступна в активном каталоге.');
  }

  if (Number(body.quantity) > availableCount) {
    throw new Error(`Нельзя добавить больше ${availableCount} шт. — столько активных единиц есть в базе.`);
  }
}

export async function createEstimateHandler(req, res, next) {
  try {
    validateEstimateBody(req.body);
    const data = { ...req.body, tax_enabled: toBool(req.body.tax_enabled) };
    const estimate = await createEstimate(data);
    res.status(201).json(estimate);
  } catch (error) {
    next(error);
  }
}

export async function getEstimateHandler(req, res, next) {
  try {
    const estimate = await getEstimateById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
    return res.json(estimate);
  } catch (error) {
    return next(error);
  }
}

export async function updateEstimateHandler(req, res, next) {
  try {
    validateEstimateBody(req.body);
    const data = { ...req.body, tax_enabled: toBool(req.body.tax_enabled) };
    const estimate = await updateEstimate(req.params.id, data);
    res.json(estimate);
  } catch (error) {
    next(error);
  }
}

export async function archiveEstimateHandler(req, res, next) {
  try {
    const estimate = await archiveEstimate(req.params.id);
    res.json(estimate);
  } catch (error) {
    next(error);
  }
}

export async function listProjectEstimatesHandler(req, res, next) {
  try {
    const estimates = await listEstimatesByProject(req.params.projectId);
    res.json(estimates);
  } catch (error) {
    next(error);
  }
}

export async function createEstimateItemHandler(req, res, next) {
  try {
    validateEstimateItemBody(req.body);
    await validateCatalogStock(req.body);
    const item = await addEstimateItem(req.params.estimateId, req.body);
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
}

export async function updateEstimateItemHandler(req, res, next) {
  try {
    validateEstimateItemBody(req.body);
    await validateCatalogStock(req.body);
    const item = await updateEstimateItem(req.params.id, req.body);
    if (!item) return res.status(404).json({ error: 'Estimate item not found' });
    return res.json(item);
  } catch (error) {
    return next(error);
  }
}

export async function deleteEstimateItemHandler(req, res, next) {
  try {
    await deleteEstimateItem(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function reorderEstimateItemsHandler(req, res, next) {
  try {
    const orderedIds = Array.isArray(req.body.ordered_ids) ? req.body.ordered_ids : [];
    const estimate = await reorderEstimateItems(req.params.id, orderedIds);
    await recalculateEstimateTotals(req.params.id);
    res.json(estimate);
  } catch (error) {
    next(error);
  }
}

export async function estimatePdfHandler(req, res, next) {
  try {
    const estimate = await getEstimateById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    const project = await getProjectById(estimate.project_id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    return renderEstimatePdf(res, { project, estimate, items: estimate.items || [] });
  } catch (error) {
    return next(error);
  }
}
