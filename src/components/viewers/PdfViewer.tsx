import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfViewerProps {
  fileUrl: string;
  downloadUrl: string;
  title: string;
}

export function PdfViewer({ fileUrl, downloadUrl, title }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [matchedPages, setMatchedPages] = useState<number[]>([]);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setNumPages(0);
    setCurrentPage(1);

    const loadingTask = pdfjsLib.getDocument({ url: fileUrl });
    loadingTask.promise
      .then(async (doc) => {
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);

        // Extract text per page in background for in-document search
        const texts: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          try {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            const str = content.items
              .map((item) => ('str' in item ? item.str : ''))
              .join(' ');
            texts.push(str);
          } catch {
            texts.push('');
          }
        }
        if (!cancelled) setPageTexts(texts);
      })
      .catch((err) => {
        console.error('PDF.js load error:', err);
        if (!cancelled) {
          setError('Không thể hiển thị trực tiếp tệp PDF này. Bạn vẫn có thể tải xuống bản gốc.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [fileUrl]);

  // Render pages whenever pdfDoc or scale changes
  useEffect(() => {
    if (!pdfDoc || numPages === 0) return;
    let cancelled = false;
    const renderTasks: Array<{ cancel: () => void }> = [];

    const renderAllPages = async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (cancelled) return;
        const canvas = canvasRefs.current[pageNum - 1];
        if (!canvas) continue;
        try {
          const page = await pdfDoc.getPage(pageNum);
          if (cancelled) return;
          const viewport = page.getViewport({ scale });
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

          const task = page.render({
            canvasContext: ctx,
            viewport,
            canvas,
          });
          renderTasks.push(task);
          await task.promise;
        } catch (err) {
          // Ignore cancellation errors on zoom change
          if (!cancelled && String(err).indexOf('RenderingCancelled') === -1) {
            console.error(`Error rendering PDF page ${pageNum}:`, err);
          }
        }
      }
    };

    void renderAllPages();
    return () => {
      cancelled = true;
      for (const t of renderTasks) {
        try {
          t.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, numPages, scale]);

  // Search computation
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setMatchedPages([]);
      setActiveMatchIdx(0);
      return;
    }
    const matches: number[] = [];
    pageTexts.forEach((txt, idx) => {
      if (txt.toLowerCase().includes(q)) {
        matches.push(idx + 1);
      }
    });
    setMatchedPages(matches);
    setActiveMatchIdx(0);
    if (matches.length > 0) {
      scrollToPage(matches[0]);
    }
  }, [searchQuery, pageTexts]);

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

  // Track visible page on scroll
  const handleScroll = useCallback(() => {
    const container = scrollAreaRef.current;
    if (!container || numPages === 0) return;
    const containerTop = container.getBoundingClientRect().top;
    let closestPage = 1;
    let minDistance = Infinity;
    for (let i = 0; i < numPages; i++) {
      const el = pageRefs.current[i];
      if (!el) continue;
      const dist = Math.abs(el.getBoundingClientRect().top - containerTop - 24);
      if (dist < minDistance) {
        minDistance = dist;
        closestPage = i + 1;
      }
    }
    setCurrentPage(closestPage);
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
      // Fallback for sandboxed iframes
      setIsFullscreen((prev) => !prev);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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
            disabled={currentPage <= 1 || numPages === 0}
            aria-label="Trang trước"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1.5 px-2 text-xs font-medium text-slate-700 tabular-nums whitespace-nowrap">
            <span>Trang</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, numPages)}
              value={currentPage}
              aria-label="Số trang hiện tại"
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 1 && v <= numPages) scrollToPage(v);
              }}
              className="w-12 text-center rounded border border-slate-300 py-0.5 text-xs font-mono"
            />
            <span className="text-slate-500">/ {numPages || '—'}</span>
          </div>
          <button
            type="button"
            onClick={() => scrollToPage(currentPage + 1)}
            disabled={currentPage >= numPages || numPages === 0}
            aria-label="Trang sau"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Search inside PDF */}
        <div className="flex items-center gap-1.5 flex-1 max-w-xs">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm trong tài liệu..."
              aria-label="Tìm kiếm nội dung trong PDF"
              className="w-full pl-8 pr-2 py-1 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
            />
          </div>
          {searchQuery.trim() && (
            <div className="flex items-center gap-1 text-xs text-slate-600 tabular-nums whitespace-nowrap">
              <span>{matchedPages.length} trang</span>
              {matchedPages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const next = (activeMatchIdx + 1) % matchedPages.length;
                    setActiveMatchIdx(next);
                    scrollToPage(matchedPages[next]);
                  }}
                  className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
                >
                  Tiếp
                </button>
              )}
            </div>
          )}
        </div>

        {/* Zoom & Fullscreen */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.6, +(s - 0.15).toFixed(2)))}
            aria-label="Thu nhỏ"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-700 w-12 text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.4, +(s + 0.15).toFixed(2)))}
            aria-label="Phóng to"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setScale(1.15)}
            aria-label="Mặc định tỷ lệ"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
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

      {/* Scrollable PDF Pages */}
      <div
        ref={scrollAreaRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-4 sm:p-6 flex flex-col items-center gap-5 bg-slate-200/70"
        data-testid="pdf-viewer-canvas-area"
      >
        {loading && (
          <div className="w-full max-w-2xl bg-white rounded-lg border border-slate-200 p-8 animate-pulse space-y-4">
            <div className="h-6 bg-slate-200 rounded w-2/3" />
            <div className="h-4 bg-slate-100 rounded w-full" />
            <div className="h-4 bg-slate-100 rounded w-5/6" />
            <div className="h-64 bg-slate-100 rounded w-full" />
          </div>
        )}

        {error && (
          <div className="w-full max-w-lg bg-white rounded-xl border border-amber-200 p-6 text-center space-y-3">
            <p className="text-sm font-medium text-slate-800">{error}</p>
            <a
              href={downloadUrl}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-medium hover:bg-blue-800"
            >
              <Download className="w-4 h-4" />
              Tải xuống {title}
            </a>
          </div>
        )}

        {!loading &&
          !error &&
          Array.from({ length: numPages }, (_, idx) => {
            const pageNum = idx + 1;
            const isMatched = matchedPages.includes(pageNum);
            return (
              <div
                key={pageNum}
                ref={(el) => {
                  pageRefs.current[idx] = el;
                }}
                className={`shrink-0 bg-white shadow-sm border rounded-sm overflow-hidden transition-shadow ${
                  isMatched ? 'border-amber-400 ring-2 ring-amber-300' : 'border-slate-300'
                }`}
              >
                <canvas
                  ref={(el) => {
                    canvasRefs.current[idx] = el;
                  }}
                  aria-label={`Trang ${pageNum} tài liệu ${title}`}
                  className="block"
                />
              </div>
            );
          })}
      </div>
    </div>
  );
}
