import React, { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext.tsx';
import { MarketProvider, useMarket } from './context/MarketContext.tsx';
import { Header } from './components/Header.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { DevToolbar } from './components/DevToolbar.tsx';
import { ToastProvider, SimulatedBanner } from '@cex/ui';

// Pages
import { MarketsPage } from './pages/MarketsPage.tsx';
import { TradePage } from './pages/TradePage.tsx';
import { WalletPage } from './pages/WalletPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import {
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './pages/AuthPages.tsx';
import { UiShowcasePage } from './pages/UiShowcasePage.tsx';

const AppContent: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname || '/markets');
  const { tradingHalted } = useMarket();

  // Handle popstate (browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/markets');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.scrollTo(0, 0);
  };

  // Render current route
  const renderPage = () => {
    if (currentPath === '/markets') {
      return <MarketsPage onNavigate={navigate} />;
    }
    if (currentPath.startsWith('/trade')) {
      const parts = currentPath.split('/');
      const symbol = parts[2] || 'BTCUSDT';
      return <TradePage symbolParam={symbol} onNavigate={navigate} />;
    }
    if (currentPath === '/wallet') {
      return <WalletPage onNavigate={navigate} />;
    }
    if (currentPath === '/settings') {
      return <SettingsPage onNavigate={navigate} />;
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
      return <UiShowcasePage />;
    }

    // Default route -> redirect to trade
    return <TradePage symbolParam="BTCUSDT" onNavigate={navigate} />;
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--color-bg-base,#08090c)] text-[var(--color-text-primary,#f3f4f6)] font-sans">
      {/* Top Simulated Banner */}
      <SimulatedBanner tradingHalted={tradingHalted} />

      {/* Main Header */}
      <Header currentPath={currentPath} onNavigate={navigate} />

      {/* Page Content */}
      <main className="flex-1 w-full flex flex-col">{renderPage()}</main>

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
      <AuthProvider>
        <MarketProvider>
          <AppContent />
        </MarketProvider>
      </AuthProvider>
    </ToastProvider>
  );
};
