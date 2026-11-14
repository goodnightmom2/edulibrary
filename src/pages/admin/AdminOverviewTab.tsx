import React, { useEffect, useState } from 'react';
import { BarChart3, BookOpen, Download, Eye, FilePlus2, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { formatDateVi } from '../../lib/assets.ts';

interface StatsResponse {
  kpis: {
    totalDocuments: number;
    totalViews: number;
    totalDownloads: number;
    totalUsers: number;
    monthlyDocuments: number;
  };
  subjectChart: Array<{
    subjectName: string;
    views: number;
    downloads: number;
    docCount: number;
  }>;
  dailyChart: Array<{
    date: string;
    label: string;
    views: number;
    downloads: number;
  }>;
  recentDocuments: Array<{
    id: number;
    title: string;
    slug: string;
    fileType: string;
    status: string;
    viewCount: number;
    downloadCount: number;
    createdAt: string;
    subjectName: string | null;
  }>;
}

export function AdminOverviewTab({ onOpenDoc }: { onOpenDoc: (slug: string) => void }) {
  const { apiFetch } = useAuth();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch('/api/admin/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data) setStats(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiFetch]);

  if (loading || !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  const maxSubjectMetric = Math.max(
    1,
    ...stats.subjectChart.map((s) => Math.max(s.views, s.downloads))
  );

  const kpiCards = [
    { label: 'Tổng tài liệu', value: stats.kpis.totalDocuments, icon: BookOpen, tone: 'text-blue-700 bg-blue-50' },
    { label: 'Tổng lượt xem', value: stats.kpis.totalViews, icon: Eye, tone: 'text-indigo-700 bg-indigo-50' },
    { label: 'Tổng lượt tải', value: stats.kpis.totalDownloads, icon: Download, tone: 'text-emerald-700 bg-emerald-50' },
    { label: 'Người dùng', value: stats.kpis.totalUsers, icon: Users, tone: 'text-amber-700 bg-amber-50' },
    { label: 'Mới trong tháng', value: stats.kpis.monthlyDocuments, icon: FilePlus2, tone: 'text-cyan-700 bg-cyan-50' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                  {card.value.toLocaleString('vi-VN')}
                </p>
              </div>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${card.tone}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-700" />
              <h2 className="text-sm font-bold text-slate-900">
                Thống kê lượt xem &amp; lượt tải theo môn học
              </h2>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block" /> Lượt xem
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" /> Lượt tải
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {stats.subjectChart.map((row) => (
              <div key={row.subjectName} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800">{row.subjectName}</span>
                  <span className="text-slate-500 tabular-nums">
                    {row.views.toLocaleString('vi-VN')} xem · {row.downloads.toLocaleString('vi-VN')} tải
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all"
                      style={{ width: `${Math.max(2, (row.views / maxSubjectMetric) * 100)}%` }}
                    />
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${Math.max(2, (row.downloads / maxSubjectMetric) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900">Hoạt động 7 ngày gần nhất</h2>
          <div className="grid grid-cols-7 gap-2 items-end h-44 pt-4 border-b border-slate-100 pb-2">
            {stats.dailyChart.map((d) => {
              const maxDay = Math.max(1, ...stats.dailyChart.map((x) => x.views + x.downloads));
              const hViews = Math.round((d.views / maxDay) * 120);
              const hDl = Math.round((d.downloads / maxDay) * 120);
              return (
                <div key={d.date} className="flex flex-col items-center gap-1.5">
                  <div className="flex items-end gap-0.5 h-32">
                    <div
                      title={`${d.views} lượt xem`}
                      style={{ height: `${Math.max(4, hViews)}px` }}
                      className="w-2.5 bg-blue-600 rounded-t"
                    />
                    <div
                      title={`${d.downloads} lượt tải`}
                      style={{ height: `${Math.max(4, hDl)}px` }}
                      className="w-2.5 bg-emerald-500 rounded-t"
                    />
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums">{d.label}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">
            Biểu đồ tổng hợp từ nhật ký lượt xem và lượt tải thực tế trên hệ thống.
          </p>
        </div>
      </div>

      {/* Recent Documents Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Tài liệu mới đăng tải</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Tên tài liệu</th>
                <th className="px-4 py-2.5 text-left font-semibold">Môn học</th>
                <th className="px-4 py-2.5 text-left font-semibold">Định dạng</th>
                <th className="px-4 py-2.5 text-right font-semibold">Lượt xem</th>
                <th className="px-4 py-2.5 text-right font-semibold">Lượt tải</th>
                <th className="px-4 py-2.5 text-left font-semibold">Ngày đăng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.recentDocuments.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <button
                      type="button"
                      onClick={() => onOpenDoc(doc.slug)}
                      className="text-left hover:text-blue-700 line-clamp-1"
                    >
                      {doc.title}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {doc.subjectName || '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs uppercase text-slate-600">
                    {doc.fileType}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                    {doc.viewCount.toLocaleString('vi-VN')}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                    {doc.downloadCount.toLocaleString('vi-VN')}
                  </td>
                  <td className="px-4 py-3 text-slate-500 tabular-nums whitespace-nowrap">
                    {formatDateVi(doc.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
