import path from 'node:path';
import bcrypt from 'bcryptjs';
import { count, desc, eq, gte, sql } from 'drizzle-orm';
import { Router, type Response } from 'express';
import multer from 'multer';
import { db } from '../db/index.ts';
import {
  auditLogs,
  categories,
  comments,
  documents,
  documentTags,
  downloadLogs,
  grades,
  processingJobs,
  siteSettings,
  subjects,
  tags,
  users,
  viewLogs,
} from '../db/schema.ts';
import { listDocuments } from '../db/documents.ts';
import { toSafeUser } from '../db/users.ts';
import { saveDocumentFile } from '../lib/documentFiles.ts';
import { enqueueDocumentProcessing, getRecentProcessingJobs } from '../lib/processingQueue.ts';
import { getAllowedFileExtension, toVietnameseSlug } from '../lib/slug.ts';
import {
  createPresignedUploadUrl,
  deleteStoredObject,
  detectMimeTypeFromExt,
  ensureStorageDirs,
  generateStoredFilename,
  getStorageStatus,
  uploadStoredObject,
  validateMagicBytes,
} from '../lib/storage.ts';
import { requireAdmin, requireAuth, type AuthRequest } from '../middleware/auth.ts';
import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  createRateLimiter,
  stripUnsafeHtml,
  taxonomyNameSchema,
} from '../middleware/security.ts';

export const adminApiRouter = Router();

// Strictly enforce authentication + ADMIN role on all /api/admin/* endpoints
adminApiRouter.use(requireAuth, requireAdmin);

const uploadRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 60, prefix: 'admin-upload' });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max per file
  },
});

async function logAudit(
  adminId: number,
  action: string,
  targetType: string,
  targetId: string | number | null,
  details?: string
) {
  try {
    await db.insert(auditLogs).values({
      adminId,
      action,
      targetType,
      targetId: targetId !== null ? String(targetId) : null,
      details: details || null,
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

// 1. Dashboard Stats & Charts
adminApiRouter.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      [{ totalDocuments }],
      [{ totalUsers }],
      [{ monthlyDocuments }],
      [{ totalViews, totalDownloads }],
      recentDocs,
      recentAudits,
      subjectDistribution,
    ] = await Promise.all([
      db.select({ totalDocuments: count() }).from(documents),
      db.select({ totalUsers: count() }).from(users),
      db
        .select({ monthlyDocuments: count() })
        .from(documents)
        .where(gte(documents.createdAt, startOfMonth)),
      db
        .select({
          totalViews: sql<number>`coalesce(sum(${documents.viewCount}), 0)::int`,
          totalDownloads: sql<number>`coalesce(sum(${documents.downloadCount}), 0)::int`,
        })
        .from(documents),
      db
        .select({
          id: documents.id,
          title: documents.title,
          slug: documents.slug,
          fileType: documents.fileType,
          status: documents.status,
          viewCount: documents.viewCount,
          downloadCount: documents.downloadCount,
          createdAt: documents.createdAt,
          subjectName: subjects.name,
        })
        .from(documents)
        .leftJoin(subjects, eq(documents.subjectId, subjects.id))
        .orderBy(desc(documents.createdAt))
        .limit(8),
      db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          targetType: auditLogs.targetType,
          targetId: auditLogs.targetId,
          details: auditLogs.details,
          createdAt: auditLogs.createdAt,
          adminName: users.fullName,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.adminId, users.id))
        .orderBy(desc(auditLogs.createdAt))
        .limit(10),
      db
        .select({
          subjectName: subjects.name,
          views: sql<number>`coalesce(sum(${documents.viewCount}), 0)::int`,
          downloads: sql<number>`coalesce(sum(${documents.downloadCount}), 0)::int`,
          docCount: count(documents.id),
        })
        .from(subjects)
        .leftJoin(documents, eq(subjects.id, documents.subjectId))
        .groupBy(subjects.id, subjects.name)
        .orderBy(desc(sql`coalesce(sum(${documents.viewCount}), 0)`))
        .limit(6),
    ]);

    // Recent 7 days real view/download logs aggregated
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [recentViewLogs, recentDownloadLogs] = await Promise.all([
      db
        .select({ viewedAt: viewLogs.viewedAt })
        .from(viewLogs)
        .where(gte(viewLogs.viewedAt, sevenDaysAgo)),
      db
        .select({ downloadedAt: downloadLogs.downloadedAt })
        .from(downloadLogs)
        .where(gte(downloadLogs.downloadedAt, sevenDaysAgo)),
    ]);

    const dailyChart: Array<{ date: string; label: string; views: number; downloads: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      dailyChart.push({ date: iso, label, views: 0, downloads: 0 });
    }
    const chartMap = new Map(dailyChart.map((item) => [item.date, item]));
    for (const v of recentViewLogs) {
      const key = new Date(v.viewedAt).toISOString().slice(0, 10);
      const entry = chartMap.get(key);
      if (entry) entry.views += 1;
    }
    for (const dl of recentDownloadLogs) {
      const key = new Date(dl.downloadedAt).toISOString().slice(0, 10);
      const entry = chartMap.get(key);
      if (entry) entry.downloads += 1;
    }

    res.json({
      kpis: {
        totalDocuments,
        totalViews,
        totalDownloads,
        totalUsers,
        monthlyDocuments,
      },
      storage: getStorageStatus(),
      subjectChart: subjectDistribution,
      dailyChart,
      recentDocuments: recentDocs,
      recentAudits,
    });
  } catch (error) {
    console.error('GET /api/admin/stats error:', error);
    res.status(500).json({ error: 'Không thể tải thống kê quản trị.' });
  }
});

