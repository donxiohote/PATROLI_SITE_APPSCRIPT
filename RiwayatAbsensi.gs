/** RiwayatAbsensi.gs - fase 2.3 riwayat absen saya */

function getMyAbsensi(token, limit) {
  const ctx = requireAuth_(token, ['admin','komandan','security','cs','driver']);
  const user = ctx.user;

  if (!user.id_personil) {
    return { ok: false, message: 'Akun belum terhubung ke id_personil.' };
  }

  limit = Number(limit || 30);
  if (isNaN(limit) || limit < 1) limit = 30;
  if (limit > 200) limit = 200;

  const sh = getSheet_('Absensi');
  const map = getHeaderMapAbsensi_(sh);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true, data: [] };

  const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  const out = [];

  for (let i = values.length - 1; i >= 0 && out.length < limit; i--) {
    const row = values[i];
    const pid = String(row[map.id_personil - 1] || '').trim();
    if (pid !== String(user.id_personil)) continue;

    out.push({
      id_absensi: map.id_absensi ? String(row[map.id_absensi - 1] || '') : '',
      tanggal: normalizeDateKey_(row[map.tanggal - 1] || ''),
      lokasi_site: map.lokasi_site ? String(row[map.lokasi_site - 1] || '') : '',
      jam_masuk: String(row[map.jam_masuk - 1] || ''),
      jam_pulang: String(row[map.jam_pulang - 1] || ''),
      status: map.status ? String(row[map.status - 1] || '') : '',
      keterangan: map.keterangan ? String(row[map.keterangan - 1] || '') : ''
    });
  }

  return { ok: true, data: out };
}

function getHeaderMapAbsensi_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h || '').trim().toLowerCase();
    if (key) map[key] = i + 1;
  });

  const required = ['tanggal','id_personil','jam_masuk','jam_pulang'];
  for (const r of required) {
    if (!map[r]) throw new Error(`Kolom wajib "${r}" tidak ditemukan di sheet Absensi.`);
  }
  // optional: id_absensi, lokasi_site, status, keterangan
  return map;
}
