import React, { useCallback, useEffect, useState } from 'react';
import { Lock, Plus, Shield, Trash2, Unlock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateVi } from '../../lib/assets.ts';
import type { UserProfile } from '../../types/library.ts';

interface AdminCommentRow {
  id: number;
  content: string;
  status: string;
  createdAt: string;
  userName: string;
  userEmail: string;
  documentTitle: string;
  documentSlug: string;
}

export function AdminUsersCommentsTab({ mode }: { mode: 'users' | 'comments' }) {
  const { apiFetch } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [comments, setComments] = useState<AdminCommentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newRole, setNewRole] = useState<'ADMIN' | 'USER'>('ADMIN');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'users') {
        const res = await apiFetch('/api/admin/users');
        if (res.ok) {
          const d = await res.json();
          setUsers(d.users || []);
        }
      } else {
        const res = await apiFetch('/api/admin/comments');
        if (res.ok) {
          const d = await res.json();
          setComments(d.comments || []);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch, mode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: newName.trim(),
        email: newEmail.trim(),
        password: newPass,
        role: newRole,
      }),
    });
    const d = await res.json();
    if (res.ok) {
      setNewName('');
      setNewEmail('');
      setNewPass('');
      showToast('Đã tạo tài khoản mới thành công.', 'success');
      void loadData();
    } else {
      showToast(d.error || 'Tạo tài khoản thất bại.', 'error');
    }
  };

  const handleUpdateUser = async (u: UserProfile, patch: { role?: string; status?: string }) => {
    const res = await apiFetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const d = await res.json();
    if (res.ok) {
      showToast('Đã cập nhật quyền/trạng thái người dùng.', 'success');
      void loadData();
    } else {
      showToast(d.error || 'Cập nhật thất bại.', 'error');
    }
  };

  const handleDeleteComment = async (id: number) => {
    const res = await apiFetch(`/api/admin/comments/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Đã xóa bình luận.', 'info');
      void loadData();
    }
  };

  const handleModerateComment = async (id: number, status: string) => {
    const res = await apiFetch(`/api/admin/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      showToast('Đã cập nhật trạng thái bình luận.', 'success');
      void loadData();
    }
  };

  if (mode === 'comments') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Kiểm duyệt bình luận</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {loading ? (
            <p className="p-8 text-center text-sm text-slate-400">Đang tải bình luận...</p>
          ) : comments.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">Chưa có bình luận nào.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">
                    <strong className="text-slate-900">{c.userName}</strong> ({c.userEmail}) ·{' '}
                    <span>{formatDateVi(c.createdAt)}</span> · trên{' '}
                    <span className="font-medium text-blue-700">{c.documentTitle}</span>
                  </div>
                  <p className="text-sm text-slate-800">{c.content}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      handleModerateComment(c.id, c.status === 'APPROVED' ? 'HIDDEN' : 'APPROVED')
                    }
                    className="px-3 py-1 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {c.status === 'APPROVED' ? 'Ẩn bình luận' : 'Duyệt hiển thị'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(c.id)}
                    aria-label="Xóa bình luận"
                    className="p-1.5 rounded-md text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create Admin/Staff Form */}
      <form
        onSubmit={handleCreateUser}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-700" />
          Cấp tài khoản quản trị hoặc nhân viên quản lý mới
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <input
            type="text"
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Họ và tên"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email đăng nhập"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="Mật khẩu (>= 8 ký tự)"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value === 'USER' ? 'USER' : 'ADMIN')}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
          >
            <option value="ADMIN">Quản trị viên (ADMIN)</option>
            <option value="USER">Thành viên (USER)</option>
          </select>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2"
          >
            <Plus className="w-4 h-4" />
            Tạo tài khoản
          </button>
        </div>
      </form>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Người dùng</th>
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Vai trò</th>
                <th className="px-4 py-3 text-left font-semibold">Trạng thái</th>
                <th className="px-4 py-3 text-left font-semibold">Ngày tạo</th>
                <th className="px-4 py-3 text-right font-semibold">Quản lý</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Đang tải danh sách người dùng...
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{u.fullName}</td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        aria-label={`Vai trò của ${u.email}`}
                        onChange={(e) => handleUpdateUser(u, { role: e.target.value })}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold"
                      >
                        <option value="USER">USER</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold">
                      <span
                        className={
                          u.status === 'ACTIVE' ? 'text-emerald-700' : 'text-red-700'
                        }
                      >
                        {u.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã khóa'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 tabular-nums">
                      {formatDateVi(u.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateUser(u, {
                            status: u.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE',
                          })
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-medium ${
                          u.status === 'ACTIVE'
                            ? 'border-red-200 text-red-700 hover:bg-red-50'
                            : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {u.status === 'ACTIVE' ? (
                          <>
                            <Lock className="w-3.5 h-3.5" /> Khóa
                          </>
                        ) : (
                          <>
                            <Unlock className="w-3.5 h-3.5" /> Mở khóa
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
