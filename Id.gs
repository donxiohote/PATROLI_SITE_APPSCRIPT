/** Id.gs - generator ID sederhana + aman (unik) */

function nextId_(prefix, dateYmd) {
  // prefix contoh: ABS, SCN
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const ymd = dateYmd || Utilities.formatDate(new Date(), tz, 'yyyyMMdd');

  const key = `SEQ_${prefix}_${ymd}`;
  const props = PropertiesService.getScriptProperties();

  // lock supaya tidak bentrok kalau banyak orang absen/scan bareng
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cur = Number(props.getProperty(key) || '0');
    const next = cur + 1;
    props.setProperty(key, String(next));
    // format 3 digit: 001, 002, ...
    const seq = String(next).padStart(3, '0');
    return `${prefix}-${ymd}-${seq}`;
  } finally {
    lock.releaseLock();
  }
}
