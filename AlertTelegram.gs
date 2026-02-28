/** AlertTelegram.gs - Notifikasi Telegram Otomatis (Belum Absen / Belum Scan / Belum Pulang)
 *
 * Prasyarat:
 * - Telegram helper sudah ada: tgSendMessage_() (dan token/chatId sudah diset)
 * - Sheet: Personil, Absensi, ScanPatroli sudah sesuai
 */

const ALERT_MAX_LIST = 30; // batasi list biar telegram tidak kepanjangan

/** ===== JOBS (dipanggil trigger) ===== */

function jobAlertBelumAbsen() {
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const tanggal = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  // anti-duplikasi per hari
  if (isAlreadySent_('ALERT_BELUM_ABSEN', tanggal)) return;

  const res = getTodayMonitoringInternal_(tanggal, { lokasi_site: '', kategori: '' });
  const list = res.data.belumMasuk || [];

  const text = buildAlertMessage_({
    title: '⏰ BELUM ABSEN MASUK',
    tanggal,
    subtitle: `Personil aktif: ${res.totals.personil_aktif} • Hadir: ${res.totals.hadir}`,
    list,
    cols: ['id_personil','nama','kategori','lokasi_site']
  });

  tgSendMessage_(text);
  markSent_('ALERT_BELUM_ABSEN', tanggal);
}

function jobAlertBelumScan() {
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const tanggal = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  if (isAlreadySent_('ALERT_BELUM_SCAN', tanggal)) return;

  const res = getTodayMonitoringInternal_(tanggal, { lokasi_site: '', kategori: '' });
  const list = res.data.belumScan || [];

  const text = buildAlertMessage_({
    title: '🟦 BELUM PATROLI (BELUM SCAN)',
    tanggal,
    subtitle: `Yang sudah masuk tapi belum scan: ${res.totals.belum_scan} • Total scan hari ini: ${res.totals.total_scan}`,
    list,
    cols: ['id_personil','nama','jam_masuk','kategori','lokasi_site']
  });

  tgSendMessage_(text);
  markSent_('ALERT_BELUM_SCAN', tanggal);
}

function jobAlertBelumPulang() {
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const tanggal = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  if (isAlreadySent_('ALERT_BELUM_PULANG', tanggal)) return;

  const res = getTodayMonitoringInternal_(tanggal, { lokasi_site: '', kategori: '' });
  const list = res.data.belumPulang || [];

  const text = buildAlertMessage_({
    title: '🟥 BELUM ABSEN PULANG',
    tanggal,
    subtitle: `Belum pulang: ${res.totals.belum_pulang} • Hadir: ${res.totals.hadir}`,
    list,
    cols: ['id_personil','nama','jam_masuk','kategori','lokasi_site']
  });

  tgSendMessage_(text);
  markSent_('ALERT_BELUM_PULANG', tanggal);
}

/** ===== INSTALL TRIGGERS (jalankan sekali) ===== */

function installAlertTriggers() {
  // hapus trigger lama agar tidak dobel
  deleteTriggersByHandler_('jobAlertBelumAbsen');
  deleteTriggersByHandler_('jobAlertBelumScan');
  deleteTriggersByHandler_('jobAlertBelumPulang');

  // WIB (ikut timezone script)
  ScriptApp.newTrigger('jobAlertBelumAbsen').timeBased().everyDays(1).atHour(8).nearMinute(15).create();
  ScriptApp.newTrigger('jobAlertBelumScan').timeBased().everyDays(1).atHour(10).nearMinute(0).create();
  ScriptApp.newTrigger('jobAlertBelumPulang').timeBased().everyDays(1).atHour(17).nearMinute(15).create();

  return { ok: true, message: 'Trigger alert terpasang: 08:15, 10:00, 17:15 (WIB)' };
}

function deleteTriggersByHandler_(handlerName) {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction && t.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(t);
    }
  });
}

/** ===== INTERNAL MONITORING (tanpa token) =====
 * Pakai helper fast yang sudah kamu punya di AdminMonitoring.gs:
 * - getActivePersonilFast_
 * - getAbsensiMapByTanggalFast_
 * - getScanAggByTanggalFast_
 *
 * Kalau kamu belum rename helper fast itu, sesuaikan namanya.
 */
