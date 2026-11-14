import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { documents, processingJobs } from '../db/schema.ts';
import { generateDocumentPreview } from './docProcessor.ts';
import {
  DOCUMENTS_DIR,
  getActiveStorageProvider,
  resolveSafeStoragePath,
  uploadStoredObject,
} from './storage.ts';

const WORKER_URL = process.env.WORKER_URL || '';
const WORKER_SHARED_SECRET = process.env.WORKER_SHARED_SECRET || '';
const WORKER_ID = process.env.WORKER_ID || 'edulibrary-inline-worker-1';

export async function processDocumentJob(jobId: number): Promise<void> {
  const jobRows = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, jobId))
    .limit(1);

  if (jobRows.length === 0) return;
  const job = jobRows[0];

  const docRows = await db
    .select()
    .from(documents)
    .where(eq(documents.id, job.documentId))
    .limit(1);

  if (docRows.length === 0) return;
  const doc = docRows[0];

  const startedAt = new Date();
  await db
    .update(processingJobs)
    .set({
      status: 'PROCESSING',
      attempts: job.attempts + 1,
      workerId: WORKER_URL ? 'docker-libreoffice-worker' : WORKER_ID,
      startedAt,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(processingJobs.id, jobId));

  await db
    .update(documents)
    .set({
      processingStatus: 'PROCESSING',
      processingError: null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, doc.id));

  try {
    // Optional external Docker LibreOffice Worker dispatch when WORKER_URL is configured
    if (WORKER_URL) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const res = await fetch(`${WORKER_URL.replace(/\/$/, '')}/jobs/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Worker-Secret': WORKER_SHARED_SECRET,
          },
          body: JSON.stringify({
            jobId,
            documentId: doc.id,
            slug: doc.slug,
            fileType: doc.fileType,
            storageKey: doc.storageKey || `originals/${doc.storedFilename}`,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const workerData = await res.json();
          if (workerData.asyncAccepted) {
            return; // External worker will call /api/internal/worker-callback
          }
        }
      } catch (workerErr) {
        clearTimeout(timeout);
        console.warn('External Docker worker unavailable, falling back to local processor:', workerErr);
      }
    }

    // In-process Node TypeScript document & OMML/MathType processor
    const fullPath = resolveSafeStoragePath(DOCUMENTS_DIR, doc.filePath);
    const preview = await generateDocumentPreview(fullPath, doc.fileType);

    const previewFilename = `${doc.slug}-preview.json`;
    const previewJson = JSON.stringify(preview);
    const uploadedPreview = await uploadStoredObject(
      'previews',
      previewFilename,
      Buffer.from(previewJson, 'utf8'),
      'application/json'
    );

    const mathReport = JSON.stringify({
      checkedAt: new Date().toISOString(),
      fileType: doc.fileType,
      kind: preview.kind,
      ommlCount: preview.mathMeta.ommlCount,
      mathTypeOleCount: preview.mathMeta.mathTypeOleCount,
      formulaImageCount: preview.mathMeta.formulaImageCount ?? 0,
      convertedCount: preview.mathMeta.convertedCount,
      fallbackImagesCount: preview.mathMeta.fallbackImagesCount,
      preCheckTotal: preview.mathMeta.preCheckTotal ?? preview.mathMeta.ommlCount + preview.mathMeta.mathTypeOleCount,
      postCheckPreserved:
        preview.mathMeta.postCheckPreserved ??
        preview.mathMeta.convertedCount + preview.mathMeta.fallbackImagesCount,
      supportsFullPreview: preview.mathMeta.supportsFullPreview,
      warnings: preview.mathMeta.warnings,
      storageProvider: getActiveStorageProvider(),
    });

    await db
      .update(documents)
      .set({
        previewPath: previewJson,
        previewStorageKey: uploadedPreview.storageKey,
        mathMeta: JSON.stringify(preview.mathMeta),
        processingStatus: 'COMPLETED',
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, doc.id));

    await db
      .update(processingJobs)
      .set({
        status: 'COMPLETED',
        mathReport,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, jobId));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi không xác định khi xử lý tài liệu.';
    await db
      .update(documents)
      .set({
        processingStatus: 'FAILED',
        processingError: message,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, doc.id));

    await db
      .update(processingJobs)
      .set({
        status: 'FAILED',
        errorMessage: message,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, jobId));
  }
}

export async function enqueueDocumentProcessing(
  documentId: number,
  jobType: 'DOCUMENT_CONVERT' | 'MATH_VERIFY' = 'DOCUMENT_CONVERT'
): Promise<{ jobId: number; status: 'PENDING' }> {
  await db
    .update(documents)
    .set({
      processingStatus: 'PENDING',
      processingError: null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));

  const [job] = await db
    .insert(processingJobs)
    .values({
      documentId,
      jobType,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
    })
    .returning();

  // Schedule non-blocking asynchronous execution so upload HTTP requests respond immediately
  setImmediate(() => {
    void processDocumentJob(job.id);
  });

  return { jobId: job.id, status: 'PENDING' };
}

export async function getRecentProcessingJobs(limit = 50) {
  return db
    .select({
      id: processingJobs.id,
      documentId: processingJobs.documentId,
      jobType: processingJobs.jobType,
      status: processingJobs.status,
      attempts: processingJobs.attempts,
      maxAttempts: processingJobs.maxAttempts,
      workerId: processingJobs.workerId,
      errorMessage: processingJobs.errorMessage,
      mathReport: processingJobs.mathReport,
      startedAt: processingJobs.startedAt,
      completedAt: processingJobs.completedAt,
      createdAt: processingJobs.createdAt,
      documentTitle: documents.title,
      documentSlug: documents.slug,
      documentFileType: documents.fileType,
      documentStatus: documents.status,
      documentProcessingStatus: documents.processingStatus,
    })
    .from(processingJobs)
    .innerJoin(documents, eq(processingJobs.documentId, documents.id))
    .orderBy(desc(processingJobs.createdAt))
    .limit(limit);
}
