/** RekapTelegram.gs - FASE 3.2 kirim Excel rekap ke Telegram */

function sendRekapHarianToTelegram(tanggalYmd) {
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const tanggal = tanggalYmd || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  // 1) Generate rekap + XLSX (FASE 3.1)
  const gen = generateRekapHarian_(tanggal);

  // 2) Buat ringkasan teks (opsional tapi berguna)
  const summary = buildRekapSummary_(tanggal);

  // 3) Kirim text dulu
  const msgRes = tgSendMessage_(summary);

  // 4) Kirim file XLSX sebagai document
  const file = DriveApp.getFileById(gen.excelFileId);
  const blob = file.getBlob().setName(gen.excelFileName);

  const docRes = tgSendDocument_(blob, `📎 Rekap Harian ${tanggal}`);

  return {
    ok: true,
    tanggal,
    message: 'Rekap harian terkirim ke Telegram.',
    telegram: { message: msgRes, document: docRes },
    file: gen
  };
}

/** Kirim dokumen (xlsx) ke Telegram sebagai attachment */
function tgSendDocument_(blob, caption) {
  const cfg = tgGetConfig_();
  if (!cfg.token || !cfg.chatId) {
    return { ok: false, message: 'Telegram belum dikonfigurasi (TG_BOT_TOKEN / TG_CHAT_ID kosong).' };
  }

  const url = `https://api.telegram.org/bot${cfg.token}/sendDocument`;

  const form = {
    chat_id: cfg.chatId,
    caption: caption || '',
    parse_mode: 'HTML',
    document: blob
  };

  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    payload: form,
    muteHttpExceptions: true
  });

  const code = resp.getResponseCode();
  const body = resp.getContentText();
  if (code >= 200 && code < 300) return { ok: true, message: 'Dokumen terkirim.' };

  return { ok: false, message: `sendDocument error: HTTP ${code} ${body}` };
}

/** Ringkasan singkat (ambil hitungan dari sheet utama) */
function buildRekapSummary_(tanggal) {
  // hitung absensi & scan berdasarkan tanggal
  const absCount = countByTanggal_('Absensi', 'tanggal', tanggal);
  const scanCount = countByTanggal_('ScanPatroli', 'tanggal', tanggal);

  const lines = [];
  lines.push(`📊 <b>REKAP HARIAN</b>`);
  lines.push(`<b>Tanggal</b>: ${tanggal}`);
  lines.push(`✅ <b>Absensi</b>: ${absCount} record`);
  lines.push(`📍 <b>Scan</b>: ${scanCount} record`);
  lines.push(``);
  lines.push(`File Excel menyusul di bawah ini.`);
  return lines.join('\n');
}

/** Helper count sederhana berdasarkan header tanggal */
function countByTanggal_(sheetName, headerTanggal, tanggal) {
  const sh = getSheet_(sheetName);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return 0;

  const headers = values[0].map(h => String(h || '').trim().toLowerCase());
  const idx = headers.indexOf(String(headerTanggal).toLowerCase());
  if (idx < 0) return 0;

  let c = 0;
  for (let i = 1; i < values.length; i++) {
    const d = normalizeDateKey_(values[i][idx]);
    if (d === tanggal) c++;
  }
  return c;
}

function sendRekapBulananToTelegram(year, month) {
  const res = generateRekapBulanan_(year, month);

  const text =
    `📆 <b>REKAP BULANAN</b>\n` +
    `Periode: <b>${year}-${String(month).padStart(2,'0')}</b>\n` +
    `File Excel terlampir.`;

  tgSendMessage_(text);

  const file = DriveApp.getFileById(res.fileId);
  tgSendDocument_(file.getBlob().setName(res.fileName), `Rekap Bulanan ${year}-${month}`);

  return res;
}

