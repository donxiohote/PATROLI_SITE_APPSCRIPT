/** Absensi.gs - Fase 2.1 Absen Masuk/Pulang */

function getMyTodayAbsensi(token) {
  const ctx = requireAuth_(token, ['admin','komandan','security','cs','driver']);
  const user = ctx.user;

  if (!user.id_personil) {
    return { ok: false, message: 'Akun belum terhubung ke id_personil. Cek kolom id_personil di sheet User.' };
  }

  const sh = getSheet_('Absensi');
  const map = getHeaderMap_(sh);

  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  const row = findAbsensiRow_(sh, map, today, user.id_personil);

  if (!row) {
    return {
      ok: true,
      data: {
        tanggal: today,
        id_personil: user.id_personil,
        jam_masuk: '',
        jam_pulang: '',
        status: '',
        keterangan: ''
      }
    };
  }

  return { ok: true, data: rowToAbsensi_(row, map) };
}

function absenMasuk(token) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = requireAuth_(token, ['security','cs','driver','admin','komandan']);
    const user = ctx.user;

    if (!user.id_personil) {
      return { ok: false, message: 'Akun belum terhubung ke id_personil. Cek kolom id_personil di sheet User.' };
    }

    const sh = getSheet_('Absensi');
    const map = getHeaderMap_(sh);

    const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
    const now = new Date();
    const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const time = Utilities.formatDate(now, tz, 'HH:mm:ss');

    const found = findAbsensiRow_(sh, map, today, user.id_personil);

    // Kalau sudah ada baris hari ini
    if (found) {
      const jamMasuk = getCellFromRow_(found, map, 'jam_masuk');
      if (jamMasuk) {
        return { ok: false, message: `Sudah absen masuk hari ini (${jamMasuk}).` };
      }

      // update jam_masuk
      updateAbsensiRow_(sh, map, found.__rowIndex, {
        tanggal: today,
        id_personil: user.id_personil,
        lokasi_site: user.lokasi_site_default || '',
        jam_masuk: time,
        status: getCellFromRow_(found, map, 'status') || 'H'
      });

      const updated = findAbsensiRow_(sh, map, today, user.id_personil);
      return { ok: true, message: 'Absen masuk berhasil.', data: rowToAbsensi_(updated, map) };
    }

    // Kalau belum ada baris, buat baru
    appendAbsensiRow_(sh, map, {
      id_absensi: nextId_('ABS', today.replaceAll('-', '')),
      tanggal: today,
      id_personil: user.id_personil,
      lokasi_site: user.lokasi_site_default || '',
      jam_masuk: time,
      jam_pulang: '',
      status: 'H',
      keterangan: ''
    });


    const created = findAbsensiRow_(sh, map, today, user.id_personil);
    return { ok: true, message: 'Absen masuk berhasil.', data: rowToAbsensi_(created, map) };

  } catch (err) {
    return { ok: false, message: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

function absenPulang(token) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = requireAuth_(token, ['security','cs','driver','admin','komandan']);
    const user = ctx.user;

    if (!user.id_personil) {
      return { ok: false, message: 'Akun belum terhubung ke id_personil. Cek kolom id_personil di sheet User.' };
    }

    const sh = getSheet_('Absensi');
    const map = getHeaderMap_(sh);

    const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
    const now = new Date();
    const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const time = Utilities.formatDate(now, tz, 'HH:mm:ss');

    const found = findAbsensiRow_(sh, map, today, user.id_personil);
    if (!found) {
      return { ok: false, message: 'Belum ada absen masuk hari ini. Silakan absen masuk dulu.' };
    }

    const jamMasuk = getCellFromRow_(found, map, 'jam_masuk');
    if (!jamMasuk) {
      return { ok: false, message: 'Belum absen masuk hari ini. Silakan absen masuk dulu.' };
    }

    const jamPulang = getCellFromRow_(found, map, 'jam_pulang');
    if (jamPulang) {
      return { ok: false, message: `Sudah absen pulang hari ini (${jamPulang}).` };
    }

    updateAbsensiRow_(sh, map, found.__rowIndex, {
      jam_pulang: time
    });

    const updated = findAbsensiRow_(sh, map, today, user.id_personil);
    return { ok: true, message: 'Absen pulang berhasil.', data: rowToAbsensi_(updated, map) };

  } catch (err) {
    return { ok: false, message: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

/** ===================== Helpers ===================== */

function requireAuth_(token, allowedRoles) {
  const payload = verifyAndDecodeToken_(token); // dari Auth.gs (fungsi internal)
  const user = payload.user || {};
  const role = String(user.role || '').toLowerCase();
  if (!allowedRoles.map(r => r.toLowerCase()).includes(role)) {
    throw new Error('Tidak punya akses.');
  }
  return { user };
}

function getHeaderMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h || '').trim().toLowerCase();
    if (key) map[key] = i + 1; // 1-based col index
  });

  // minimal columns yang dibutuhkan
  const required = ['tanggal', 'id_personil', 'jam_masuk', 'jam_pulang'];
  for (const r of required) {
    if (!map[r]) throw new Error(`Kolom wajib "${r}" tidak ditemukan di sheet Absensi (baris header).`);
  }

  return map;
}

