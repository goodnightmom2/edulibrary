import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HardDrive,
  RefreshCw,
  RotateCw,
  Server,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateVi } from '../../lib/assets.ts';
import type { MathMeta, ProcessingJobItem } from '../../types/library.ts';

interface StorageInfo {
  provider: string;
  bucket: string | null;
  presignedUrlsEnabled: boolean;
  maxFileSizeMb: number;
  prefixes: string[];
}

export function AdminJobsTab() {
  const { apiFetch } = useAuth();
  const { showToast } = useToast();

  const [jobs, setJobs] = useState<ProcessingJobItem[]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [jobsRes, storageRes] = await Promise.all([
        apiFetch('/api/admin/jobs?limit=50'),
        apiFetch('/api/admin/storage/status'),
      ]);
      if (jobsRes.ok) {
        const jData = await jobsRes.json();
        setJobs(jData.jobs || []);
      }
      if (storageRes.ok) {
        const sData = await storageRes.json();
        setStorage(sData.storage || null);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRetry = async (documentId: number) => {
    setRetryingId(documentId);
    try {
      const res = await apiFetch(`/api/admin/documents/${documentId}/retry`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể thử xử lý lại.');
      showToast('Đã đưa tài liệu vào hàng đợi xử lý lại.', 'success');
      setTimeout(() => void loadData(), 600);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Thao tác thất bại.', 'error');
    } finally {
      setRetryingId(null);
    }
  };

  const renderStatusBadge = (status: string) => {
    if (status === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" /> Hoàn tất
        </span>
      );
    }
    if (status === 'PROCESSING') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Đang xử lý
        </span>
      );
    }
    if (status === 'FAILED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
          <AlertTriangle className="w-3.5 h-3.5" /> Thất bại
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
        <Clock className="w-3.5 h-3.5" /> Đang chờ
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Storage & Worker Health Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Kho lưu trữ tệp (Storage Layer)</p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">
              {storage?.provider === 'R2'
                ? `Cloudflare R2 (${storage.bucket}) · Presigned URLs`
                : 'Local Modular Storage (originals / previews / thumbnails / temp)'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Giới hạn tải lên: {storage?.maxFileSizeMb || 25} MB/tệp · Kiểm tra Magic Bytes & MIME
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">Hàng đợi xử lý tài liệu & MathType</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {jobs.filter((j) => j.status === 'COMPLETED').length} hoàn tất ·{' '}
                {jobs.filter((j) => j.status === 'FAILED').length} lỗi ·{' '}
                {jobs.filter((j) => j.status === 'PENDING' || j.status === 'PROCESSING').length} đang xử lý
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Chỉ công khai tài liệu sau khi trạng thái xử lý đạt COMPLETED
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Làm mới
          </button>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Tài liệu</th>
                <th className="px-4 py-3 text-left font-semibold">Trạng thái</th>
                <th className="px-4 py-3 text-left font-semibold">Kiểm tra công thức (Trước / Sau)</th>
                <th className="px-4 py-3 text-left font-semibold">Worker · Lần thử</th>
                <th className="px-4 py-3 text-right font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    Đang tải danh sách công việc xử lý...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Chưa có tác vụ xử lý nào trong hàng đợi.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => {
                  let report: MathMeta | null = null;
                  if (job.mathReport) {
                    try {
                      report = JSON.parse(job.mathReport) as MathMeta;
                    } catch {
                      report = null;
                    }
                  }
                  return (
                    <tr key={job.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 max-w-xs">
                        <p className="font-semibold text-slate-900 line-clamp-1">
                          {job.documentTitle}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 uppercase font-mono">
                          #{job.id} · {job.documentFileType} · {formatDateVi(job.createdAt)}
                        </p>
                        {job.errorMessage && (
                          <p className="text-xs text-red-600 mt-1 line-clamp-2">{job.errorMessage}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{renderStatusBadge(job.status)}</td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {report ? (
                          <div className="space-y-0.5 tabular-nums">
                            <p>
                              OMML: <strong>{report.convertedCount}/{report.ommlCount}</strong> · OLE:{' '}
                              <strong>{report.mathTypeOleCount}</strong> · Ảnh:{' '}
                              <strong>{report.formulaImageCount ?? 0}</strong>
                            </p>
                            {report.warnings && report.warnings.length > 0 && (
                              <p className="text-amber-700 line-clamp-1">{report.warnings[0]}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        <span className="font-mono">{job.workerId || 'pending'}</span> ·{' '}
                        {job.attempts}/{job.maxAttempts}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={retryingId === job.documentId}
                          onClick={() => void handleRetry(job.documentId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 disabled:opacity-50"
                        >
                          <RotateCw
                            className={`w-3.5 h-3.5 ${
                              retryingId === job.documentId ? 'animate-spin' : ''
                            }`}
                          />
                          Thử xử lý lại
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
