import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const BCRYPT_ROUNDS = 12;
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  if (salt && BCRYPT_HASH_RE.test(String(salt))) {
    return String(salt);
  }

  return bcrypt.hashSync(String(password), BCRYPT_ROUNDS);
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;

  if (BCRYPT_HASH_RE.test(storedHash)) {
    return bcrypt.compareSync(String(password), storedHash);
  }

  const [algorithm, salt, expectedDigest] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedDigest) return false;

  const actualDigest = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const expectedBuffer = Buffer.from(expectedDigest, 'hex');
  const actualBuffer = Buffer.from(actualDigest, 'hex');

  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
