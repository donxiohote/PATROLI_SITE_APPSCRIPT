/** RiwayatScan.gs - fase 2.3 riwayat scan saya (dengan nama checkpoint) */

function getMyScan(token, limit) {
  const ctx = requireAuth_(token, ['admin','komandan','security','cs','driver']);
  const user = ctx.user;

  if (!user.id_personil) {
    return { ok: false, message: 'Akun belum terhubung ke id_personil.' };
  }

  limit = Number(limit || 30);
  if (isNaN(limit) || limit < 1) limit = 30;
  if (limit > 200) limit = 200;

  // map checkpoint: id_checkpoint -> {nama_checkpoint, lokasi_aset}
  const cpMap = buildCheckpointMap_();

  const sh = getSheet_('ScanPatroli');
  const map = getHeaderMapScan_(sh); // sudah ada di ScanPatroli.gs

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true, data: [] };

  const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  const out = [];

  for (let i = values.length - 1; i >= 0 && out.length < limit; i--) {
    const row = values[i];
    const pid = String(row[map.id_personil - 1] || '').trim();
    if (pid !== String(user.id_personil)) continue;

    const cpId = String(row[map.id_checkpoint - 1] || '');
    const cp = cpMap[cpId] || {};

    out.push({
      id_scan: map.id_scan ? String(row[map.id_scan - 1] || '') : '',
      timestamp: String(row[map.timestamp - 1] || ''),
      tanggal: normalizeDateKey_(row[map.tanggal - 1] || ''),
      jam: String(row[map.jam - 1] || ''),
      id_area: String(row[map.id_area - 1] || ''),
      id_checkpoint: cpId,
      nama_checkpoint: cp.nama_checkpoint || '',
      lokasi_aset: cp.lokasi_aset || '',
      source: map.source ? String(row[map.source - 1] || '') : ''
    });
  }

  return { ok: true, data: out };
}

function buildCheckpointMap_() {
  const sh = getSheet_('Checkpoint');
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return {};

  const headers = values[0].map(h => String(h || '').trim().toLowerCase());
  const idx = {};
  headers.forEach((h, i) => { if (h) idx[h] = i; });

  const out = {};
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const id = String(row[idx.id_checkpoint] || '').trim();
    if (!id) continue;
    out[id] = {
      nama_checkpoint: idx.nama_checkpoint != null ? String(row[idx.nama_checkpoint] || '') : '',
      lokasi_aset: idx.lokasi_aset != null ? String(row[idx.lokasi_aset] || '') : ''
    };
  }
  return out;
}