function getTodayMonitoringInternal_(tanggal, filter) {
  filter = filter || {};
  const fSite = String(filter.lokasi_site || '').trim();
  const fKat  = String(filter.kategori || '').trim();

  const personil = (typeof getActivePersonilFast_ === 'function')
    ? getActivePersonilFast_(fSite, fKat)
    : getActivePersonil_(fSite, fKat);

  const absMap = (typeof getAbsensiMapByTanggalFast_ === 'function')
    ? getAbsensiMapByTanggalFast_(tanggal)
    : getAbsensiMapByTanggal_(tanggal);

  const scanMap = (typeof getScanAggByTanggalFast_ === 'function')
    ? getScanAggByTanggalFast_(tanggal)
    : getScanAggByTanggal_(tanggal);

  const belumMasuk = [];
  const belumPulang = [];
  const belumScan = [];
  const hadir = [];
  const scanSummary = [];

  for (let i = 0; i < personil.length; i++) {
    const p = personil[i];
    const pid = String(p.id_personil);
    const a = absMap[pid] || null;
    const s = scanMap[pid] || { count: 0, last_jam: '', last_checkpoint: '', last_area: '' };

    scanSummary.push({
      id_personil: pid,
      nama: p.nama || '',
      kategori: p.kategori || '',
      lokasi_site: p.lokasi_site || '',
      scan_count: s.count || 0,
      last_jam: s.last_jam || '',
      last_checkpoint: s.last_checkpoint || '',
      last_area: s.last_area || ''
    });

    if (!a || !a.jam_masuk) {
      belumMasuk.push({
        id_personil: pid,
        nama: p.nama || '',
        kategori: p.kategori || '',
        lokasi_site: p.lokasi_site || ''
      });
      continue;
    }

    hadir.push({
      id_personil: pid,
      nama: p.nama || '',
      kategori: p.kategori || '',
      lokasi_site: p.lokasi_site || '',
      jam_masuk: a.jam_masuk || '',
      jam_pulang: a.jam_pulang || ''
    });

    if (a.jam_masuk && !a.jam_pulang) {
      belumPulang.push({
        id_personil: pid,
        nama: p.nama || '',
        kategori: p.kategori || '',
        lokasi_site: p.lokasi_site || '',
        jam_masuk: a.jam_masuk || ''
      });
    }

    // belum scan: hanya yang sudah masuk
    if ((s.count || 0) === 0) {
      belumScan.push({
        id_personil: pid,
        nama: p.nama || '',
        jam_masuk: a.jam_masuk || '',
        kategori: p.kategori || '',
        lokasi_site: p.lokasi_site || ''
      });
    }
  }

  scanSummary.sort((x,y)=> (y.scan_count||0) - (x.scan_count||0));

  return {
    ok: true,
    tanggal,
    filter: { lokasi_site: fSite, kategori: fKat },
    totals: {
      personil_aktif: personil.length,
      hadir: hadir.length,
      belum_masuk: belumMasuk.length,
      belum_pulang: belumPulang.length,
      belum_scan: belumScan.length,
      total_scan: scanSummary.reduce((acc,r)=>acc+(Number(r.scan_count)||0),0)
    },
    data: { belumMasuk, belumPulang, belumScan, hadir, scanSummary }
  };
}

/** ===== MESSAGE BUILDER ===== */

function buildAlertMessage_(opt) {
  const title = opt.title || 'ALERT';
  const tanggal = opt.tanggal || '';
  const subtitle = opt.subtitle || '';
  const list = opt.list || [];
  const cols = opt.cols || ['id_personil','nama'];

  const header =
    `<b>${escapeHtmlTg_(title)}</b>\n` +
    `Tanggal: <b>${escapeHtmlTg_(tanggal)}</b>\n` +
    (subtitle ? `${escapeHtmlTg_(subtitle)}\n` : '') +
    `Jumlah: <b>${list.length}</b>\n\n`;

  if (!list.length) {
    return header + `✅ Tidak ada.\n`;
  }

  const shown = list.slice(0, ALERT_MAX_LIST);
  const lines = shown.map((r, i) => {
    const parts = cols.map(k => (r[k] != null ? String(r[k]) : '')).filter(Boolean);
    const s = parts.join(' • ');
    return `${i+1}. ${escapeHtmlTg_(s)}`;
  }).join('\n');

  const more = list.length > ALERT_MAX_LIST
    ? `\n\n…dan <b>${list.length - ALERT_MAX_LIST}</b> lainnya.`
    : '';

  return header + lines + more;
}

function escapeHtmlTg_(s) {
  return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

/** ===== ANTI DUPLICATE SEND ===== */

function isAlreadySent_(keyPrefix, tanggal) {
  const props = PropertiesService.getScriptProperties();
  const key = `${keyPrefix}_${tanggal}`;
  return props.getProperty(key) === '1';
}
function markSent_(keyPrefix, tanggal) {
  const props = PropertiesService.getScriptProperties();
  const key = `${keyPrefix}_${tanggal}`;
  props.setProperty(key, '1');
}

/** Manual reset kalau ingin kirim ulang */
function resetAlertFlag(keyPrefix, tanggal) {
  PropertiesService.getScriptProperties().deleteProperty(`${keyPrefix}_${tanggal}`);
  return { ok: true };
}
