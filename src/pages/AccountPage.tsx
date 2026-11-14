import React, { useEffect, useState } from 'react';
import { Bookmark, Clock, Download, Save, Shield, User as UserIcon } from 'lucide-react';
import { FileFormatIcon } from '../components/FileFormatIcon.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { formatDateVi } from '../lib/assets.ts';

interface AccountPageProps {
  onNavigate: (path: string) => void;
}

interface ActivityDoc {
  id: number;
  title: string;
  slug: string;
  fileType: string;
  subjectName: string | null;
  gradeName: string | null;
  favoritedAt?: string;
  viewedAt?: string;
  downloadedAt?: string;
}

export function AccountPage({ onNavigate }: AccountPageProps) {
  const { user, signIn, register, apiFetch, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authFullName, setAuthFullName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [submittingAuth, setSubmittingAuth] = useState(false);

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [saving, setSaving] = useState(false);
  const [favorites, setFavorites] = useState<ActivityDoc[]>([]);
  const [viewHistory, setViewHistory] = useState<ActivityDoc[]>([]);
  const [downloadHistory, setDownloadHistory] = useState<ActivityDoc[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setLoadingActivity(true);
      apiFetch('/api/user/activity')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) {
            setFavorites(data.favorites || []);
            setViewHistory(data.viewHistory || []);
            setDownloadHistory(data.downloadHistory || []);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingActivity(false));
    }
  }, [user, apiFetch]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Cập nhật thất bại.');
      }
      await refreshProfile();
      showToast('Đã cập nhật thông tin cá nhân.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Cập nhật thất bại.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingAuth(true);
    try {
      if (authMode === 'register') {
        const created = await register(authFullName.trim(), authEmail.trim(), authPassword);
        showToast(`Đăng ký thành công! Xin chào, ${created.fullName}.`, 'success');
      } else {
        const loggedIn = await signIn(authEmail.trim(), authPassword);
        showToast(`Xin chào, ${loggedIn.fullName}!`, 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Thao tác không thành công.', 'error');
    } finally {
      setSubmittingAuth(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center mx-auto">
              <UserIcon className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Tài khoản EduLibrary</h1>
            <p className="text-xs text-slate-600">
              Đăng nhập hoặc tạo tài khoản để lưu tài liệu yêu thích và theo dõi lịch sử học tập.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100">
            <button
              type="button"
              onClick={() => setAuthMode('login')}
              className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                authMode === 'login' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('register')}
              className={`py-2 text-xs font-semibold rounded-md transition-colors ${
                authMode === 'register' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Đăng ký mới
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Họ và tên</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={authFullName}
                  onChange={(e) => setAuthFullName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-600"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mật khẩu</label>
              <input
                type="password"
                required
                minLength={6}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={submittingAuth}
              className="w-full py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {submittingAuth
                ? 'Đang xử lý...'
                : authMode === 'register'
                ? 'Tạo tài khoản'
                : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.fullName}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-full object-cover border border-slate-200"
            />
          ) : (
            <span className="w-16 h-16 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xl font-bold">
              {user.fullName.charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="text-xl font-bold text-slate-900">{user.fullName}</h1>
            <p className="text-sm text-slate-500">{user.email}</p>
            <p className="text-xs text-slate-400 mt-1">
              Vai trò: {user.role === 'ADMIN' ? 'Quản trị viên' : 'Thành viên'} · Tham gia{' '}
              {formatDateVi(user.createdAt)}
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="flex items-end gap-2">
          <div>
            <label htmlFor="profile-name" className="block text-xs font-semibold text-slate-600 mb-1">
              Họ và tên hiển thị
            </label>
            <input
              id="profile-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-56 focus:outline-none focus:border-blue-600"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Lưu
          </button>
          {user.role === 'ADMIN' && (
            <button
              type="button"
              onClick={() => onNavigate('/admin')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-sm font-semibold hover:bg-blue-100"
            >
              <Shield className="w-4 h-4" />
              Admin
            </button>
          )}
        </form>
      </div>

      {/* 3-Column Activity Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Favorites */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
            <Bookmark className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-900">Tài liệu đã lưu ({favorites.length})</h2>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {loadingActivity ? (
              <p className="p-5 text-sm text-slate-400 text-center">Đang tải...</p>
            ) : favorites.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 text-center">Chưa có tài liệu yêu thích nào.</p>
            ) : (
              favorites.map((doc) => (
                <a
                  key={doc.id}
                  href={`/tai-lieu/${doc.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(`/tai-lieu/${doc.slug}`);
                  }}
                  className="flex items-start gap-3 p-3.5 hover:bg-blue-50/50 transition-colors"
                >
                  <FileFormatIcon fileType={doc.fileType} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 line-clamp-2">{doc.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {doc.subjectName || 'Tổng hợp'} · {formatDateVi(doc.favoritedAt || '')}
                    </p>
                  </div>
                </a>
              ))
            )}
          </div>
        </section>

        {/* Reading History */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
            <Clock className="w-4 h-4 text-blue-700" />
            <h2 className="text-sm font-bold text-slate-900">Lịch sử đã đọc</h2>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {loadingActivity ? (
              <p className="p-5 text-sm text-slate-400 text-center">Đang tải...</p>
            ) : viewHistory.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 text-center">Chưa có lịch sử đọc tài liệu.</p>
            ) : (
              viewHistory.map((doc, idx) => (
                <a
                  key={`${doc.id}-${idx}`}
                  href={`/tai-lieu/${doc.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(`/tai-lieu/${doc.slug}`);
                  }}
                  className="flex items-start gap-3 p-3.5 hover:bg-blue-50/50 transition-colors"
                >
                  <FileFormatIcon fileType={doc.fileType} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 line-clamp-2">{doc.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {doc.subjectName || 'Tổng hợp'} · {formatDateVi(doc.viewedAt || '')}
                    </p>
                  </div>
                </a>
              ))
            )}
          </div>
        </section>

        {/* Download History */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
            <Download className="w-4 h-4 text-emerald-700" />
            <h2 className="text-sm font-bold text-slate-900">Tài liệu đã tải xuống</h2>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {loadingActivity ? (
              <p className="p-5 text-sm text-slate-400 text-center">Đang tải...</p>
            ) : downloadHistory.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 text-center">Chưa ghi nhận lượt tải xuống nào.</p>
            ) : (
              downloadHistory.map((doc, idx) => (
                <a
                  key={`${doc.id}-${idx}`}
                  href={`/tai-lieu/${doc.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(`/tai-lieu/${doc.slug}`);
                  }}
                  className="flex items-start gap-3 p-3.5 hover:bg-blue-50/50 transition-colors"
                >
                  <FileFormatIcon fileType={doc.fileType} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 line-clamp-2">{doc.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {doc.subjectName || 'Tổng hợp'} · {formatDateVi(doc.downloadedAt || '')}
                    </p>
                  </div>
                </a>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
