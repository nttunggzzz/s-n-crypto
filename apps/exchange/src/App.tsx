import React, { useState, useEffect, Suspense, lazy } from 'react';
import { ConfigProvider } from './context/ConfigContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { MarketProvider, useMarket } from './context/MarketContext.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { Header } from './components/Header.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { DevToolbar } from './components/DevToolbar.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { AiAssistantWidget } from './components/AiAssistantWidget.tsx';
import { ToastProvider, SimulatedBanner } from '@cex/ui';

// Lazy-loaded Pages for route code-splitting
const MarketsPage = lazy(() => import('./pages/MarketsPage.tsx').then((m) => ({ default: m.MarketsPage })));
const TradePage = lazy(() => import('./pages/TradePage.tsx').then((m) => ({ default: m.TradePage })));
const FuturesPage = lazy(() => import('./pages/FuturesPage.tsx').then((m) => ({ default: m.FuturesPage })));
const WalletPage = lazy(() => import('./pages/WalletPage.tsx').then((m) => ({ default: m.WalletPage })));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage.tsx').then((m) => ({ default: m.PortfolioPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })));
const BotsPage = lazy(() => import('./pages/BotsPage.tsx').then((m) => ({ default: m.BotsPage })));
const PnlAnalysisPage = lazy(() => import('./pages/PnlAnalysisPage.tsx').then((m) => ({ default: m.PnlAnalysisPage })));
const LoginPage = lazy(() => import('./pages/AuthPages.tsx').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/AuthPages.tsx').then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('./pages/AuthPages.tsx').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/AuthPages.tsx').then((m) => ({ default: m.ResetPasswordPage })));
const VerifyEmailPage = lazy(() => import('./pages/AuthPages.tsx').then((m) => ({ default: m.VerifyEmailPage })));
const AccountTaxPage = lazy(() => import('./pages/AccountTaxPage.tsx').then((m) => ({ default: m.AccountTaxPage })));
const UiShowcasePage = lazy(() => import('./pages/UiShowcasePage.tsx').then((m) => ({ default: m.UiShowcasePage })));

const AppContent: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return (window.location.pathname || '/markets') + (window.location.hash || '');
    }
    return '/markets';
  });
  const { tradingHalted } = useMarket();

  // Handle popstate & hashchange (browser back/forward & hash links)
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath((window.location.pathname || '/markets') + (window.location.hash || ''));
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    if (!path.includes('#')) {
      window.scrollTo(0, 0);
    }
  };

  // Render current route
  const renderPage = () => {
    const pathname = currentPath.split('#')[0] || '/';
    if (pathname === '/markets') {
      return <MarketsPage onNavigate={navigate} />;
    }
    if (pathname.startsWith('/trade')) {
      const parts = pathname.split('/');
      const symbol = parts[2] || 'BTCUSDT';
      return <TradePage symbolParam={symbol} onNavigate={navigate} />;
    }
    if (pathname.startsWith('/futures')) {
      const parts = pathname.split('/');
      const symbol = parts[2] || 'BTCUSDT';
      return <FuturesPage symbolParam={symbol} onNavigate={navigate} />;
    }
    if (pathname === '/portfolio') {
      return <PortfolioPage onNavigate={navigate} />;
    }
    if (pathname === '/assets/analysis') {
      return <PnlAnalysisPage onNavigate={navigate} />;
    }
    if (pathname === '/assets' || pathname === '/wallet') {
      if (pathname === '/wallet') {
        const hash = currentPath.includes('#') ? '#' + currentPath.split('#')[1] : '';
        window.history.replaceState({}, '', '/assets' + hash);
      }
      return <WalletPage onNavigate={navigate} />;
    }
    if (currentPath.startsWith('/bots')) {
      return <BotsPage onNavigate={navigate} />;
    }
    if (currentPath === '/settings') {
      return <SettingsPage onNavigate={navigate} />;
    }
    if (currentPath === '/account/tax') {
      return <AccountTaxPage onNavigate={navigate} />;
    }
    if (currentPath === '/login') {
      return <LoginPage onNavigate={navigate} />;
    }
    if (currentPath === '/register') {
      return <RegisterPage onNavigate={navigate} />;
    }
    if (currentPath === '/forgot-password') {
      return <ForgotPasswordPage onNavigate={navigate} />;
    }
    if (currentPath.startsWith('/reset-password')) {
      return <ResetPasswordPage onNavigate={navigate} />;
    }
    if (currentPath.startsWith('/verify-email')) {
      return <VerifyEmailPage onNavigate={navigate} />;
    }
    if (currentPath === '/__ui') {
      if (import.meta.env.DEV) {
        return <UiShowcasePage />;
      }
      return <MarketsPage onNavigate={navigate} />;
    }

    // Default route -> redirect to markets
    return <MarketsPage onNavigate={navigate} />;
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans">
      {/* Top Simulated Banner */}
      <SimulatedBanner tradingHalted={tradingHalted} />

      {/* Main Header */}
      <Header currentPath={currentPath} onNavigate={navigate} />
      
      <CommandPalette onNavigate={navigate} />

      {/* Page Content */}
      <main className="flex-1 w-full flex flex-col">
        <ErrorBoundary key={currentPath}>
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center p-12">
                <div className="w-8 h-8 border-2 border-[var(--accent,#818cf8)] border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            {renderPage()}
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* AI Assistant Chatbot for New Users */}
      <AiAssistantWidget onNavigate={navigate} />

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav currentPath={currentPath} onNavigate={navigate} />

      {/* Development Mock Scenario Toolbar */}
      <DevToolbar />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <ConfigProvider>
        <AuthProvider>
          <MarketProvider>
            <AppContent />
          </MarketProvider>
        </AuthProvider>
      </ConfigProvider>
    </ToastProvider>
  );
};
