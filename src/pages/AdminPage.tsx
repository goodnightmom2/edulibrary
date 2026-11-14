import React, { useState } from 'react';
import {
  Cpu,
  FileText,
  FolderTree,
  LayoutDashboard,
  Lock,
  LogOut,
  MessageSquare,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import type { CategoryItem, GradeItem, SubjectItem } from '../types/library.ts';
import { AdminDocumentsTab } from './admin/AdminDocumentsTab.tsx';
import { AdminJobsTab } from './admin/AdminJobsTab.tsx';
import { AdminOverviewTab } from './admin/AdminOverviewTab.tsx';
import { AdminSettingsTab } from './admin/AdminSettingsTab.tsx';
import { AdminTaxonomyTab } from './admin/AdminTaxonomyTab.tsx';
import { AdminUsersCommentsTab } from './admin/AdminUsersCommentsTab.tsx';

interface AdminPageProps {
  subjects: SubjectItem[];
  grades: GradeItem[];
  categories: CategoryItem[];
  settings: Record<string, string>;
  onRefreshTaxonomy: () => Promise<void>;
  onNavigate: (path: string) => void;
}

type AdminTab = 'overview' | 'documents' | 'jobs' | 'taxonomy' | 'users' | 'comments' | 'settings';

export function AdminPage({
  subjects,
  grades,
  categories,
  settings,
  onRefreshTaxonomy,
  onNavigate,
}: AdminPageProps) {
  const { user, signInAsAdmin, logout } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signInAsAdmin(email.trim(), password);
      showToast('Đăng nhập quản trị thành công.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Đăng nhập thất bại.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Separate secure Admin login gate
  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="max-w-md mx-auto px-4 py-14">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center mx-auto">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Đăng nhập Quản trị viên</h1>
            <p className="text-xs text-slate-500">
              Khu vực quản lý học liệu tập trung. Chỉ tài khoản có quyền ADMIN mới được phép truy cập.
            </p>
          </div>

          {user && user.role !== 'ADMIN' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <span>
                Tài khoản hiện tại ({user.email}) là tài khoản người dùng thông thường. Vui lòng đăng nhập bằng tài khoản Quản trị viên.
              </span>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label htmlFor="admin-email" className="block text-xs font-semibold text-slate-700 mb-1">
                Email quản trị
              </label>
              <input
                id="admin-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@edulibrary.vn"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold text-slate-700 mb-1">
                Mật khẩu
              </label>
              <input
                id="admin-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {submitting ? 'Đang xác thực...' : 'Đăng nhập vào Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'documents', label: 'Quản lý tài liệu', icon: FileText },
    { id: 'jobs', label: 'Hàng đợi xử lý', icon: Cpu },
    { id: 'taxonomy', label: 'Danh mục & Thẻ', icon: FolderTree },
    { id: 'users', label: 'Người dùng', icon: Users },
    { id: 'comments', label: 'Bình luận', icon: MessageSquare },
    { id: 'settings', label: 'Cài đặt website', icon: Settings },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Sidebar */}
        <aside className="w-full lg:w-64 bg-white border border-slate-200 rounded-xl p-3 shrink-0 space-y-1">
          <div className="px-3 py-2.5 border-b border-slate-100 mb-2">
            <p className="text-xs font-semibold text-blue-700">Quản trị hệ thống</p>
            <p className="text-sm font-bold text-slate-900 truncate">{user.fullName}</p>
          </div>

          <div className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-blue-700 text-white font-semibold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden lg:block pt-3 mt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={async () => {
                await logout();
                onNavigate('/');
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </aside>

        {/* Right Workspace */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-slate-900">
              {navItems.find((i) => i.id === activeTab)?.label}
            </h1>
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="text-xs font-semibold text-blue-700 hover:underline"
            >
              Xem trang chủ &rarr;
            </button>
          </div>

          {activeTab === 'overview' && (
            <AdminOverviewTab onOpenDoc={(slug) => onNavigate(`/tai-lieu/${slug}`)} />
          )}
          {activeTab === 'documents' && (
            <AdminDocumentsTab
              subjects={subjects}
              grades={grades}
              categories={categories}
              onOpenDoc={(slug) => onNavigate(`/tai-lieu/${slug}`)}
            />
          )}
          {activeTab === 'jobs' && <AdminJobsTab />}
          {activeTab === 'taxonomy' && (
            <AdminTaxonomyTab
              subjects={subjects}
              grades={grades}
              categories={categories}
              onRefreshTaxonomy={onRefreshTaxonomy}
            />
          )}
          {activeTab === 'users' && <AdminUsersCommentsTab mode="users" />}
          {activeTab === 'comments' && <AdminUsersCommentsTab mode="comments" />}
          {activeTab === 'settings' && (
            <AdminSettingsTab settings={settings} onRefreshTaxonomy={onRefreshTaxonomy} />
          )}
        </div>
      </div>
    </div>
  );
}
