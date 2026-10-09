import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  // Never log secrets.
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.newPassword', '*.currentPassword', '*.token'],
    censor: '[redacted]',
  },
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});

export type Logger = typeof logger;
