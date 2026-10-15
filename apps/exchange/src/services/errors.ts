import { ApiError, type ErrorCode } from '@cex/contracts';

/**
 * Mapping error codes from @cex/contracts to friendly Vietnamese messages.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // Generic
  VALIDATION_ERROR: 'Dữ liệu nhập vào không hợp lệ hoặc thiếu thông tin.',
  UNAUTHENTICATED: 'Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  NOT_FOUND: 'Không tìm thấy tài nguyên yêu cầu.',
  RATE_LIMITED: 'Bạn đang thao tác quá nhanh. Vui lòng thử lại sau giây lát.',
  CONFLICT: 'Thao tác không thực hiện được vì trạng thái đã thay đổi. Vui lòng tải lại.',
  INTERNAL_ERROR: 'Lỗi máy chủ nội bộ. Vui lòng thử lại sau.',

  // Account & Auth
  EMAIL_NOT_VERIFIED: 'Vui lòng xác minh địa chỉ email trước khi thực hiện giao dịch này.',
  ACCOUNT_LOCKED: 'Tài khoản của bạn đã bị khóa.',
  INVALID_INVITE: 'Mã mời không đúng hoặc không hợp lệ.',
  TWO_FACTOR_REQUIRED: 'Yêu cầu xác thực hai yếu tố (2FA).',
  INVALID_TWO_FACTOR_CODE: 'Mã xác thực 2FA không chính xác hoặc đã hết hạn.',
  BOT_ACCOUNT_PROTECTED: 'Tài khoản bot được bảo vệ, không thể sửa đổi.',

  // Exchange State
  TRADING_HALTED: 'Sàn giao dịch hiện đang tạm dừng hoạt động khẩn cấp.',
  SYMBOL_DISABLED: 'Cặp giao dịch đang tạm ngưng.',
  MARKET_DATA_STALE: 'Dữ liệu thị trường hiện bị gián đoạn.',

  // Order Validation
  INVALID_PRICE: 'Mức giá đặt lệnh không hợp lệ (phải lớn hơn 0).',
  PRICE_TICK_SIZE: 'Mức giá không tuân thủ bước giá tối thiểu của cặp giao dịch.',
  INVALID_QUANTITY: 'Khối lượng đặt lệnh không hợp lệ (phải lớn hơn 0).',
  QUANTITY_STEP_SIZE: 'Khối lượng không tuân thủ bước khối lượng của cặp giao dịch.',
  QUANTITY_TOO_SMALL: 'Khối lượng đặt lệnh nhỏ hơn mức tối thiểu cho phép.',
  QUANTITY_TOO_LARGE: 'Khối lượng đặt lệnh vượt quá giới hạn tối đa của sàn.',
  NOTIONAL_TOO_SMALL: 'Giá trị lệnh (Giá × Khối lượng) nhỏ hơn giá trị tối thiểu cho phép.',
  INVALID_STOP_PRICE: 'Mức giá kích hoạt Stop không hợp lệ.',
  INVALID_OCO_PRICES: 'Mức giá OCO không thỏa mãn điều kiện khớp.',
  INVALID_TPSL: 'Mức giá chốt lời/cắt lỗ không hợp lệ.',
  INVALID_TRAILING_DELTA: 'Biên độ Trailing Stop không hợp lệ.',
  LIMIT_EXCEEDED: 'Đã vượt quá số lượng lệnh mở hoặc cảnh báo cho phép.',

  // Futures & Bots
  LEVERAGE_LOCKED: 'Đòn bẩy đang bị khóa do có vị thế hoặc lệnh mở.',
  INVALID_LEVERAGE: 'Mức đòn bẩy không hợp lệ.',
  REDUCE_ONLY_REJECTED: 'Lệnh chỉ giảm vị thế bị từ chối do không có vị thế đối ứng.',
  MARGIN_TOO_LOW: 'Ký quỹ không đủ duy trì vị thế.',
  INVALID_GRID: 'Thông số bot lưới không hợp lệ.',

  // Execution
  INSUFFICIENT_BALANCE: 'Số dư khả dụng trong ví không đủ để thực hiện lệnh.',
  INSUFFICIENT_LIQUIDITY: 'Thanh khoản sổ lệnh hiện tại không đủ để khớp lệnh thị trường này.',
  ORDER_NOT_CANCELABLE: 'Lệnh này không thể hủy ở trạng thái hiện tại.',
  DUPLICATE_CLIENT_ORDER_ID: 'Yêu cầu đặt lệnh bị trùng lặp.',

  // Faucet
  FAUCET_COOLDOWN: 'Bạn đang trong thời gian chờ giữa các lần nạp tiền thử nghiệm.',
  FAUCET_CAP_REACHED: 'Bạn đã đạt hạn mức nạp tiền thử nghiệm trọn đời (100.000 USDT).',

  // Uploads
  PAYLOAD_TOO_LARGE: 'Dung lượng tệp hoặc dữ liệu gửi lên vượt quá giới hạn cho phép.',
  UNSUPPORTED_MEDIA_TYPE: 'Định dạng tệp không được hỗ trợ.',
};

export function getErrorMessage(code: string, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.'): string {
  return (ERROR_MESSAGES as Record<string, string>)[code] || fallback;
}

/**
 * Format structured ApiError with details into user-friendly Vietnamese messages.
 */