// 1b. Storage Status & Presigned Upload URL (Cloudflare R2)
adminApiRouter.get('/storage/status', (_req: AuthRequest, res: Response) => {
  res.json({ storage: getStorageStatus() });
});

adminApiRouter.post('/storage/presign', async (req: AuthRequest, res: Response) => {
  try {
    const filename = typeof req.body?.filename === 'string' ? req.body.filename : '';
    const ext = getAllowedFileExtension(filename);
    if (!ext) {
      return res.status(400).json({ error: 'Định dạng tệp không hợp lệ.' });
    }
    const stored = generateStoredFilename(filename);
    const mimeType = detectMimeTypeFromExt(ext);
    const presign = await createPresignedUploadUrl('originals', stored, mimeType, 300);
    if (!presign) {
      return res.json({
        mode: 'LOCAL',
        uploadEndpoint: '/api/admin/documents',
        storedFilename: stored,
      });
    }
    res.json({
      mode: 'R2',
      ...presign,
      storedFilename: stored,
      mimeType,
    });
  } catch (error) {
    console.error('POST /api/admin/storage/presign error:', error);
    res.status(500).json({ error: 'Không thể tạo Presigned URL.' });
  }
});

// 1c. Processing Jobs Queue Inspection & Retry
adminApiRouter.get('/jobs', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const jobs = await getRecentProcessingJobs(limit);
    res.json({ jobs });
  } catch (error) {
    console.error('GET /api/admin/jobs error:', error);
    res.status(500).json({ error: 'Không thể tải hàng đợi xử lý tài liệu.' });
  }
});

adminApiRouter.post('/documents/:id/retry', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID tài liệu không hợp lệ.' });
    }
    const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });
    }
    const job = await enqueueDocumentProcessing(id, 'DOCUMENT_CONVERT');
    await logAudit(req.dbUser!.id, 'RETRY_PROCESSING', 'document', id, rows[0].title);
    res.json({ ok: true, job });
  } catch (error) {
    console.error('POST /api/admin/documents/:id/retry error:', error);
    res.status(500).json({ error: 'Không thể đưa tài liệu vào hàng đợi xử lý lại.' });
  }
});

// 2. Admin Documents List
adminApiRouter.get('/documents', async (req: AuthRequest, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' && req.query.status !== 'ALL'
      ? req.query.status
      : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    if (!status) {
      const all = await db
        .select({
          id: documents.id,
          title: documents.title,
          slug: documents.slug,
          description: documents.description,
          originalFilename: documents.originalFilename,
          fileType: documents.fileType,
          fileSize: documents.fileSize,
          thumbnail: documents.thumbnail,
          topic: documents.topic,
          author: documents.author,
          status: documents.status,
          processingStatus: documents.processingStatus,
          processingError: documents.processingError,
          storageProvider: documents.storageProvider,
          featured: documents.featured,
          viewCount: documents.viewCount,
          downloadCount: documents.downloadCount,
          mathMeta: documents.mathMeta,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
          subjectId: documents.subjectId,
          subjectName: subjects.name,
          gradeId: documents.gradeId,
          gradeName: grades.name,
          categoryId: documents.categoryId,
          categoryName: categories.name,
        })
        .from(documents)
        .leftJoin(subjects, eq(documents.subjectId, subjects.id))
        .leftJoin(grades, eq(documents.gradeId, grades.id))
        .leftJoin(categories, eq(documents.categoryId, categories.id))
        .orderBy(desc(documents.createdAt));

      const filtered = q
        ? all.filter((d) => d.title.toLowerCase().includes(q.toLowerCase()))
        : all;

      return res.json({
        items: filtered.slice((page - 1) * limit, page * limit),
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit),
      });
    }

    const data = await listDocuments({ q, status, page, limit, includeUnprocessed: true });
    res.json(data);
  } catch (error) {
    console.error('GET /api/admin/documents error:', error);
    res.status(500).json({ error: 'Không thể tải danh sách tài liệu quản trị.' });
  }
});

