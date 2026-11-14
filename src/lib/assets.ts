import heroStudyImg from '../assets/images/hero_edulibrary_study_1794618839193.jpg';
import mathThumbImg from '../assets/images/thumb_subject_math_1794618839741.jpg';
import physicsThumbImg from '../assets/images/thumb_subject_physics_1794618841264.jpg';
import chemThumbImg from '../assets/images/thumb_subject_chemistry_1794618840655.jpg';

export const HERO_BANNER_IMAGE = heroStudyImg;

export function getDocumentThumbnailUrl(
  customThumbnail: string | null | undefined,
  subjectSlug: string | null | undefined
): string | null {
  if (customThumbnail) return customThumbnail;
  if (subjectSlug === 'toan-hoc') return mathThumbImg;
  if (subjectSlug === 'vat-ly') return physicsThumbImg;
  if (subjectSlug === 'hoa-hoc') return chemThumbImg;
  return null;
}

export function formatDateVi(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}
