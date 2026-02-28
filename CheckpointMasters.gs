/** CheckpointMaster.gs - Master Checkpoint + Generate QR + Print (Admin/Komandan) */

function buildSignedCheckpointUrl_(cpId, idArea) {
  const baseUrl = getBaseUrl_(); // pastikan sudah ada di project (punya kamu sudah)
  const cp = String(cpId || '').trim();
  const area = String(idArea || '').trim();
  if (!cp) return '';

  const sig = makeQrSig_(cp, area); // akan error jika QR_SECRET belum diset (bagus, biar ketahuan)
  return `${baseUrl}?page=scan&cp=${encodeURIComponent(cp)}&sig=${encodeURIComponent(sig)}`;
}

function adminListCheckpoints(token, filter) {
  requireAuth_(token, ['admin','komandan']);
  filter = filter || {};
  const fArea = String(filter.id_area || '').trim();
  const fKat  = String(filter.kategori || '').trim();

  const sh = getSheet_('Checkpoint');
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return { ok:true, rows:[], headers: getHeaders_(sh), filter:{id_area:fArea,kategori:fKat} };

  const headers = getHeaders_(sh);
  const map = headerMap_(headers);

  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const out = [];

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const rec = rowToObj_(headers, row);
    const id_checkpoint = String(rec.id_checkpoint || '').trim();
    if (!id_checkpoint) continue;

    const id_area = String(rec.id_area || '').trim();
    const kategori = String(rec.kategori || '').trim();

    if (fArea && id_area !== fArea) continue;
    if (fKat && kategori !== fKat) continue;

    rec._row = i + 2; // row index in sheet
    out.push(rec);
  }

  return { ok:true, rows: out, headers, filter:{id_area:fArea,kategori:fKat} };
}

function adminSaveCheckpoint(token, data) {
  requireAuth_(token, ['admin','komandan']);
  data = data || {};
  const sh = getSheet_('Checkpoint');
  const headers = getHeaders_(sh);
  const map = headerMap_(headers);

  const id = String(data.id_checkpoint || '').trim();
  if (!id) return { ok:false, message:'id_checkpoint wajib diisi.' };

  const id_area = String(data.id_area || '').trim();

  // AUTO signed link jika kosong
  // - saat create: pasti diisi
  // - saat update: diisi jika kosong (atau biarkan admin overwrite via tombol Generate)
  const incomingQr = (data.qrcode_link == null) ? null : String(data.qrcode_link || '').trim();
  if (!incomingQr) {
    data.qrcode_link = buildSignedCheckpointUrl_(id, id_area);
  }

  // cari existing row
  const found = findRowById_(sh, map, 'id_checkpoint', id);

  if (found.row > 0) {
    // update
    const rowIdx = found.row;

    // pastikan kalau id_area berubah, qrcode_link ikut konsisten (signed pakai area)
    // kalau admin tidak mengisi qrcode_link, kita regenerate sesuai area baru
    if (incomingQr == null || incomingQr === '') {
      data.qrcode_link = buildSignedCheckpointUrl_(id, id_area);
    }

    writeObjToRow_(sh, headers, map, rowIdx, data);
    return { ok:true, message:'Checkpoint diperbarui.', id_checkpoint:id };
  } else {
    // append new
    const newRow = new Array(headers.length).fill('');
    setField_(newRow, map, 'id_checkpoint', id);
    setField_(newRow, map, 'id_area', id_area);
    setField_(newRow, map, 'nama_checkpoint', data.nama_checkpoint || '');
    setField_(newRow, map, 'lokasi_aset', data.lokasi_aset || '');
    setField_(newRow, map, 'deskripsi_tugas', data.deskripsi_tugas || '');
    setField_(newRow, map, 'kategori', data.kategori || '');
    setField_(newRow, map, 'qrcode_link', data.qrcode_link || '');

    sh.appendRow(newRow);
    return { ok:true, message:'Checkpoint ditambahkan.', id_checkpoint:id };
  }
}