const PAIRED_PDF_MATH_META = {
  ommlCount: 0,
  mathTypeOleCount: 0,
  formulaImageCount: 0,
  convertedCount: 0,
  fallbackImagesCount: 0,
  preCheckTotal: 0,
  postCheckPreserved: 0,
  supportsFullPreview: true,
  warnings: [] as string[],
};

const PAIRED_PDF_PREVIEW_JSON = JSON.stringify({
  kind: 'pdf',
  mathMeta: PAIRED_PDF_MATH_META,
});

// Upload paired Word (.docx for download) + PDF (.pdf for online viewing) -> Storage & DB -> Immediately COMPLETED
adminApiRouter.post(
  '/documents',
  uploadRateLimiter,
  upload.fields([
    { name: 'docxFile', maxCount: 1 },
    { name: 'pdfFile', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      await ensureStorageDirs();
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const docxFile = files?.docxFile?.[0];
      const pdfFile = files?.pdfFile?.[0];
      const thumbFile = files?.thumbnail?.[0];

      if (!docxFile) {
        return res.status(400).json({ error: 'Vui lòng thêm tệp Word (.docx) để người dùng tải về.' });
      }
      if (!pdfFile) {
        return res.status(400).json({ error: 'Vui lòng thêm tệp PDF (.pdf) để hiển thị trực tiếp trên web.' });
      }

      if (getAllowedFileExtension(docxFile.originalname) !== 'docx') {
        return res.status(400).json({
          error: 'Tệp tải về bắt buộc phải có định dạng Word (.docx).',
        });
      }
      if (!validateMagicBytes(docxFile.buffer, 'docx')) {
        return res.status(400).json({
          error: 'Nội dung tệp .docx không hợp lệ (kiểm tra bảo mật thất bại).',
        });
      }

      if (getAllowedFileExtension(pdfFile.originalname) !== 'pdf') {
        return res.status(400).json({
          error: 'Tệp hiển thị trên web bắt buộc phải có định dạng PDF (.pdf).',
        });
      }
      if (!validateMagicBytes(pdfFile.buffer, 'pdf')) {
        return res.status(400).json({
          error: 'Nội dung tệp .pdf không hợp lệ (kiểm tra bảo mật thất bại).',
        });
      }

      const title = typeof req.body?.title === 'string' ? stripUnsafeHtml(req.body.title) : '';
      if (!title) {
        return res.status(400).json({ error: 'Tên tài liệu không được để trống.' });
      }

      const docxStoredFilename = generateStoredFilename(docxFile.originalname);
      const docxMime = detectMimeTypeFromExt('docx');
      const storedOriginal = await uploadStoredObject(
        'originals',
        docxStoredFilename,
        docxFile.buffer,
        docxMime
      );

      const pdfStoredFilename = generateStoredFilename(pdfFile.originalname);
      const storedPreviewPdf = await uploadStoredObject(
        'previews',
        pdfStoredFilename,
        pdfFile.buffer,
        'application/pdf'
      );

      let thumbnailUrl: string | null = null;
      let thumbStoredName: string | null = null;
      let thumbMimeType: string | null = null;
      if (thumbFile) {
        const thumbExt = path.extname(thumbFile.originalname).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(thumbExt)) {
          thumbStoredName = generateStoredFilename(thumbFile.originalname);
          thumbMimeType =
            thumbExt === '.png' ? 'image/png' : thumbExt === '.webp' ? 'image/webp' : 'image/jpeg';
          await uploadStoredObject('thumbnails', thumbStoredName, thumbFile.buffer, thumbMimeType);
          thumbnailUrl = `/api/uploads/thumbnails/${thumbStoredName}`;
        }
      }

      // Ensure unique slug
      const baseSlug = toVietnameseSlug(title);
      const existingSlug = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.slug, baseSlug))
        .limit(1);
      const finalSlug =
        existingSlug.length > 0 ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;

      const subjectId = req.body.subjectId ? Number(req.body.subjectId) : null;
      const gradeId = req.body.gradeId ? Number(req.body.gradeId) : null;
      const categoryId = req.body.categoryId ? Number(req.body.categoryId) : null;
      const status = req.body.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED';
      const featured = req.body.featured === 'true' || req.body.featured === true;

      const [inserted] = await db
        .insert(documents)
        .values({
          title,
          slug: finalSlug,
          description: typeof req.body.description === 'string' ? stripUnsafeHtml(req.body.description) : '',
          originalFilename: docxFile.originalname,
          storedFilename: docxStoredFilename,
          fileType: 'docx',
          mimeType: docxMime,
          fileSize: docxFile.size,
          filePath: docxStoredFilename,
          previewPath: PAIRED_PDF_PREVIEW_JSON,
          storageProvider: storedOriginal.provider,
          storageKey: storedOriginal.storageKey,
          previewStorageKey: storedPreviewPdf.storageKey,
          thumbnail: thumbnailUrl,
          subjectId: subjectId && Number.isInteger(subjectId) ? subjectId : null,
          gradeId: gradeId && Number.isInteger(gradeId) ? gradeId : null,
          categoryId: categoryId && Number.isInteger(categoryId) ? categoryId : null,
          topic: typeof req.body.topic === 'string' ? stripUnsafeHtml(req.body.topic) : '',
          author:
            typeof req.body.author === 'string' && req.body.author.trim()
              ? stripUnsafeHtml(req.body.author)
              : req.dbUser!.fullName,
          status,
          processingStatus: 'COMPLETED',
          processingError: null,
          featured,
          mathMeta: JSON.stringify(PAIRED_PDF_MATH_META),
          createdBy: req.dbUser!.id,
        })
        .returning();

      // Persist both binaries in PostgreSQL so Vercel serverless instances always serve them reliably
      await Promise.all([
        saveDocumentFile({
          documentId: inserted.id,
          role: 'ORIGINAL',
          filename: docxFile.originalname,
          mimeType: docxMime,
          buffer: docxFile.buffer,
        }),
        saveDocumentFile({
          documentId: inserted.id,
          role: 'PREVIEW_PDF',
          filename: pdfFile.originalname,
          mimeType: 'application/pdf',
          buffer: pdfFile.buffer,
        }),
        thumbFile && thumbStoredName && thumbMimeType
          ? saveDocumentFile({
              documentId: inserted.id,
              role: 'THUMBNAIL',
              filename: thumbStoredName,
              mimeType: thumbMimeType,
              buffer: thumbFile.buffer,
            })
          : Promise.resolve(),
      ]);

      // Handle comma-separated tags
      if (typeof req.body.tags === 'string' && req.body.tags.trim()) {
        const tagNames = req.body.tags
          .split(',')
          .map((t: string) => stripUnsafeHtml(t))
          .filter(Boolean)
          .slice(0, 12);
        for (const name of tagNames) {
          const slug = toVietnameseSlug(name);
          await db.insert(tags).values({ name, slug }).onConflictDoNothing();
          const [tagRow] = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
          if (tagRow) {
            await db
              .insert(documentTags)
              .values({ documentId: inserted.id, tagId: tagRow.id })
              .onConflictDoNothing();
          }
        }
      }

      const [job] = await db
        .insert(processingJobs)
        .values({
          documentId: inserted.id,
          jobType: 'PAIRED_PDF_PREVIEW',
          status: 'COMPLETED',
          attempts: 1,
          maxAttempts: 1,
          workerId: 'paired-pdf-upload',
          mathReport: JSON.stringify(PAIRED_PDF_MATH_META),
          startedAt: new Date(),
          completedAt: new Date(),
        })
        .returning();

      await logAudit(req.dbUser!.id, 'CREATE_DOCUMENT', 'document', inserted.id, title);

      res.status(201).json({
        document: inserted,
        job,
      });
    } catch (error) {
      console.error('POST /api/admin/documents error:', error);
      res.status(500).json({ error: 'Tải lên tài liệu thất bại.' });
    }
  }
);

