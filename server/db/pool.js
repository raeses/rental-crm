import mysql from 'mysql2/promise';
import { appEnv } from '../config/env.js';

const pool = mysql.createPool({
  host: appEnv.db.host,
  port: appEnv.db.port,
  user: appEnv.db.user,
  password: appEnv.db.password,
  database: appEnv.db.name,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: appEnv.db.poolSize,
  namedPlaceholders: true
});

export default pool;