function adminDeleteCheckpoint(token, id_checkpoint) {
  requireAuth_(token, ['admin','komandan']);
  const id = String(id_checkpoint || '').trim();
  if (!id) return { ok:false, message:'id_checkpoint kosong.' };

  const sh = getSheet_('Checkpoint');
  const headers = getHeaders_(sh);
  const map = headerMap_(headers);
  const found = findRowById_(sh, map, 'id_checkpoint', id);

  if (!found.row) return { ok:false, message:'Checkpoint tidak ditemukan.' };

  sh.deleteRow(found.row);
  return { ok:true, message:'Checkpoint dihapus.', id_checkpoint:id };
}

/** Generate qrcode_link untuk:
 * - mode="missing" => hanya yang kosong
 * - mode="all" => semua di overwrite
 */
function adminGenerateCheckpointQrLinks(token, mode) {
  requireAuth_(token, ['admin','komandan']);
  const sh = getSheet_('Checkpoint');
  const headers = getHeaders_(sh);
  const map = headerMap_(headers);

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return { ok:true, updated:0, message:'Tidak ada data.' };

  const iId   = map['id_checkpoint'];
  const iArea = map['id_area'];        // untuk sig
  const iQr   = map['qrcode_link'];

  if (!iId) throw new Error('Checkpoint: kolom id_checkpoint tidak ditemukan.');
  if (!iQr) throw new Error('Checkpoint: kolom qrcode_link tidak ditemukan.');

  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  let updated = 0;

  const isAll = String(mode).toLowerCase() === 'all';

  for (let r = 0; r < values.length; r++) {
    const row = values[r];
    const cp = String(row[iId - 1] || '').trim();
    if (!cp) continue;

    const cur = String(row[iQr - 1] || '').trim();
    const area = (iArea ? String(row[iArea - 1] || '').trim() : '');

    const shouldWrite = isAll ? true : (!cur);
    if (!shouldWrite) continue;

    row[iQr - 1] = buildSignedCheckpointUrl_(cp, area);
    updated++;
  }

  if (updated > 0) {
    sh.getRange(2, 1, values.length, lastCol).setValues(values);
  }

  return { ok:true, updated, message:`QR Signed dibuat: ${updated} baris (${mode || 'missing'}).` };
}