export function formatApiError(
  err: unknown,
  fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.',
  overrides?: Partial<Record<ErrorCode, string>>
): string {
  // Check for ApiError or duck-typed API error object
  const isApiErr = err instanceof ApiError || (typeof err === 'object' && err !== null && 'code' in err);
  if (isApiErr) {
    const apiErr = err as { code: string; details?: Record<string, unknown> };
    const code = apiErr.code as ErrorCode;

    if (overrides && code in overrides && overrides[code]) {
      return overrides[code]!;
    }

    if (apiErr.code === 'INVALID_INVITE') {
      const reason = (apiErr.details as { reason?: string } | undefined)?.reason;
      switch (reason) {
        case 'MISSING':
          return 'Cần mã mời để đăng ký';
        case 'UNKNOWN':
          return 'Mã mời không đúng';
        case 'EXPIRED':
          return 'Mã mời đã hết hạn';
        case 'USED_UP':
          return 'Mã mời đã được dùng hết';
        case 'REVOKED':
          return 'Mã mời đã bị thu hồi';
        default:
          return 'Mã mời không đúng hoặc không hợp lệ';
      }
    }

    if (apiErr.code === 'RATE_LIMITED' && apiErr.details && typeof apiErr.details.retryAfterSeconds === 'number') {
      return `Bạn đang thao tác quá nhanh. Thử lại sau ${apiErr.details.retryAfterSeconds} giây.`;
    }

    if (apiErr.code === 'VALIDATION_ERROR') {
      const field = (apiErr.details as { field?: string } | undefined)?.field;
      if (field === 'captchaToken') {
        return 'Xác thực bảo vệ captcha không thành công. Vui lòng thử lại.';
      }
      if (field === 'inviteCode') {
        return 'Mã mời không hợp lệ (phải từ 4 đến 40 ký tự).';
      }
      if (field === 'email') {
        return 'Địa chỉ email không hợp lệ.';
      }
      if (field === 'password') {
        return 'Mật khẩu phải chứa ít nhất 8 ký tự.';
      }
    }

    return getErrorMessage(apiErr.code, fallback);
  }

  // Network / fetch errors
  if (err instanceof Error) {
    const msg = err.message || '';
    if (/failed to fetch/i.test(msg) || /network/i.test(msg) || err.name === 'TypeError') {
      return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.';
    }
    // Don't leak stack traces or raw technical internals
    if (/status of 5\d\d/i.test(msg) || /internal/i.test(msg)) {
      return 'Lỗi máy chủ nội bộ. Vui lòng thử lại sau.';
    }
    return msg;
  }

  return fallback;
}
