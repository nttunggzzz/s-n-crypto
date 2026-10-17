import { describe, it, expect } from 'vitest';
import { ApiError } from '@cex/contracts';
import { formatApiError, getErrorMessage } from './errors.ts';

describe('formatApiError', () => {
  it('formats INVALID_INVITE error codes with detailed reasons', () => {
    expect(formatApiError(new ApiError(400, 'INVALID_INVITE', 'Refused', { reason: 'MISSING' }))).toBe('Cần mã mời để đăng ký');
    expect(formatApiError(new ApiError(400, 'INVALID_INVITE', 'Refused', { reason: 'UNKNOWN' }))).toBe('Mã mời không đúng');
    expect(formatApiError(new ApiError(400, 'INVALID_INVITE', 'Refused', { reason: 'EXPIRED' }))).toBe('Mã mời đã hết hạn');
    expect(formatApiError(new ApiError(400, 'INVALID_INVITE', 'Refused', { reason: 'USED_UP' }))).toBe('Mã mời đã được dùng hết');
    expect(formatApiError(new ApiError(400, 'INVALID_INVITE', 'Refused', { reason: 'REVOKED' }))).toBe('Mã mời đã bị thu hồi');
  });

  it('formats CONFLICT error code as generic state conflict by default', () => {
    expect(formatApiError(new ApiError(409, 'CONFLICT', 'Conflict'))).toBe(
      'Thao tác không thực hiện được vì trạng thái đã thay đổi. Vui lòng tải lại.'
    );
  });

  it('supports context-specific overrides for login and registration', () => {
    expect(
      formatApiError(new ApiError(401, 'UNAUTHENTICATED', 'Bad password'), 'Fallback', {
        UNAUTHENTICATED: 'Email hoặc mật khẩu không đúng.',
      })
    ).toBe('Email hoặc mật khẩu không đúng.');

    expect(
      formatApiError(new ApiError(409, 'CONFLICT', 'Conflict'), 'Fallback', {
        CONFLICT: 'Địa chỉ email này đã được đăng ký tài khoản.',
      })
    ).toBe('Địa chỉ email này đã được đăng ký tài khoản.');
  });

  it('formats RATE_LIMITED error code with retryAfterSeconds', () => {
    expect(formatApiError(new ApiError(429, 'RATE_LIMITED', 'Too many requests', { retryAfterSeconds: 30 }))).toBe(
      'Bạn đang thao tác quá nhanh. Thử lại sau 30 giây.'
    );
  });

  it('formats VALIDATION_ERROR field-specific errors', () => {
    expect(formatApiError(new ApiError(400, 'VALIDATION_ERROR', 'Validation', { field: 'captchaToken' }))).toBe(
      'Xác thực bảo vệ captcha không thành công. Vui lòng thử lại.'
    );
    expect(formatApiError(new ApiError(400, 'VALIDATION_ERROR', 'Validation', { field: 'inviteCode' }))).toBe(
      'Mã mời không hợp lệ (phải từ 4 đến 40 ký tự).'
    );
  });

  it('translates network TypeError into user-friendly Vietnamese', () => {
    expect(formatApiError(new TypeError('Failed to fetch'))).toBe(
      'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.'
    );
  });

  it('handles duck-typed API errors seamlessly', () => {
    const duckTyped = { code: 'INVALID_INVITE', details: { reason: 'EXPIRED' } };
    expect(formatApiError(duckTyped)).toBe('Mã mời đã hết hạn');
  });

  it('falls back to custom fallback if error is unknown', () => {
    expect(formatApiError(null, 'Tùy chỉnh lỗi')).toBe('Tùy chỉnh lỗi');
  });

  describe('S-01 Futures error formatting', () => {
    it('formats INSUFFICIENT_BALANCE for FUTURES account', () => {
      const err = new ApiError(400, 'INSUFFICIENT_BALANCE', 'Insufficient', {
        account: 'FUTURES',
        asset: 'USDT',
        available: '100',
        required: '150',
      });
      expect(formatApiError(err)).toBe('Ví Futures không đủ USDT: cần thêm ~50,00 USDT (ký quỹ + phí). Khả dụng: 100,00 USDT.');

      // With context override
      expect(
        formatApiError(err, undefined, undefined, {
          needed: '70.5',
          available: '100',
        })
      ).toBe('Ví Futures không đủ USDT: cần thêm ~70,50 USDT (ký quỹ + phí). Khả dụng: 100,00 USDT.');

      // Non-FUTURES fallback
      const spotErr = new ApiError(400, 'INSUFFICIENT_BALANCE', 'Insufficient', { account: 'SPOT' });
      expect(formatApiError(spotErr)).toBe('Số dư khả dụng trong ví không đủ để thực hiện lệnh.');
    });

    it('formats NOTIONAL_TOO_SMALL', () => {
      const err = new ApiError(400, 'NOTIONAL_TOO_SMALL', 'Too small', { minNotional: '5' });
      expect(formatApiError(err)).toBe('Giá trị lệnh tối thiểu 5 USDT.');
      expect(formatApiError(err, undefined, undefined, { currentNotional: '3.2' })).toBe('Giá trị lệnh tối thiểu 5 USDT (hiện 3.2 USDT).');
    });

    it('formats INVALID_LEVERAGE', () => {
      const err = new ApiError(400, 'INVALID_LEVERAGE', 'Invalid leverage', { maxLeverage: 20 });
      expect(formatApiError(err, undefined, undefined, { symbol: 'BTCUSDT' })).toBe('Đòn bẩy tối đa của BTCUSDT là 20x.');
      expect(formatApiError(err)).toBe('Đòn bẩy tối đa của cặp giao dịch là 20x.');
    });

    it('formats LEVERAGE_LOCKED', () => {
      const err = new ApiError(400, 'LEVERAGE_LOCKED', 'Locked');
      expect(formatApiError(err)).toBe('Không đổi được đòn bẩy khi còn vị thế hoặc lệnh chờ trên cặp giao dịch này.');
      expect(
        formatApiError(err, undefined, undefined, {
          positionQty: '0.5',
          baseAsset: 'BTC',
          openOrdersCount: 2,
          symbol: 'BTCUSDT',
        })
      ).toBe('Không đổi được đòn bẩy khi còn vị thế 0.5 BTC hoặc 2 lệnh chờ trên BTCUSDT.');
    });

    it('formats INVALID_TPSL for BUY, SELL, and default', () => {
      const err = new ApiError(400, 'INVALID_TPSL', 'Bad TP/SL', { markPrice: '80000' });
      expect(formatApiError(err, undefined, undefined, { side: 'BUY' })).toBe('Chốt lời phải cao hơn và cắt lỗ thấp hơn giá mark 80000.');
      expect(formatApiError(err, undefined, undefined, { side: 'SELL' })).toBe('Chốt lời phải thấp hơn và cắt lỗ cao hơn giá mark 80000.');
      expect(formatApiError(err)).toBe('Long: Chốt lời phải cao hơn và cắt lỗ thấp hơn giá mark 80000 (Short: ngược lại).');
    });

    it('formats INSUFFICIENT_LIQUIDITY', () => {
      const err = new ApiError(400, 'INSUFFICIENT_LIQUIDITY', 'No liquidity');
      expect(formatApiError(err)).toBe('Thanh khoản sổ lệnh hiện tại không đủ để khớp lệnh thị trường này.');
      expect(formatApiError(err, undefined, undefined, { maxQty: '0.15', baseAsset: 'BTC' })).toBe(
        'Sổ lệnh hiện chỉ khớp được khoảng 0.15 BTC — giảm khối lượng hoặc dùng lệnh Giới hạn.'
      );
    });

    it('formats MARKET_DATA_STALE, TRADING_HALTED, SYMBOL_DISABLED', () => {
      expect(formatApiError(new ApiError(400, 'MARKET_DATA_STALE', 'Stale'))).toBe(
        'Dữ liệu thị trường hiện bị gián đoạn; tạm ngưng giao dịch.'
      );
      expect(formatApiError(new ApiError(400, 'TRADING_HALTED', 'Halted'))).toBe(
        'Sàn giao dịch hiện đang tạm dừng hoạt động khẩn cấp.'
      );
      expect(formatApiError(new ApiError(400, 'SYMBOL_DISABLED', 'Disabled'))).toBe(
        'Cặp giao dịch đang tạm ngưng.'
      );
    });

    it('handles non-ApiError instances of Error', () => {
      const err = new Error('Lỗi tính toán ký quỹ bất thường');
      expect(formatApiError(err)).toBe('Không gửi được lệnh: Lỗi tính toán ký quỹ bất thường');
    });
  });
});

describe('getErrorMessage', () => {
  it('returns Vietnamese message for known error code', () => {
    expect(getErrorMessage('EMAIL_NOT_VERIFIED')).toBe('Vui lòng xác minh địa chỉ email trước khi thực hiện giao dịch này.');
    expect(getErrorMessage('INSUFFICIENT_BALANCE')).toBe('Số dư khả dụng trong ví không đủ để thực hiện lệnh.');
  });
});
