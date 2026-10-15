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
});

describe('getErrorMessage', () => {
  it('returns Vietnamese message for known error code', () => {
    expect(getErrorMessage('EMAIL_NOT_VERIFIED')).toBe('Vui lòng xác minh địa chỉ email trước khi thực hiện giao dịch này.');
    expect(getErrorMessage('INSUFFICIENT_BALANCE')).toBe('Số dư khả dụng trong ví không đủ để thực hiện lệnh.');
  });
});
