/** Telegram.gs - helper Telegram (GLOBAL) */

function tgGetConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    token: props.getProperty('TG_BOT_TOKEN') || '',
    chatId: props.getProperty('TG_CHAT_ID') || ''
  };
}

function tgSendMessage_(text) {
  const cfg = tgGetConfig_();
  if (!cfg.token || !cfg.chatId) {
    throw new Error('TG_BOT_TOKEN atau TG_CHAT_ID belum di-set di Script Properties.');
  }

  const url = `https://api.telegram.org/bot${cfg.token}/sendMessage`;
  const payload = {
    chat_id: cfg.chatId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Telegram sendMessage gagal: HTTP ' + code + ' ' + res.getContentText());
  }

  return { ok: true };
}
