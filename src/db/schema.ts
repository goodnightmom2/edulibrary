import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  avatar: text('avatar'),
  role: text('role').notNull().default('USER'), // 'USER' | 'ADMIN'
  status: text('status').notNull().default('ACTIVE'), // 'ACTIVE' | 'LOCKED'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const accounts = pgTable(
  'accounts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    provider: text('provider').notNull(), // 'google' | 'credentials'
    providerAccountId: text('provider_account_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('idx_accounts_provider_account').on(table.provider, table.providerAccountId)]
);

export const sessions = pgTable(
  'sessions',
  {
    id: serial('id').primaryKey(),
    sessionToken: text('session_token').notNull().unique(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_sessions_user').on(table.userId)]
);

export const subjects = pgTable('subjects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description').default(''),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const grades = pgTable('grades', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  level: integer('level').notNull(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description').default(''),
});

export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
});

export const documents = pgTable(
  'documents',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description').notNull().default(''),
    originalFilename: text('original_filename').notNull(),
    storedFilename: text('stored_filename').notNull(),
    fileType: text('file_type').notNull(), // pdf | docx | doc | pptx | ppt | xlsx | xls
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    filePath: text('file_path').notNull(),
    previewPath: text('preview_path'),
    storageProvider: text('storage_provider').notNull().default('LOCAL'), // LOCAL | R2
    storageKey: text('storage_key'),
    previewStorageKey: text('preview_storage_key'),
    thumbnail: text('thumbnail'),
    subjectId: integer('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    gradeId: integer('grade_id').references(() => grades.id, { onDelete: 'set null' }),
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
    topic: text('topic').default(''),
    author: text('author').notNull().default('Ban biên tập EduLibrary'),
    status: text('status').notNull().default('PUBLISHED'), // PUBLISHED | DRAFT | TRASH
    processingStatus: text('processing_status').notNull().default('COMPLETED'), // PENDING | PROCESSING | COMPLETED | FAILED
    processingError: text('processing_error'),
    featured: boolean('featured').notNull().default(false),
    viewCount: integer('view_count').notNull().default(0),
    downloadCount: integer('download_count').notNull().default(0),
    mathMeta: text('math_meta'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_documents_status_created').on(table.status, table.createdAt),
    index('idx_documents_processing_status').on(table.processingStatus),
    index('idx_documents_subject').on(table.subjectId),
    index('idx_documents_grade').on(table.gradeId),
    index('idx_documents_category').on(table.categoryId),
  ]
);

export const processingJobs = pgTable(
  'processing_jobs',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    jobType: text('job_type').notNull().default('DOCUMENT_CONVERT'), // DOCUMENT_CONVERT | MATH_VERIFY
    status: text('status').notNull().default('PENDING'), // PENDING | PROCESSING | COMPLETED | FAILED
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    workerId: text('worker_id'),
    errorMessage: text('error_message'),
    mathReport: text('math_report'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_processing_jobs_doc').on(table.documentId),
    index('idx_processing_jobs_status').on(table.status, table.createdAt),
  ]
);

export const documentTags = pgTable(
  'document_tags',
  {
    documentId: integer('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    tagId: integer('tag_id')
      .references(() => tags.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.documentId, table.tagId] })]
);

export const favorites = pgTable(
  'favorites',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    documentId: integer('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('idx_favorites_user_doc').on(table.userId, table.documentId)]
);

export const downloadLogs = pgTable(
  'download_logs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    documentId: integer('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    downloadedAt: timestamp('downloaded_at').defaultNow().notNull(),
  },
  (table) => [index('idx_download_logs_doc').on(table.documentId, table.downloadedAt)]
);

export const viewLogs = pgTable(
  'view_logs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    documentId: integer('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    viewedAt: timestamp('viewed_at').defaultNow().notNull(),
  },
  (table) => [index('idx_view_logs_doc').on(table.documentId, table.viewedAt)]
);

export const comments = pgTable(
  'comments',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    content: text('content').notNull(),
    status: text('status').notNull().default('APPROVED'), // APPROVED | PENDING | HIDDEN
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_comments_doc').on(table.documentId, table.createdAt)]
);

export const siteSettings = pgTable('site_settings', {
  id: serial('id').primaryKey(),
  settingKey: text('setting_key').notNull().unique(),
  settingValue: text('setting_value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    adminId: integer('admin_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    details: text('details'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_audit_logs_created').on(table.createdAt)]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  documents: many(documents),
  favorites: many(favorites),
  downloadLogs: many(downloadLogs),
  viewLogs: many(viewLogs),
  comments: many(comments),
  auditLogs: many(auditLogs),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const subjectsRelations = relations(subjects, ({ many }) => ({
  documents: many(documents),
}));

export const gradesRelations = relations(grades, ({ many }) => ({
  documents: many(documents),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [documents.subjectId],
    references: [subjects.id],
  }),
  grade: one(grades, {
    fields: [documents.gradeId],
    references: [grades.id],
  }),
  category: one(categories, {
    fields: [documents.categoryId],
    references: [categories.id],
  }),
  creator: one(users, {
    fields: [documents.createdBy],
    references: [users.id],
  }),
  processingJobs: many(processingJobs),
  documentTags: many(documentTags),
  favorites: many(favorites),
  downloadLogs: many(downloadLogs),
  viewLogs: many(viewLogs),
  comments: many(comments),
}));

export const processingJobsRelations = relations(processingJobs, ({ one }) => ({
  document: one(documents, {
    fields: [processingJobs.documentId],
    references: [documents.id],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  documentTags: many(documentTags),
}));

export const documentTagsRelations = relations(documentTags, ({ one }) => ({
  document: one(documents, {
    fields: [documentTags.documentId],
    references: [documents.id],
  }),
  tag: one(tags, {
    fields: [documentTags.tagId],
    references: [tags.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
  document: one(documents, {
    fields: [favorites.documentId],
    references: [documents.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  document: one(documents, {
    fields: [comments.documentId],
    references: [documents.id],
  }),
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
}));
