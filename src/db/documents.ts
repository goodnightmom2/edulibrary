import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  categories,
  comments,
  documents,
  documentTags,
  downloadLogs,
  favorites,
  grades,
  subjects,
  tags,
  users,
  viewLogs,
} from './schema.ts';

export interface DocumentListQuery {
  q?: string;
  subject?: string;
  grade?: string;
  category?: string;
  fileType?: string;
  tag?: string;
  featured?: boolean;
  status?: string;
  includeUnprocessed?: boolean;
  sort?: 'newest' | 'views' | 'downloads' | 'title';
  page?: number;
  limit?: number;
}

export async function listDocuments(query: DocumentListQuery) {
  try {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (query.status) {
      conditions.push(eq(documents.status, query.status));
    } else {
      conditions.push(eq(documents.status, 'PUBLISHED'));
    }

    if (!query.includeUnprocessed) {
      conditions.push(eq(documents.processingStatus, 'COMPLETED'));
    }

    if (query.featured) {
      conditions.push(eq(documents.featured, true));
    }

    if (query.fileType && query.fileType !== 'all') {
      conditions.push(eq(documents.fileType, query.fileType.toLowerCase()));
    }

    if (query.subject && query.subject !== 'all') {
      const subRows = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(eq(subjects.slug, query.subject))
        .limit(1);
      if (subRows.length > 0) {
        conditions.push(eq(documents.subjectId, subRows[0].id));
      } else {
        return { items: [], total: 0, page, limit, totalPages: 0 };
      }
    }

    if (query.grade && query.grade !== 'all') {
      const gradeRows = await db
        .select({ id: grades.id })
        .from(grades)
        .where(eq(grades.slug, query.grade))
        .limit(1);
      if (gradeRows.length > 0) {
        conditions.push(eq(documents.gradeId, gradeRows[0].id));
      } else {
        return { items: [], total: 0, page, limit, totalPages: 0 };
      }
    }

    if (query.category && query.category !== 'all') {
      const catRows = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, query.category))
        .limit(1);
      if (catRows.length > 0) {
        conditions.push(eq(documents.categoryId, catRows[0].id));
      } else {
        return { items: [], total: 0, page, limit, totalPages: 0 };
      }
    }

    if (query.tag) {
      const tagDocIds = await db
        .select({ documentId: documentTags.documentId })
        .from(documentTags)
        .innerJoin(tags, eq(documentTags.tagId, tags.id))
        .where(eq(tags.slug, query.tag));
      const ids = tagDocIds.map((r) => r.documentId);
      if (ids.length === 0) {
        return { items: [], total: 0, page, limit, totalPages: 0 };
      }
      conditions.push(inArray(documents.id, ids));
    }

    if (query.q && query.q.trim()) {
      const pattern = `%${query.q.trim()}%`;
      // Also match documents via tags
      const matchingTagDocs = await db
        .select({ documentId: documentTags.documentId })
        .from(documentTags)
        .innerJoin(tags, eq(documentTags.tagId, tags.id))
        .where(ilike(tags.name, pattern));
      const tagIds = matchingTagDocs.map((r) => r.documentId);

      if (tagIds.length > 0) {
        conditions.push(
          or(
            ilike(documents.title, pattern),
            ilike(documents.description, pattern),
            ilike(documents.author, pattern),
            ilike(documents.topic, pattern),
            inArray(documents.id, tagIds)
          )
        );
      } else {
        conditions.push(
          or(
            ilike(documents.title, pattern),
            ilike(documents.description, pattern),
            ilike(documents.author, pattern),
            ilike(documents.topic, pattern)
          )
        );
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let orderByClause = desc(documents.createdAt);
    if (query.sort === 'views') orderByClause = desc(documents.viewCount);
    else if (query.sort === 'downloads') orderByClause = desc(documents.downloadCount);
    else if (query.sort === 'title') orderByClause = asc(documents.title);

    const [{ total }] = await db
      .select({ total: count() })
      .from(documents)
      .where(whereClause);

    const rows = await db
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
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        subjectId: documents.subjectId,
        subjectName: subjects.name,
        subjectSlug: subjects.slug,
        gradeId: documents.gradeId,
        gradeName: grades.name,
        gradeSlug: grades.slug,
        categoryId: documents.categoryId,
        categoryName: categories.name,
        categorySlug: categories.slug,
      })
      .from(documents)
      .leftJoin(subjects, eq(documents.subjectId, subjects.id))
      .leftJoin(grades, eq(documents.gradeId, grades.id))
      .leftJoin(categories, eq(documents.categoryId, categories.id))
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    const docIds = rows.map((r) => r.id);
    const tagMap = new Map<number, Array<{ id: number; name: string; slug: string }>>();
    if (docIds.length > 0) {
      const tagRows = await db
        .select({
          documentId: documentTags.documentId,
          id: tags.id,
          name: tags.name,
          slug: tags.slug,
        })
        .from(documentTags)
        .innerJoin(tags, eq(documentTags.tagId, tags.id))
        .where(inArray(documentTags.documentId, docIds));

      for (const tr of tagRows) {
        const list = tagMap.get(tr.documentId) || [];
        list.push({ id: tr.id, name: tr.name, slug: tr.slug });
        tagMap.set(tr.documentId, list);
      }
    }

    const items = rows.map((r) => ({
      ...r,
      tags: tagMap.get(r.id) || [],
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    console.error('listDocuments error:', error);
    throw new Error('Không thể tải danh sách tài liệu.', { cause: error });
  }
}

export async function getDocumentDetailBySlug(slug: string, userId?: number, includeDraft = false) {
  try {
    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        slug: documents.slug,
        description: documents.description,
        originalFilename: documents.originalFilename,
        fileType: documents.fileType,
        mimeType: documents.mimeType,
        fileSize: documents.fileSize,
        filePath: documents.filePath,
        previewPath: documents.previewPath,
        thumbnail: documents.thumbnail,
        topic: documents.topic,
        author: documents.author,
        status: documents.status,
        processingStatus: documents.processingStatus,
        processingError: documents.processingError,
        storageProvider: documents.storageProvider,
        storageKey: documents.storageKey,
        featured: documents.featured,
        viewCount: documents.viewCount,
        downloadCount: documents.downloadCount,
        mathMeta: documents.mathMeta,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        subjectId: documents.subjectId,
        subjectName: subjects.name,
        subjectSlug: subjects.slug,
        gradeId: documents.gradeId,
        gradeName: grades.name,
        gradeSlug: grades.slug,
        categoryId: documents.categoryId,
        categoryName: categories.name,
        categorySlug: categories.slug,
      })
      .from(documents)
      .leftJoin(subjects, eq(documents.subjectId, subjects.id))
      .leftJoin(grades, eq(documents.gradeId, grades.id))
      .leftJoin(categories, eq(documents.categoryId, categories.id))
      .where(eq(documents.slug, slug))
      .limit(1);

    if (rows.length === 0) return null;
    const doc = rows[0];
    if (!includeDraft && (doc.status !== 'PUBLISHED' || doc.processingStatus !== 'COMPLETED')) {
      return null;
    }

    // Tags
    const docTagRows = await db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(documentTags)
      .innerJoin(tags, eq(documentTags.tagId, tags.id))
      .where(eq(documentTags.documentId, doc.id));

    // Check favorite
    let isFavorited = false;
    if (userId) {
      const favRows = await db
        .select({ id: favorites.id })
        .from(favorites)
        .where(and(eq(favorites.userId, userId), eq(favorites.documentId, doc.id)))
        .limit(1);
      isFavorited = favRows.length > 0;
    }

    // Related docs (same subject or same grade, published + completed, excluding current)
    const relatedConditions = [
      eq(documents.status, 'PUBLISHED'),
      eq(documents.processingStatus, 'COMPLETED'),
      ne(documents.id, doc.id),
    ];
    if (doc.subjectId && doc.gradeId) {
      relatedConditions.push(
        or(eq(documents.subjectId, doc.subjectId), eq(documents.gradeId, doc.gradeId))!
      );
    } else if (doc.subjectId) {
      relatedConditions.push(eq(documents.subjectId, doc.subjectId));
    } else if (doc.gradeId) {
      relatedConditions.push(eq(documents.gradeId, doc.gradeId));
    }

    const related = await db
      .select({
        id: documents.id,
        title: documents.title,
        slug: documents.slug,
        fileType: documents.fileType,
        fileSize: documents.fileSize,
        thumbnail: documents.thumbnail,
        viewCount: documents.viewCount,
        downloadCount: documents.downloadCount,
        createdAt: documents.createdAt,
        subjectName: subjects.name,
        subjectSlug: subjects.slug,
        gradeName: grades.name,
        categoryName: categories.name,
      })
      .from(documents)
      .leftJoin(subjects, eq(documents.subjectId, subjects.id))
      .leftJoin(grades, eq(documents.gradeId, grades.id))
      .leftJoin(categories, eq(documents.categoryId, categories.id))
      .where(and(...relatedConditions))
      .orderBy(desc(documents.viewCount))
      .limit(6);

    // Approved comments
    const docComments = await db
      .select({
        id: comments.id,
        content: comments.content,
        createdAt: comments.createdAt,
        userName: users.fullName,
        userAvatar: users.avatar,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(and(eq(comments.documentId, doc.id), eq(comments.status, 'APPROVED')))
      .orderBy(desc(comments.createdAt))
      .limit(30);

    return {
      doc,
      tags: docTagRows,
      isFavorited,
      related,
      comments: docComments,
    };
  } catch (error) {
    console.error('getDocumentDetailBySlug error:', error);
    throw new Error('Không thể tải chi tiết tài liệu.', { cause: error });
  }
}

export async function recordDocumentView(documentId: number, userId?: number) {
  try {
    await db
      .update(documents)
      .set({ viewCount: sql`${documents.viewCount} + 1` })
      .where(eq(documents.id, documentId));

    await db.insert(viewLogs).values({
      documentId,
      userId: userId ?? null,
    });
  } catch (error) {
    console.error('recordDocumentView error:', error);
  }
}

export async function recordDocumentDownload(documentId: number, userId?: number) {
  try {
    await db
      .update(documents)
      .set({ downloadCount: sql`${documents.downloadCount} + 1` })
      .where(eq(documents.id, documentId));

    await db.insert(downloadLogs).values({
      documentId,
      userId: userId ?? null,
    });
  } catch (error) {
    console.error('recordDocumentDownload error:', error);
  }
}
