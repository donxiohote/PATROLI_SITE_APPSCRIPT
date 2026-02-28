/** RekapHarian.gs - FASE 3.1 */

function generateRekapHarian_(tanggalYmd) {
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const tanggal = tanggalYmd || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  // ===== Ambil data =====
  const absensi = getAbsensiByTanggal_(tanggal);
  const scans = getScanByTanggal_(tanggal);

  // ===== Buat Spreadsheet sementara =====
  const ss = SpreadsheetApp.create(`REKAP-${tanggal}`);
  const ssId = ss.getId();

  // --- Sheet Absensi ---
  const shA = ss.getSheets()[0];
  shA.setName('Absensi');
  shA.getRange(1,1,1,6).setValues([[
    'ID Personil','Nama','Masuk','Pulang','Status','Lokasi'
  ]]);

  if (absensi.length) {
    shA.getRange(2,1,absensi.length,6).setValues(absensi);
  }

  // --- Sheet Scan ---
  const shS = ss.insertSheet('ScanPatroli');
  shS.getRange(1,1,1,6).setValues([[
    'Jam','ID Personil','Nama','Checkpoint','Area','Device'
  ]]);

  if (scans.length) {
    shS.getRange(2,1,scans.length,6).setValues(scans);
  }

  // ===== Convert ke XLSX yang valid (EXPORT) =====
  SpreadsheetApp.flush();

  const xlsxBlob = exportSpreadsheetToXlsx_(ssId, `REKAP-${tanggal}.xlsx`);
  const excelFile = DriveApp.createFile(xlsxBlob);

  // hapus spreadsheet sementara
  DriveApp.getFileById(ssId).setTrashed(true);

  return {
    tanggal,
    excelFileId: excelFile.getId(),
    excelFileName: excelFile.getName()
  };

}


/* ================= DATA BUILDER ================= */

function getAbsensiByTanggal_(tanggal) {
  const sh = getSheet_('Absensi');
  const data = sh.getDataRange().getValues();
  const hdr = data.shift();

  const idx = indexMap_(hdr);
  const personilMap = buildPersonilNameMap_();

  return data
    .filter(r => normalizeDateKey_(r[idx.tanggal]) === tanggal)
    .map(r => ([
      r[idx.id_personil],
      personilMap[r[idx.id_personil]] || '',
      r[idx.jam_masuk],
      r[idx.jam_pulang],
      r[idx.status],
      r[idx.lokasi_site] || ''
    ]));
}

function getScanByTanggal_(tanggal) {
  const sh = getSheet_('ScanPatroli');
  const data = sh.getDataRange().getValues();
  const hdr = data.shift();

  const idx = indexMap_(hdr);
  const personilMap = buildPersonilNameMap_();
  const cpMap = buildCheckpointMap_();

  return data
    .filter(r => normalizeDateKey_(r[idx.tanggal]) === tanggal)
    .map(r => ([
      r[idx.jam],
      r[idx.id_personil],
      personilMap[r[idx.id_personil]] || '',
      r[idx.id_checkpoint],
      cpMap[r[idx.id_checkpoint]]?.id_area || '',
      r[idx.device_info] || ''
    ]));
}

/* ================= HELPERS ================= */

function indexMap_(headers) {
  const m = {};
  headers.forEach((h,i)=>m[String(h).toLowerCase()]=i);
  return m;
}

function buildPersonilNameMap_() {
  const sh = getSheet_('Personil');
  const v = sh.getDataRange().getValues();
  const hdr = v.shift();
  const idx = indexMap_(hdr);

  const out = {};
  v.forEach(r=>{
    out[r[idx.id_personil]] = r[idx.nama] || '';
  });
  return out;
}

function exportSpreadsheetToXlsx_(spreadsheetId, xlsxName) {
  const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(spreadsheetId)
    + '/export?mimeType=' + encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const token = ScriptApp.getOAuthToken();
  const resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });

  const code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Export XLSX gagal. HTTP ' + code + ' — ' + resp.getContentText());
  }

  const blob = resp.getBlob()
    .setName(xlsxName)
    .setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  return blob;
}

