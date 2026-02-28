/** Scheduler.gs - FASE 3.3 Scheduler & anti-duplikasi */

/**
 * Kirim rekap untuk tanggal kemarin (default),
 * cocok dijalankan jam malam (misal 23:59 atau 00:10).
 */
function jobSendRekapDaily() {
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const now = new Date();

  // tanggal laporan = kemarin
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tanggal = Utilities.formatDate(yesterday, tz, 'yyyy-MM-dd');

  // anti-duplikasi
  const props = PropertiesService.getScriptProperties();
  const key = 'REKAP_SENT_' + tanggal;
  if (props.getProperty(key) === '1') {
    Logger.log('Skip: rekap sudah terkirim untuk ' + tanggal);
    return { ok: true, skipped: true, tanggal };
  }

  // coba kirim
  const res = sendRekapHarianToTelegram(tanggal);

  // jika sukses, tandai sudah terkirim
  props.setProperty(key, '1');

  return { ok: true, skipped: false, tanggal, result: res };
}

/**
 * (Opsional) Reset flag kalau kamu mau re-send tanggal tertentu.
 */
function resetRekapSentFlag(tanggalYmd) {
  const props = PropertiesService.getScriptProperties();
  const key = 'REKAP_SENT_' + tanggalYmd;
  props.deleteProperty(key);
  return { ok: true, deleted: key };
}

/**
 * Buat trigger otomatis harian.
 * Aman: sebelum membuat, kita hapus trigger lama untuk fungsi yang sama.
 *
 * @param {number} hour 0-23
 * @param {number} minute 0-59
 */
function installDailyTrigger(hour, minute) {
  hour = Number(hour);
  minute = Number(minute);
  if (isNaN(hour) || hour < 0 || hour > 23) hour = 23;
  if (isNaN(minute) || minute < 0 || minute > 59) minute = 59;

  // hapus trigger lama untuk jobSendRekapDaily
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'jobSendRekapDaily') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // buat trigger baru harian
  ScriptApp.newTrigger('jobSendRekapDaily')
    .timeBased()
    .everyDays(1)
    .atHour(hour)
    .nearMinute(minute)
    .create();

  return { ok: true, message: `Trigger harian dipasang: ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}` };
}

/**
 * Lihat daftar trigger project (debug).
 */
function listTriggers() {
  return ScriptApp.getProjectTriggers().map(t => ({
    handler: t.getHandlerFunction && t.getHandlerFunction(),
    type: String(t.getEventType && t.getEventType()),
    uid: t.getUniqueId && t.getUniqueId()
  }));
}
