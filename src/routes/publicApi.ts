import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { and, asc, desc, eq } from 'drizzle-orm';
import { Router, type Response } from 'express';
import { db } from '../db/index.ts';
import {
  accounts,
  categories,
  comments,
  documents,
  downloadLogs,
  favorites,
  grades,
  sessions,
  siteSettings,
  subjects,
  tags,
  users,
  viewLogs,
} from '../db/schema.ts';
import {
  getDocumentDetailBySlug,
  listDocuments,
  recordDocumentDownload,
  recordDocumentView,
} from '../db/documents.ts';
import { z } from 'zod';
import { findUserByEmail, toSafeUser } from '../db/users.ts';
import { generateDocumentPreview, type DocumentPreviewPayload } from '../lib/docProcessor.ts';
import {
  createPresignedDownloadUrl,
  DOCUMENTS_DIR,
  readStoredObjectBuffer,
  resolveSafeStoragePath,
} from '../lib/storage.ts';
import {
  ADMIN_COOKIE_NAME,
  optionalAuth,
  requireAuth,
  signAdminSessionToken,
  verifyAdminSessionToken,
  type AuthRequest,
} from '../middleware/auth.ts';
import {
  adminLoginSchema,
  commentCreateSchema,
  createRateLimiter,
  profileUpdateSchema,
  stripUnsafeHtml,
} from '../middleware/security.ts';

export const publicApiRouter = Router();

const authRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30, prefix: 'auth' });
const commentRateLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 20, prefix: 'comment' });

// Taxonomy & site configuration (no login required)
publicApiRouter.get('/taxonomy', async (_req, res: Response) => {
  try {
    const [subjectList, gradeList, categoryList, tagList, settingsRows] = await Promise.all([
      db.select().from(subjects).orderBy(asc(subjects.sortOrder), asc(subjects.name)),
      db.select().from(grades).orderBy(asc(grades.level)),
      db.select().from(categories).orderBy(asc(categories.name)),
      db.select().from(tags).orderBy(asc(tags.name)).limit(40),
      db.select().from(siteSettings),
    ]);

    const settings: Record<string, string> = {};
    for (const row of settingsRows) {
      settings[row.settingKey] = row.settingValue;
    }

    res.json({
      subjects: subjectList,
      grades: gradeList,
      categories: categoryList,
      tags: tagList,
      settings,
    });
  } catch (error) {
    console.error('GET /api/taxonomy error:', error);
    res.status(500).json({ error: 'Không thể tải danh mục thư viện.' });
  }
});

// Public document search & listing
publicApiRouter.get('/documents', async (req, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const subject = typeof req.query.subject === 'string' ? req.query.subject : undefined;
    const grade = typeof req.query.grade === 'string' ? req.query.grade : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const fileType = typeof req.query.fileType === 'string' ? req.query.fileType : undefined;
    const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
    const featured = req.query.featured === 'true' || req.query.featured === '1';
    const sortParam = typeof req.query.sort === 'string' ? req.query.sort : 'newest';
    const sort = (['newest', 'views', 'downloads', 'title'].includes(sortParam)
      ? sortParam
      : 'newest') as 'newest' | 'views' | 'downloads' | 'title';
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 12;

    const data = await listDocuments({
      q,
      subject,
      grade,
      category,
      fileType,
      tag,
      featured: featured || undefined,
      sort,
      page,
      limit,
    });

    res.json(data);
  } catch (error) {
    console.error('GET /api/documents error:', error);
    res.status(500).json({ error: 'Không thể tìm kiếm tài liệu.' });
  }
});

