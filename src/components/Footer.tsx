import React from 'react';
import { BookOpen, Mail, MapPin, Phone } from 'lucide-react';
import type { SubjectItem } from '../types/library.ts';

interface FooterProps {
  settings: Record<string, string>;
  subjects: SubjectItem[];
  onNavigate: (path: string) => void;
}

export function Footer({ settings, subjects, onNavigate }: FooterProps) {
  const siteName = settings.siteName || 'EduLibrary';

  return (
    <footer className="bg-white border-t border-slate-200 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-10">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-lg font-bold text-blue-900">
            <span className="w-8 h-8 rounded-lg bg-blue-700 text-white flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </span>
            <span>{siteName}</span>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed max-w-sm">
            {settings.siteTagline ||
              'Thư viện học liệu trực tuyến hỗ trợ giáo viên và học sinh tra cứu, đọc trực tiếp và tải xuống đề thi, giáo án, chuyên đề chuẩn hóa.'}
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Danh mục môn học</h3>
          <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
            {subjects.slice(0, 8).map((s) => (
              <a
                key={s.id}
                href={`/tai-lieu?subject=${s.slug}`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(`/tai-lieu?subject=${s.slug}`);
                }}
                className="hover:text-blue-700 transition-colors truncate"
              >
                {s.name}
              </a>
            ))}
          </div>
        </div>

        <div className="space-y-2.5 text-sm text-slate-600">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Thông tin liên hệ</h3>
          {settings.contactEmail && (
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-700 shrink-0" />
              <span>{settings.contactEmail}</span>
            </div>
          )}
          {settings.contactPhone && (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-blue-700 shrink-0" />
              <span>{settings.contactPhone}</span>
            </div>
          )}
          {settings.contactAddress && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-700 shrink-0" />
              <span>{settings.contactAddress}</span>
            </div>
          )}
          <div className="pt-2">
            <a
              href="/admin"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/admin');
              }}
              className="text-xs font-medium text-slate-500 hover:text-blue-700 underline underline-offset-4"
            >
              Cổng quản trị viên
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>{settings.footerText || '© 2026 EduLibrary — Thư viện học liệu trực tuyến.'}</span>
          <div className="flex items-center gap-4">
            <a
              href="/tai-lieu"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/tai-lieu');
              }}
              className="hover:text-blue-700"
            >
              Kho tài liệu
            </a>
            <a
              href="/tai-khoan"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/tai-khoan');
              }}
              className="hover:text-blue-700"
            >
              Tài khoản cá nhân
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
