const VIETNAMESE_MAP: Record<string, string> = {
  à: 'a', á: 'a', ạ: 'a', ả: 'a', ã: 'a',
  â: 'a', ầ: 'a', ấ: 'a', ậ: 'a', ẩ: 'a', ẫ: 'a',
  ă: 'a', ằ: 'a', ắ: 'a', ặ: 'a', ẳ: 'a', ẵ: 'a',
  è: 'e', é: 'e', ẹ: 'e', ẻ: 'e', ẽ: 'e',
  ê: 'e', ề: 'e', ế: 'e', ệ: 'e', ể: 'e', ễ: 'e',
  ì: 'i', í: 'i', ị: 'i', ỉ: 'i', ĩ: 'i',
  ò: 'o', ó: 'o', ọ: 'o', ỏ: 'o', õ: 'o',
  ô: 'o', ồ: 'o', ố: 'o', ộ: 'o', ổ: 'o', ỗ: 'o',
  ơ: 'o', ờ: 'o', ớ: 'o', ợ: 'o', ở: 'o', ỡ: 'o',
  ù: 'u', ú: 'u', ụ: 'u', ủ: 'u', ũ: 'u',
  ư: 'u', ừ: 'u', ứ: 'u', ự: 'u', ử: 'u', ữ: 'u',
  ỳ: 'y', ý: 'y', ỵ: 'y', ỷ: 'y', ỹ: 'y',
  đ: 'd',
};

export function toVietnameseSlug(input: string): string {
  const lower = input.trim().toLowerCase();
  let normalized = '';
  for (const ch of lower) {
    normalized += VIETNAMESE_MAP[ch] ?? ch;
  }
  return normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'tai-lieu';
}

export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || 'file';
  const dotIdx = base.lastIndexOf('.');
  const name = dotIdx > 0 ? base.slice(0, dotIdx) : base;
  const ext = dotIdx > 0 ? base.slice(dotIdx).toLowerCase().replace(/[^.a-z0-9]/g, '') : '';
  const safeName = toVietnameseSlug(name).slice(0, 80) || 'document';
  return `${safeName}${ext}`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function getAllowedFileExtension(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const allowed = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'];
  return allowed.includes(ext) ? ext : null;
}
