import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFileSize, getAllowedFileExtension, sanitizeFilename, toVietnameseSlug } from './slug.ts';

test('toVietnameseSlug removes Vietnamese diacritics and normalizes spaces', () => {
  assert.equal(
    toVietnameseSlug('Đề thi học kỳ 1 môn Toán lớp 12 năm học 2025-2026'),
    'de-thi-hoc-ky-1-mon-toan-lop-12-nam-hoc-2025-2026'
  );
  assert.equal(toVietnameseSlug('  Chuyên đề Hóa học Hữu cơ  '), 'chuyen-de-hoa-hoc-huu-co');
});

test('sanitizeFilename strips directory traversal and normalizes filename', () => {
  assert.equal(sanitizeFilename('../../etc/passwd.pdf'), 'passwd.pdf');
  assert.equal(sanitizeFilename('Đề kiểm tra Lý 11.DOCX'), 'de-kiem-tra-ly-11.docx');
});

test('getAllowedFileExtension validates supported office and PDF formats', () => {
  assert.equal(getAllowedFileExtension('exam.PDF'), 'pdf');
  assert.equal(getAllowedFileExtension('lesson.docx'), 'docx');
  assert.equal(getAllowedFileExtension('malware.exe'), null);
  assert.equal(getAllowedFileExtension('script.js'), null);
});

test('formatFileSize formats bytes, KB, and MB cleanly', () => {
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(2048), '2.0 KB');
  assert.equal(formatFileSize(1572864), '1.50 MB');
});