// Document detail + preview payload + related documents
publicApiRouter.get('/documents/:slug', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const slug = String(req.params.slug || '');
    const allowDraft = req.dbUser?.role === 'ADMIN' && req.query.preview === 'admin';
    const detail = await getDocumentDetailBySlug(slug, req.dbUser?.id, allowDraft);
    if (!detail) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu yêu cầu.' });
    }

    const { doc, tags: docTags, isFavorited, related, comments: docComments } = detail;

    // Record view asynchronously (avoid blocking response)
    if (req.query.track !== 'false') {
      void recordDocumentView(doc.id, req.dbUser?.id);
    }

    // Parse or generate preview payload
    let preview: DocumentPreviewPayload;
    if (doc.previewPath) {
      try {
        preview = JSON.parse(doc.previewPath) as DocumentPreviewPayload;
      } catch {
        const fullPath = resolveSafeStoragePath(DOCUMENTS_DIR, doc.filePath);
        preview = await generateDocumentPreview(fullPath, doc.fileType);
      }
    } else {
      const fullPath = resolveSafeStoragePath(DOCUMENTS_DIR, doc.filePath);
      preview = await generateDocumentPreview(fullPath, doc.fileType);
    }

    res.json({
      document: {
        id: doc.id,
        title: doc.title,
        slug: doc.slug,
        description: doc.description,
        originalFilename: doc.originalFilename,
        fileType: doc.fileType,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        thumbnail: doc.thumbnail,
        topic: doc.topic,
        author: doc.author,
        status: doc.status,
        featured: doc.featured,
        viewCount: doc.viewCount + 1,
        downloadCount: doc.downloadCount,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        subject: doc.subjectId
          ? { id: doc.subjectId, name: doc.subjectName, slug: doc.subjectSlug }
          : null,
        grade: doc.gradeId ? { id: doc.gradeId, name: doc.gradeName, slug: doc.gradeSlug } : null,
        category: doc.categoryId
          ? { id: doc.categoryId, name: doc.categoryName, slug: doc.categorySlug }
          : null,
        tags: docTags,
      },
      preview,
      isFavorited,
      related,
      comments: docComments,
    });
  } catch (error) {
    console.error('GET /api/documents/:slug error:', error);
    res.status(500).json({ error: 'Không thể tải nội dung tài liệu.' });
  }
});

// Stream raw document file (inline for PDF.js or attachment for download)
publicApiRouter.get('/documents/:slug/file', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const slug = String(req.params.slug || '');
    const isDownload = req.query.download === '1' || req.query.download === 'true';

    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.slug, slug))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Tài liệu không tồn tại.' });
    }
    const doc = rows[0];
    const isAdmin = req.dbUser?.role === 'ADMIN';
    if (!isAdmin && (doc.status !== 'PUBLISHED' || doc.processingStatus !== 'COMPLETED')) {
      return res.status(404).json({ error: 'Tài liệu không tồn tại hoặc đang được xử lý.' });
    }

    if (isDownload) {
      void recordDocumentDownload(doc.id, req.dbUser?.id);
    }

    // If stored in Cloudflare R2 and downloading as attachment, redirect to short-lived Presigned URL
    if (isDownload && doc.storageProvider === 'R2' && doc.storageKey) {
      const signedUrl = await createPresignedDownloadUrl(doc.storageKey, doc.originalFilename, 300);
      if (signedUrl) {
        return res.redirect(302, signedUrl);
      }
    }

    const encodedName = encodeURIComponent(doc.originalFilename);
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const fullPath = resolveSafeStoragePath(DOCUMENTS_DIR, doc.filePath);
    try {
      await fs.access(fullPath);
      return res.sendFile(fullPath);
    } catch {
      if (doc.storageProvider === 'R2' && doc.storageKey) {
        const buffer = await readStoredObjectBuffer('originals', doc.storageKey);
        return res.send(buffer);
      }
      return res.status(404).json({ error: 'Tệp tài liệu không còn trên máy chủ.' });
    }
  } catch (error) {
    console.error('GET /api/documents/:slug/file error:', error);
    res.status(500).json({ error: 'Không thể đọc tệp tài liệu.' });
  }
});

// Presigned or direct download endpoint metadata
publicApiRouter.get('/documents/:slug/download-url', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const slug = String(req.params.slug || '');
    const rows = await db.select().from(documents).where(eq(documents.slug, slug)).limit(1);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Tài liệu không tồn tại.' });
    }
    const doc = rows[0];
    if (req.dbUser?.role !== 'ADMIN' && (doc.status !== 'PUBLISHED' || doc.processingStatus !== 'COMPLETED')) {
      return res.status(404).json({ error: 'Tài liệu chưa được xuất bản công khai.' });
    }

    if (doc.storageProvider === 'R2' && doc.storageKey) {
      const presigned = await createPresignedDownloadUrl(doc.storageKey, doc.originalFilename, 300);
      if (presigned) {
        return res.json({ url: presigned, provider: 'R2', expiresInSeconds: 300 });
      }
    }
    res.json({
      url: `/api/documents/${encodeURIComponent(doc.slug)}/file?download=1`,
      provider: 'LOCAL',
      expiresInSeconds: null,
    });
  } catch (error) {
    console.error('GET /api/documents/:slug/download-url error:', error);
    res.status(500).json({ error: 'Không thể tạo liên kết tải xuống.' });
  }
});

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Họ và tên tối thiểu 2 ký tự.').max(120),
  email: z.string().trim().email('Email không hợp lệ.').max(200),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự.').max(200),
});

