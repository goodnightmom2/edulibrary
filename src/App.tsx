import React, { Component, useCallback, useEffect, useState } from 'react';
import { Footer } from './components/Footer.tsx';
import { Header } from './components/Header.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { AccountPage } from './pages/AccountPage.tsx';
import { AdminPage } from './pages/AdminPage.tsx';
import { CatalogPage } from './pages/CatalogPage.tsx';
import { DocumentDetailPage } from './pages/DocumentDetailPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import type { TaxonomyResponse } from './types/library.ts';

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'Lỗi không xác định.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-red-200 rounded-xl p-6 text-center space-y-4">
            <h1 className="text-lg font-bold text-slate-900">Đã xảy ra lỗi hệ thống</h1>
            <p className="text-sm text-slate-600">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.href = '/';
              }}
              className="px-4 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800"
            >
              Tải lại trang chủ
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function EduLibraryShell() {
  const [locationPath, setLocationPath] = useState(() => window.location.pathname);
  const [locationSearch, setLocationSearch] = useState(() => window.location.search);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse>({
    subjects: [],
    grades: [],
    categories: [],
    tags: [],
    settings: { siteName: 'EduLibrary' },
  });

  const refreshTaxonomy = useCallback(async () => {
    try {
      const res = await fetch('/api/taxonomy');
      if (res.ok) {
        const data: TaxonomyResponse = await res.json();
        setTaxonomy(data);
        if (data.settings?.siteName) {
          document.title = `${data.settings.siteName} – Thư viện học liệu trực tuyến`;
        }
      }
    } catch (err) {
      console.error('Failed to load taxonomy:', err);
    }
  }, []);

  useEffect(() => {
    void refreshTaxonomy();
  }, [refreshTaxonomy]);

  useEffect(() => {
    const onPopState = () => {
      setLocationPath(window.location.pathname);
      setLocationSearch(window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((target: string) => {
    const [pathOnly, searchOnly] = target.split('?');
    const nextPath = pathOnly || '/';
    const nextSearch = searchOnly ? `?${searchOnly}` : '';
    if (window.location.pathname !== nextPath || window.location.search !== nextSearch) {
      window.history.pushState({}, '', nextPath + nextSearch);
    }
    setLocationPath(nextPath);
    setLocationSearch(nextSearch);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleHeaderSearch = useCallback(
    (query: string) => {
      navigate(query ? `/tai-lieu?q=${encodeURIComponent(query)}` : '/tai-lieu');
    },
    [navigate]
  );

  // Route matching
  const renderRoute = () => {
    if (locationPath === '/' || locationPath === '') {
      return (
        <HomePage
          subjects={taxonomy.subjects}
          grades={taxonomy.grades}
          categories={taxonomy.categories}
          settings={taxonomy.settings}
          onNavigate={navigate}
        />
      );
    }

    if (locationPath === '/tai-lieu') {
      return (
        <CatalogPage
          subjects={taxonomy.subjects}
          grades={taxonomy.grades}
          categories={taxonomy.categories}
          searchParamsString={locationSearch}
          onNavigate={navigate}
        />
      );
    }

    if (locationPath.startsWith('/tai-lieu/')) {
      const slug = decodeURIComponent(locationPath.slice('/tai-lieu/'.length)).replace(/\/+$/, '');
      if (slug) {
        return <DocumentDetailPage slug={slug} onNavigate={navigate} />;
      }
    }

    if (locationPath === '/tai-khoan') {
      return <AccountPage onNavigate={navigate} />;
    }

    if (locationPath === '/admin') {
      return (
        <AdminPage
          subjects={taxonomy.subjects}
          grades={taxonomy.grades}
          categories={taxonomy.categories}
          settings={taxonomy.settings}
          onRefreshTaxonomy={refreshTaxonomy}
          onNavigate={navigate}
        />
      );
    }

    return <NotFoundPage onNavigate={navigate} />;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      <Header
        siteName={taxonomy.settings.siteName || 'EduLibrary'}
        logoUrl={taxonomy.settings.logoUrl}
        subjects={taxonomy.subjects}
        currentPath={locationPath}
        onNavigate={navigate}
        onSearchSubmit={handleHeaderSearch}
      />
      <main className="flex-1">{renderRoute()}</main>
      <Footer
        settings={taxonomy.settings}
        subjects={taxonomy.subjects}
        onNavigate={navigate}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <EduLibraryShell />
        </AuthProvider>
      </ToastProvider>
    </AppErrorBoundary>
  );
}