// Update document metadata or replace Word/PDF files independently while keeping link
adminApiRouter.put(
  '/documents/:id',
  upload.fields([
    { name: 'docxFile', maxCount: 1 },
    { name: 'pdfFile', maxCount: 1 },
    { name: 'file', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID tài liệu không hợp lệ.' });
      }

      const existingRows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
      if (existingRows.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });
      }
      const existing = existingRows[0];

      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const docxFile = files?.docxFile?.[0] || files?.file?.[0];
      const pdfFile = files?.pdfFile?.[0];
      const thumbFile = files?.thumbnail?.[0];

      const updates: Partial<typeof documents.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (typeof req.body.title === 'string' && req.body.title.trim()) {
        updates.title = req.body.title.trim();
      }
      if (typeof req.body.description === 'string') {
        updates.description = req.body.description.trim();
      }
      if (typeof req.body.topic === 'string') {
        updates.topic = req.body.topic.trim();
      }
      if (typeof req.body.author === 'string' && req.body.author.trim()) {
        updates.author = req.body.author.trim();
      }
      if (req.body.subjectId !== undefined) {
        updates.subjectId = req.body.subjectId ? Number(req.body.subjectId) : null;
      }
      if (req.body.gradeId !== undefined) {
        updates.gradeId = req.body.gradeId ? Number(req.body.gradeId) : null;
      }
      if (req.body.categoryId !== undefined) {
        updates.categoryId = req.body.categoryId ? Number(req.body.categoryId) : null;
      }
      if (req.body.status === 'PUBLISHED' || req.body.status === 'DRAFT' || req.body.status === 'TRASH') {
        if (
          req.body.status === 'PUBLISHED' &&
          !docxFile &&
          !pdfFile &&
          existing.processingStatus !== 'COMPLETED'
        ) {
          return res.status(409).json({
            error:
              'Không thể xuất bản công khai khi tài liệu chưa hoàn tất kiểm tra và xử lý (COMPLETED). Vui lòng thử xử lý lại trước.',
          });
        }
        updates.status = req.body.status;
        if (req.body.status === 'TRASH') {
          updates.deletedAt = new Date();
        } else {
          updates.deletedAt = null;
        }
      }
      if (req.body.featured !== undefined) {
        updates.featured = req.body.featured === 'true' || req.body.featured === true;
      }

      let shouldRequeue = false;
      if (docxFile) {
        const ext = getAllowedFileExtension(docxFile.originalname);
        if (!ext || !validateMagicBytes(docxFile.buffer, ext)) {
          return res.status(400).json({ error: 'Tệp Word (.docx) thay thế không hợp lệ hoặc không được hỗ trợ.' });
        }
        if (files?.docxFile?.[0] && ext !== 'docx') {
          return res.status(400).json({ error: 'Tệp tải về bắt buộc phải có định dạng Word (.docx).' });
        }
        const storedFilename = generateStoredFilename(docxFile.originalname);
        const mimeType = detectMimeTypeFromExt(ext);
        const stored = await uploadStoredObject('originals', storedFilename, docxFile.buffer, mimeType);

        if (existing.filePath) {
          await deleteStoredObject('originals', existing.storageKey || existing.filePath);
        }

        await saveDocumentFile({
          documentId: id,
          role: 'ORIGINAL',
          filename: docxFile.originalname,
          mimeType,
          buffer: docxFile.buffer,
        });

        updates.originalFilename = docxFile.originalname;
        updates.storedFilename = storedFilename;
        updates.fileType = ext;
        updates.mimeType = mimeType;
        updates.fileSize = docxFile.size;
        updates.filePath = storedFilename;
        updates.storageProvider = stored.provider;
        updates.storageKey = stored.storageKey;

        // Only requeue legacy conversion if there's no paired PDF (neither new nor existing)
        if (!pdfFile && !existing.previewStorageKey) {
          updates.processingStatus = 'PENDING';
          updates.processingError = null;
          shouldRequeue = true;
        }
      }

      if (pdfFile) {
        if (
          getAllowedFileExtension(pdfFile.originalname) !== 'pdf' ||
          !validateMagicBytes(pdfFile.buffer, 'pdf')
        ) {
          return res.status(400).json({ error: 'Tệp PDF hiển thị thay thế không hợp lệ.' });
        }
        const pdfStoredFilename = generateStoredFilename(pdfFile.originalname);
        const storedPreview = await uploadStoredObject(
          'previews',
          pdfStoredFilename,
          pdfFile.buffer,
          'application/pdf'
        );
        if (existing.previewStorageKey) {
          await deleteStoredObject('previews', existing.previewStorageKey);
        }

        await saveDocumentFile({
          documentId: id,
          role: 'PREVIEW_PDF',
          filename: pdfFile.originalname,
          mimeType: 'application/pdf',
          buffer: pdfFile.buffer,
        });

        updates.previewStorageKey = storedPreview.storageKey;
        updates.previewPath = PAIRED_PDF_PREVIEW_JSON;
        updates.processingStatus = 'COMPLETED';
        updates.processingError = null;
        updates.mathMeta = JSON.stringify(PAIRED_PDF_MATH_META);
      }

      if (thumbFile) {
        const thumbExt = path.extname(thumbFile.originalname).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(thumbExt)) {
          const thumbStored = generateStoredFilename(thumbFile.originalname);
          const thumbMime =
            thumbExt === '.png' ? 'image/png' : thumbExt === '.webp' ? 'image/webp' : 'image/jpeg';
          await uploadStoredObject('thumbnails', thumbStored, thumbFile.buffer, thumbMime);
          await saveDocumentFile({
            documentId: id,
            role: 'THUMBNAIL',
            filename: thumbStored,
            mimeType: thumbMime,
            buffer: thumbFile.buffer,
          });
          updates.thumbnail = `/api/uploads/thumbnails/${thumbStored}`;
        }
      }

      const [updated] = await db
        .update(documents)
        .set(updates)
        .where(eq(documents.id, id))
        .returning();

      if (shouldRequeue) {
        await enqueueDocumentProcessing(id, 'DOCUMENT_CONVERT');
      }

      if (typeof req.body.tags === 'string') {
        await db.delete(documentTags).where(eq(documentTags.documentId, id));
        const tagNames = req.body.tags
          .split(',')
          .map((t: string) => stripUnsafeHtml(t))
          .filter(Boolean)
          .slice(0, 12);
        for (const name of tagNames) {
          const slug = toVietnameseSlug(name);
          await db.insert(tags).values({ name, slug }).onConflictDoNothing();
          const [tagRow] = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
          if (tagRow) {
            await db
              .insert(documentTags)
              .values({ documentId: id, tagId: tagRow.id })
              .onConflictDoNothing();
          }
        }
      }

      await logAudit(req.dbUser!.id, 'UPDATE_DOCUMENT', 'document', id, updated.title || existing.title);

      res.json({ document: updated });
    } catch (error) {
      console.error('PUT /api/admin/documents/:id error:', error);
      res.status(500).json({ error: 'Cập nhật tài liệu thất bại.' });
    }
  }
);