async function issueUserSession(req: AuthRequest, res: Response, userRow: typeof users.$inferSelect) {
  const safeUser = toSafeUser(userRow);
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    sessionToken,
    userId: safeUser.id,
    userAgent: req.headers['user-agent']?.slice(0, 250) || null,
    ipAddress: req.ip || null,
    expiresAt,
  });

  const token = signAdminSessionToken(safeUser, sessionToken);
  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  });

  return { user: safeUser, token };
}

// Register new user account (Email + Password)
publicApiRouter.post('/auth/register', authRateLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Thông tin đăng ký không hợp lệ.' });
    }
    const email = parsed.data.email.toLowerCase();
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email này đã được đăng ký. Vui lòng đăng nhập.' });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const uid = `user-${crypto.randomUUID().slice(0, 12)}`;
    const [created] = await db
      .insert(users)
      .values({
        uid,
        fullName: parsed.data.fullName,
        email,
        passwordHash,
        role: 'USER',
        status: 'ACTIVE',
      })
      .returning();

    await db
      .insert(accounts)
      .values({
        userId: created.id,
        provider: 'credentials',
        providerAccountId: email,
      })
      .onConflictDoNothing();

    const sessionPayload = await issueUserSession(req, res, created);
    res.status(201).json(sessionPayload);
  } catch (error) {
    console.error('POST /api/auth/register error:', error);
    res.status(500).json({ error: 'Đăng ký tài khoản thất bại.' });
  }
});

// Standard user login (Email + Password)
publicApiRouter.post('/auth/login', authRateLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = adminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dữ liệu đăng nhập không hợp lệ.' });
    }
    const email = parsed.data.email.toLowerCase();
    const userRow = await findUserByEmail(email);
    if (!userRow || !userRow.passwordHash) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
    }
    if (userRow.status === 'LOCKED') {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa.' });
    }
    const valid = await bcrypt.compare(parsed.data.password, userRow.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
    }

    const sessionPayload = await issueUserSession(req, res, userRow);
    res.json(sessionPayload);
  } catch (error) {
    console.error('POST /api/auth/login error:', error);
    res.status(500).json({ error: 'Đăng nhập thất bại.' });
  }
});

// Separate secure Admin login
publicApiRouter.post('/auth/admin/login', authRateLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = adminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dữ liệu đăng nhập không hợp lệ.' });
    }
    const email = parsed.data.email.toLowerCase();
    const password = parsed.data.password;

    const userRow = await findUserByEmail(email);
    if (!userRow || !userRow.passwordHash || userRow.role !== 'ADMIN') {
      return res.status(401).json({ error: 'Email hoặc mật khẩu quản trị không chính xác.' });
    }

    if (userRow.status === 'LOCKED') {
      return res.status(403).json({ error: 'Tài khoản quản trị này đã bị khóa.' });
    }

    const valid = await bcrypt.compare(password, userRow.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu quản trị không chính xác.' });
    }

    const sessionPayload = await issueUserSession(req, res, userRow);
    res.json(sessionPayload);
  } catch (error) {
    console.error('POST /api/auth/admin/login error:', error);
    res.status(500).json({ error: 'Đăng nhập quản trị thất bại.' });
  }
});

publicApiRouter.post('/auth/logout', async (req, res: Response) => {
  try {
    const rawToken =
      req.cookies?.[ADMIN_COOKIE_NAME] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice('Bearer '.length).trim()
        : undefined);
    if (rawToken) {
      const payload = verifyAdminSessionToken(rawToken);
      if (payload?.jti) {
        await db
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(eq(sessions.sessionToken, payload.jti));
      }
    }
  } catch {
    // Ignore revoke errors on logout
  }
  res.clearCookie(ADMIN_COOKIE_NAME);
  res.json({ ok: true });
});

publicApiRouter.get('/auth/me', optionalAuth, (req: AuthRequest, res: Response) => {
  res.json({ user: req.dbUser ?? null });
});

// Authenticated User Profile & Activity
publicApiRouter.patch('/user/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Họ và tên không hợp lệ.' });
    }
    const fullName = stripUnsafeHtml(parsed.data.fullName);

    const [updated] = await db
      .update(users)
      .set({ fullName, updatedAt: new Date() })
      .where(eq(users.id, req.dbUser!.id))
      .returning();

    res.json({ user: toSafeUser(updated) });
  } catch (error) {
    console.error('PATCH /api/user/profile error:', error);
    res.status(500).json({ error: 'Không thể cập nhật hồ sơ.' });
  }
});

