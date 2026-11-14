import React from 'react';
import { BookOpen, Home } from 'lucide-react';

interface NotFoundPageProps {
  onNavigate: (path: string) => void;
}

export function NotFoundPage({ onNavigate }: NotFoundPageProps) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-5">
      <p className="font-mono text-sm font-bold text-blue-700">404</p>
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
        Không tìm thấy trang yêu cầu
      </h1>
      <p className="text-sm text-slate-600 leading-relaxed">
        Đường dẫn bạn truy cập không tồn tại hoặc tài liệu đã được di chuyển.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
        >
          <Home className="w-4 h-4" />
          Về trang chủ
        </button>
        <button
          type="button"
          onClick={() => onNavigate('/tai-lieu')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold"
        >
          <BookOpen className="w-4 h-4" />
          Khám phá kho tài liệu
        </button>
      </div>
    </div>
  );
}
