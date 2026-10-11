import React, { useState, useEffect } from 'react';
import { getApiClient } from '../services/api';
import type { AuditLogEntry } from '@cex/contracts';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const api = getApiClient();

  useEffect(() => {
    api.adminAuditLogs({ query: { limit: 50 } }).then((res) => setLogs(res.items)).catch(() => {});
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Nhật ký quản trị</h1>
      
      <div className="bg-panel border border-line rounded overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-line/50">
            <tr>
              <th className="px-4 py-3 font-medium text-text-2">Thời gian</th>
              <th className="px-4 py-3 font-medium text-text-2">Người thực hiện</th>
              <th className="px-4 py-3 font-medium text-text-2">Hành động</th>
              <th className="px-4 py-3 font-medium text-text-2">Mục tiêu</th>
              <th className="px-4 py-3 font-medium text-text-2">Lý do</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} data-testid="audit-row" className="border-t border-line hover:bg-line/30">
                <td className="px-4 py-3 text-text-2">{new Date(l.createdAt).toLocaleString('vi-VN')}</td>
                <td className="px-4 py-3 font-medium">{l.actor?.email ?? '(hệ thống)'}</td>
                <td className="px-4 py-3"><span className="px-2 py-1 bg-line rounded text-xs">{l.action}</span></td>
                <td className="px-4 py-3">{l.targetId || '-'}</td>
                <td className="px-4 py-3 text-text-2">{l.reason}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-2">Chưa có dữ liệu</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
