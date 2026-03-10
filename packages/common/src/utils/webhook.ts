import { createLogger } from './logger.js';

const logger = createLogger('webhook');

/**
 * Send an alert message via webhook (Discord or Telegram).
 * Fire-and-forget — never throws.
 */
export async function sendAlert(webhookUrl: string, message: string): Promise<void> {
  try {
    const isDiscord = webhookUrl.includes('discord.com/api/webhooks');
    const isTelegram = webhookUrl.includes('api.telegram.org');

    let url = webhookUrl;
    let body: string;

    if (isTelegram) {
      // Telegram format: URL should be https://api.telegram.org/bot<TOKEN>/sendMessage
      // We append /sendMessage if not present
      if (!url.endsWith('/sendMessage')) {
        url = url.replace(/\/$/, '') + '/sendMessage';
      }
      // Extract chat_id from env or use a default query param approach
      // For simplicity, expect ALERT_WEBHOOK_URL to include chat_id as query param
      // e.g., https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>
      const urlObj = new URL(url);
      const chatId = urlObj.searchParams.get('chat_id');
      if (!chatId) {
        logger.warn('Telegram webhook URL missing chat_id query parameter');
        return;
      }
      urlObj.searchParams.delete('chat_id');
      body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' });
      url = urlObj.toString();
    } else if (isDiscord) {
      body = JSON.stringify({ content: message });
    } else {
      // Generic webhook — send as JSON with message field
      body = JSON.stringify({ text: message, message });
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status, url: webhookUrl.slice(0, 50) }, 'Webhook request failed');
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn({ error: msg }, 'Failed to send webhook alert');
  }
}