// Soft-delete or permanent delete
adminApiRouter.delete('/documents/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const permanent = req.query.permanent === 'true';

    const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });
    }
    const doc = rows[0];

    if (permanent || doc.status === 'TRASH') {
      await db.delete(documents).where(eq(documents.id, id));
      await Promise.all([
        deleteStoredObject('originals', doc.storageKey || doc.filePath),
        doc.previewStorageKey ? deleteStoredObject('previews', doc.previewStorageKey) : Promise.resolve(),
      ]);
      await logAudit(req.dbUser!.id, 'PERMANENT_DELETE_DOCUMENT', 'document', id, doc.title);
      return res.json({ deleted: true, permanent: true });
    }

    await db
      .update(documents)
      .set({ status: 'TRASH', deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(documents.id, id));
    await logAudit(req.dbUser!.id, 'TRASH_DOCUMENT', 'document', id, doc.title);
    res.json({ deleted: true, permanent: false });
  } catch (error) {
    console.error('DELETE /api/admin/documents/:id error:', error);
    res.status(500).json({ error: 'Xóa tài liệu thất bại.' });
  }
});

adminApiRouter.post('/documents/:id/restore', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu.' });
    }
    const nextStatus = rows[0].processingStatus === 'COMPLETED' ? 'PUBLISHED' : 'DRAFT';
    const [updated] = await db
      .update(documents)
      .set({ status: nextStatus, deletedAt: null, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    await logAudit(req.dbUser!.id, 'RESTORE_DOCUMENT', 'document', id, updated.title);
    res.json({ document: updated });
  } catch (error) {
    console.error('POST /api/admin/documents/:id/restore error:', error);
    res.status(500).json({ error: 'Khôi phục tài liệu thất bại.' });
  }
});

