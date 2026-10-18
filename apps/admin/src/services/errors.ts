import { ApiError, type ErrorCode } from '@cex/contracts';

export const ADMIN_ERROR_MESSAGES: Partial<Record<ErrorCode | string, string>> = {
  VALIDATION_ERROR: 'Dữ liệu nhập vào không hợp lệ hoặc thiếu thông tin.',
  UNAUTHENTICATED: 'Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  NOT_FOUND: 'Không tìm thấy tài nguyên yêu cầu.',
  RATE_LIMITED: 'Quá nhiều yêu cầu. Vui lòng thử lại sau giây lát.',
  CONFLICT: 'Thao tác không thực hiện được do xung đột dữ liệu hoặc trạng thái đã thay đổi.',
  INTERNAL_ERROR: 'Lỗi máy chủ nội bộ. Vui lòng thử lại sau.',
  BOT_ACCOUNT_PROTECTED: 'Tài khoản bot hệ thống được bảo vệ, không thể sửa đổi.',
  TWO_FACTOR_REQUIRED: 'Tài khoản quản trị bắt buộc phải bật xác thực hai yếu tố (2FA).',
  INVALID_TWO_FACTOR_CODE: 'Mã xác thực 2FA không chính xác hoặc đã hết hạn.',
  INSUFFICIENT_BALANCE: 'Số dư khả dụng không đủ để thực hiện điều chỉnh giảm.',
  TRADING_HALTED: 'Sàn giao dịch hiện đang tạm dừng hoạt động.',
};

export function formatApiError(err: unknown, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.'): string {
  if (err instanceof ApiError || (typeof err === 'object' && err !== null && 'code' in err)) {
    const apiErr = err as { code?: string; message?: string; details?: Record<string, unknown>; status?: number };
    const code = apiErr.code;
    const msg = apiErr.message || '';

    // Check specific known message patterns from server
    if (msg.includes('equal or higher role')) {
      return 'Không được phép thao tác trên tài khoản có vai trò ngang hoặc cao hơn.';
    }
    if (msg.includes('own account')) {
      return 'Không thể thực hiện thao tác này trên chính tài khoản của bạn.';
    }
    if (msg.includes('last owner')) {
      return 'Không thể giáng cấp tài khoản Owner cuối cùng của hệ thống.';
    }
    if (msg.includes('change at least one field')) {
      return 'Vui lòng thay đổi ít nhất một trường thông tin trước khi lưu.';
    }
    if (msg.includes('Debit larger than')) {
      const avail = apiErr.details?.available ? ` (khả dụng: ${apiErr.details.available})` : '';
      return `Số tiền trừ lớn hơn số dư khả dụng${avail}.`;
    }

    if (code && ADMIN_ERROR_MESSAGES[code]) {
      return ADMIN_ERROR_MESSAGES[code]!;
    }

    if (apiErr.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (apiErr.status === 404) return 'Không tìm thấy đối tượng yêu cầu.';
    if (apiErr.status === 429) return 'Quá nhiều yêu cầu. Vui lòng thử lại sau.';
    if (msg) return msg;
  }

  if (err instanceof Error && err.message) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.';
    }
    return err.message;
  }

  return fallback;
}

export const getErrorMessage = formatApiError;

