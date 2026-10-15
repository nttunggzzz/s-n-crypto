import { ApiError } from '@cex/contracts';

export function formatApiError(err: unknown, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.'): string {
  if (err instanceof ApiError) {
    if (err.status === 403 || err.code === 'FORBIDDEN') return 'Bạn không có quyền thực hiện thao tác này.';
    if (err.status === 429 || err.code === 'RATE_LIMITED') return 'Quá nhiều yêu cầu. Vui lòng thử lại sau.';
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

export const getErrorMessage = formatApiError;

