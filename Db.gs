/** Db.gs - helper akses Spreadsheet */

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  // fallback kalau script attached ke spreadsheet
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name) {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error(`Sheet "${name}" tidak ditemukan.`);
  return sh;
}

/** Ambil semua data sheet sebagai array of objects (berdasarkan header baris 1) */
function readAllAsObjects_(sheetName) {
  const sh = getSheet_(sheetName);
  const values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  const headers = values[0].map(h => String(h || '').trim());
  const out = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    // skip baris kosong total
    if (row.every(v => v === '' || v === null)) continue;

    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c];
    }
    out.push(obj);
  }
  return out;
}
