export function assertRequiredString(value, fieldName) {
  if (!String(value || '').trim()) {
    const err = new Error(`${fieldName} is required`);
    err.status = 400;
    throw err;
  }
}

export function assertNonNegativeNumber(value, fieldName) {
  if (Number(value) < 0 || Number.isNaN(Number(value))) {
    const err = new Error(`${fieldName} must be >= 0`);
    err.status = 400;
    throw err;
  }
}

export function assertPositiveNumber(value, fieldName) {
  if (Number(value) <= 0 || Number.isNaN(Number(value))) {
    const err = new Error(`${fieldName} must be > 0`);
    err.status = 400;
    throw err;
  }
}

export function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (value === '1' || value === 1 || value === 'true') return true;
  return false;
}
