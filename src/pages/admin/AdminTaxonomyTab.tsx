import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import type { CategoryItem, GradeItem, SubjectItem } from '../../types/library.ts';

interface AdminTaxonomyTabProps {
  subjects: SubjectItem[];
  grades: GradeItem[];
  categories: CategoryItem[];
  onRefreshTaxonomy: () => Promise<void>;
}

export function AdminTaxonomyTab({
  subjects,
  grades,
  categories,
  onRefreshTaxonomy,
}: AdminTaxonomyTabProps) {
  const { apiFetch } = useAuth();
  const { showToast } = useToast();

  const [newSubject, setNewSubject] = useState('');
  const [newGrade, setNewGrade] = useState('');
  const [newGradeLevel, setNewGradeLevel] = useState('13');
  const [newCategory, setNewCategory] = useState('');

  const addSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim()) return;
    const res = await apiFetch('/api/admin/subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSubject.trim() }),
    });
    if (res.ok) {
      setNewSubject('');
      await onRefreshTaxonomy();
      showToast('Đã thêm môn học mới.', 'success');
    } else {
      const d = await res.json();
      showToast(d.error || 'Lỗi thêm môn học.', 'error');
    }
  };

  const deleteSubject = async (id: number) => {
    const res = await apiFetch(`/api/admin/subjects/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await onRefreshTaxonomy();
      showToast('Đã xóa môn học.', 'info');
    }
  };

  const addGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGrade.trim()) return;
    const res = await apiFetch('/api/admin/grades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGrade.trim(), level: Number(newGradeLevel) || 13 }),
    });
    if (res.ok) {
      setNewGrade('');
      await onRefreshTaxonomy();
      showToast('Đã thêm khối lớp mới.', 'success');
    } else {
      const d = await res.json();
      showToast(d.error || 'Lỗi thêm khối lớp.', 'error');
    }
  };

  const deleteGrade = async (id: number) => {
    const res = await apiFetch(`/api/admin/grades/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await onRefreshTaxonomy();
      showToast('Đã xóa khối lớp.', 'info');
    }
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    const res = await apiFetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategory.trim() }),
    });
    if (res.ok) {
      setNewCategory('');
      await onRefreshTaxonomy();
      showToast('Đã thêm loại tài liệu.', 'success');
    } else {
      const d = await res.json();
      showToast(d.error || 'Lỗi thêm loại tài liệu.', 'error');
    }
  };

  const deleteCategory = async (id: number) => {
    const res = await apiFetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await onRefreshTaxonomy();
      showToast('Đã xóa loại tài liệu.', 'info');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Subjects */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h2 className="text-base font-bold text-slate-900">Môn học ({subjects.length})</h2>
        <form onSubmit={addSubject} className="flex gap-2">
          <input
            type="text"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            placeholder="Tên môn học mới..."
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm
          </button>
        </form>
        <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
          {subjects.map((s) => (
            <div key={s.id} className="py-2 flex items-center justify-between text-sm">
              <span className="text-slate-800 font-medium">{s.name}</span>
              <button
                type="button"
                onClick={() => deleteSubject(s.id)}
                aria-label={`Xóa môn ${s.name}`}
                className="text-slate-400 hover:text-red-600 p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Grades */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h2 className="text-base font-bold text-slate-900">Khối lớp ({grades.length})</h2>
        <form onSubmit={addGrade} className="flex gap-2">
          <input
            type="text"
            value={newGrade}
            onChange={(e) => setNewGrade(e.target.value)}
            placeholder="VD: Ôn thi ĐH"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <input
            type="number"
            value={newGradeLevel}
            onChange={(e) => setNewGradeLevel(e.target.value)}
            className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-mono"
            title="Thứ tự"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm
          </button>
        </form>
        <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
          {grades.map((g) => (
            <div key={g.id} className="py-2 flex items-center justify-between text-sm">
              <span className="text-slate-800 font-medium">{g.name}</span>
              <button
                type="button"
                onClick={() => deleteGrade(g.id)}
                aria-label={`Xóa ${g.name}`}
                className="text-slate-400 hover:text-red-600 p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h2 className="text-base font-bold text-slate-900">Loại tài liệu ({categories.length})</h2>
        <form onSubmit={addCategory} className="flex gap-2">
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Tên loại tài liệu..."
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm
          </button>
        </form>
        <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
          {categories.map((c) => (
            <div key={c.id} className="py-2 flex items-center justify-between text-sm">
              <span className="text-slate-800 font-medium">{c.name}</span>
              <button
                type="button"
                onClick={() => deleteCategory(c.id)}
                aria-label={`Xóa loại ${c.name}`}
                className="text-slate-400 hover:text-red-600 p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
