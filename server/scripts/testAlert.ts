/**
 * Sends one test alert with the server's settings — run after setting TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID.
 *   npm run alert:test -w @cex/server        (on Railway: inside the container via `railway ssh`, from /app)
 */
import { loadConfig } from '../src/config.ts';
import { telegramSink } from '../src/ops/alerts.ts';

const config = loadConfig();
if (!config.TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set — alerts only go to the log.');
  process.exit(1);
}
const sink = telegramSink(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID);
await sink(`✅ [${config.ALERT_ENV_NAME || process.env.RAILWAY_ENVIRONMENT_NAME || config.NODE_ENV}] Thử cảnh báo: kênh Telegram của sàn hoạt động.`);
console.log('sent — check the Telegram chat');
