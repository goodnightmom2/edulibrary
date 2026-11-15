import React, { useEffect, useState } from 'react';
import { History, Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateVi } from '../../lib/assets.ts';

interface AdminSettingsTabProps {
  settings: Record<string, string>;
  onRefreshTaxonomy: () => Promise<void>;
}

interface AuditLogRow {
  id: number;
  action: string;
  targetType: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
  adminName: string | null;
  adminEmail: string | null;
}

export function AdminSettingsTab({ settings, onRefreshTaxonomy }: AdminSettingsTabProps) {
  const { apiFetch } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState<Record<string, string>>({
    siteName: settings.siteName || 'EduLibrary',
    siteTagline: settings.siteTagline || '',
    bannerTitle: settings.bannerTitle || '',
    bannerSubtitle: settings.bannerSubtitle || '',
    logoUrl: settings.logoUrl || '',
    featuredBannerUrl: settings.featuredBannerUrl || '',
    contactEmail: settings.contactEmail || '',
    contactPhone: settings.contactPhone || '',
    contactAddress: settings.contactAddress || 'P.Tân Ninh, Tây Ninh',
    footerText: settings.footerText || '',
  });
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);

  useEffect(() => {
    apiFetch('/api/admin/audit-logs')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setLogs(d.logs || []);
      })
      .catch(() => {});
  }, [apiFetch]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: form }),
      });
      if (!res.ok) throw new Error('Lưu cài đặt thất bại.');
      await onRefreshTaxonomy();
      showToast('Đã cập nhật cấu hình website.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi lưu cấu hình.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSave}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900">Cấu hình giao diện &amp; Thông tin website</h2>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Lưu cấu hình
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tên website</label>
            <input
              type="text"
              value={form.siteName}
              onChange={(e) => setForm({ ...form, siteName: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Khẩu hiệu (Tagline)</label>
            <input
              type="text"
              value={form.siteTagline}
              onChange={(e) => setForm({ ...form, siteTagline: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tiêu đề Banner trang chủ</label>
            <input
              type="text"
              value={form.bannerTitle}
              onChange={(e) => setForm({ ...form, bannerTitle: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mô tả Banner trang chủ</label>
            <textarea
              rows={2}
              value={form.bannerSubtitle}
              onChange={(e) => setForm({ ...form, bannerSubtitle: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email liên hệ</label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Số điện thoại</label>
            <input
              type="text"
              value={form.contactPhone}
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Địa chỉ liên hệ</label>
            <input
              type="text"
              value={form.contactAddress}
              onChange={(e) => setForm({ ...form, contactAddress: e.target.value })}
              placeholder="P.Tân Ninh, Tây Ninh"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Logo URL (tùy chọn)</label>
            <input
              type="text"
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              placeholder="Để trống để dùng logo mặc định"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Banner URL (tùy chọn)</label>
            <input
              type="text"
              value={form.featuredBannerUrl}
              onChange={(e) => setForm({ ...form, featuredBannerUrl: e.target.value })}
              placeholder="Để trống để dùng ảnh mặc định"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nội dung chân trang (Footer)</label>
            <input
              type="text"
              value={form.footerText}
              onChange={(e) => setForm({ ...form, footerText: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </form>

      {/* Audit Logs */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
          <History className="w-4 h-4 text-blue-700" />
          <h2 className="text-sm font-bold text-slate-900">Nhật ký hoạt động quản trị</h2>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Thời gian</th>
                <th className="px-4 py-2.5 text-left font-semibold">Quản trị viên</th>
                <th className="px-4 py-2.5 text-left font-semibold">Hành động</th>
                <th className="px-4 py-2.5 text-left font-semibold">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap tabular-nums">
                    {formatDateVi(log.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-800">{log.adminName || log.adminEmail || 'System'}</td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-blue-700">{log.action}</td>
                  <td className="px-4 py-2.5 text-slate-600">{log.details || `${log.targetType} #${log.targetId}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