// 3. Taxonomy CRUD (Subjects, Grades, Categories)
adminApiRouter.post('/subjects', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = taxonomyNameSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Tên môn học không được trống.' });
    }
    const name = stripUnsafeHtml(parsed.data.name);
    const [created] = await db
      .insert(subjects)
      .values({
        name,
        slug: toVietnameseSlug(name),
        description: stripUnsafeHtml(parsed.data.description || ''),
        sortOrder: parsed.data.sortOrder ?? 99,
      })
      .returning();
    await logAudit(req.dbUser!.id, 'CREATE_SUBJECT', 'subject', created.id, name);
    res.status(201).json({ subject: created });
  } catch (error) {
    console.error('POST /api/admin/subjects error:', error);
    res.status(400).json({ error: 'Không thể thêm môn học (có thể đã tồn tại).' });
  }
});

adminApiRouter.put('/subjects/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const parsed = taxonomyNameSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Tên môn học không được trống.' });
    }
    const name = stripUnsafeHtml(parsed.data.name);
    const [updated] = await db
      .update(subjects)
      .set({
        name,
        slug: toVietnameseSlug(name),
        description: stripUnsafeHtml(parsed.data.description || ''),
      })
      .where(eq(subjects.id, id))
      .returning();
    await logAudit(req.dbUser!.id, 'UPDATE_SUBJECT', 'subject', id, name);
    res.json({ subject: updated });
  } catch (error) {
    console.error('PUT /api/admin/subjects/:id error:', error);
    res.status(400).json({ error: 'Cập nhật môn học thất bại.' });
  }
});

