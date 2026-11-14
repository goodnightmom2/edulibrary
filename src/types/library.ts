export interface SubjectItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
}

export interface GradeItem {
  id: number;
  name: string;
  slug: string;
  level: number;
}

export interface CategoryItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}

export interface TagItem {
  id: number;
  name: string;
  slug: string;
}

export interface TaxonomyResponse {
  subjects: SubjectItem[];
  grades: GradeItem[];
  categories: CategoryItem[];
  tags: TagItem[];
  settings: Record<string, string>;
}

export interface DocumentSummary {
  id: number;
  title: string;
  slug: string;
  description: string;
  originalFilename: string;
  fileType: string;
  fileSize: number;
  thumbnail: string | null;
  topic: string | null;
  author: string;
  status: string;
  processingStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | string;
  processingError?: string | null;
  storageProvider?: 'LOCAL' | 'R2' | string;
  featured: boolean;
  viewCount: number;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  subjectId: number | null;
  subjectName: string | null;
  subjectSlug: string | null;
  gradeId: number | null;
  gradeName: string | null;
  gradeSlug: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categorySlug: string | null;
  tags?: TagItem[];
}

export interface MathMeta {
  ommlCount: number;
  mathTypeOleCount: number;
  formulaImageCount?: number;
  convertedCount: number;
  fallbackImagesCount: number;
  preCheckTotal?: number;
  postCheckPreserved?: number;
  supportsFullPreview: boolean;
  warnings: string[];
}

export interface ProcessingJobItem {
  id: number;
  documentId: number;
  jobType: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | string;
  attempts: number;
  maxAttempts: number;
  workerId: string | null;
  errorMessage: string | null;
  mathReport: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  documentTitle: string;
  documentSlug: string;
  documentFileType: string;
  documentStatus: string;
  documentProcessingStatus: string;
}

export interface DocumentPreviewPayload {
  kind: 'pdf' | 'word' | 'slides' | 'sheet' | 'unsupported';
  pages?: Array<{ pageNumber: number; html: string }>;
  slides?: Array<{
    slideNumber: number;
    title: string;
    blocks: Array<{ type: 'text' | 'math' | 'list'; content: string }>;
  }>;
  sheets?: Array<{ name: string; rows: string[][] }>;
  mathMeta: MathMeta;
}

export interface DocumentComment {
  id: number;
  content: string;
  createdAt: string;
  userName: string;
  userAvatar: string | null;
}

export interface DocumentDetailResponse {
  document: {
    id: number;
    title: string;
    slug: string;
    description: string;
    originalFilename: string;
    fileType: string;
    mimeType: string;
    fileSize: number;
    thumbnail: string | null;
    topic: string | null;
    author: string;
    status: string;
    processingStatus?: string;
    storageProvider?: string;
    featured: boolean;
    viewCount: number;
    downloadCount: number;
    createdAt: string;
    updatedAt: string;
    subject: { id: number; name: string; slug: string } | null;
    grade: { id: number; name: string; slug: string } | null;
    category: { id: number; name: string; slug: string } | null;
    tags: TagItem[];
  };
  preview: DocumentPreviewPayload;
  isFavorited: boolean;
  related: DocumentSummary[];
  comments: DocumentComment[];
}

export interface UserProfile {
  id: number;
  uid: string;
  fullName: string;
  email: string;
  avatar: string | null;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'LOCKED';
  createdAt: string;
}
