import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Eye,
  FileText,
  FileUp,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { formatBytes, formatDateVi } from '../../lib/assets.ts';
import type {
  CategoryItem,
  DocumentSummary,
  GradeItem,
  SubjectItem,
} from '../../types/library.ts';

interface AdminDocumentsTabProps {
  subjects: SubjectItem[];
  grades: GradeItem[];
  categories: CategoryItem[];
  onOpenDoc: (slug: string) => void;
}

export function AdminDocumentsTab({
  subjects,
  grades,
  categories,
  onOpenDoc,
}: AdminDocumentsTabProps) {
  const { apiFetch } = useAuth();
  const { showToast } = useToast();

  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchText, setSearchText] = useState('');

  // Modal state (Create or Edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentSummary | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [gradeId, setGradeId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [topic, setTopic] = useState('');
  const [author, setAuthor] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [status, setStatus] = useState<'PUBLISHED' | 'DRAFT'>('PUBLISHED');
  const [featured, setFeatured] = useState(false);
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [dragTarget, setDragTarget] = useState<'docx' | 'pdf' | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (statusFilter !== 'ALL') sp.set('status', statusFilter);
      if (searchText.trim()) sp.set('q', searchText.trim());
      sp.set('limit', '50');
      const res = await apiFetch(`/api/admin/documents?${sp.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDocs(data.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch, statusFilter, searchText]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const openCreateModal = () => {
    setEditingDoc(null);
    setTitle('');
    setDescription('');
    setSubjectId(subjects[0]?.id ? String(subjects[0].id) : '');
    setGradeId(grades[grades.length - 1]?.id ? String(grades[grades.length - 1].id) : '');
    setCategoryId(categories[0]?.id ? String(categories[0].id) : '');
    setTopic('');
    setAuthor('');
    setTagsText('');
    setStatus('PUBLISHED');
    setFeatured(false);
    setDocxFile(null);
    setPdfFile(null);
    setThumbFile(null);
    setUploadProgress(0);
    setModalOpen(true);
  };

  const openEditModal = (doc: DocumentSummary) => {
    setEditingDoc(doc);
    setTitle(doc.title);
    setDescription(doc.description || '');
    setSubjectId(doc.subjectId ? String(doc.subjectId) : '');
    setGradeId(doc.gradeId ? String(doc.gradeId) : '');
    setCategoryId(doc.categoryId ? String(doc.categoryId) : '');
    setTopic(doc.topic || '');
    setAuthor(doc.author || '');
    setTagsText((doc.tags || []).map((t) => t.name).join(', '));
    setStatus(doc.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED');
    setFeatured(doc.featured);
    setDocxFile(null);
    setPdfFile(null);
    setThumbFile(null);
    setUploadProgress(0);
    setModalOpen(true);
  };

  const uploadSingleWithProgress = (
    url: string,
    method: 'POST' | 'PUT',
    formData: FormData,
    onProgress: (pct: number) => void
  ): Promise<{ ok: boolean; data: any }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status === 413) {
          resolve({
            ok: false,
            data: {
              error:
                'Tổng dung lượng 2 tệp vượt quá giới hạn ~4.5MB của máy chủ Vercel. Vui lòng nén nhỏ tệp PDF hơn trước khi tải lên.',
            },
          });
          return;
        }
        try {
          const parsed = JSON.parse(xhr.responseText || '{}');
          resolve({ ok: xhr.status >= 200 && xhr.status < 300, data: parsed });
        } catch {
          resolve({ ok: false, data: { error: 'Phản hồi máy chủ không hợp lệ.' } });
        }
      };
      xhr.onerror = () => reject(new Error('Lỗi kết nối mạng khi tải tệp.'));
      xhr.send(formData);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) {
      if (!docxFile) {
        showToast('Vui lòng thêm tệp Word (.docx) để người dùng tải về.', 'error');
        return;
      }
      if (!docxFile.name.toLowerCase().endsWith('.docx')) {
        showToast('Tệp tải về bắt buộc phải có định dạng .docx.', 'error');
        return;
      }
      if (!pdfFile) {
        showToast('Vui lòng thêm tệp PDF (.pdf) để hiển thị xem trước trên web.', 'error');
        return;
      }
      if (!pdfFile.name.toLowerCase().endsWith('.pdf')) {
        showToast('Tệp hiển thị trên web bắt buộc phải có định dạng .pdf.', 'error');
        return;
      }
    }

    if (!title.trim()) {
      showToast('Tên tài liệu không được để trống.', 'error');
      return;
    }

    setSubmitting(true);
    setUploadProgress(5);
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('description', description.trim());
      if (subjectId) fd.append('subjectId', subjectId);
      if (gradeId) fd.append('gradeId', gradeId);
      if (categoryId) fd.append('categoryId', categoryId);
      fd.append('topic', topic.trim());
      fd.append('author', author.trim());
      fd.append('tags', tagsText);
      fd.append('status', status);
      fd.append('featured', String(featured));
      if (docxFile) fd.append('docxFile', docxFile);
      if (pdfFile) fd.append('pdfFile', pdfFile);
      if (thumbFile) fd.append('thumbnail', thumbFile);

      const { ok, data } = await uploadSingleWithProgress(
        editingDoc ? `/api/admin/documents/${editingDoc.id}` : '/api/admin/documents',
        editingDoc ? 'PUT' : 'POST',
        fd,
        setUploadProgress
      );
      if (!ok) {
        throw new Error(data.error || (editingDoc ? 'Cập nhật thất bại.' : 'Tải lên thất bại.'));
      }
      showToast(
        editingDoc
          ? 'Đã cập nhật thông tin tài liệu thành công.'
          : 'Đã tải lên cặp tệp Word + PDF thành công!',
        'success'
      );

      setModalOpen(false);
      await loadDocuments();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Thao tác thất bại.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (doc: DocumentSummary) => {
    const nextStatus = doc.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    const fd = new FormData();
    fd.append('status', nextStatus);
    const res = await apiFetch(`/api/admin/documents/${doc.id}`, {
      method: 'PUT',
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast(
        nextStatus === 'PUBLISHED' ? 'Đã xuất bản tài liệu.' : 'Đã chuyển về bản nháp.',
        'success'
      );
      void loadDocuments();
    } else {
      showToast(data.error || 'Không thể đổi trạng thái tài liệu.', 'error');
    }
  };

  const handleRetryProcessing = async (doc: DocumentSummary) => {
    const res = await apiFetch(`/api/admin/documents/${doc.id}/retry`, { method: 'POST' });
    if (res.ok) {
      showToast('Đã đưa tài liệu vào hàng đợi xử lý lại.', 'info');
      setTimeout(() => void loadDocuments(), 700);
    } else {
      showToast('Không thể thử xử lý lại tài liệu.', 'error');
    }
  };

  const handleDelete = async (doc: DocumentSummary, permanent = false) => {
    const res = await apiFetch(
      `/api/admin/documents/${doc.id}${permanent ? '?permanent=true' : ''}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      showToast(
        permanent ? 'Đã xóa vĩnh viễn tài liệu.' : 'Đã chuyển tài liệu vào thùng rác.',
        'info'
      );
      void loadDocuments();
    }
  };

  const handleRestore = async (doc: DocumentSummary) => {
    const res = await apiFetch(`/api/admin/documents/${doc.id}/restore`, { method: 'POST' });
    if (res.ok) {
      showToast('Đã khôi phục tài liệu.', 'success');
      void loadDocuments();
    }
  };

  const handlePickedFiles = (files: File[], target: 'docx' | 'pdf') => {
    let pickedDocx: File | null = null;
    let pickedPdf: File | null = null;

    for (const f of files) {
      const lower = f.name.toLowerCase();
      if (lower.endsWith('.docx')) {
        pickedDocx = f;
      } else if (lower.endsWith('.pdf')) {
        pickedPdf = f;
      }
    }

    if (pickedDocx) setDocxFile(pickedDocx);
    if (pickedPdf) setPdfFile(pickedPdf);

    if (target === 'docx' && !pickedDocx && files[0]) {
      showToast('Vui lòng chọn tệp đúng định dạng Word (.docx).', 'error');
    } else if (target === 'pdf' && !pickedPdf && files[0]) {
      showToast('Vui lòng chọn tệp đúng định dạng PDF (.pdf).', 'error');
    }

    const firstValid = pickedDocx || pickedPdf;
    if (firstValid && !title.trim()) {
      setTitle(firstValid.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleDropFor = (target: 'docx' | 'pdf') => (e: React.DragEvent) => {
    e.preventDefault();
    setDragTarget(null);
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length > 0) {
      handlePickedFiles(dropped, target);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'ALL', label: 'Tất cả' },
            { id: 'PUBLISHED', label: 'Đã xuất bản' },
            { id: 'DRAFT', label: 'Bản nháp' },
            { id: 'TRASH', label: 'Thùng rác' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === tab.id
                  ? 'bg-blue-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Tìm tài liệu..."
              className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-slate-50 w-48 sm:w-60"
            />
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Thêm tài liệu
          </button>
        </div>
      </div>

      {/* Document Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Tên tài liệu</th>
                <th className="px-4 py-3 text-left font-semibold">Môn · Lớp</th>
                <th className="px-4 py-3 text-left font-semibold">Tệp</th>
                <th className="px-4 py-3 text-left font-semibold">Trạng thái</th>
                <th className="px-4 py-3 text-right font-semibold">Xem / Tải</th>
                <th className="px-4 py-3 text-right font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Đang tải danh sách tài liệu...
                  </td>
                </tr>
              ) : docs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Không có tài liệu nào trong mục này.
                  </td>
                </tr>
              ) : (
                docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-semibold text-slate-900 line-clamp-1">{doc.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {doc.author} · {formatDateVi(doc.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">
                      {doc.subjectName || '—'} {doc.gradeName ? `· ${doc.gradeName}` : ''}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600 whitespace-nowrap">
                      <span className="uppercase font-semibold">{doc.fileType}</span> ·{' '}
                      {formatBytes(doc.fileSize)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(doc)}
                          disabled={doc.status === 'TRASH'}
                          className={`px-2.5 py-1 rounded text-xs font-semibold ${
                            doc.status === 'PUBLISHED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : doc.status === 'DRAFT'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {doc.status === 'PUBLISHED'
                            ? 'Đã xuất bản'
                            : doc.status === 'DRAFT'
                            ? 'Bản nháp'
                            : 'Thùng rác'}
                        </button>
                        {doc.processingStatus && doc.processingStatus !== 'COMPLETED' && (
                          <span
                            className={`text-[11px] font-medium ${
                              doc.processingStatus === 'FAILED'
                                ? 'text-red-600'
                                : 'text-blue-700'
                            }`}
                          >
                            Xử lý: {doc.processingStatus}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-700 whitespace-nowrap">
                      {doc.viewCount} / {doc.downloadCount}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {(doc.processingStatus === 'FAILED' || doc.processingStatus === 'PENDING') && (
                          <button
                            type="button"
                            onClick={() => void handleRetryProcessing(doc)}
                            title="Thử xử lý lại"
                            aria-label={`Thử xử lý lại ${doc.title}`}
                            className="p-1.5 rounded-md text-amber-700 hover:bg-amber-50"
                          >
                            <RotateCw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenDoc(doc.slug)}
                          title="Xem trước"
                          aria-label={`Xem trước ${doc.title}`}
                          className="p-1.5 rounded-md text-slate-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(doc)}
                          title="Chỉnh sửa"
                          aria-label={`Chỉnh sửa ${doc.title}`}
                          className="p-1.5 rounded-md text-slate-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {doc.status === 'TRASH' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRestore(doc)}
                              title="Khôi phục"
                              aria-label={`Khôi phục ${doc.title}`}
                              className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(doc, true)}
                              title="Xóa vĩnh viễn"
                              aria-label={`Xóa vĩnh viễn ${doc.title}`}
                              className="p-1.5 rounded-md text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDelete(doc, false)}
                            title="Chuyển vào thùng rác"
                            aria-label={`Xóa ${doc.title}`}
                            className="p-1.5 rounded-md text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingDoc ? 'Chỉnh sửa & Thay thế tài liệu' : 'Tải lên tài liệu mới'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Đóng hộp thoại"
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Dual File Upload: Word (.docx) + PDF (.pdf) */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    {editingDoc
                      ? 'Thay thế cặp tệp tài liệu (tùy chọn, giữ nguyên đường dẫn)'
                      : 'Tệp tài liệu bắt buộc (1 file Word .docx để tải về + 1 file PDF .pdf để xem trên web) *'}
                  </label>
                  {(docxFile || pdfFile) && (
                    <span className="text-[11px] font-mono text-slate-500">
                      Tổng: {formatBytes((docxFile?.size || 0) + (pdfFile?.size || 0))}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Box 1: Word (.docx) */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragTarget('docx');
                    }}
                    onDragLeave={() => setDragTarget(null)}
                    onDrop={handleDropFor('docx')}
                    className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
                      dragTarget === 'docx'
                        ? 'border-blue-600 bg-blue-50'
                        : docxFile
                        ? 'border-emerald-400 bg-emerald-50/40'
                        : 'border-slate-300 bg-slate-50/70'
                    }`}
                  >
                    <FileText className="w-7 h-7 text-blue-700 mx-auto mb-1.5" />
                    <p className="text-xs font-bold text-slate-800">
                      1. File Word (.docx) {!editingDoc && <span className="text-red-600">*</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 mb-2">
                      Bản gốc người dùng sẽ tải về máy
                    </p>
                    <label className="inline-block px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-blue-700 hover:bg-blue-50 cursor-pointer">
                      {docxFile ? 'Đổi file .docx' : 'Chọn file .docx'}
                      <input
                        type="file"
                        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="sr-only"
                        onChange={(e) => {
                          const list = Array.from(e.target.files || []);
                          if (list.length > 0) handlePickedFiles(list, 'docx');
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {docxFile && (
                      <div className="mt-2.5 flex items-center justify-between bg-white border border-emerald-200 rounded-lg px-2.5 py-1.5 text-xs text-left">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-medium text-slate-800 truncate">{docxFile.name}</span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500 shrink-0 ml-1.5">
                          {formatBytes(docxFile.size)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Box 2: PDF (.pdf) */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragTarget('pdf');
                    }}
                    onDragLeave={() => setDragTarget(null)}
                    onDrop={handleDropFor('pdf')}
                    className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
                      dragTarget === 'pdf'
                        ? 'border-rose-600 bg-rose-50'
                        : pdfFile
                        ? 'border-emerald-400 bg-emerald-50/40'
                        : 'border-slate-300 bg-slate-50/70'
                    }`}
                  >
                    <UploadCloud className="w-7 h-7 text-rose-600 mx-auto mb-1.5" />
                    <p className="text-xs font-bold text-slate-800">
                      2. File PDF (.pdf) {!editingDoc && <span className="text-red-600">*</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 mb-2">
                      Hiển thị đọc trực tiếp chuẩn công thức trên web
                    </p>
                    <label className="inline-block px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer">
                      {pdfFile ? 'Đổi file .pdf' : 'Chọn file .pdf'}
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        className="sr-only"
                        onChange={(e) => {
                          const list = Array.from(e.target.files || []);
                          if (list.length > 0) handlePickedFiles(list, 'pdf');
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {pdfFile && (
                      <div className="mt-2.5 flex items-center justify-between bg-white border border-emerald-200 rounded-lg px-2.5 py-1.5 text-xs text-left">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-medium text-slate-800 truncate">{pdfFile.name}</span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500 shrink-0 ml-1.5">
                          {formatBytes(pdfFile.size)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {(docxFile?.size || 0) + (pdfFile?.size || 0) > 4.2 * 1024 * 1024 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                    Lưu ý: Tổng dung lượng 2 tệp đang vượt ~4.2MB. Nếu tải lên qua Vercel có thể bị từ chối ở mức 4.5MB — hãy xuất PDF tối ưu dung lượng nếu gặp lỗi.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="doc-title" className="block text-xs font-semibold text-slate-700 mb-1">
                    Tên tài liệu *
                  </label>
                  <input
                    id="doc-title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="VD: Đề thi học kỳ 1 môn Toán lớp 12..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="doc-desc" className="block text-xs font-semibold text-slate-700 mb-1">
                    Mô tả tài liệu
                  </label>
                  <textarea
                    id="doc-desc"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tóm tắt nội dung, cấu trúc đề hoặc hướng dẫn sử dụng..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label htmlFor="doc-subject" className="block text-xs font-semibold text-slate-700 mb-1">
                    Môn học
                  </label>
                  <select
                    id="doc-subject"
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">-- Chọn môn học --</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="doc-grade" className="block text-xs font-semibold text-slate-700 mb-1">
                    Khối lớp
                  </label>
                  <select
                    id="doc-grade"
                    value={gradeId}
                    onChange={(e) => setGradeId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">-- Chọn khối lớp --</option>
                    {grades.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="doc-category" className="block text-xs font-semibold text-slate-700 mb-1">
                    Loại tài liệu
                  </label>
                  <select
                    id="doc-category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  >
                    <option value="">-- Chọn loại --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="doc-topic" className="block text-xs font-semibold text-slate-700 mb-1">
                    Chủ đề
                  </label>
                  <input
                    id="doc-topic"
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="VD: Hình học không gian"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="doc-author" className="block text-xs font-semibold text-slate-700 mb-1">
                    Tác giả / Nguồn
                  </label>
                  <input
                    id="doc-author"
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Ban biên tập EduLibrary"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="doc-tags" className="block text-xs font-semibold text-slate-700 mb-1">
                    Từ khóa (cách nhau bằng dấu phẩy)
                  </label>
                  <input
                    id="doc-tags"
                    type="text"
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    placeholder="Toán 12, Tích phân, Đề thi"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="doc-status" className="block text-xs font-semibold text-slate-700 mb-1">
                    Trạng thái xuất bản
                  </label>
                  <select
                    id="doc-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value === 'DRAFT' ? 'DRAFT' : 'PUBLISHED')}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  >
                    <option value="PUBLISHED">Xuất bản ngay</option>
                    <option value="DRAFT">Lưu bản nháp</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="doc-thumb" className="block text-xs font-semibold text-slate-700 mb-1">
                    Ảnh đại diện tùy chọn
                  </label>
                  <input
                    id="doc-thumb"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setThumbFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 file:text-slate-700"
                  />
                </div>

                <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                  <input
                    id="doc-featured"
                    type="checkbox"
                    checked={featured}
                    onChange={(e) => setFeatured(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-700"
                  />
                  <label htmlFor="doc-featured" className="text-sm font-medium text-slate-800">
                    Đánh dấu là tài liệu nổi bật trên trang chủ
                  </label>
                </div>
              </div>

              {/* Upload Progress */}
              {submitting && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-xs font-medium text-blue-800">
                    <span>Đang tải lên và xử lý công thức...</span>
                    <span className="font-mono tabular-nums">{uploadProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-700 transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {editingDoc ? 'Lưu thay đổi' : 'Tải lên & Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
