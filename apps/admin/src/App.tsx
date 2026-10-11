import React, { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { MarketProvider } from './context/MarketContext';
import { AdminHeader } from './components/AdminHeader';
import { AdminSidebar } from './components/AdminSidebar';

// Pages
import { OverviewPage } from './pages/OverviewPage';
import { UsersPage } from './pages/UsersPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { SymbolsPage } from './pages/SymbolsPage';
import { FuturesSymbolsPage } from './pages/FuturesSymbolsPage';
import { AssetsPage } from './pages/AssetsPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { InvitesPage } from './pages/InvitesPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { ReconciliationPage } from './pages/ReconciliationPage';
import { RolesPage } from './pages/RolesPage';

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
      const id = normalized.split('/')[3] ?? '';
      return <UserDetailPage userId={id} onNavigate={navigate} />;
    }
    if (normalized === '/admin/symbols') return <SymbolsPage />;
    if (normalized === '/admin/futures') return <FuturesSymbolsPage />;
    if (normalized === '/admin/assets') return <AssetsPage />;
    if (normalized === '/admin/announcements') return <AnnouncementsPage />;
    if (normalized === '/admin/invites') return <InvitesPage />;
    if (normalized === '/admin/settings') return <SettingsPage />;
    if (normalized === '/admin/audit-logs') return <AuditLogsPage />;
    if (normalized === '/admin/reconciliation') return <ReconciliationPage />;
    if (normalized === '/admin/roles') return <RolesPage />;

    return <OverviewPage />;
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--bg,#000000)] text-[var(--text,#f4f4f5)] font-sans overflow-hidden">
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
