import React, { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { MarketProvider } from './context/MarketContext';
import { AdminHeader } from './components/AdminHeader';
import { AdminSidebar } from './components/AdminSidebar';

// Pages
import { OverviewPage } from './pages/OverviewPage';
import { UsersPage } from './pages/UsersPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { AuditLogsPage } from './pages/AuditLogsPage';

const PlaceholderPage = ({ title }: { title: string }) => <div className="p-6"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-4 text-text-2">Trang này đang được phát triển.</p></div>;

const AppContent: React.FC = () => {
  // Vite sets base='/admin/', so pathname might be '/admin/' or '/admin/users'
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname || '/admin');

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/admin');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.scrollTo(0, 0);
  };

  const renderPage = () => {
    // Strip trailing slash for easier matching, except if it's exactly /admin/
    const normalized = currentPath.endsWith('/') && currentPath.length > 1 ? currentPath.slice(0, -1) : currentPath;

    if (normalized === '/admin') return <OverviewPage />;
    if (normalized === '/admin/users') return <UsersPage onNavigate={navigate} />;
    if (normalized.startsWith('/admin/users/')) {
      const id = normalized.split('/')[3];
      return <UserDetailPage userId={id} onNavigate={navigate} />;
    }
    if (normalized === '/admin/symbols') return <PlaceholderPage title="Cặp giao dịch" />;
    if (normalized === '/admin/futures') return <PlaceholderPage title="Hợp đồng Futures" />;
    if (normalized === '/admin/assets') return <PlaceholderPage title="Thông tin coin" />;
    if (normalized === '/admin/announcements') return <PlaceholderPage title="Thông báo" />;
    if (normalized === '/admin/invites') return <PlaceholderPage title="Mã mời" />;
    if (normalized === '/admin/settings') return <PlaceholderPage title="Cấu hình sàn" />;
    if (normalized === '/admin/audit-logs') return <AuditLogsPage />;
    if (normalized === '/admin/reconciliation') return <PlaceholderPage title="Đối soát" />;
    if (normalized === '/admin/roles') return <PlaceholderPage title="Vai trò" />;

    return <OverviewPage />;
  };

  return (
    <div className="flex flex-col h-screen bg-bg text-text font-sans overflow-hidden">
      <AdminHeader />
      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar currentPath={currentPath} onNavigate={navigate} />
        <main className="flex-1 overflow-y-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MarketProvider>
        <AppContent />
      </MarketProvider>
    </AuthProvider>
  );
};