/** Return HTML print-friendly (daftar QR) */
function adminGetCheckpointPrintHtml(token, filter) {
  requireAuth_(token, ['admin','komandan']);
  filter = filter || {};
  const fArea = String(filter.id_area || '').trim();
  const fKat  = String(filter.kategori || '').trim();

  const baseUrl = getBaseUrl_();

  const sh = getSheet_('Checkpoint');
  const headers = getHeaders_(sh);
  const map = headerMap_(headers);

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return { ok:true, html:'<p>Tidak ada checkpoint.</p>' };

  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const items = [];

  for (let i = 0; i < values.length; i++) {
    const rec = rowToObj_(headers, values[i]);
    const id = String(rec.id_checkpoint || '').trim();
    if (!id) continue;

    const id_area = String(rec.id_area || '').trim();
    const kategori = String(rec.kategori || '').trim();
    if (fArea && id_area !== fArea) continue;
    if (fKat && kategori !== fKat) continue;

    const link = String(rec.qrcode_link || '').trim() || buildSignedCheckpointUrl_(id, String(rec.id_area||'').trim());
    const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}`;

    items.push({
      id_checkpoint: id,
      id_area,
      nama_checkpoint: String(rec.nama_checkpoint || '').trim(),
      lokasi_aset: String(rec.lokasi_aset || '').trim(),
      link,
      qrImg
    });
  }

  const html = buildPrintHtml_(items, { fArea, fKat });
  return { ok:true, html };
}

/* ========== helpers local ========== */

function getHeaders_(sh) {
  const lastCol = sh.getLastColumn();
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h||'').trim());
}
function headerMap_(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const k = String(h||'').trim().toLowerCase();
    if (k) map[k] = i + 1;
  });
  return map;
}
function rowToObj_(headers, row) {
  const o = {};
  for (let i = 0; i < headers.length; i++) {
    const k = String(headers[i]||'').trim();
    if (!k) continue;
    o[k.toLowerCase()] = row[i];
  }
  return o;
}
function findRowById_(sh, map, keyLower, idValue) {
  const col = map[String(keyLower).toLowerCase()];
  if (!col) throw new Error(`Kolom ${keyLower} tidak ditemukan.`);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { row: 0 };

  const vals = sh.getRange(2, col, lastRow - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]||'').trim() === String(idValue).trim()) {
      return { row: i + 2 };
    }
  }
  return { row: 0 };
}
function writeObjToRow_(sh, headers, map, rowIdx, data) {
  const lastCol = headers.length;
  const cur = sh.getRange(rowIdx, 1, 1, lastCol).getValues()[0];

  setField_(cur, map, 'id_area', data.id_area);
  setField_(cur, map, 'nama_checkpoint', data.nama_checkpoint);
  setField_(cur, map, 'lokasi_aset', data.lokasi_aset);
  setField_(cur, map, 'deskripsi_tugas', data.deskripsi_tugas);
  setField_(cur, map, 'kategori', data.kategori);
  // qrcode_link optional (biasanya di-generate)
  if (data.qrcode_link != null) setField_(cur, map, 'qrcode_link', data.qrcode_link);

  sh.getRange(rowIdx, 1, 1, lastCol).setValues([cur]);
}
function setField_(rowArr, map, key, val) {
  const col = map[String(key).toLowerCase()];
  if (!col) return;
  if (val === undefined) return;
  rowArr[col - 1] = val == null ? '' : val;
}
function buildPrintHtml_(items, meta) {
  const title = `PRINT QR CHECKPOINT`;
  const sub = `Filter area="${meta.fArea||''}" kategori="${meta.fKat||''}" • total=${items.length}`;

  const cards = items.map(it => {
    const name = escapeHtml_(it.nama_checkpoint || '');
    const loc = escapeHtml_(it.lokasi_aset || '');
    const area = escapeHtml_(it.id_area || '');
    const id = escapeHtml_(it.id_checkpoint || '');
    const link = escapeHtml_(it.link || '');

    return `
      <div class="card">
        <div class="qr"><img src="${it.qrImg}" alt="QR"></div>
        <div class="txt">
          <div class="id"><b>${id}</b> • ${area}</div>
          <div class="nm">${name}</div>
          <div class="lc">${loc}</div>
          <div class="lnk">${link}</div>
        </div>
      </div>
    `;
  }).join('');

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body{font-family:Arial, sans-serif; padding:16px;}
    .top{display:flex; justify-content:space-between; align-items:flex-end; gap:12px; margin-bottom:12px;}
    .h1{font-size:18px; font-weight:700;}
    .sub{color:#666; font-size:12px;}
    .grid{display:grid; grid-template-columns: repeat(2, 1fr); gap:12px;}
    .card{border:1px solid #ddd; border-radius:10px; padding:10px; display:flex; gap:10px; align-items:center;}
    .qr img{width:140px; height:140px;}
    .txt{font-size:12px; line-height:1.25;}
    .id{font-size:13px;}
    .nm{margin-top:4px;}
    .lc{color:#666; margin-top:2px;}
    .lnk{color:#999; margin-top:6px; word-break:break-all; font-size:10px;}
    @media print{
      body{padding:0;}
      .grid{grid-template-columns: repeat(2, 1fr);}
      .card{page-break-inside: avoid;}
    }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <div class="h1">${title}</div>
      <div class="sub">${sub}</div>
    </div>
    <div class="sub">Tip: Print A4 • 2 kolom</div>
  </div>
  <div class="grid">${cards}</div>
  <script>
  (function(){
    const imgs = Array.from(document.images || []);
    let done = 0;
    const total = imgs.length;

    function goPrint(){
      // kasih jeda sedikit biar layout stabil
      setTimeout(()=>window.print(), 300);
    }

    if (!total) return goPrint();

    const onDone = () => {
      done++;
      if (done >= total) goPrint();
    };

    imgs.forEach(img => {
      if (img.complete && img.naturalWidth > 0) return onDone();
      img.addEventListener('load', onDone, { once:true });
      img.addEventListener('error', onDone, { once:true }); // kalau gagal load, tetap print (biar ga nge-hang)
    });

    // safety timeout: kalau koneksi lambat, tetap print setelah 5 detik
    setTimeout(goPrint, 5000);
  })();
  </script>
</body>
</html>`;
}
function escapeHtml_(s){
  return String(s||'').replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}
