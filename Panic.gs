/** Panic.gs - Fase 2.5 Panic Button (log + Telegram via Telegram.gs) */

function sendPanic(token, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = requireAuth_(token, ['admin','komandan','security','cs','driver']);
    const u = ctx.user;

    if (!u.id_personil) {
      return { ok: false, message: 'Akun belum terhubung ke id_personil.' };
    }

    payload = payload || {};
    const note = String(payload.note || payload.keterangan || '').trim().slice(0, 500);
    const lat = payload.lat != null ? String(payload.lat) : '';
    const lng = payload.lng != null ? String(payload.lng) : '';
    const acc = payload.accuracy != null ? String(payload.accuracy) : '';
    const deviceInfo = payload.device_info ? String(payload.device_info).slice(0, 200) : '';

    const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
    const now = new Date();
    const tanggal = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const jam = Utilities.formatDate(now, tz, 'HH:mm:ss');
    const ts = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');

    const id_panic = nextId_('PNC', tanggal.replaceAll('-', ''));

    // --- simpan ke LogEmergency ---
    const sh = getSheet_('LogEmergency');
    const map = getHeaderMapPanic_(sh);

    appendPanicRow_(sh, map, {
      id_panic,
      timestamp: ts,
      tanggal,
      jam,
      id_personil: u.id_personil,
      nama: u.nama || '',
      role: u.role || '',
      lokasi_site: u.lokasi_site_default || '',
      note,
      lat,
      lng,
      accuracy: acc,
      device_info: deviceInfo,
      status: 'OPEN'
    });

    // --- Telegram (opsional) via Telegram.gs ---
    const tg = sendTelegramPanicViaHelper_({
      id_panic,
      timestamp: ts,
      tanggal,
      jam,
      id_personil: u.id_personil,
      nama: u.nama || '',
      role: u.role || '',
      lokasi_site: u.lokasi_site_default || '',
      note,
      lat,
      lng,
      accuracy: acc
    });

    return {
      ok: true,
      message: tg.sent
        ? 'PANIC terkirim & tersimpan. Telegram: terkirim.'
        : 'PANIC tersimpan. Telegram: belum dikonfigurasi / gagal.',
      data: { id_panic, timestamp: ts },
      telegram: tg
    };

  } catch (err) {
    return { ok: false, message: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

function getHeaderMapPanic_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h || '').trim().toLowerCase();
    if (key) map[key] = i + 1;
  });

  // minimal wajib
  const required = ['id_panic','timestamp','tanggal','jam','id_personil','status'];
  for (const r of required) {
    if (!map[r]) throw new Error(`Kolom wajib "${r}" tidak ditemukan di sheet LogEmergency.`);
  }
  return map;
}

function appendPanicRow_(sheet, map, data) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = new Array(headers.length).fill('');

  setIfExists_(row, map, 'id_panic', data.id_panic || '');
  setIfExists_(row, map, 'timestamp', data.timestamp || '');
  setIfExists_(row, map, 'tanggal', data.tanggal || '');
  setIfExists_(row, map, 'jam', data.jam || '');
  setIfExists_(row, map, 'id_personil', data.id_personil || '');
  setIfExists_(row, map, 'nama', data.nama || '');
  setIfExists_(row, map, 'role', data.role || '');
  setIfExists_(row, map, 'lokasi_site', data.lokasi_site || '');
  setIfExists_(row, map, 'note', data.note || '');
  setIfExists_(row, map, 'lat', data.lat || '');
  setIfExists_(row, map, 'lng', data.lng || '');
  setIfExists_(row, map, 'accuracy', data.accuracy || '');
  setIfExists_(row, map, 'device_info', data.device_info || '');
  setIfExists_(row, map, 'status', data.status || 'OPEN');

  sheet.appendRow(row);
}

/** ========== Telegram via Telegram.gs ========== */
/**
 * Menggunakan helper dari Telegram.gs:
 * - tgGetConfig_()
 * - tgSendMessage_()
 *
 * Tidak menggagalkan panic kalau telegram tidak siap.
 */
function sendTelegramPanicViaHelper_(d) {
  try {
    // cek config telegram (pakai helper yang sama dengan rekap)
    const cfg = tgGetConfig_();
    if (!cfg.token || !cfg.chatId) {
      return { sent: false, reason: 'TG_BOT_TOKEN / TG_CHAT_ID kosong.' };
    }

    const maps = (d.lat && d.lng)
      ? `https://maps.google.com/?q=${encodeURIComponent(d.lat + ',' + d.lng)}`
      : '';

    const lines = [];
    lines.push('🚨 <b>PANIC ALERT</b>');
    lines.push(`<b>ID</b>: ${escHtml_(d.id_panic)}`);
    lines.push(`<b>Waktu</b>: ${escHtml_(d.timestamp)}`);
    lines.push(`<b>Personil</b>: ${escHtml_(d.nama)} (${escHtml_(d.id_personil)})`);
    lines.push(`<b>Role</b>: ${escHtml_(d.role)} | <b>Site</b>: ${escHtml_(d.lokasi_site || '-')}`);
    if (d.note) lines.push(`<b>Catatan</b>: ${escHtml_(d.note)}`);
    if (maps) lines.push(`<b>Lokasi</b>: ${maps}`);
    else lines.push(`<b>Lokasi</b>: (izin GPS tidak diberikan)`);
    if (d.accuracy) lines.push(`<b>Akurasi</b>: ${escHtml_(d.accuracy)} m`);

    // tgSendMessage_ dari Telegram.gs (yang sudah terbukti berhasil)
    tgSendMessage_(lines.join('\n'));

    return { sent: true };
  } catch (e) {
    return { sent: false, reason: String(e && e.message ? e.message : e) };
  }
}

function escHtml_(s){
  return String(s||'').replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}
