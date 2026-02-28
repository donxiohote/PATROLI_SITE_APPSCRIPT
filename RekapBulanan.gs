/** RekapBulanan.gs - FASE 3.4 */

function generateRekapBulanan_(year, month) {
  // month: 1-12
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const ym = `${year}-${String(month).padStart(2,'0')}`;

  // ===== ambil data =====
  const absensi = getAbsensiBulanan_(year, month);
  const scans = getScanBulanan_(year, month);

  // ===== spreadsheet sementara =====
  const ss = SpreadsheetApp.create(`REKAP-BULANAN-${ym}`);
  const ssId = ss.getId();

  // --- Sheet Absensi Bulanan ---
  const shA = ss.getSheets()[0];
  shA.setName('AbsensiBulanan');
  shA.getRange(1,1,1,6).setValues([[
    'ID Personil','Nama','Hadir','Tidak Hadir','Jam Masuk Terakhir','Jam Pulang Terakhir'
  ]]);
  if (absensi.length) {
    shA.getRange(2,1,absensi.length,6).setValues(absensi);
  }

  // --- Sheet Scan Bulanan ---
  const shS = ss.insertSheet('ScanBulanan');
  shS.getRange(1,1,1,4).setValues([[
    'ID Personil','Nama','Total Scan','Area'
  ]]);
  if (scans.length) {
    shS.getRange(2,1,scans.length,4).setValues(scans);
  }

  // ===== export ke XLSX =====
  SpreadsheetApp.flush();
  const blob = exportSpreadsheetToXlsx_(ssId, `REKAP-BULANAN-${ym}.xlsx`);
  const file = DriveApp.createFile(blob);

  DriveApp.getFileById(ssId).setTrashed(true);

  return {
    ok: true,
    year,
    month,
    fileId: file.getId(),
    fileName: file.getName()
  };
}

/* ================= DATA BUILDER ================= */

function getAbsensiBulanan_(year, month) {
  const sh = getSheet_('Absensi');
  const data = sh.getDataRange().getValues();
  const hdr = data.shift();
  const idx = indexMap_(hdr);
  const personilMap = buildPersonilNameMap_();

  const map = {}; // id_personil -> stats

  data.forEach(r => {
    const d = new Date(r[idx.tanggal]);
    if (d.getFullYear() !== year || d.getMonth()+1 !== month) return;

    const id = r[idx.id_personil];
    if (!map[id]) {
      map[id] = {
        hadir: 0,
        masuk: r[idx.jam_masuk] || '',
        pulang: r[idx.jam_pulang] || ''
      };
    }
    if (r[idx.status] === 'H') map[id].hadir++;
    map[id].masuk = r[idx.jam_masuk] || map[id].masuk;
    map[id].pulang = r[idx.jam_pulang] || map[id].pulang;
  });

  const daysInMonth = new Date(year, month, 0).getDate();

  return Object.keys(map).map(id => ([
    id,
    personilMap[id] || '',
    map[id].hadir,
    daysInMonth - map[id].hadir,
    map[id].masuk,
    map[id].pulang
  ]));
}

function getScanBulanan_(year, month) {
  const sh = getSheet_('ScanPatroli');
  const data = sh.getDataRange().getValues();
  const hdr = data.shift();
  const idx = indexMap_(hdr);
  const personilMap = buildPersonilNameMap_();

  const map = {}; // id_personil -> count

  data.forEach(r => {
    const d = new Date(r[idx.tanggal]);
    if (d.getFullYear() !== year || d.getMonth()+1 !== month) return;

    const id = r[idx.id_personil];
    if (!map[id]) map[id] = { count: 0, area: r[idx.id_area] || '' };
    map[id].count++;
  });

  return Object.keys(map).map(id => ([
    id,
    personilMap[id] || '',
    map[id].count,
    map[id].area
  ]));
}
