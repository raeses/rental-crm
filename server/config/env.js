import dotenv from 'dotenv';
import { validateEnv } from '../utils/validateEnv.js';

dotenv.config();

export const appEnv = validateEnv(process.env);