publicApiRouter.get('/user/activity', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;

    const favDocs = await db
      .select({
        id: documents.id,
        title: documents.title,
        slug: documents.slug,
        fileType: documents.fileType,
        fileSize: documents.fileSize,
        viewCount: documents.viewCount,
        downloadCount: documents.downloadCount,
        createdAt: documents.createdAt,
        favoritedAt: favorites.createdAt,
        subjectName: subjects.name,
        gradeName: grades.name,
      })
      .from(favorites)
      .innerJoin(documents, eq(favorites.documentId, documents.id))
      .leftJoin(subjects, eq(documents.subjectId, subjects.id))
      .leftJoin(grades, eq(documents.gradeId, grades.id))
      .where(and(eq(favorites.userId, userId), eq(documents.status, 'PUBLISHED')))
      .orderBy(desc(favorites.createdAt))
      .limit(30);

    const viewedDocs = await db
      .select({
        id: documents.id,
        title: documents.title,
        slug: documents.slug,
        fileType: documents.fileType,
        viewedAt: viewLogs.viewedAt,
        subjectName: subjects.name,
        gradeName: grades.name,
      })
      .from(viewLogs)
      .innerJoin(documents, eq(viewLogs.documentId, documents.id))
      .leftJoin(subjects, eq(documents.subjectId, subjects.id))
      .leftJoin(grades, eq(documents.gradeId, grades.id))
      .where(and(eq(viewLogs.userId, userId), eq(documents.status, 'PUBLISHED')))
      .orderBy(desc(viewLogs.viewedAt))
      .limit(20);

    const downloadedDocs = await db
      .select({
        id: documents.id,
        title: documents.title,
        slug: documents.slug,
        fileType: documents.fileType,
        downloadedAt: downloadLogs.downloadedAt,
        subjectName: subjects.name,
        gradeName: grades.name,
      })
      .from(downloadLogs)
      .innerJoin(documents, eq(downloadLogs.documentId, documents.id))
      .leftJoin(subjects, eq(documents.subjectId, subjects.id))
      .leftJoin(grades, eq(documents.gradeId, grades.id))
      .where(and(eq(downloadLogs.userId, userId), eq(documents.status, 'PUBLISHED')))
      .orderBy(desc(downloadLogs.downloadedAt))
      .limit(20);

    res.json({
      favorites: favDocs,
      viewHistory: viewedDocs,
      downloadHistory: downloadedDocs,
    });
  } catch (error) {
    console.error('GET /api/user/activity error:', error);
    res.status(500).json({ error: 'Không thể tải lịch sử hoạt động.' });
  }
});

// Toggle Favorite
publicApiRouter.post('/documents/:id/favorite', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const docId = Number(req.params.id);
    if (!Number.isInteger(docId) || docId <= 0) {
      return res.status(400).json({ error: 'ID tài liệu không hợp lệ.' });
    }

    const existing = await db
      .select()
      .from(favorites)
      .where(and(eq(favorites.userId, req.dbUser!.id), eq(favorites.documentId, docId)))
      .limit(1);

    if (existing.length > 0) {
      await db.delete(favorites).where(eq(favorites.id, existing[0].id));
      return res.json({ favorited: false });
    }

    await db.insert(favorites).values({
      userId: req.dbUser!.id,
      documentId: docId,
    });
    res.json({ favorited: true });
  } catch (error) {
    console.error('POST /api/documents/:id/favorite error:', error);
    res.status(500).json({ error: 'Không thể cập nhật yêu thích.' });
  }
});

// Add Comment
publicApiRouter.post(
  '/documents/:id/comments',
  commentRateLimiter,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const docId = Number(req.params.id);
      if (!Number.isInteger(docId) || docId <= 0) {
        return res.status(400).json({ error: 'ID tài liệu không hợp lệ.' });
      }
      const parsed = commentCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message || 'Nội dung bình luận không hợp lệ.' });
      }
      const cleanContent = stripUnsafeHtml(parsed.data.content);
      if (cleanContent.length < 3) {
        return res.status(400).json({ error: 'Bình luận phải dài từ 3 đến 1000 ký tự.' });
      }

      const [created] = await db
        .insert(comments)
        .values({
          documentId: docId,
          userId: req.dbUser!.id,
          content: cleanContent,
          status: 'APPROVED',
        })
        .returning();

      res.status(201).json({
        comment: {
          id: created.id,
          content: created.content,
          createdAt: created.createdAt,
          userName: req.dbUser!.fullName,
          userAvatar: req.dbUser!.avatar,
        },
      });
    } catch (error) {
      console.error('POST /api/documents/:id/comments error:', error);
      res.status(500).json({ error: 'Không thể gửi bình luận.' });
    }
  }
);
