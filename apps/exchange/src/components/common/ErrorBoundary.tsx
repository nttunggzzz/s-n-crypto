import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircleIcon, Button } from '@cex/ui';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[50vh] text-center">
          <div className="w-16 h-16 rounded-2xl bg-[var(--down,#f2475f)]/10 border border-[var(--down,#f2475f)]/20 text-[var(--down,#f2475f)] flex items-center justify-center mb-4">
            <AlertCircleIcon size={32} />
          </div>
          <h2 className="text-xl font-bold text-[var(--text,#f4f4f5)] mb-2">
            Đã xảy ra lỗi không mong muốn
          </h2>
          <p className="text-sm text-[var(--text-3,#63636b)] max-w-md mb-6 leading-relaxed">
            Ứng dụng gặp sự cố trong quá trình kết xuất giao diện. Bạn có thể làm mới trang để tiếp tục.
          </p>
          <Button variant="primary" onClick={this.handleReset}>
            Tải lại trang
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
