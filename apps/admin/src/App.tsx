import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
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
import { TaxManagementPage } from './pages/TaxManagementPage';
import { NoAccessPage } from './pages/NoAccessPage';

const AppContent: React.FC = () => {
  // Vite sets base='/admin/', so pathname might be '/admin/' or '/admin/users'
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname || '/admin');
  const { hasPerm } = useAuth();

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

    if (normalized === '/admin') {
      if (!hasPerm('exchange.read')) return <NoAccessPage />;
      return <OverviewPage onNavigate={navigate} />;
    }
    if (normalized === '/admin/tax') {
      if (!hasPerm('tax.read')) return <NoAccessPage />;
      return <TaxManagementPage />;
    }
    if (normalized === '/admin/users') {
      if (!hasPerm('users.read')) return <NoAccessPage />;
      return <UsersPage onNavigate={navigate} />;
    }
    if (normalized.startsWith('/admin/users/')) {
      if (!hasPerm('users.read')) return <NoAccessPage />;
      const id = normalized.split('/')[3] ?? '';
      return <UserDetailPage userId={id} onNavigate={navigate} />;
    }
    if (normalized === '/admin/symbols') {
      if (!hasPerm('exchange.read')) return <NoAccessPage />;
      return <SymbolsPage />;
    }
    if (normalized === '/admin/futures') {
      if (!hasPerm('exchange.read')) return <NoAccessPage />;
      return <FuturesSymbolsPage />;
    }
    if (normalized === '/admin/assets') {
      if (!hasPerm('exchange.read')) return <NoAccessPage />;
      return <AssetsPage />;
    }
    if (normalized === '/admin/announcements') {
      if (!hasPerm('exchange.read')) return <NoAccessPage />;
      return <AnnouncementsPage />;
    }
    if (normalized === '/admin/invites') {
      if (!hasPerm('users.invite')) return <NoAccessPage />;
      return <InvitesPage />;
    }
    if (normalized === '/admin/settings') {
      if (!hasPerm('exchange.read')) return <NoAccessPage />;
      return <SettingsPage />;
    }
    if (normalized === '/admin/audit-logs') {
      if (!hasPerm('audit.read')) return <NoAccessPage />;
      return <AuditLogsPage />;
    }
    if (normalized === '/admin/reconciliation') {
      if (!hasPerm('reconciliation.read')) return <NoAccessPage />;
      return <ReconciliationPage onNavigate={navigate} />;
    }
    if (normalized === '/admin/roles') {
      if (!hasPerm('users.roles')) return <NoAccessPage />;
      return <RolesPage />;
    }

    if (!hasPerm('exchange.read')) return <NoAccessPage />;
    return <OverviewPage onNavigate={navigate} />;
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
