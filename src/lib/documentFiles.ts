import { createPool } from '../db/index.ts';

export type DocumentFileRole = 'ORIGINAL' | 'PREVIEW_PDF' | 'THUMBNAIL';

export interface StoredDocumentBinary {
  filename: string;
  mimeType: string;
  fileSize: number;
  buffer: Buffer;
}

let tableReadyPromise: Promise<void> | null = null;

export async function ensureDocumentFilesTable(): Promise<void> {
  if (!tableReadyPromise) {
    const pool = createPool();
    tableReadyPromise = pool
      .query(`
        CREATE TABLE IF NOT EXISTS document_files (
          id SERIAL PRIMARY KEY,
          document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          content_bytes BYTEA NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(document_id, role)
        );
        CREATE INDEX IF NOT EXISTS idx_document_files_role_filename
          ON document_files(role, filename);
      `)
      .then(() => undefined)
      .catch((err) => {
        tableReadyPromise = null;
        throw err;
      });
  }
  return tableReadyPromise;
}

export async function saveDocumentFile(params: {
  documentId: number;
  role: DocumentFileRole;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<void> {
  await ensureDocumentFilesTable();
  const pool = createPool();
  await pool.query(
    `
    INSERT INTO document_files (document_id, role, filename, mime_type, file_size, content_bytes)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (document_id, role)
    DO UPDATE SET
      filename = EXCLUDED.filename,
      mime_type = EXCLUDED.mime_type,
      file_size = EXCLUDED.file_size,
      content_bytes = EXCLUDED.content_bytes,
      created_at = NOW()
    `,
    [
      params.documentId,
      params.role,
      params.filename,
      params.mimeType,
      params.buffer.length,
      params.buffer,
    ]
  );
}

export async function getDocumentFile(
  documentId: number,
  role: DocumentFileRole
): Promise<StoredDocumentBinary | null> {
  await ensureDocumentFilesTable();
  const pool = createPool();
  const result = await pool.query<{
    filename: string;
    mime_type: string;
    file_size: number;
    content_bytes: Buffer;
  }>(
    `
    SELECT filename, mime_type, file_size, content_bytes
    FROM document_files
    WHERE document_id = $1 AND role = $2
    LIMIT 1
    `,
    [documentId, role]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    filename: row.filename,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    buffer: Buffer.isBuffer(row.content_bytes)
      ? row.content_bytes
      : Buffer.from(row.content_bytes),
  };
}

export async function getDocumentThumbnailByFilename(
  filename: string
): Promise<{ mimeType: string; buffer: Buffer } | null> {
  await ensureDocumentFilesTable();
  const pool = createPool();
  const result = await pool.query<{
    mime_type: string;
    content_bytes: Buffer;
  }>(
    `
    SELECT mime_type, content_bytes
    FROM document_files
    WHERE role = 'THUMBNAIL' AND filename = $1
    LIMIT 1
    `,
    [filename]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    mimeType: row.mime_type,
    buffer: Buffer.isBuffer(row.content_bytes)
      ? row.content_bytes
      : Buffer.from(row.content_bytes),
  };
}
