import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import { and, desc, eq } from 'drizzle-orm';
import express, { type NextFunction, type Request, type Response } from 'express';
import { db } from './src/db/index.ts';
import { documents, processingJobs, subjects } from './src/db/schema.ts';
import { ensureSeeded } from './src/db/seed.ts';
import { getStorageStatus, resolveSafeStoragePath, THUMBNAILS_DIR } from './src/lib/storage.ts';
import { validateCsrfOrigin, workerCallbackSchema } from './src/middleware/security.ts';
import { adminApiRouter } from './src/routes/adminApi.ts';
import { publicApiRouter } from './src/routes/publicApi.ts';

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

export function createServerApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cookieParser());
  app.use(express.json({ limit: '4mb' }));

  // Security headers (kept iframe-friendly in preview while hardening MIME, XSS, HSTS)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'edulibrary-cloud',
      storage: getStorageStatus().provider,
      timestamp: new Date().toISOString(),
    });
  });

  // SEO: robots.txt and dynamic XML sitemap
  app.get('/robots.txt', (req, res) => {
    const origin = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    res.type('text/plain').send(
      `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin/\nSitemap: ${origin.replace(/\/$/, '')}/sitemap.xml\n`
    );
  });

  app.get('/sitemap.xml', async (req, res) => {
    try {
      await ensureSeeded();
      const origin = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const [pubDocs, allSubjects] = await Promise.all([
        db
          .select({ slug: documents.slug, updatedAt: documents.updatedAt })
          .from(documents)
          .where(and(eq(documents.status, 'PUBLISHED'), eq(documents.processingStatus, 'COMPLETED')))
          .orderBy(desc(documents.updatedAt))
          .limit(500),
        db.select({ slug: subjects.slug }).from(subjects),
      ]);

      const urls: string[] = [
        `<url><loc>${origin}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
        `<url><loc>${origin}/tai-lieu</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`,
      ];
      for (const s of allSubjects) {
        urls.push(
          `<url><loc>${origin}/tai-lieu?subject=${encodeURIComponent(s.slug)}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`
        );
      }
      for (const d of pubDocs) {
        const lastmod = new Date(d.updatedAt).toISOString().slice(0, 10);
        urls.push(
          `<url><loc>${origin}/tai-lieu/${encodeURIComponent(d.slug)}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`
        );
      }

      res
        .type('application/xml')
        .send(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`
        );
    } catch (error) {
      console.error('GET /sitemap.xml error:', error);
      res.status(500).type('text/plain').send('Error generating sitemap');
    }
  });

  // External Docker LibreOffice Worker webhook callback (authenticated via shared secret)
  app.post('/api/internal/worker-callback', async (req: Request, res: Response) => {
    const expectedSecret = process.env.WORKER_SHARED_SECRET;
    const providedSecret = req.headers['x-worker-secret'];
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized worker callback' });
    }
    const parsed = workerCallbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid callback payload' });
    }
    const { jobId, documentId, status, previewStorageKey, previewJson, mathReport, errorMessage } =
      parsed.data;

    await db
      .update(documents)
      .set({
        processingStatus: status,
        processingError: status === 'FAILED' ? errorMessage || 'Worker conversion failed' : null,
        previewStorageKey: previewStorageKey || undefined,
        previewPath: previewJson || undefined,
        mathMeta: mathReport || undefined,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    await db
      .update(processingJobs)
      .set({
        status,
        errorMessage: errorMessage || null,
        mathReport: mathReport || null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, jobId));

    res.json({ ok: true });
  });

  // Lazy DB seed on first API access (never runs eager queries at module load)
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health' || req.path === '/internal/worker-callback') return next();
    try {
      await ensureSeeded();
      next();
    } catch (error) {
      console.error('Database initialization error:', error);
      res.status(503).json({
        error: 'Hệ thống đang khởi tạo cơ sở dữ liệu. Vui lòng thử lại sau giây lát.',
      });
    }
  });

  // CSRF Origin validation on mutating API calls
  app.use('/api', validateCsrfOrigin);

  // Safe thumbnail serving
  app.get('/api/uploads/thumbnails/:filename', async (req: Request, res: Response) => {
    try {
      const safePath = resolveSafeStoragePath(THUMBNAILS_DIR, String(req.params.filename || ''));
      await fs.access(safePath);
      res.sendFile(safePath);
    } catch {
      res.status(404).end();
    }
  });

  app.use('/api', publicApiRouter);
  app.use('/api/admin', adminApiRouter);

  // Centralized error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled API error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Đã xảy ra lỗi máy chủ nội bộ.' });
    }
  });

  return app;
}

async function startServer() {
  const app = createServerApp();

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EduLibrary Cloud server listening on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start EduLibrary server:', err);
    process.exit(1);
  });
}
