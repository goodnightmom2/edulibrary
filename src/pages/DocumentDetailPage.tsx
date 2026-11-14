import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Calendar,
  ChevronRight,
  Download,
  Eye,
  FileText,
  MessageSquare,
  Send,
  User as UserIcon,
} from 'lucide-react';
import { DocumentCard } from '../components/DocumentCard.tsx';
import { FileFormatIcon } from '../components/FileFormatIcon.tsx';
import { LatestSidebar } from '../components/LatestSidebar.tsx';
import { OfficeViewer } from '../components/viewers/OfficeViewer.tsx';
import { PdfViewer } from '../components/viewers/PdfViewer.tsx';
import { WordMathViewer } from '../components/viewers/WordMathViewer.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { formatBytes, formatDateVi } from '../lib/assets.ts';
import type { DocumentDetailResponse, DocumentSummary } from '../types/library.ts';

interface DocumentDetailPageProps {
  slug: string;
  onNavigate: (path: string) => void;
}

export function DocumentDetailPage({ slug, onNavigate }: DocumentDetailPageProps) {
  const { user, apiFetch } = useAuth();
  const { showToast } = useToast();

  const [detail, setDetail] = useState<DocumentDetailResponse | null>(null);
  const [latestDocs, setLatestDocs] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      apiFetch(`/api/documents/${encodeURIComponent(slug)}`),
      fetch('/api/documents?limit=6&sort=newest').then((r) => r.json()),
    ])
      .then(async ([docRes, latestRes]) => {
        if (!active) return;
        if (!docRes.ok) {
          const errData = await docRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Không tìm thấy tài liệu.');
        }
        const docData: DocumentDetailResponse = await docRes.json();
        setDetail(docData);
        setFavorited(docData.isFavorited);
        setLatestDocs(latestRes.items || []);

        // Update SEO title, meta description & Schema.org DigitalDocument JSON-LD
        document.title = `${docData.document.title} | EduLibrary`;
        const descMeta = document.querySelector('meta[name="description"]');
        if (descMeta && docData.document.description) {
          descMeta.setAttribute('content', docData.document.description.slice(0, 160));
        }
        let ldScript = document.getElementById('edu-doc-jsonld') as HTMLScriptElement | null;
        if (!ldScript) {
          ldScript = document.createElement('script');
          ldScript.id = 'edu-doc-jsonld';
          ldScript.type = 'application/ld+json';
          document.head.appendChild(ldScript);
        }
        ldScript.textContent = JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'DigitalDocument',
          name: docData.document.title,
          description: docData.document.description,
          author: { '@type': 'Person', name: docData.document.author },
          datePublished: docData.document.createdAt,
          encodingFormat: docData.document.mimeType,
          url: window.location.href,
        });
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Lỗi tải tài liệu.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug, apiFetch]);

  const handleToggleFavorite = async () => {
    if (!detail) return;
    if (!user) {
      showToast('Vui lòng đăng nhập để lưu tài liệu yêu thích.', 'info');
      onNavigate('/tai-khoan');
      return;
    }
    try {
      const res = await apiFetch(`/api/documents/${detail.document.id}/favorite`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Không thể lưu yêu thích.');
      const data = await res.json();
      setFavorited(Boolean(data.favorited));
      showToast(
        data.favorited ? 'Đã lưu vào danh sách yêu thích.' : 'Đã bỏ khỏi danh sách yêu thích.',
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Thao tác thất bại.', 'error');
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await apiFetch(`/api/documents/${detail.document.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể gửi bình luận.');
      setDetail((prev) =>
        prev ? { ...prev, comments: [data.comment, ...prev.comments] } : prev
      );
      setCommentText('');
      showToast('Đã đăng bình luận.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gửi bình luận thất bại.', 'error');
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="h-8 bg-slate-200 rounded w-1/2 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 h-[680px] bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="lg:col-span-4 h-[420px] bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
        <h1 className="text-2xl font-bold text-slate-900">Không tìm thấy tài liệu</h1>
        <p className="text-sm text-slate-600">{error || 'Tài liệu có thể đã bị xóa hoặc đường dẫn không đúng.'}</p>
        <button
          type="button"
          onClick={() => onNavigate('/tai-lieu')}
          className="px-5 py-2.5 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800"
        >
          Quay lại kho tài liệu
        </button>
      </div>
    );
  }

  const { document: doc, preview, related, comments } = detail;
  const inlineFileUrl = `/api/documents/${encodeURIComponent(doc.slug)}/file?mode=preview`;
  const downloadUrl = `/api/documents/${encodeURIComponent(doc.slug)}/file?download=1`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      {/* Breadcrumb */}
      <nav aria-label="Đường dẫn" className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm text-slate-500">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('/');
          }}
          className="hover:text-blue-700"
        >
          Trang chủ
        </a>
        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        {doc.subject && (
          <>
            <a
              href={`/tai-lieu?subject=${doc.subject.slug}`}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(`/tai-lieu?subject=${doc.subject!.slug}`);
              }}
              className="hover:text-blue-700"
            >
              {doc.subject.name}
            </a>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          </>
        )}
        {doc.grade && (
          <>
            <a
              href={`/tai-lieu?grade=${doc.grade.slug}`}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(`/tai-lieu?grade=${doc.grade!.slug}`);
              }}
              className="hover:text-blue-700"
            >
              {doc.grade.name}
            </a>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          </>
        )}
        <span className="text-slate-800 font-medium truncate max-w-md">{doc.title}</span>
      </nav>

      {/* Main 2-column Reader + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        {/* Left Reader Column */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          {/* Top Reader Header & Download CTA */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <FileFormatIcon fileType={doc.fileType} size="md" />
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
                  {doc.title}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                  <span>{doc.subject?.name || 'Tổng hợp'}</span>
                  {doc.grade && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{doc.grade.name}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{formatBytes(doc.fileSize)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{doc.viewCount.toLocaleString('vi-VN')} lượt xem</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleToggleFavorite}
                aria-label={favorited ? 'Bỏ lưu tài liệu' : 'Lưu tài liệu yêu thích'}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border text-sm font-semibold transition-colors whitespace-nowrap ${
                  favorited
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Bookmark className={`w-4 h-4 ${favorited ? 'fill-amber-500 text-amber-600' : ''}`} />
                <span>{favorited ? 'Đã lưu' : 'Lưu'}</span>
              </button>

              <a
                href={downloadUrl}
                onClick={() => {
                  setDetail((prev) =>
                    prev
                      ? {
                          ...prev,
                          document: {
                            ...prev.document,
                            downloadCount: prev.document.downloadCount + 1,
                          },
                        }
                      : prev
                  );
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold shadow-xs transition-colors whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>Tải xuống ({doc.fileType.toUpperCase()})</span>
              </a>
            </div>
          </div>

          {/* Interactive Document Viewer */}
          {preview.kind === 'pdf' ? (
            <PdfViewer fileUrl={inlineFileUrl} downloadUrl={downloadUrl} title={doc.title} />
          ) : preview.kind === 'word' && preview.pages ? (
            <WordMathViewer
              pages={preview.pages}
              mathMeta={preview.mathMeta}
              downloadUrl={downloadUrl}
              title={doc.title}
            />
          ) : (
            <OfficeViewer preview={preview} downloadUrl={downloadUrl} title={doc.title} />
          )}

          {/* Below Reader: Full Document Info & Description */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900">Thông tin chi tiết tài liệu</h2>
              <a
                href={downloadUrl}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                Tải file gốc ({doc.fileType.toUpperCase()})
              </a>
            </div>

            {doc.description && (
              <p className="text-sm text-slate-700 leading-relaxed">{doc.description}</p>
            )}

            <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2 text-sm">
              <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/70">
                <dt className="text-xs text-slate-500 mb-0.5">Môn học</dt>
                <dd className="font-semibold text-slate-900">{doc.subject?.name || 'Chưa phân loại'}</dd>
              </div>
              <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/70">
                <dt className="text-xs text-slate-500 mb-0.5">Khối lớp</dt>
                <dd className="font-semibold text-slate-900">{doc.grade?.name || 'Nhiều khối lớp'}</dd>
              </div>
              <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/70">
                <dt className="text-xs text-slate-500 mb-0.5">Loại tài liệu</dt>
                <dd className="font-semibold text-slate-900">{doc.category?.name || 'Tài liệu học tập'}</dd>
              </div>
              <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/70">
                <dt className="text-xs text-slate-500 mb-0.5 flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5" /> Tác giả / Nguồn
                </dt>
                <dd className="font-semibold text-slate-900">{doc.author}</dd>
              </div>
              <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/70">
                <dt className="text-xs text-slate-500 mb-0.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Ngày đăng
                </dt>
                <dd className="font-semibold text-slate-900 tabular-nums">{formatDateVi(doc.createdAt)}</dd>
              </div>
              <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/70">
                <dt className="text-xs text-slate-500 mb-0.5 flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" /> Thống kê
                </dt>
                <dd className="font-semibold text-slate-900 tabular-nums">
                  {doc.viewCount.toLocaleString('vi-VN')} xem · {doc.downloadCount.toLocaleString('vi-VN')} tải
                </dd>
              </div>
            </dl>

            {doc.tags.length > 0 && (
              <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500">Từ khóa:</span>
                {doc.tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => onNavigate(`/tai-lieu?tag=${tag.slug}`)}
                    className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 text-slate-700 hover:text-blue-800 transition-colors"
                  >
                    #{tag.name}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Comments Section */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <MessageSquare className="w-5 h-5 text-blue-700" />
              <h2 className="text-base font-bold text-slate-900">
                Trao đổi &amp; Bình luận ({comments.length})
              </h2>
            </div>

            {user ? (
              <form onSubmit={handleCommentSubmit} className="space-y-2.5">
                <textarea
                  rows={3}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Chia sẻ nhận xét hoặc câu hỏi về tài liệu này..."
                  className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:outline-none focus:border-blue-600"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingComment || commentText.trim().length < 3}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    Gửi bình luận
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                <span className="text-slate-600">
                  Đăng nhập tài khoản để đặt câu hỏi hoặc trao đổi về tài liệu này.
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('/tai-khoan')}
                  className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 whitespace-nowrap"
                >
                  Đăng nhập / Đăng ký
                </button>
              </div>
            )}

            <div className="divide-y divide-slate-100">
              {comments.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  Chưa có bình luận nào cho tài liệu này.
                </p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="py-3.5 flex items-start gap-3">
                    {c.userAvatar ? (
                      <img
                        src={c.userAvatar}
                        alt={c.userName}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xs font-bold shrink-0">
                        {c.userName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-900">{c.userName}</span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="text-slate-500">{formatDateVi(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-slate-700 mt-1 leading-relaxed">{c.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Right Sidebar */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-6">
          <LatestSidebar
            title="TÀI LIỆU MỚI NHẤT"
            documents={latestDocs}
            onOpenDoc={(s) => onNavigate(`/tai-lieu/${s}`)}
            onViewMore={() => onNavigate('/tai-lieu?sort=newest')}
          />

          {/* Related Documents Sidebar List */}
          <aside className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-700" />
              <h2 className="text-sm font-bold text-slate-900">Tài liệu liên quan</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {related.length === 0 ? (
                <p className="p-4 text-xs text-slate-500 text-center">
                  Chưa có tài liệu liên quan khác.
                </p>
              ) : (
                related.map((rel) => (
                  <a
                    key={rel.id}
                    href={`/tai-lieu/${rel.slug}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate(`/tai-lieu/${rel.slug}`);
                    }}
                    className="flex items-start gap-3 p-3.5 hover:bg-blue-50/50 transition-colors group"
                  >
                    <FileFormatIcon fileType={rel.fileType} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2 group-hover:text-blue-700">
                        {rel.title}
                      </p>
                      <div className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
                        <span>{rel.subjectName || 'Tổng hợp'}</span>
                        {rel.gradeName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{rel.gradeName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </a>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Bottom Related Grid */}
      {related.length > 0 && (
        <section className="space-y-4 pt-4 border-t border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Có thể bạn quan tâm</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {related.slice(0, 3).map((rel) => (
              <DocumentCard
                key={rel.id}
                doc={rel}
                onOpen={(s) => onNavigate(`/tai-lieu/${s}`)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
