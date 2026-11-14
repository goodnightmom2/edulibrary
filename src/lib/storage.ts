import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { buildContentDispositionHeader, sanitizeFilename } from './slug.ts';

const BASE_STORAGE = process.env.VERCEL
  ? path.resolve('/tmp/edulibrary-storage')
  : path.resolve(process.cwd(), process.env.STORAGE_DIR || 'storage');
export const DOCUMENTS_DIR = path.join(BASE_STORAGE, 'documents');
export const PREVIEWS_DIR = path.join(BASE_STORAGE, 'previews');
export const THUMBNAILS_DIR = path.join(BASE_STORAGE, 'thumbnails');
export const TEMP_DIR = path.join(BASE_STORAGE, 'temp');

export type StoragePrefix = 'originals' | 'previews' | 'thumbnails' | 'temp';
export type StorageProviderKind = 'R2' | 'LOCAL';

const R2_ENDPOINT = process.env.R2_ENDPOINT || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.R2_BUCKET || '';

let r2Client: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

export function getActiveStorageProvider(): StorageProviderKind {
  return isR2Configured() ? 'R2' : 'LOCAL';
}

export function getStorageStatus() {
  return {
    provider: getActiveStorageProvider(),
    bucket: isR2Configured() ? R2_BUCKET : null,
    presignedUrlsEnabled: isR2Configured(),
    maxFileSizeMb: Number(process.env.MAX_UPLOAD_MB || 25),
    prefixes: ['originals/', 'previews/', 'thumbnails/', 'temp/'],
  };
}

function getR2Client(): S3Client {
  if (!isR2Configured()) {
    throw new Error('Cloudflare R2 chưa được cấu hình đầy đủ.');
  }
  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return r2Client;
}

export async function ensureStorageDirs(): Promise<void> {
  await Promise.all([
    fs.mkdir(DOCUMENTS_DIR, { recursive: true }),
    fs.mkdir(PREVIEWS_DIR, { recursive: true }),
    fs.mkdir(THUMBNAILS_DIR, { recursive: true }),
    fs.mkdir(TEMP_DIR, { recursive: true }),
  ]);
}

export function generateStoredFilename(originalFilename: string): string {
  const safe = sanitizeFilename(originalFilename);
  const id = crypto.randomUUID().slice(0, 12);
  return `${Date.now()}-${id}-${safe}`;
}

export function buildObjectKey(prefix: StoragePrefix, filename: string): string {
  const cleanName = path.basename(filename);
  return `${prefix}/${cleanName}`;
}

function getLocalDirForPrefix(prefix: StoragePrefix): string {
  if (prefix === 'previews') return PREVIEWS_DIR;
  if (prefix === 'thumbnails') return THUMBNAILS_DIR;
  if (prefix === 'temp') return TEMP_DIR;
  return DOCUMENTS_DIR;
}

export function resolveSafeStoragePath(dir: string, storedName: string): string {
  const baseName = path.basename(storedName);
  const fullPath = path.resolve(dir, baseName);
  if (!fullPath.startsWith(path.resolve(dir) + path.sep) && fullPath !== path.resolve(dir)) {
    throw new Error('Invalid storage path');
  }
  return fullPath;
}

export async function uploadStoredObject(
  prefix: StoragePrefix,
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<{ provider: StorageProviderKind; storageKey: string; localFilename: string }> {
  await ensureStorageDirs();
  const cleanFilename = path.basename(filename);
  const storageKey = buildObjectKey(prefix, cleanFilename);

  // Always write safely to local disk for immediate processing/fallback or local storage mode
  const localPath = resolveSafeStoragePath(getLocalDirForPrefix(prefix), cleanFilename);
  await fs.writeFile(localPath, buffer);

  if (isR2Configured()) {
    const client = getR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: storageKey,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return { provider: 'R2', storageKey, localFilename: cleanFilename };
  }

  return { provider: 'LOCAL', storageKey, localFilename: cleanFilename };
}

export async function readStoredObjectBuffer(
  prefix: StoragePrefix,
  storageKeyOrFilename: string
): Promise<Buffer> {
  const cleanFilename = path.basename(storageKeyOrFilename);
  const localPath = resolveSafeStoragePath(getLocalDirForPrefix(prefix), cleanFilename);
  try {
    return await fs.readFile(localPath);
  } catch (localErr) {
    if (isR2Configured()) {
      const client = getR2Client();
      const key = storageKeyOrFilename.includes('/')
        ? storageKeyOrFilename
        : buildObjectKey(prefix, cleanFilename);
      const response = await client.send(
        new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
        })
      );
      if (response.Body) {
        const bytes = await response.Body.transformToByteArray();
        return Buffer.from(bytes);
      }
    }
    throw localErr;
  }
}

export async function deleteStoredObject(
  prefix: StoragePrefix,
  storageKeyOrFilename: string
): Promise<void> {
  const cleanFilename = path.basename(storageKeyOrFilename);
  const localPath = resolveSafeStoragePath(getLocalDirForPrefix(prefix), cleanFilename);
  await fs.unlink(localPath).catch(() => undefined);

  if (isR2Configured()) {
    const client = getR2Client();
    const key = storageKeyOrFilename.includes('/')
      ? storageKeyOrFilename
      : buildObjectKey(prefix, cleanFilename);
    await client
      .send(
        new DeleteObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
        })
      )
      .catch(() => undefined);
  }
}

export async function createPresignedDownloadUrl(
  storageKey: string,
  downloadFilename: string,
  expiresInSeconds = 300
): Promise<string | null> {
  if (!isR2Configured()) return null;
  const client = getR2Client();
  const cmd = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
    ResponseContentDisposition: buildContentDispositionHeader('attachment', downloadFilename),
  });
  return getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
}

export async function createPresignedUploadUrl(
  prefix: StoragePrefix,
  filename: string,
  contentType: string,
  expiresInSeconds = 300
): Promise<{ uploadUrl: string; storageKey: string } | null> {
  if (!isR2Configured()) return null;
  const client = getR2Client();
  const storageKey = buildObjectKey(prefix, filename);
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
  return { uploadUrl, storageKey };
}

export function detectMimeTypeFromExt(ext: string): string {
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

export function validateMagicBytes(buffer: Buffer, ext: string): boolean {
  if (buffer.length < 4) return false;
  const normalized = ext.toLowerCase();
  if (normalized === 'pdf') {
    return buffer.subarray(0, 4).toString('ascii') === '%PDF';
  }
  if (normalized === 'docx' || normalized === 'pptx' || normalized === 'xlsx') {
    // OOXML files are ZIP archives (PK\x03\x04)
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  }
  if (normalized === 'doc' || normalized === 'ppt' || normalized === 'xls') {
    // Legacy OLE2 Compound Binary File (D0 CF 11 E0) or RTF/ZIP fallback
    const isOle2 =
      buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
    const isRtf = buffer.subarray(0, 5).toString('ascii') === '{\\rtf';
    return isOle2 || isZip || isRtf;
  }
  return false;
}
