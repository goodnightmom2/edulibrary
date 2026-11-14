import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.ts';
import { sessions } from '../db/schema.ts';
import { getAdminAuth } from '../lib/firebase-admin.ts';
import { findUserById, toSafeUser, upsertGoogleUser, type SafeUser } from '../db/users.ts';

export const ADMIN_COOKIE_NAME = 'edulib_session';

const RUNTIME_JWT_SECRET =
  process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16
    ? process.env.JWT_SECRET
    : crypto.createHash('sha256').update(process.env.SQL_PASSWORD || 'edulibrary-dev-secret-key').digest('hex');

export interface AdminJwtPayload {
  userId: number;
  role: string;
  type: 'admin_session';
  jti?: string;
}

export function signAdminSessionToken(user: SafeUser, sessionToken?: string): string {
  const payload: AdminJwtPayload = {
    userId: user.id,
    role: user.role,
    type: 'admin_session',
    jti: sessionToken,
  };
  return jwt.sign(payload, RUNTIME_JWT_SECRET, { expiresIn: '12h' });
}

export function verifyAdminSessionToken(token: string): AdminJwtPayload | null {
  try {
    const decoded = jwt.verify(token, RUNTIME_JWT_SECRET) as AdminJwtPayload;
    if (decoded && decoded.type === 'admin_session' && typeof decoded.userId === 'number') {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

async function isSessionActive(payload: AdminJwtPayload): Promise<boolean> {
  if (!payload.jti) return true;
  const rows = await db
    .select({ id: sessions.id, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.sessionToken, payload.jti), isNull(sessions.revokedAt)))
    .limit(1);
  if (rows.length === 0) return false;
  return new Date(rows[0].expiresAt).getTime() > Date.now();
}

export interface AuthRequest extends Request {
  dbUser?: SafeUser;
  sessionJti?: string;
}

async function resolveUserFromRequest(req: AuthRequest): Promise<SafeUser | null> {
  // 1. Check Bearer token (either Firebase ID Token or Admin JWT)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) {
      const adminPayload = verifyAdminSessionToken(token);
      if (adminPayload && (await isSessionActive(adminPayload))) {
        req.sessionJti = adminPayload.jti;
        const row = await findUserById(adminPayload.userId);
        if (row) return toSafeUser(row);
      }

      try {
        const adminAuth = await getAdminAuth();
        const decoded = await adminAuth.verifyIdToken(token);
        if (decoded.email) {
          const user = await upsertGoogleUser({
            uid: decoded.uid,
            email: decoded.email.toLowerCase(),
            fullName: decoded.name || decoded.email.split('@')[0],
            avatar: decoded.picture || null,
          });
          return user;
        }
      } catch {
        // Invalid Firebase token; fall through to cookie check
      }
    }
  }

  // 2. Check HttpOnly Admin Session Cookie
  const cookieToken = req.cookies?.[ADMIN_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    const payload = verifyAdminSessionToken(cookieToken);
    if (payload && (await isSessionActive(payload))) {
      req.sessionJti = payload.jti;
      const row = await findUserById(payload.userId);
      if (row) return toSafeUser(row);
    }
  }

  return null;
}

export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (user && user.status !== 'LOCKED') {
      req.dbUser = user;
    }
  } catch (error) {
    console.error('optionalAuth error:', error);
  }
  next();
};

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
    }
    if (user.status === 'LOCKED') {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa bởi quản trị viên.' });
    }
    req.dbUser = user;
    next();
  } catch (error) {
    console.error('requireAuth error:', error);
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  }
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.dbUser) {
    return res.status(401).json({ error: 'Yêu cầu xác thực quản trị viên.' });
  }
  if (req.dbUser.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Bạn không có quyền truy cập khu vực quản trị.' });
  }
  next();
};
