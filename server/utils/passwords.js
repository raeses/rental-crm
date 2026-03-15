import crypto from 'node:crypto';

const KEY_LENGTH = 64;
const ITERATIONS = 210000;
const DIGEST = 'sha512';

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derivedKey = crypto.pbkdf2Sync(String(password), salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) return false;

  const incomingHash = crypto.pbkdf2Sync(String(password), salt, ITERATIONS, KEY_LENGTH, DIGEST);
  const savedHash = Buffer.from(hash, 'hex');

  if (incomingHash.length !== savedHash.length) return false;
  return crypto.timingSafeEqual(incomingHash, savedHash);
}
