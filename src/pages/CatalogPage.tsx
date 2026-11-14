import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, RotateCcw, Search } from 'lucide-react';
import { DocumentCard } from '../components/DocumentCard.tsx';
import type {
  CategoryItem,
  DocumentSummary,
  GradeItem,
  SubjectItem,
} from '../types/library.ts';

interface CatalogPageProps {
  subjects: SubjectItem[];
  grades: GradeItem[];
  categories: CategoryItem[];
  searchParamsString: string;
  onNavigate: (path: string) => void;
}

export function CatalogPage({
  subjects,
  grades,
  categories,
  searchParamsString,
  onNavigate,
}: CatalogPageProps) {
  const params = new URLSearchParams(searchParamsString);
  const [q, setQ] = useState(params.get('q') || '');
  const [subject, setSubject] = useState(params.get('subject') || 'all');
  const [grade, setGrade] = useState(params.get('grade') || 'all');
  const [category, setCategory] = useState(params.get('category') || 'all');
  const [fileType, setFileType] = useState(params.get('fileType') || 'all');
  const [sort, setSort] = useState(params.get('sort') || 'newest');
  const [page, setPage] = useState(Number(params.get('page')) || 1);

  const [items, setItems] = useState<DocumentSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync URL query params into state when route changes
  useEffect(() => {
    const p = new URLSearchParams(searchParamsString);
    setQ(p.get('q') || '');
    setSubject(p.get('subject') || 'all');
    setGrade(p.get('grade') || 'all');
    setCategory(p.get('category') || 'all');
    setFileType(p.get('fileType') || 'all');
    setSort(p.get('sort') || 'newest');
    setPage(Number(p.get('page')) || 1);
  }, [searchParamsString]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const apiParams = new URLSearchParams();
    if (q.trim()) apiParams.set('q', q.trim());
    if (subject !== 'all') apiParams.set('subject', subject);
    if (grade !== 'all') apiParams.set('grade', grade);
    if (category !== 'all') apiParams.set('category', category);
    if (fileType !== 'all') apiParams.set('fileType', fileType);
    apiParams.set('sort', sort);
    apiParams.set('page', String(page));
    apiParams.set('limit', '12');

    fetch(`/api/documents?${apiParams.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error('Không thể tải danh sách tài liệu.');
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setItems(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(Math.max(1, data.totalPages || 1));
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [q, subject, grade, category, fileType, sort, page]);

  const applyFiltersToUrl = (overrides: Record<string, string | number>) => {
    const next = {
      q,
      subject,
      grade,
      category,
      fileType,
      sort,
      page: 1,
      ...overrides,
    };
    const sp = new URLSearchParams();
    if (String(next.q).trim()) sp.set('q', String(next.q).trim());
    if (next.subject && next.subject !== 'all') sp.set('subject', String(next.subject));
    if (next.grade && next.grade !== 'all') sp.set('grade', String(next.grade));
    if (next.category && next.category !== 'all') sp.set('category', String(next.category));
    if (next.fileType && next.fileType !== 'all') sp.set('fileType', String(next.fileType));
    if (next.sort && next.sort !== 'newest') sp.set('sort', String(next.sort));
    if (Number(next.page) > 1) sp.set('page', String(next.page));
    const qs = sp.toString();
    onNavigate(qs ? `/tai-lieu?${qs}` : '/tai-lieu');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFiltersToUrl({ q, page: 1 });
  };

  const resetFilters = () => {
    onNavigate('/tai-lieu');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kho tài liệu học tập</h1>
          <p className="text-sm text-slate-600 mt-1">
            Tìm thấy <strong className="font-mono text-slate-900 tabular-nums">{total}</strong> tài liệu phù hợp
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tên tài liệu, tác giả, từ khóa..."
              aria-label="Từ khóa tìm kiếm"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-600"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold whitespace-nowrap shrink-0"
          >
            Tìm kiếm
          </button>
        </form>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
        <div>
          <label htmlFor="filter-subject" className="block text-xs font-semibold text-slate-600 mb-1">
            Môn học
          </label>
          <select
            id="filter-subject"
            value={subject}
            onChange={(e) => applyFiltersToUrl({ subject: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          >
            <option value="all">Tất cả môn học</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-grade" className="block text-xs font-semibold text-slate-600 mb-1">
            Khối lớp
          </label>
          <select
            id="filter-grade"
            value={grade}
            onChange={(e) => applyFiltersToUrl({ grade: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          >
            <option value="all">Tất cả khối lớp</option>
            {grades.map((g) => (
              <option key={g.id} value={g.slug}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-category" className="block text-xs font-semibold text-slate-600 mb-1">
            Loại tài liệu
          </label>
          <select
            id="filter-category"
            value={category}
            onChange={(e) => applyFiltersToUrl({ category: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          >
            <option value="all">Tất cả loại</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-filetype" className="block text-xs font-semibold text-slate-600 mb-1">
            Định dạng
          </label>
          <select
            id="filter-filetype"
            value={fileType}
            onChange={(e) => applyFiltersToUrl({ fileType: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          >
            <option value="all">Tất cả định dạng</option>
            <option value="docx">Word (.docx)</option>
            <option value="doc">Word (.doc)</option>
            <option value="pdf">PDF (.pdf)</option>
            <option value="pptx">PowerPoint (.pptx)</option>
            <option value="xlsx">Excel (.xlsx)</option>
          </select>
        </div>

        <div>
          <label htmlFor="filter-sort" className="block text-xs font-semibold text-slate-600 mb-1">
            Sắp xếp
          </label>
          <select
            id="filter-sort"
            value={sort}
            onChange={(e) => applyFiltersToUrl({ sort: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          >
            <option value="newest">Mới nhất</option>
            <option value="views">Xem nhiều nhất</option>
            <option value="downloads">Tải nhiều nhất</option>
            <option value="title">Tên A - Z</option>
          </select>
        </div>

        <button
          type="button"
          onClick={resetFilters}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
        >
          <RotateCcw className="w-4 h-4" />
          Đặt lại
        </button>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-white border border-red-200 rounded-xl p-8 text-center text-sm text-red-700">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <Filter className="w-8 h-8 text-slate-400 mx-auto" />
          <h2 className="text-base font-semibold text-slate-900">
            Không tìm thấy tài liệu phù hợp
          </h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Thử thay đổi từ khóa tìm kiếm hoặc bỏ bớt bộ lọc để xem thêm nhiều tài liệu hơn.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800"
          >
            Xem tất cả tài liệu
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onOpen={(slug) => onNavigate(`/tai-lieu/${slug}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => applyFiltersToUrl({ page: page - 1 })}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                Trước
              </button>
              <span className="px-4 text-sm text-slate-600 tabular-nums">
                Trang <strong>{page}</strong> / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => applyFiltersToUrl({ page: page + 1 })}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Sau
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
