import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { User, UserRole } from '../src/types/hms.ts';

const TOKEN_SECRET = process.env.CAREPLUS_TOKEN_SECRET || 'careplus-hms-dev-secret-key-2026';
const revokedTokens = new Set<string>();

export interface StoredUser extends User {
  passwordHash: string;
  resetToken?: string;
  resetTokenExpiresAt?: number;
  activationToken?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}

export interface TokenPayload {
  userId: string;
  role: UserRole;
  hospitalId: string;
  exp: number;
  jti: string;
}

export function signToken(user: User, rememberMe = false): string {
  const ttlMs = rememberMe ? 7 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
  const payload: TokenPayload = {
    userId: user.id,
    role: user.role,
    hospitalId: user.hospitalId,
    exp: Date.now() + ttlMs,
    jti: crypto.randomUUID(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  if (!token || revokedTokens.has(token)) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as TokenPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function revokeToken(token: string): void {
  if (token) revokedTokens.add(token);
}

export function sanitizeUser(user: StoredUser): User {
  const {
    passwordHash: _ph,
    resetToken: _rt,
    resetTokenExpiresAt: _rte,
    activationToken: _at,
    ...safe
  } = user;
  return safe;
}

export interface AuthenticatedRequest extends Request {
  authUser?: StoredUser;
  authToken?: string;
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.split(';').find((c) => c.trim().startsWith('careplus_token='));
    if (match) {
      return decodeURIComponent(match.trim().slice('careplus_token='.length));
    }
  }
  return null;
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (roles.length > 0 && !roles.includes(req.authUser.role)) {
      res.status(403).json({ error: 'Insufficient role permissions for this action.' });
      return;
    }
    next();
  };
}
