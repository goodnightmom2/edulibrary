import React, { useEffect, useState } from 'react';
import { ArrowRight, Award, BookMarked, FolderOpen, Search } from 'lucide-react';
import { DocumentCard } from '../components/DocumentCard.tsx';
import { LatestSidebar } from '../components/LatestSidebar.tsx';
import { HERO_BANNER_IMAGE } from '../lib/assets.ts';
import type {
  CategoryItem,
  DocumentSummary,
  GradeItem,
  SubjectItem,
} from '../types/library.ts';

interface HomePageProps {
  subjects: SubjectItem[];
  grades: GradeItem[];
  categories: CategoryItem[];
  settings: Record<string, string>;
  onNavigate: (path: string) => void;
}

export function HomePage({
  subjects,
  grades,
  categories,
  settings,
  onNavigate,
}: HomePageProps) {
  const [heroSearch, setHeroSearch] = useState('');
  const [latestDocs, setLatestDocs] = useState<DocumentSummary[]>([]);
  const [featuredDocs, setFeaturedDocs] = useState<DocumentSummary[]>([]);
  const [subjectDocs, setSubjectDocs] = useState<DocumentSummary[]>([]);
  const [gradeDocs, setGradeDocs] = useState<DocumentSummary[]>([]);
  const [selectedSubjectSlug, setSelectedSubjectSlug] = useState<string>('all');
  const [selectedGradeSlug, setSelectedGradeSlug] = useState<string>('lop-12');
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingSubject, setLoadingSubject] = useState(false);
  const [loadingGrade, setLoadingGrade] = useState(false);

  // Load initial Featured + Latest
  useEffect(() => {
    let active = true;
    setLoadingInitial(true);
    Promise.all([
      fetch('/api/documents?limit=8&sort=newest').then((r) => r.json()),
      fetch('/api/documents?featured=true&limit=4&sort=views').then((r) => r.json()),
    ])
      .then(([latestRes, featuredRes]) => {
        if (!active) return;
        setLatestDocs(latestRes.items || []);
        setFeaturedDocs(featuredRes.items || []);
      })
      .catch((err) => console.error('Home fetch error:', err))
      .finally(() => {
        if (active) setLoadingInitial(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Load documents by selected subject
  useEffect(() => {
    let active = true;
    setLoadingSubject(true);
    const url =
      selectedSubjectSlug === 'all'
        ? '/api/documents?limit=4&sort=newest'
        : `/api/documents?subject=${encodeURIComponent(selectedSubjectSlug)}&limit=4&sort=newest`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (active) setSubjectDocs(data.items || []);
      })
      .catch((err) => console.error('Subject docs error:', err))
      .finally(() => {
        if (active) setLoadingSubject(false);
      });
    return () => {
      active = false;
    };
  }, [selectedSubjectSlug]);

  // Load documents by selected grade
  useEffect(() => {
    let active = true;
    setLoadingGrade(true);
    fetch(`/api/documents?grade=${encodeURIComponent(selectedGradeSlug)}&limit=4&sort=newest`)
      .then((r) => r.json())
      .then((data) => {
        if (active) setGradeDocs(data.items || []);
      })
      .catch((err) => console.error('Grade docs error:', err))
      .finally(() => {
        if (active) setLoadingGrade(false);
      });
    return () => {
      active = false;
    };
  }, [selectedGradeSlug]);

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = heroSearch.trim();
    onNavigate(q ? `/tai-lieu?q=${encodeURIComponent(q)}` : '/tai-lieu');
  };

  const bannerImg = settings.featuredBannerUrl || HERO_BANNER_IMAGE;

  return (
    <div>
      {/* Hero Banner */}
      <section className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 text-white border-b border-blue-950/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-tight text-balance">
              {settings.bannerTitle || 'Kho tài liệu học tập, đề thi và giáo án chuẩn hóa'}
            </h1>
            <p className="text-sm sm:text-base text-blue-100 leading-relaxed max-w-2xl">
              {settings.bannerSubtitle ||
                'Tra cứu, đọc trực tiếp tài liệu Word, PDF với công thức Toán - Lý - Hóa sắc nét và tải xuống hoàn toàn miễn phí.'}
            </p>

            {/* Hero Search Bar */}
            <form onSubmit={handleHeroSearch} className="flex flex-col sm:flex-row gap-2.5 max-w-2xl">
              <div className="relative flex-1">
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={heroSearch}
                  onChange={(e) => setHeroSearch(e.target.value)}
                  placeholder="Tìm kiếm đề thi, giáo án, chuyên đề, môn học..."
                  aria-label="Tìm kiếm học liệu trên trang chủ"
                  className="w-full pl-11 pr-4 py-3 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm transition-colors whitespace-nowrap shrink-0"
              >
                Tìm tài liệu
              </button>
            </form>

            {/* Popular Category Shortcuts */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-medium text-blue-200 mr-1">Danh mục phổ biến:</span>
              {categories.slice(0, 6).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onNavigate(`/tai-lieu?category=${cat.slug}`)}
                  className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-xs font-medium text-white border border-white/15 transition-colors whitespace-nowrap"
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Right Hero Image */}
          <div className="lg:col-span-5 hidden lg:block">
            <div className="relative rounded-xl overflow-hidden border border-white/20 shadow-xl aspect-[16/10] bg-blue-950">
              <img
                src={bannerImg}
                alt="Không gian học tập trực tuyến EduLibrary"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-blue-950/60 via-transparent to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* Main 2-Column Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column */}
        <div className="lg:col-span-8 space-y-10">
          {/* Section 1: Tài liệu nổi bật */}
          <section aria-labelledby="featured-heading" className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-blue-700" />
                <h2 id="featured-heading" className="text-lg sm:text-xl font-bold text-slate-900">
                  Tài liệu nổi bật
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/tai-lieu?sort=views')}
                className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-blue-700 hover:text-blue-900"
              >
                Xem tất cả <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {loadingInitial ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse"
                  />
                ))}
              </div>
            ) : featuredDocs.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
                Chưa có tài liệu nổi bật nào.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {featuredDocs.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    onOpen={(slug) => onNavigate(`/tai-lieu/${slug}`)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Section 2: Tài liệu theo môn học */}
          <section aria-labelledby="by-subject-heading" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <BookMarked className="w-5 h-5 text-blue-700" />
                <h2 id="by-subject-heading" className="text-lg sm:text-xl font-bold text-slate-900">
                  Tài liệu theo môn học
                </h2>
              </div>
              <button
                type="button"
                onClick={() =>
                  onNavigate(
                    selectedSubjectSlug === 'all'
                      ? '/tai-lieu'
                      : `/tai-lieu?subject=${selectedSubjectSlug}`
                  )
                }
                className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-blue-700 hover:text-blue-900"
              >
                Xem thêm <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Interactive subject tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedSubjectSlug('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedSubjectSlug === 'all'
                    ? 'bg-blue-700 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Tất cả môn
              </button>
              {subjects.slice(0, 7).map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSelectedSubjectSlug(sub.slug)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedSubjectSlug === sub.slug
                      ? 'bg-blue-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {sub.name}
                </button>
              ))}
            </div>

            {loadingSubject ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[1, 2].map((n) => (
                  <div
                    key={n}
                    className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse"
                  />
                ))}
              </div>
            ) : subjectDocs.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
                <p className="text-sm font-medium text-slate-700">
                  Chưa có tài liệu cho môn học này.
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedSubjectSlug('all')}
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  Xem tất cả môn học
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {subjectDocs.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    onOpen={(slug) => onNavigate(`/tai-lieu/${slug}`)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Section 3: Tài liệu theo khối lớp */}
          <section aria-labelledby="by-grade-heading" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-blue-700" />
                <h2 id="by-grade-heading" className="text-lg sm:text-xl font-bold text-slate-900">
                  Tài liệu theo khối lớp
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(`/tai-lieu?grade=${selectedGradeSlug}`)}
                className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-blue-700 hover:text-blue-900"
              >
                Lọc theo {grades.find((g) => g.slug === selectedGradeSlug)?.name || 'khối lớp'}{' '}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[...grades]
                .sort((a, b) => b.level - a.level)
                .map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGradeSlug(g.slug)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      selectedGradeSlug === g.slug
                        ? 'bg-blue-700 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {g.name}
                  </button>
                ))}
            </div>

            {loadingGrade ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[1, 2].map((n) => (
                  <div
                    key={n}
                    className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse"
                  />
                ))}
              </div>
            ) : gradeDocs.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
                Hiện chưa có tài liệu thuộc khối lớp này. Hãy chọn khối lớp khác hoặc xem toàn bộ kho tài liệu.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {gradeDocs.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    onOpen={(slug) => onNavigate(`/tai-lieu/${slug}`)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <LatestSidebar
            title="TÀI LIỆU MỚI NHẤT"
            documents={latestDocs}
            onOpenDoc={(slug) => onNavigate(`/tai-lieu/${slug}`)}
            onViewMore={() => onNavigate('/tai-lieu?sort=newest')}
          />

          {/* Quick Subject Directory */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Danh mục môn học
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {subjects.map((sub) => (
                <a
                  key={sub.id}
                  href={`/tai-lieu?subject=${sub.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(`/tai-lieu?subject=${sub.slug}`);
                  }}
                  className="px-2.5 py-2 rounded-lg border border-slate-100 bg-slate-50/70 hover:bg-blue-50 hover:border-blue-200 text-xs font-medium text-slate-700 hover:text-blue-800 transition-colors truncate"
                >
                  {sub.name}
                </a>
              ))}
            </div>
          </div>

          {/* Quick Format Directory */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Lọc nhanh theo định dạng
            </h3>
            <div className="space-y-1.5 text-sm">
              {[
                { label: 'Tài liệu Word (.docx)', type: 'docx' },
                { label: 'Tài liệu PDF (.pdf)', type: 'pdf' },
                { label: 'Bài giảng PowerPoint (.pptx)', type: 'pptx' },
                { label: 'Bảng tính Excel (.xlsx)', type: 'xlsx' },
              ].map((fmt) => (
                <button
                  key={fmt.type}
                  type="button"
                  onClick={() => onNavigate(`/tai-lieu?fileType=${fmt.type}`)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 text-xs font-medium text-slate-700 hover:text-blue-800 flex items-center justify-between transition-colors"
                >
                  <span>{fmt.label}</span>
                  <span className="font-mono text-[11px] uppercase text-slate-400">{fmt.type}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
