/** Profil.gs - Fase 2.4 Profil (view + update + ganti password) */

function getMyProfile(token) {
  try {
    const ctx = requireAuth_(token, ['admin','komandan','security','cs','driver']);
    const user = ctx.user;

    if (!user.id_personil) {
      return { ok: false, message: 'Akun belum terhubung ke id_personil. Cek kolom id_personil di sheet User.' };
    }

    const personil = getPersonilById_(user.id_personil); // bisa null kalau belum ada baris Personil
    return {
      ok: true,
      data: {
        user: {
          username: user.username || '',
          nama: user.nama || '',
          role: user.role || '',
          lokasi_site_default: user.lokasi_site_default || '',
          id_personil: user.id_personil || ''
        },
        personil: personil ? personil.data : null,
        personil_headers: personil ? personil.headers : getPersonilHeaders_()
      }
    };
  } catch (err) {
    return { ok: false, message: String(err && err.message ? err.message : err) };
  }
}

function updateMyProfile(token, patch) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = requireAuth_(token, ['admin','komandan','security','cs','driver']);
    const user = ctx.user;

    if (!user.id_personil) {
      return { ok: false, message: 'Akun belum terhubung ke id_personil. Cek kolom id_personil di sheet User.' };
    }

    patch = patch || {};
    // Whitelist umum (aman). Kalau kolomnya ada → update. Kalau tidak ada → skip.
    const allowed = [
      'nama',
      'no_hp',
      'url_foto'
    ];



    // Normalisasi keys (tanpa memaksa harus ada)
    const cleaned = {};
    for (const k in patch) {
      const key = String(k || '').trim();
      if (!key) continue;
      // batasi panjang nilai agar tidak merusak sheet
      const val = String(patch[k] ?? '').trim().slice(0, 500);
      if (!val) continue;

      const lower = key.toLowerCase();
      if (allowed.includes(lower)) cleaned[lower] = val;
    }

    if (Object.keys(cleaned).length === 0) {
      return { ok: false, message: 'Tidak ada perubahan yang valid untuk disimpan.' };
    }

    const res = upsertPersonilById_(user.id_personil, cleaned);

    return {
      ok: true,
      message: 'Profil berhasil disimpan.',
      data: {
        updated: res.updated,
        skipped: res.skipped,
        personil: res.personil
      }
    };

  } catch (err) {
    return { ok: false, message: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

function changeMyPassword(token, oldPassword, newPassword) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = requireAuth_(token, ['admin','komandan','security','cs','driver']);
    const user = ctx.user;

    oldPassword = String(oldPassword || '');
    newPassword = String(newPassword || '');

    if (newPassword.length < 6) {
      return { ok: false, message: 'Password baru minimal 6 karakter.' };
    }

    // Ambil row User by username (sesuai token)
    const result = getUserRowByUsername_(user.username);
    if (!result) return { ok: false, message: 'Data user tidak ditemukan.' };

    const { sh, map, rowIndex, row } = result;
    const stored = String(row[map.password_hash - 1] || '');

    // Pakai verifier yang sudah ada di Auth.gs
    const ok = verifyPassword_(user.username, oldPassword, stored);
    if (!ok) return { ok: false, message: 'Password lama salah.' };

    // Set password_hash jadi sha256:...
    const newHash = 'sha256:' + sha256Hex_(`${user.username}:${newPassword}:${getSalt_()}`);
    sh.getRange(rowIndex, map.password_hash).setValue(newHash);

    return { ok: true, message: 'Password berhasil diubah.' };

  } catch (err) {
    return { ok: false, message: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

/** ===================== Helpers (Personil) ===================== */

function getPersonilHeaders_() {
  const sh = getSheet_('Personil');
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return headers.map(h => String(h || '').trim()).filter(Boolean);
}

function getPersonilById_(idPersonil) {
  const sh = getSheet_('Personil');
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h || '').trim().toLowerCase();
    if (key) map[key] = i + 1;
  });

  if (!map.id_personil) throw new Error('Header "id_personil" tidak ditemukan di sheet Personil.');

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  const idVals = sh.getRange(2, map.id_personil, lastRow - 1, 1).getValues();
  for (let i = 0; i < idVals.length; i++) {
    const pid = String(idVals[i][0] || '').trim();
    if (pid === String(idPersonil)) {
      const rowIndex = i + 2;
      const row = sh.getRange(rowIndex, 1, 1, sh.getLastColumn()).getValues()[0];

      const data = {};
      headers.forEach((h, idx) => {
        const k = String(h || '').trim();
        if (!k) return;
        data[k] = row[idx];
      });

      return { rowIndex, headers: headers.map(h => String(h || '').trim()), data };
    }
  }
  return null;
}

function upsertPersonilById_(idPersonil, patchLowerKeys) {
  const sh = getSheet_('Personil');
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h || '').trim().toLowerCase();
    if (key) map[key] = i + 1;
  });

  if (!map.id_personil) throw new Error('Header "id_personil" tidak ditemukan di sheet Personil.');

  const found = getPersonilById_(idPersonil);

  // siapkan row array
  let rowIndex;
  let row;
  if (found) {
    rowIndex = found.rowIndex;
    row = sh.getRange(rowIndex, 1, 1, sh.getLastColumn()).getValues()[0];
  } else {
    // bikin baris baru kosong
    rowIndex = sh.getLastRow() + 1;
    row = new Array(sh.getLastColumn()).fill('');
    row[map.id_personil - 1] = String(idPersonil);
  }

  const updated = [];
  const skipped = [];

  for (const keyLower in patchLowerKeys) {
    const col = map[keyLower];
    if (!col) {
      skipped.push(keyLower);
      continue;
    }
    row[col - 1] = patchLowerKeys[keyLower];
    updated.push(keyLower);
  }

  // tulis ke sheet
  if (found) {
    sh.getRange(rowIndex, 1, 1, sh.getLastColumn()).setValues([row]);
  } else {
    sh.appendRow(row);
    // rowIndex berubah kalau appendRow? (biasanya tetap). Kita set ulang ke lastRow.
    rowIndex = sh.getLastRow();
  }

  // ambil kembali data terbaru
  const latest = sh.getRange(rowIndex, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = {};
  headers.forEach((h, idx) => {
    const k = String(h || '').trim();
    if (!k) return;
    data[k] = latest[idx];
  });

  return { updated, skipped, personil: data };
}

/** ===================== Helpers (User) ===================== */

function getUserRowByUsername_(username) {
  const sh = getSheet_('User');
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h || '').trim().toLowerCase();
    if (key) map[key] = i + 1;
  });

  if (!map.username) throw new Error('Header "username" tidak ditemukan di sheet User.');
  if (!map.password_hash) throw new Error('Header "password_hash" tidak ditemukan di sheet User.');

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  const vals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  for (let i = 0; i < vals.length; i++) {
    const row = vals[i];
    const u = String(row[map.username - 1] || '').trim();
    if (u === String(username)) {
      return { sh, map, rowIndex: i + 2, row };
    }
  }
  return null;
}