adminApiRouter.delete('/subjects/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    await db.delete(subjects).where(eq(subjects.id, id));
    await logAudit(req.dbUser!.id, 'DELETE_SUBJECT', 'subject', id);
    res.json({ deleted: true });
  } catch (error) {
    console.error('DELETE /api/admin/subjects/:id error:', error);
    res.status(400).json({ error: 'Không thể xóa môn học.' });
  }
});

adminApiRouter.post('/grades', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = taxonomyNameSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Tên khối lớp không được trống.' });
    }
    const name = stripUnsafeHtml(parsed.data.name);
    const level = parsed.data.level ?? 13;
    const [created] = await db
      .insert(grades)
      .values({ name, slug: toVietnameseSlug(name), level })
      .returning();
    await logAudit(req.dbUser!.id, 'CREATE_GRADE', 'grade', created.id, name);
    res.status(201).json({ grade: created });
  } catch (error) {
    console.error('POST /api/admin/grades error:', error);
    res.status(400).json({ error: 'Không thể thêm khối lớp.' });
  }
});

adminApiRouter.delete('/grades/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    await db.delete(grades).where(eq(grades.id, id));
    await logAudit(req.dbUser!.id, 'DELETE_GRADE', 'grade', id);
    res.json({ deleted: true });
  } catch (error) {
    console.error('DELETE /api/admin/grades/:id error:', error);
    res.status(400).json({ error: 'Không thể xóa khối lớp.' });
  }
});

adminApiRouter.post('/categories', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = taxonomyNameSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Tên loại tài liệu không được trống.' });
    }
    const name = stripUnsafeHtml(parsed.data.name);
    const [created] = await db
      .insert(categories)
      .values({
        name,
        slug: toVietnameseSlug(name),
        description: stripUnsafeHtml(parsed.data.description || ''),
      })
      .returning();
    await logAudit(req.dbUser!.id, 'CREATE_CATEGORY', 'category', created.id, name);
    res.status(201).json({ category: created });
  } catch (error) {
    console.error('POST /api/admin/categories error:', error);
    res.status(400).json({ error: 'Không thể thêm loại tài liệu.' });
  }
});

adminApiRouter.put('/categories/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'Tên loại tài liệu không được trống.' });
    const [updated] = await db
      .update(categories)
      .set({
        name,
        slug: toVietnameseSlug(name),
        description: typeof req.body?.description === 'string' ? req.body.description : '',
      })
      .where(eq(categories.id, id))
      .returning();
    await logAudit(req.dbUser!.id, 'UPDATE_CATEGORY', 'category', id, name);
    res.json({ category: updated });
  } catch (error) {
    console.error('PUT /api/admin/categories/:id error:', error);
    res.status(400).json({ error: 'Không thể cập nhật loại tài liệu.' });
  }
});

adminApiRouter.delete('/categories/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    await db.delete(categories).where(eq(categories.id, id));
    await logAudit(req.dbUser!.id, 'DELETE_CATEGORY', 'category', id);
    res.json({ deleted: true });
  } catch (error) {
    console.error('DELETE /api/admin/categories/:id error:', error);
    res.status(400).json({ error: 'Không thể xóa loại tài liệu.' });
  }
});

// 4. User Management
adminApiRouter.get('/users', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db.select().from(users).orderBy(desc(users.createdAt));
    res.json({ users: rows.map(toSafeUser) });
  } catch (error) {
    console.error('GET /api/admin/users error:', error);
    res.status(500).json({ error: 'Không thể tải danh sách người dùng.' });
  }
});

