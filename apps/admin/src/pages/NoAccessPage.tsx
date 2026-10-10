import React from 'react';
import { appLinks } from '@cex/contracts';

const NoAccessPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg text-text" data-testid="admin-no-access">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Tài khoản không có quyền quản trị</h1>
        <a href={appLinks.exchange.home(import.meta.env.VITE_EXCHANGE_ORIGIN)} className="text-accent hover:underline">
          Quay lại sàn
        </a>
      </div>
    </div>
  );
};
export default NoAccessPage;
