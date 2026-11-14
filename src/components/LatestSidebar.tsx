import React from 'react';
import { ArrowRight } from 'lucide-react';
import { formatDateVi } from '../lib/assets.ts';
import type { DocumentSummary } from '../types/library.ts';
import { FileFormatIcon } from './FileFormatIcon.tsx';

interface LatestSidebarProps {
  title?: string;
  documents: DocumentSummary[];
  onOpenDoc: (slug: string) => void;
  onViewMore: () => void;
}

export function LatestSidebar({
  title = 'TÀI LIỆU MỚI NHẤT',
  documents,
  onOpenDoc,
  onViewMore,
}: LatestSidebarProps) {
  return (
    <aside className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3.5 bg-blue-700 text-white flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-wide">{title}</h2>
      </div>

      <div className="divide-y divide-slate-100">
        {documents.length === 0 ? (
          <p className="p-5 text-sm text-slate-500 text-center">Chưa có tài liệu nào.</p>
        ) : (
          documents.map((doc) => (
            <a
              key={doc.id}
              href={`/tai-lieu/${doc.slug}`}
              onClick={(e) => {
                e.preventDefault();
                onOpenDoc(doc.slug);
              }}
              className="flex items-start gap-3 p-3.5 hover:bg-blue-50/50 transition-colors group"
            >
              <FileFormatIcon fileType={doc.fileType} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors">
                  {doc.title}
                </p>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  {doc.subjectName && (
                    <>
                      <span className="truncate max-w-[100px]">{doc.subjectName}</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <time dateTime={doc.createdAt}>{formatDateVi(doc.createdAt)}</time>
                </div>
              </div>
            </a>
          ))
        )}
      </div>

      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/70">
        <button
          type="button"
          onClick={onViewMore}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 py-1"
        >
          <span>Xem thêm tài liệu</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}
