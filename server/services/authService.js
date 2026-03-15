import crypto from 'node:crypto';
import pool from '../db/pool.js';
import { getBusinessConfig } from '../config/businesses.js';
import { parseCookies, serializeCookie } from '../utils/cookies.js';
import { verifyPassword } from '../utils/passwords.js';

const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-before-production';
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);

function getSessionMaxAgeSeconds() {
  return Math.max(1, Math.floor(SESSION_TTL_HOURS * 60 * 60));
}

function getCookieName(businessKey) {
  return `portal_session_${businessKey}`;
}

function signValue(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(value) {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function buildToken(payload) {
  const encoded = encodePayload(payload);
  const signature = signValue(encoded);
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) return null;

  const expectedSignature = signValue(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return null;
  }

  const payload = decodePayload(encoded);
  if (!payload || Number(payload.exp || 0) < Date.now()) return null;
  return payload;
}

export async function authenticateUser(businessKey, username, password) {
  const business = getBusinessConfig(businessKey);
  if (!business) return null;

  const [rows] = await pool.query(
    `
      SELECT id, business_key, username, password_hash, role, is_active
      FROM portal_users
      WHERE business_key = ? AND username = ?
      LIMIT 1
    `,
    [business.key, String(username || '').trim()]
  );

  const user = rows[0];
  if (!user || !user.is_active) return null;
  if (!verifyPassword(password, user.password_hash)) return null;

  return {
    id: Number(user.id),
    businessKey: user.business_key,
    username: user.username,
    role: user.role || 'admin'
  };
}

export function createSessionToken(user) {
  return buildToken({
    sub: Number(user.id),
    businessKey: user.businessKey,
    username: user.username,
    role: user.role,
    exp: Date.now() + getSessionMaxAgeSeconds() * 1000
  });
}

export function readSession(req, businessKey) {
  const business = getBusinessConfig(businessKey);
  if (!business) return null;

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[getCookieName(business.key)];
  const payload = verifyToken(token);
  if (!payload || payload.businessKey !== business.key) return null;
  return payload;
}

export function createSessionCookie(businessKey, token, options = {}) {
  return serializeCookie(getCookieName(businessKey), token, {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    secure: Boolean(options.secure),
    maxAge: getSessionMaxAgeSeconds()
  });
}

export function clearSessionCookie(businessKey, options = {}) {
  return serializeCookie(getCookieName(businessKey), '', {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    secure: Boolean(options.secure),
    maxAge: 0
  });
}

