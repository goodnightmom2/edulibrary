import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import express from 'express';

const execFileAsync = promisify(execFile);
const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT) || 4000;
const WORKER_SHARED_SECRET = process.env.WORKER_SHARED_SECRET || '';
const CALLBACK_URL = process.env.APP_CALLBACK_URL || '';

const r2 =
  process.env.R2_ENDPOINT &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET
    ? new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      })
    : null;

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'edulibrary-libreoffice-worker', r2Configured: Boolean(r2) });
});

app.post('/jobs/process', async (req, res) => {
  if (!WORKER_SHARED_SECRET || req.headers['x-worker-secret'] !== WORKER_SHARED_SECRET) {
    return res.status(401).json({ error: 'Unauthorized worker call' });
  }

  const { jobId, documentId, slug, fileType, storageKey } = req.body || {};
  if (!jobId || !documentId || !storageKey || !r2 || !CALLBACK_URL) {
    return res.status(400).json({ error: 'Missing required worker configuration or payload' });
  }

  // Acknowledge immediately so main web app never blocks
  res.status(202).json({ asyncAccepted: true, jobId });

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `edulib-${jobId}-`));
  try {
    const bucket = process.env.R2_BUCKET!;
    const inputObj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
    const bytes = await inputObj.Body!.transformToByteArray();
    const inputPath = path.join(workDir, `${slug}.${fileType}`);
    await fs.writeFile(inputPath, Buffer.from(bytes));

    // Convert Office document -> PDF Preview via LibreOffice Headless
    await execFileAsync('soffice', [
      '--headless',
      '--norestore',
      '--convert-to',
      'pdf',
      '--outdir',
      workDir,
      inputPath,
    ]);

    const pdfPath = path.join(workDir, `${slug}.pdf`);
    const pdfBuffer = await fs.readFile(pdfPath);
    const previewStorageKey = `previews/${slug}-preview.pdf`;

    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: previewStorageKey,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      })
    );

    await fetch(CALLBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': WORKER_SHARED_SECRET,
      },
      body: JSON.stringify({
        jobId,
        documentId,
        status: 'COMPLETED',
        previewStorageKey,
        mathReport: JSON.stringify({
          engine: 'libreoffice-headless',
          convertedToPdf: true,
          previewBytes: pdfBuffer.length,
        }),
      }),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'LibreOffice conversion error';
    await fetch(CALLBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': WORKER_SHARED_SECRET,
      },
      body: JSON.stringify({
        jobId,
        documentId,
        status: 'FAILED',
        errorMessage,
      }),
    }).catch(() => undefined);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`EduLibrary LibreOffice Worker listening on port ${PORT}`);
});