function normalizeDateKey_(v) {
  // terima Date atau string, jadikan yyyy-MM-dd
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  if (!s) return '';
  // kalau sudah yyyy-MM-dd, pakai langsung
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // coba parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return s;
}

function findAbsensiRow_(sheet, map, tanggalYmd, idPersonil) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const colTanggal = map['tanggal'];
  const colId = map['id_personil'];

  // Ambil range minimum untuk pencarian cepat
  const tanggalVals = sheet.getRange(2, colTanggal, lastRow - 1, 1).getValues();
  const idVals = sheet.getRange(2, colId, lastRow - 1, 1).getValues();

  for (let i = 0; i < tanggalVals.length; i++) {
    const t = normalizeDateKey_(tanggalVals[i][0]);
    const pid = String(idVals[i][0] || '').trim();
    if (t === tanggalYmd && pid === String(idPersonil)) {
      const rowIndex = i + 2; // data mulai row 2
      const row = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
      row.__rowIndex = rowIndex;
      return row;
    }
  }
  return null;
}

function getCellFromRow_(row, map, headerKey) {
  const col = map[headerKey];
  if (!col) return '';
  return row[col - 1] ?? '';
}

function rowToAbsensi_(row, map) {
  return {
    tanggal: normalizeDateKey_(getCellFromRow_(row, map, 'tanggal')),
    id_personil: String(getCellFromRow_(row, map, 'id_personil') || ''),
    lokasi_site: String(getCellFromRow_(row, map, 'lokasi_site') || ''),
    jam_masuk: String(getCellFromRow_(row, map, 'jam_masuk') || ''),
    jam_pulang: String(getCellFromRow_(row, map, 'jam_pulang') || ''),
    status: String(getCellFromRow_(row, map, 'status') || ''),
    keterangan: String(getCellFromRow_(row, map, 'keterangan') || '')
  };
}

function appendAbsensiRow_(sheet, map, data) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = new Array(headers.length).fill('');

  // isi sesuai header yang ada
  setIfExists_(row, map, 'id_absensi', data.id_absensi || '');
  setIfExists_(row, map, 'tanggal', data.tanggal || '');
  setIfExists_(row, map, 'id_personil', data.id_personil || '');
  setIfExists_(row, map, 'lokasi_site', data.lokasi_site || '');
  setIfExists_(row, map, 'jam_masuk', data.jam_masuk || '');
  setIfExists_(row, map, 'jam_pulang', data.jam_pulang || '');
  setIfExists_(row, map, 'status', data.status || '');
  setIfExists_(row, map, 'keterangan', data.keterangan || '');

  sheet.appendRow(row);
}

function updateAbsensiRow_(sheet, map, rowIndex, patch) {
  const lastCol = sheet.getLastColumn();
  const range = sheet.getRange(rowIndex, 1, 1, lastCol);
  const row = range.getValues()[0];

  // patch fields if exist
  for (const k in patch) {
    setIfExists_(row, map, k, patch[k]);
  }
  range.setValues([row]);
}

function setIfExists_(rowArray, map, key, value) {
  const col = map[String(key || '').trim().toLowerCase()];
  if (!col) return;
  rowArray[col - 1] = value;
}
