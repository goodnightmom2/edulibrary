import React, { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Maximize2,
  Minimize2,
  Presentation,
  Search,
} from 'lucide-react';
import type { DocumentPreviewPayload } from '../../types/library.ts';

interface OfficeViewerProps {
  preview: DocumentPreviewPayload;
  downloadUrl: string;
  title: string;
}

export function OfficeViewer({ preview, downloadUrl, title }: OfficeViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const slideMathRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!slideMathRef.current) return;
    const mathBlocks = slideMathRef.current.querySelectorAll<HTMLElement>('[data-slide-latex]');
    mathBlocks.forEach((el) => {
      const latex = el.getAttribute('data-slide-latex') || '';
      try {
        katex.render(latex, el, { displayMode: true, throwOnError: false, strict: false });
      } catch {
        el.textContent = latex;
      }
    });
  }, [activeSlideIdx, preview]);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen((prev) => !prev);
    }
  };

  if (preview.kind === 'sheet' && preview.sheets && preview.sheets.length > 0) {
    const sheet = preview.sheets[activeSheetIdx] || preview.sheets[0];
    const headerRow = sheet.rows[0] || [];
    const dataRows = sheet.rows.slice(1).filter((row) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return row.some((cell) => cell.toLowerCase().includes(q));
    });

    return (
      <div
        ref={containerRef}
        className={`flex flex-col border border-slate-200 bg-white rounded-xl overflow-hidden ${
          isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen' : 'h-[680px]'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5 bg-slate-50">
          <div className="flex items-center gap-2 overflow-x-auto">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
            {preview.sheets.map((s, idx) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setActiveSheetIdx(idx)}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  idx === activeSheetIdx
                    ? 'bg-blue-700 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Lọc dòng..."
                className="pl-8 pr-2 py-1 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:border-blue-500 w-40"
              />
            </div>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-blue-50 text-blue-950">
              <tr>
                {headerRow.map((cell, ci) => (
                  <th
                    key={ci}
                    className="border-b border-r border-slate-200 px-3 py-2.5 text-left font-semibold text-xs whitespace-nowrap"
                  >
                    {cell || `Cột ${ci + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, ri) => (
                <tr key={ri} className="hover:bg-slate-50 border-b border-slate-100">
                  {headerRow.map((_, ci) => (
                    <td
                      key={ci}
                      className="border-r border-slate-100 px-3 py-2 text-slate-700 tabular-nums"
                    >
                      {row[ci] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
              {dataRows.length === 0 && (
                <tr>
                  <td
                    colSpan={Math.max(1, headerRow.length)}
                    className="p-8 text-center text-sm text-slate-500"
                  >
                    Không có dòng dữ liệu phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (preview.kind === 'slides' && preview.slides && preview.slides.length > 0) {
    const slide = preview.slides[activeSlideIdx] || preview.slides[0];
    return (
      <div
        ref={containerRef}
        className={`flex flex-col border border-slate-200 bg-slate-100 rounded-xl overflow-hidden ${
          isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen' : 'h-[680px]'
        }`}
      >
        <div className="flex items-center justify-between gap-2 bg-white border-b border-slate-200 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Presentation className="w-4 h-4 text-orange-600" />
            <span className="text-xs font-medium text-slate-700 tabular-nums">
              Slide {activeSlideIdx + 1} / {preview.slides.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveSlideIdx((i) => Math.max(0, i - 1))}
              disabled={activeSlideIdx === 0}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Trước
            </button>
            <button
              type="button"
              onClick={() => setActiveSlideIdx((i) => Math.min(preview.slides!.length - 1, i + 1))}
              disabled={activeSlideIdx >= preview.slides.length - 1}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Sau
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
          <div
            ref={slideMathRef}
            className="w-full max-w-3xl aspect-[16/9] bg-white border border-slate-300 shadow-sm rounded-lg p-8 sm:p-12 flex flex-col justify-center gap-4"
          >
            {slide.blocks.map((b, idx) =>
              b.type === 'math' ? (
                <div
                  key={idx}
                  data-slide-latex={b.content}
                  className="py-3 px-4 bg-slate-50 border border-slate-200 rounded-lg text-center"
                />
              ) : (
                <p
                  key={idx}
                  className={
                    idx === 0
                      ? 'text-xl sm:text-2xl font-bold text-blue-900 border-b border-slate-100 pb-3'
                      : 'text-base text-slate-700 leading-relaxed'
                  }
                >
                  {b.content}
                </p>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-8 text-center space-y-4">
      <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
        <AlertCircle className="w-6 h-6 text-amber-700" />
      </div>
      <div className="max-w-lg mx-auto space-y-2">
        <h3 className="text-base font-semibold text-slate-900">
          Tài liệu chưa hỗ trợ xem trước đầy đủ trên trình duyệt
        </h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          {preview.mathMeta.warnings[0] ||
            'Hệ thống giữ nguyên tệp gốc để đảm bảo toàn bộ công thức MathType và bố cục trang không bị sai lệch.'}
        </p>
      </div>
      <a
        href={downloadUrl}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition-colors"
      >
        <Download className="w-4 h-4" />
        Tải xuống {title}
      </a>
    </div>
  );
}
