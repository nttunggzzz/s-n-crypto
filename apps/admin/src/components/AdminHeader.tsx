import React from 'react';
import { appLinks } from '@cex/contracts';
import { useAuth } from '../context/AuthContext';
import { LogOut } from 'lucide-react';

export const AdminHeader: React.FC = () => {
  const { user } = useAuth();
  
  return (
    <header className="h-14 border-b border-line bg-panel flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-4">
        <div className="text-xl font-bold text-accent">CEX</div>
        <div className="text-text-2 font-medium">Quản trị</div>
      </div>
      <div className="flex items-center gap-4">
        <a 
          href={appLinks.exchange.home(import.meta.env.VITE_EXCHANGE_ORIGIN)}
          data-testid="admin-open-exchange"
          className="text-sm text-accent hover:underline"
        >
          Mở sàn
        </a>
        <div className="text-sm text-text-2">{user?.email} ({user?.role})</div>
      </div>
    </header>
  );
};