adminApiRouter.post('/users', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = adminCreateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Vui lòng nhập đầy đủ họ tên, email và mật khẩu tối thiểu 8 ký tự.',
      });
    }
    const fullName = stripUnsafeHtml(parsed.data.fullName);
    const email = parsed.data.email.toLowerCase();
    const password = parsed.data.password;
    const role = parsed.data.role;

    const passwordHash = await bcrypt.hash(password, 10);
    const [created] = await db
      .insert(users)
      .values({
        uid: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fullName,
        email,
        passwordHash,
        role,
        status: 'ACTIVE',
      })
      .returning();

    await logAudit(req.dbUser!.id, 'CREATE_USER', 'user', created.id, `${email} (${role})`);
    res.status(201).json({ user: toSafeUser(created) });
  } catch (error) {
    console.error('POST /api/admin/users error:', error);
    res.status(400).json({ error: 'Không thể tạo tài khoản (email có thể đã tồn tại).' });
  }
});

adminApiRouter.patch('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const parsed = adminUpdateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dữ liệu cập nhật tài khoản không hợp lệ.' });
    }
    if (id === req.dbUser!.id && parsed.data.status === 'LOCKED') {
      return res.status(400).json({ error: 'Không thể tự khóa tài khoản đang đăng nhập.' });
    }

    const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (parsed.data.role) {
      updates.role = parsed.data.role;
    }
    if (parsed.data.status) {
      updates.status = parsed.data.status;
    }

    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    if (!updated) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });

    await logAudit(
      req.dbUser!.id,
      'UPDATE_USER',
      'user',
      id,
      `role=${updated.role}, status=${updated.status}`
    );
    res.json({ user: toSafeUser(updated) });
  } catch (error) {
    console.error('PATCH /api/admin/users/:id error:', error);
    res.status(500).json({ error: 'Không thể cập nhật tài khoản.' });
  }
});

// 5. Comments Moderation
adminApiRouter.get('/comments', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select({
        id: comments.id,
        content: comments.content,
        status: comments.status,
        createdAt: comments.createdAt,
        userName: users.fullName,
        userEmail: users.email,
        documentTitle: documents.title,
        documentSlug: documents.slug,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .innerJoin(documents, eq(comments.documentId, documents.id))
      .orderBy(desc(comments.createdAt))
      .limit(100);
    res.json({ comments: rows });
  } catch (error) {
    console.error('GET /api/admin/comments error:', error);
    res.status(500).json({ error: 'Không thể tải bình luận.' });
  }
});

adminApiRouter.patch('/comments/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const status = ['APPROVED', 'PENDING', 'HIDDEN'].includes(req.body?.status)
      ? req.body.status
      : 'APPROVED';
    const [updated] = await db
      .update(comments)
      .set({ status })
      .where(eq(comments.id, id))
      .returning();
    await logAudit(req.dbUser!.id, 'MODERATE_COMMENT', 'comment', id, status);
    res.json({ comment: updated });
  } catch (error) {
    console.error('PATCH /api/admin/comments/:id error:', error);
    res.status(500).json({ error: 'Không thể cập nhật bình luận.' });
  }
});

adminApiRouter.delete('/comments/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    await db.delete(comments).where(eq(comments.id, id));
    await logAudit(req.dbUser!.id, 'DELETE_COMMENT', 'comment', id);
    res.json({ deleted: true });
  } catch (error) {
    console.error('DELETE /api/admin/comments/:id error:', error);
    res.status(500).json({ error: 'Không thể xóa bình luận.' });
  }
});

// 6. Site Settings
adminApiRouter.put('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const entries = req.body?.settings;
    if (!entries || typeof entries !== 'object') {
      return res.status(400).json({ error: 'Dữ liệu cài đặt không hợp lệ.' });
    }

    for (const [key, val] of Object.entries(entries)) {
      if (typeof val === 'string') {
        await db
          .insert(siteSettings)
          .values({ settingKey: key, settingValue: val })
          .onConflictDoUpdate({
            target: siteSettings.settingKey,
            set: { settingValue: val, updatedAt: new Date() },
          });
      }
    }

    await logAudit(req.dbUser!.id, 'UPDATE_SETTINGS', 'site_settings', 'global');
    const all = await db.select().from(siteSettings);
    const settings: Record<string, string> = {};
    for (const r of all) settings[r.settingKey] = r.settingValue;
    res.json({ settings });
  } catch (error) {
    console.error('PUT /api/admin/settings error:', error);
    res.status(500).json({ error: 'Không thể lưu cài đặt website.' });
  }
});

// 7. Audit Logs
adminApiRouter.get('/audit-logs', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
        adminName: users.fullName,
        adminEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.adminId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);
    res.json({ logs: rows });
  } catch (error) {
    console.error('GET /api/admin/audit-logs error:', error);
    res.status(500).json({ error: 'Không thể tải nhật ký quản trị.' });
  }
});
