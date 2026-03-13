import { createItem, getItemById, listItems, updateItem } from '../services/itemService.js';
import { assertNonNegativeNumber, assertRequiredString } from '../utils/validation.js';

const VALID_STATUSES = new Set(['available', 'unavailable', 'maintenance']);
const VALID_OWNER_TYPES = new Set(['own', 'partner']);

function validateItemBody(body) {
  assertRequiredString(body.name, 'name');
  assertRequiredString(body.category, 'category');
  assertNonNegativeNumber(body.price || 0, 'price');
  assertNonNegativeNumber(body.base_rate || 0, 'base_rate');
  assertNonNegativeNumber(body.purchase_price || 0, 'purchase_price');

  if (body.status && !VALID_STATUSES.has(body.status)) {
    const err = new Error('status is invalid');
    err.status = 400;
    throw err;
  }

  if (body.owner_type && !VALID_OWNER_TYPES.has(body.owner_type)) {
    const err = new Error('owner_type is invalid');
    err.status = 400;
    throw err;
  }
}

export async function listItemsHandler(_req, res, next) {
  try {
    const items = await listItems();
    res.json(items);
  } catch (error) {
    next(error);
  }
}

export async function getItemHandler(req, res, next) {
  try {
    const item = await getItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    return res.json(item);
  } catch (error) {
    return next(error);
  }
}

export async function createItemHandler(req, res, next) {
  try {
    validateItemBody(req.body);
    const item = await createItem(req.body);
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
}

export async function updateItemHandler(req, res, next) {
  try {
    validateItemBody(req.body);
    const item = await updateItem(req.params.id, req.body);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    return res.json(item);
  } catch (error) {
    return next(error);
  }
}
