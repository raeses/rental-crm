import { hashPassword } from '../auth/passwordUtils.js';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/generatePasswordHash.js "your-password"');
  process.exit(1);
}

console.log(hashPassword(password));
