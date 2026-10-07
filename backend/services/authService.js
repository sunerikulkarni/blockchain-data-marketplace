const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const AuthSession = require('../models/AuthSession');

const SESSION_SECONDS = 12 * 60 * 60;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_BYTES = 64;

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password), salt, KEY_BYTES, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${toBase64Url(salt)}$${toBase64Url(key)}`;
}

async function verifyPassword(password, encoded) {
  if (typeof encoded !== 'string') return false;
  const [scheme, nText, rText, pText, saltText, keyText, extra] = encoded.split('$');
  const n = Number(nText), r = Number(rText), p = Number(pText);
  if (scheme !== 'scrypt' || extra !== undefined || !saltText || !keyText ||
      !Number.isInteger(n) || n < 16384 || n > 131072 ||
      !Number.isInteger(r) || r < 1 || r > 16 ||
      !Number.isInteger(p) || p < 1 || p > 4) return false;
  try {
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(keyText, 'base64url');
    if (salt.length < 16 || expected.length !== KEY_BYTES) return false;
    const actual = await scrypt(String(password), salt, expected.length, {
      N: n, r, p, maxmem: 64 * 1024 * 1024
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function jwtSecret() {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('AUTH_JWT_SECRET must be configured with at least 32 bytes');
  }
  return secret;
}

function signToken(claims) {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(JSON.stringify(claims));
  const input = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', jwtSecret()).update(input).digest('base64url');
  return `${input}.${signature}`;
}

function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid session token');
  const input = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', jwtSecret()).update(input).digest();
  const supplied = Buffer.from(parts[2], 'base64url');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new Error('Invalid session token');
  }
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'HS256' || !claims.sub || !claims.jti || !claims.role ||
      !Number.isFinite(claims.exp) || claims.exp <= now) {
    throw new Error('Expired or invalid session token');
  }
  return claims;
}

async function createSession(role, subjectId) {
  const tokenId = crypto.randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((issuedAt + SESSION_SECONDS) * 1000);
  const claims = { sub: String(subjectId), role, jti: tokenId, iat: issuedAt, exp: issuedAt + SESSION_SECONDS };
  const token = signToken(claims);
  await AuthSession.create({ tokenId, subjectId: String(subjectId), role, expiresAt });
  return { token, expiresIn: SESSION_SECONDS };
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, createSession, SESSION_SECONDS };
