import React, { useState } from 'react';
import { Download, Eye, FileText } from 'lucide-react';
import { formatDateVi, getDocumentThumbnailUrl } from '../lib/assets.ts';
import type { DocumentSummary } from '../types/library.ts';

interface DocumentCardProps {
  doc: DocumentSummary;
  onOpen: (slug: string) => void;
}

export function DocumentCard({ doc, onOpen }: DocumentCardProps) {
  const [imgError, setImgError] = useState(false);
  const subjectThumb = getDocumentThumbnailUrl(doc.thumbnail, doc.subjectSlug);
  const thumbUrl = doc.thumbnail
    ? doc.thumbnail
    : doc.fileType === 'pdf'
    ? null
    : subjectThumb;

  return (
    <article className="group bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col hover:border-blue-300 hover:shadow-md transition-all duration-200">
      {/* Cover thumbnail or clean academic fallback */}
      <a
        href={`/tai-lieu/${doc.slug}`}
        onClick={(e) => {
          e.preventDefault();
          onOpen(doc.slug);
        }}
        className="relative aspect-[16/10] bg-gradient-to-br from-blue-50 via-slate-50 to-slate-100 overflow-hidden block border-b border-slate-100"
      >
        {thumbUrl && !imgError ? (
          <img
            src={thumbUrl}
            alt={doc.title}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
            <div className="w-11 h-11 rounded-lg bg-white border border-blue-200 flex items-center justify-center text-blue-700 mb-2 shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-blue-900 line-clamp-1">
              {doc.subjectName || 'Tài liệu học tập'}
            </span>
          </div>
        )}
        <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded bg-slate-900/80 text-white font-mono text-[11px] font-semibold uppercase tracking-wide">
          {doc.fileType}
        </span>
      </a>

      {/* Card Body — Zero-pill clean typographic metadata */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>{doc.subjectName || 'Tổng hợp'}</span>
            {doc.gradeName && (
              <>
                <span aria-hidden="true">·</span>
                <span>{doc.gradeName}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <time dateTime={doc.createdAt}>{formatDateVi(doc.createdAt)}</time>
          </div>

          <h3 className="text-[15px] font-semibold text-slate-900 leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors">
            <a
              href={`/tai-lieu/${doc.slug}`}
              onClick={(e) => {
                e.preventDefault();
                onOpen(doc.slug);
              }}
            >
              {doc.title}
            </a>
          </h3>

          {doc.description && (
            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
              {doc.description}
            </p>
          )}
        </div>

        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3 text-slate-500 tabular-nums">
            <span className="inline-flex items-center gap-1" title="Lượt xem">
              <Eye className="w-3.5 h-3.5" />
              {doc.viewCount.toLocaleString('vi-VN')}
            </span>
            <span className="inline-flex items-center gap-1" title="Lượt tải xuống">
              <Download className="w-3.5 h-3.5" />
              {doc.downloadCount.toLocaleString('vi-VN')}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onOpen(doc.slug)}
            className="font-semibold text-blue-700 hover:text-blue-900 transition-colors whitespace-nowrap"
          >
            Xem tài liệu &rarr;
          </button>
        </div>
      </div>
    </article>
  );
}
