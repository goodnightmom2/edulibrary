import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

// ---- Zod Request Validation Schemas ----
export const adminLoginSchema = z.object({
  email: z.string().trim().email('Email quản trị không hợp lệ.').max(200),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự.').max(200),
});

export const commentCreateSchema = z.object({
  content: z
    .string()
    .trim()
    .min(3, 'Bình luận phải dài từ 3 đến 1000 ký tự.')
    .max(1000, 'Bình luận tối đa 1000 ký tự.'),
});

export const profileUpdateSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Họ và tên phải có ít nhất 2 ký tự.')
    .max(120, 'Họ và tên tối đa 120 ký tự.'),
});

export const taxonomyNameSchema = z.object({
  name: z.string().trim().min(1, 'Tên danh mục không được trống.').max(120),
  description: z.string().trim().max(500).optional().default(''),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  level: z.coerce.number().int().min(1).max(20).optional(),
});

export const adminCreateUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Họ tên tối thiểu 2 ký tự.').max(120),
  email: z.string().trim().email('Email không hợp lệ.').max(200),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự.').max(200),
  role: z.enum(['USER', 'ADMIN']).default('ADMIN'),
});

export const adminUpdateUserSchema = z.object({
  role: z.enum(['USER', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'LOCKED']).optional(),
});

export const workerCallbackSchema = z.object({
  jobId: z.number().int().positive(),
  documentId: z.number().int().positive(),
  status: z.enum(['COMPLETED', 'FAILED']),
  previewStorageKey: z.string().max(500).optional(),
  previewJson: z.string().optional(),
  mathReport: z.string().optional(),
  errorMessage: z.string().max(2000).optional(),
});

// ---- XSS Text Sanitization ----
export function stripUnsafeHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

// ---- Sliding-Window Rate Limiter ----
interface RateBucket {
  timestamps: number[];
}

export class SlidingWindowLimiter {
  private buckets = new Map<string, RateBucket>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  check(key: string, now = Date.now()): { allowed: boolean; remaining: number; retryAfterSec: number } {
    const cutoff = now - this.windowMs;
    const bucket = this.buckets.get(key) || { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);

    if (bucket.timestamps.length >= this.maxRequests) {
      const oldest = bucket.timestamps[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      this.buckets.set(key, bucket);
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    bucket.timestamps.push(now);
    this.buckets.set(key, bucket);

    // Opportunistic cleanup to keep memory bounded
    if (this.buckets.size > 5000) {
      for (const [k, b] of this.buckets.entries()) {
        if (b.timestamps.every((ts) => ts <= cutoff)) {
          this.buckets.delete(k);
        }
      }
    }

    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - bucket.timestamps.length),
      retryAfterSec: 0,
    };
  }
}

export function createRateLimiter(opts: { windowMs: number; max: number; prefix: string }) {
  const limiter = new SlidingWindowLimiter(opts.windowMs, opts.max);
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const result = limiter.check(`${opts.prefix}:${ip}`);
    res.setHeader('X-RateLimit-Limit', String(opts.max));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      return res.status(429).json({
        error: `Quá nhiều yêu cầu. Vui lòng thử lại sau ${result.retryAfterSec} giây.`,
      });
    }
    next();
  };
}

// ---- CSRF Origin Validation for Cookie-Authenticated Mutations ----
export function validateCsrfOrigin(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }
  // If request uses explicit Bearer authorization header, CSRF cookie risk does not apply
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return next();
  }
  const origin = req.headers.origin;
  if (!origin) {
    return next(); // Same-origin non-browser or server-side fetch
  }
  const host = req.headers.host;
  try {
    const originHost = new URL(origin).host;
    const appUrlHost = process.env.APP_URL ? new URL(process.env.APP_URL).host : null;
    if (originHost === host || (appUrlHost && originHost === appUrlHost)) {
      return next();
    }
  } catch {
    // Invalid origin header
  }
  return res.status(403).json({ error: 'Yêu cầu bị từ chối do kiểm tra nguồn gốc CSRF không hợp lệ.' });
}
