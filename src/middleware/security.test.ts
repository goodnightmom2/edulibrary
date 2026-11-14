import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  SlidingWindowLimiter,
  adminLoginSchema,
  commentCreateSchema,
  stripUnsafeHtml,
} from './security.ts';
import { resolveSafeStoragePath, validateMagicBytes } from '../lib/storage.ts';

test('Zod validation enforces admin login and comment constraints', () => {
  const validLogin = adminLoginSchema.safeParse({
    email: ' admin@edulibrary.vn ',
    password: 'StrongPassword123',
  });
  assert.equal(validLogin.success, true);
  if (validLogin.success) {
    assert.equal(validLogin.data.email, 'admin@edulibrary.vn');
  }

  const badLogin = adminLoginSchema.safeParse({
    email: 'not-an-email',
    password: '123',
  });
  assert.equal(badLogin.success, false);

  const shortComment = commentCreateSchema.safeParse({ content: 'ok' });
  assert.equal(shortComment.success, false);

  const validComment = commentCreateSchema.safeParse({
    content: 'Tài liệu trình bày công thức rất rõ ràng!',
  });
  assert.equal(validComment.success, true);
});

test('stripUnsafeHtml removes script blocks and HTML tags against XSS payloads', () => {
  const dirty = '<script>alert("xss")</script><b>Tuyệt vời</b> <img src=x onerror=alert(1)>';
  const clean = stripUnsafeHtml(dirty);
  assert.equal(clean, 'Tuyệt vời');
});

test('SlidingWindowLimiter allows requests within window and blocks excess with retryAfterSec', () => {
  const limiter = new SlidingWindowLimiter(10_000, 3);
  const t0 = 1_000_000;

  assert.equal(limiter.check('ip:1', t0).allowed, true);
  assert.equal(limiter.check('ip:1', t0 + 100).allowed, true);
  assert.equal(limiter.check('ip:1', t0 + 200).allowed, true);

  const blocked = limiter.check('ip:1', t0 + 300);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSec >= 1);

  // After window expires, requests are permitted again
  const afterWindow = limiter.check('ip:1', t0 + 10_500);
  assert.equal(afterWindow.allowed, true);
});

test('validateMagicBytes verifies real file signatures and rejects spoofed extensions', () => {
  assert.equal(validateMagicBytes(Buffer.from('%PDF-1.7\n...'), 'pdf'), true);
  assert.equal(validateMagicBytes(Buffer.from('MZ\x90\x00This is an exe'), 'pdf'), false);

  assert.equal(validateMagicBytes(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'docx'), true);
  assert.equal(validateMagicBytes(Buffer.from('plain text masquerading as docx'), 'docx'), false);

  assert.equal(validateMagicBytes(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00]), 'doc'), true);
  assert.equal(validateMagicBytes(Buffer.from('#!/bin/sh'), 'doc'), false);
});

test('resolveSafeStoragePath strips directory traversal segments safely inside target root', () => {
  const root = path.resolve('/tmp/edulibrary-test-storage');
  const resolved = resolveSafeStoragePath(root, '../../etc/passwd');
  assert.equal(resolved, path.join(root, 'passwd'));
  assert.ok(resolved.startsWith(root + path.sep));
});
