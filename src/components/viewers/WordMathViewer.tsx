import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/contrib/mhchem';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { MathMeta } from '../../types/library.ts';

interface WordMathViewerProps {
  pages: Array<{ pageNumber: number; html: string }>;
  mathMeta: MathMeta;
  downloadUrl: string;
  title: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function WordMathViewer({ pages, mathMeta, downloadUrl, title }: WordMathViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const numPages = pages.length;

  const matchedPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const matched: number[] = [];
    pages.forEach((p) => {
      const plain = p.html.replace(/<[^>]+>/g, ' ').toLowerCase();
      if (plain.includes(q)) matched.push(p.pageNumber);
    });
    return matched;
  }, [pages, searchQuery]);

  // Render KaTeX formulas on every page container after mount/update
  useEffect(() => {
    for (let i = 0; i < pages.length; i++) {
      const container = pageRefs.current[i];
      if (!container) continue;

      const mathEls = container.querySelectorAll<HTMLElement>('[data-latex]');
      mathEls.forEach((el) => {
        const latex = el.getAttribute('data-latex') || '';
        const isBlock = el.classList.contains('edu-math-block');
        try {
          katex.render(latex, el, {
            displayMode: isBlock,
            throwOnError: false,
            strict: false,
            trust: false,
          });
        } catch {
          el.textContent = latex;
        }
      });
    }
  }, [pages, zoom, searchQuery]);

  const scrollToPage = useCallback(
    (pageNum: number) => {
      const clamped = Math.max(1, Math.min(numPages || 1, pageNum));
      setCurrentPage(clamped);
      const target = pageRefs.current[clamped - 1];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [numPages]
  );

  const handleScroll = useCallback(() => {
    const container = scrollAreaRef.current;
    if (!container || numPages === 0) return;
    const containerTop = container.getBoundingClientRect().top;
    let closest = 1;
    let minDist = Infinity;
    for (let i = 0; i < numPages; i++) {
      const el = pageRefs.current[i];
      if (!el) continue;
      const dist = Math.abs(el.getBoundingClientRect().top - containerTop - 24);
      if (dist < minDist) {
        minDist = dist;
        closest = i + 1;
      }
    }
    setCurrentPage(closest);
  }, [numPages]);

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

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const getHighlightedHtml = (html: string) => {
    const q = searchQuery.trim();
    if (!q) return html;
    const regex = new RegExp(`(${escapeRegExp(q)})(?![^<]*>)`, 'gi');
    return html.replace(regex, '<mark class="edu-search-highlight">$1</mark>');
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col border border-slate-200 bg-slate-100 rounded-xl overflow-hidden ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen' : 'h-[760px]'
      }`}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border-b border-slate-200 px-3 py-2.5 text-sm">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Trang trước"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 text-xs font-medium text-slate-700 tabular-nums whitespace-nowrap">
            Trang <strong className="font-mono">{currentPage}</strong> / {numPages}
          </span>
          <button
            type="button"
            onClick={() => scrollToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            aria-label="Trang sau"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Search inside Word doc */}
        <div className="flex items-center gap-1.5 flex-1 max-w-xs">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm trong tài liệu Word..."
              aria-label="Tìm kiếm nội dung trong tài liệu Word"
              className="w-full pl-8 pr-2 py-1 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
            />
          </div>
          {searchQuery.trim() && (
            <span className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
              {matchedPages.length} trang
            </span>
          )}
        </div>

        {/* Zoom & Fullscreen */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(80, z - 10))}
            aria-label="Thu nhỏ"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-700 w-11 text-center tabular-nums">
            {zoom}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(150, z + 10))}
            aria-label="Phóng to"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
            className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Thu gọn' : 'Toàn màn hình'}</span>
          </button>
        </div>
      </div>

      {/* MathType / OMML diagnostic notice */}
      {(mathMeta.warnings.length > 0 || mathMeta.convertedCount > 0) && (
        <div
          className={`px-4 py-2 text-xs border-b flex flex-wrap items-center justify-between gap-2 ${
            mathMeta.warnings.length > 0
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          <div className="flex items-start gap-2">
            {mathMeta.warnings.length > 0 && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
            <div className="space-y-0.5">
              <div>
                {mathMeta.warnings.length > 0
                  ? mathMeta.warnings.join(' ')
                  : `Đã chuyển đổi chính xác ${mathMeta.convertedCount} công thức toán/lý/hóa (OMML → KaTeX) với độ phân giải sắc nét.`}
              </div>
              {typeof mathMeta.preCheckTotal === 'number' && mathMeta.preCheckTotal > 0 && (
                <div className="text-[11px] opacity-80 tabular-nums">
                  Đối soát công thức: Phát hiện {mathMeta.preCheckTotal} (OMML: {mathMeta.ommlCount}, MathType OLE: {mathMeta.mathTypeOleCount}, Ảnh công thức: {mathMeta.formulaImageCount ?? 0}) · Bảo toàn trực tiếp trên web: {mathMeta.postCheckPreserved ?? mathMeta.convertedCount}/{mathMeta.preCheckTotal}
                </div>
              )}
            </div>
          </div>
          {mathMeta.warnings.length > 0 && (
            <a
              href={downloadUrl}
              className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Tải file Word gốc
            </a>
          )}
        </div>
      )}

      {/* Pages */}
      <div
        ref={scrollAreaRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-4 sm:p-6 space-y-6 bg-slate-200/70"
        data-testid="word-math-viewer"
      >
        {pages.map((page, idx) => (
          <div
            key={page.pageNumber}
            ref={(el) => {
              pageRefs.current[idx] = el;
            }}
            style={{ fontSize: `${(15.5 * zoom) / 100}px` }}
            className="mx-auto max-w-3xl bg-white border border-slate-300 shadow-sm rounded-sm p-6 sm:p-10 edu-doc-page"
          >
            <div dangerouslySetInnerHTML={{ __html: getHighlightedHtml(page.html) }} />
            <div className="mt-8 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 tabular-nums">
              <span className="truncate max-w-xs">{title}</span>
              <span>
                Trang {page.pageNumber} / {numPages}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
