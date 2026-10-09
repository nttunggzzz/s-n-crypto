import type { ErrorCode } from '@cex/contracts';

/**
 * Mapping all 25 business error codes from @cex/contracts to friendly Vietnamese messages.
 */
export const ERROR_MESSAGES: Record<ErrorCode | string, string> = {
  INVALID_INPUT: 'Dữ liệu nhập vào không hợp lệ hoặc thiếu thông tin.',
  UNAUTHENTICATED: 'Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn.',
  UNAUTHORIZED: 'Bạn không có quyền thực hiện thao tác này.',
  EMAIL_NOT_VERIFIED: 'Vui lòng xác minh địa chỉ email trước khi thực hiện giao dịch này.',
  EMAIL_ALREADY_EXISTS: 'Địa chỉ email này đã được đăng ký tài khoản.',
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không chính xác.',
  INVALID_TOKEN: 'Mã xác thực không hợp lệ hoặc đã qua sử dụng.',
  TOKEN_EXPIRED: 'Mã xác thực đã hết hạn. Vui lòng yêu cầu mã mới.',
  RATE_LIMITED: 'Bạn đang thao tác quá nhanh. Vui lòng thử lại sau giây lát.',
  CAPTCHA_FAILED: 'Xác thực bảo vệ captcha không thành công. Vui lòng thử lại.',
  INSUFFICIENT_BALANCE: 'Số dư khả dụng trong ví không đủ để thực hiện lệnh.',
  INSUFFICIENT_LIQUIDITY: 'Thanh khoản sổ lệnh hiện tại không đủ để khớp lệnh thị trường này.',
  INVALID_PRICE: 'Mức giá đặt lệnh không hợp lệ (phải lớn hơn 0).',
  PRICE_TICK_SIZE: 'Mức giá không tuân thủ bước giá tối thiểu của cặp giao dịch.',
  INVALID_QUANTITY: 'Khối lượng đặt lệnh không hợp lệ (phải lớn hơn 0).',
  QUANTITY_STEP_SIZE: 'Khối lượng không tuân thủ bước khối lượng của cặp giao dịch.',
  QUANTITY_TOO_SMALL: 'Khối lượng đặt lệnh nhỏ hơn mức tối thiểu cho phép.',
  QUANTITY_TOO_LARGE: 'Khối lượng đặt lệnh vượt quá giới hạn tối đa của sàn.',
  NOTIONAL_TOO_SMALL: 'Giá trị lệnh (Giá × Khối lượng) nhỏ hơn giá trị tối thiểu cho phép.',
  ORDER_NOT_FOUND: 'Không tìm thấy lệnh yêu cầu.',
  ORDER_ALREADY_CLOSED: 'Lệnh này đã được khớp hoặc đã bị hủy trước đó.',
  DUPLICATE_CLIENT_ORDER_ID: 'Yêu cầu đặt lệnh bị trùng lặp.',
  TRADING_HALTED: 'Sàn giao dịch hiện đang tạm dừng hoạt động khẩn cấp.',
  FAUCET_COOLDOWN: 'Bạn đang trong thời gian chờ giữa các lần nạp tiền thử nghiệm.',
  FAUCET_CAP_REACHED: 'Bạn đã đạt hạn mức nạp tiền thử nghiệm trọn đời (100.000 USDT).',
  INTERNAL_ERROR: 'Lỗi máy chủ nội bộ. Vui lòng thử lại sau.',
};

export function getErrorMessage(code: string, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.'): string {
  return ERROR_MESSAGES[code] || fallback;
}
