import React, { useState } from 'react';
import { BookOpen, ChevronDown, LogOut, Menu, Search, Shield, User as UserIcon, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import type { SubjectItem } from '../types/library.ts';

interface HeaderProps {
  siteName: string;
  logoUrl?: string;
  subjects: SubjectItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onSearchSubmit: (query: string) => void;
}

export function Header({
  siteName,
  logoUrl,
  subjects,
  currentPath,
  onNavigate,
  onSearchSubmit,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const { showToast } = useToast();

  const [searchText, setSearchText] = useState('');
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchSubmit(searchText.trim());
    setMobileMenuOpen(false);
  };

  const navItems = [
    { label: 'Trang chủ', path: '/' },
    { label: 'Tài liệu', path: '/tai-lieu' },
    { label: 'Đề thi', path: '/tai-lieu?category=de-thi-cuoi-ky' },
    { label: 'Giáo án', path: '/tai-lieu?category=giao-an' },
    { label: 'Chuyên đề', path: '/tai-lieu?category=chuyen-de' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 lg:gap-8">
        {/* Zone 1: Brand wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('/');
          }}
          className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-blue-900 whitespace-nowrap shrink-0"
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={siteName}
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-md object-contain"
            />
          ) : (
            <span className="w-8 h-8 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </span>
          )}
          <span>{siteName}</span>
        </a>

        {/* Zone 2: Clean single-line navigation links */}
        <nav aria-label="Điều hướng chính" className="hidden lg:flex items-center gap-5 text-sm font-medium text-slate-600">
          {navItems.map((item) => {
            const active =
              item.path === '/'
                ? currentPath === '/'
                : currentPath.startsWith(item.path.split('?')[0]) &&
                  (!item.path.includes('?') || window.location.search.includes(item.path.split('?')[1]));
            return (
              <a
                key={item.path}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(item.path);
                }}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  active
                    ? 'text-blue-700 border-blue-700 font-semibold'
                    : 'border-transparent hover:text-blue-700 hover:border-blue-200'
                }`}
              >
                {item.label}
              </a>
            );
          })}

          {/* Subjects dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSubjectsOpen((o) => !o)}
              aria-expanded={subjectsOpen}
              className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 py-1 text-slate-600 hover:text-blue-700 transition-colors"
            >
              <span>Môn học</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {subjectsOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setSubjectsOpen(false)}
                />
                <div className="absolute left-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg py-2 z-20 grid grid-cols-1 max-h-96 overflow-y-auto">
                  {subjects.map((sub) => (
                    <a
                      key={sub.id}
                      href={`/tai-lieu?subject=${sub.slug}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setSubjectsOpen(false);
                        onNavigate(`/tai-lieu?subject=${sub.slug}`);
                      }}
                      className="px-4 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-800 transition-colors"
                    >
                      {sub.name}
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        </nav>

        {/* Zone 3: Search + Auth Action */}
        <div className="flex items-center gap-3 shrink-0">
          <form onSubmit={handleSearch} className="hidden md:flex items-center relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Tìm tài liệu, đề thi..."
              aria-label="Tìm kiếm tài liệu"
              className="w-48 xl:w-60 pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 transition-colors"
            />
          </form>

          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                aria-expanded={userMenuOpen}
                aria-label="Menu tài khoản người dùng"
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.fullName}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xs font-bold">
                    {user.fullName.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="hidden sm:inline max-w-[120px] truncate">{user.fullName}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-20">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-sm font-semibold text-slate-900 truncate">{user.fullName}</p>
                      <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onNavigate('/tai-khoan');
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <UserIcon className="w-4 h-4 text-slate-400" />
                      Tài khoản &amp; Đã lưu
                    </button>
                    {user.role === 'ADMIN' && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          onNavigate('/admin');
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-blue-700 font-medium hover:bg-blue-50 flex items-center gap-2"
                      >
                        <Shield className="w-4 h-4" />
                        Trang quản trị Admin
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        setUserMenuOpen(false);
                        await logout();
                        showToast('Đã đăng xuất khỏi tài khoản.', 'info');
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-slate-100 mt-1"
                    >
                      <LogOut className="w-4 h-4" />
                      Đăng xuất
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('/tai-khoan')}
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              Đăng nhập
            </button>
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu điều hướng'}
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-4">
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Tìm kiếm tài liệu, đề thi..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-medium shrink-0"
            >
              Tìm
            </button>
          </form>

          <div className="grid grid-cols-2 gap-2">
            {navItems.map((item) => (
              <a
                key={item.path}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  setMobileMenuOpen(false);
                  onNavigate(item.path);
                }}
                className="px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-800"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 mb-2">Môn học phổ biến</p>
            <div className="flex flex-wrap gap-2">
              {subjects.slice(0, 8).map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigate(`/tai-lieu?subject=${sub.slug}`);
                  }}
                  className="px-3 py-1.5 rounded-md bg-slate-100 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-800"
                >
                  {sub.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
