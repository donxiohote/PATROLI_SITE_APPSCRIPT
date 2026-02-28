/** ScanPatroli.gs - Signed QR + GPS Geofence + Wajib Login + Wajib Absen + ShiftPersonil */

const PATROL_RULES_ = {
  REQUIRE_ABSEN_MASUK: true,         // wajib absen masuk hari ini sebelum scan
  BLOCK_AFTER_ABSEN_PULANG: true,    // jika sudah pulang, tidak boleh scan

  REQUIRE_SIGNED_QR: true,           // wajib cp+sig (anti tembak manual)
  REQUIRE_GPS: true,                 // wajib GPS aktif
  DEFAULT_RADIUS_M: 80,              // jika radius_m kosong di Checkpoint
  MAX_ACCURACY_M: 80,                // jika accuracy GPS > ini, tolak (opsional)

  MIN_INTERVAL_SAME_CP_SEC: 60,      // duplikat checkpoint sama dalam X detik ditolak
  MIN_INTERVAL_ANY_CP_SEC: 20        // scan apapun minimal X detik (anti spam)
};

/**
 * meta dari client diharapkan berisi:
 * - device_info
 * - source (camera_qr / scan_qr / manual_input)
 * - sig (signature dari QR link)
 * - lat, lng, accuracy (GPS)
 */
function scanCheckpoint(token, id_checkpoint, meta) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = requireAuth_(token, ['security','cs','driver','admin','komandan']);
    const user = ctx.user;

    if (!user.id_personil) {
      return { ok: false, message: 'Akun belum terhubung ke id_personil. Cek kolom id_personil di sheet User.' };
    }

    const cpId = String(id_checkpoint || '').trim();
    if (!cpId) return { ok: false, message: 'id_checkpoint kosong.' };

    meta = meta || {};

    // --- waktu server ---
    const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
    const now = new Date();
    const tanggal = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
    const jam = Utilities.formatDate(now, tz, 'HH:mm:ss');
    const ts = Utilities.formatDate(now, tz, "yyyy-MM-dd'T'HH:mm:ss");

    // --- validasi shift dari DB (ShiftPersonil) ---
    const vShift = validateShiftFromDb_(user.id_personil, tanggal, jam);
    if (!vShift.ok) return vShift;

    // --- wajib absen masuk hari ini (anti curang) ---
    if (PATROL_RULES_.REQUIRE_ABSEN_MASUK) {
      const abs = getAbsensiTodayByPersonil_(tanggal, user.id_personil);
      if (!abs || !abs.jam_masuk) {
        return { ok: false, message: 'Wajib Absen Masuk terlebih dahulu sebelum Scan Patroli.' };
      }
      if (PATROL_RULES_.BLOCK_AFTER_ABSEN_PULANG && abs.jam_pulang) {
        return { ok: false, message: 'Kamu sudah Absen Pulang. Scan tidak bisa dilakukan setelah pulang.' };
      }
    }

    // --- checkpoint harus valid ---
    const cp = getCheckpointById_(cpId);
    if (!cp) return { ok: false, message: `Checkpoint "${cpId}" tidak ditemukan.` };

    // --- signed QR wajib ---
    if (PATROL_RULES_.REQUIRE_SIGNED_QR) {
      const sig = String(meta.sig || '').trim();
      if (!sig) return { ok: false, message: 'QR tidak valid (signature kosong). Gunakan QR resmi.' };
      const okSig = verifyQrSig_(cpId, String(cp.id_area || ''), sig);
      if (!okSig) return { ok: false, message: 'QR tidak valid (signature salah). Gunakan QR resmi.' };
    }

    // --- GPS wajib + geofence ke koordinat checkpoint ---
    if (PATROL_RULES_.REQUIRE_GPS) {
      const lat = meta.lat != null ? Number(meta.lat) : NaN;
      const lng = meta.lng != null ? Number(meta.lng) : NaN;
      const acc = meta.accuracy != null ? Number(meta.accuracy) : NaN;

      if (!isFinite(lat) || !isFinite(lng)) {
        return { ok: false, message: 'GPS wajib aktif. Lokasi tidak terbaca.' };
      }
      if (isFinite(acc) && acc > PATROL_RULES_.MAX_ACCURACY_M) {
        return { ok: false, message: `Akurasi GPS terlalu rendah (${Math.round(acc)}m). Tunggu sinyal lebih stabil.` };
      }

      const geo = getCheckpointGeoById_(cpId); // {lat,lng,radius_m}
      if (!geo || !isFinite(geo.lat) || !isFinite(geo.lng)) {
        return { ok: false, message: 'Checkpoint belum punya koordinat (lat/lng). Set di master Checkpoint.' };
      }
      const radius = isFinite(geo.radius_m) ? geo.radius_m : PATROL_RULES_.DEFAULT_RADIUS_M;
      const dist = haversineMeters_(lat, lng, geo.lat, geo.lng);

      if (dist > radius) {
        return { ok: false, message: `Di luar area checkpoint. Jarak ~${Math.round(dist)}m (maks ${Math.round(radius)}m).` };
      }
    }

    // --- anti spam/duplikat ---
    const antiSame = checkRecentDuplicateScanSameCp_(user.id_personil, cpId, PATROL_RULES_.MIN_INTERVAL_SAME_CP_SEC);
    if (!antiSame.ok) return antiSame;

    const antiAny = checkRecentDuplicateScanAnyCp_(user.id_personil, PATROL_RULES_.MIN_INTERVAL_ANY_CP_SEC);
    if (!antiAny.ok) return antiAny;

    // --- simpan scan ---
    const sh = getSheet_('ScanPatroli');
    const map = getHeaderMapScan_(sh);

    const deviceInfo = meta.device_info ? String(meta.device_info).slice(0, 200) : '';
    const source = meta.source ? String(meta.source).slice(0, 50) : 'scan_qr';

    const latStr = (meta.lat != null && isFinite(Number(meta.lat))) ? String(meta.lat) : '';
    const lngStr = (meta.lng != null && isFinite(Number(meta.lng))) ? String(meta.lng) : '';
    const accStr = (meta.accuracy != null && isFinite(Number(meta.accuracy))) ? String(meta.accuracy) : '';

    appendScanRow_(sh, map, {
      id_scan: nextId_('SCN', tanggal.replaceAll('-', '')),
      timestamp: ts,
      tanggal,
      jam,
      id_personil: user.id_personil,
      id_area: String(cp.id_area || ''),
      id_checkpoint: cpId,
      device_info: deviceInfo,
      source: source,

      // GPS optional columns (kalau ada di sheet)
      lat: latStr,
      lng: lngStr,
      accuracy: accStr,

      // signature optional column (kalau mau disimpan)
      sig: String(meta.sig || '').trim()
    });

    return {
      ok: true,
      message: `Scan berhasil: ${cpId} (${cp.nama_checkpoint || ''})`,
      data: {
        timestamp: ts,
        tanggal,
        jam,
        id_personil: user.id_personil,
        id_area: String(cp.id_area || ''),
        id_checkpoint: cpId,
        nama_checkpoint: cp.nama_checkpoint || '',
        lokasi_aset: cp.lokasi_aset || ''
      }
    };

  } catch (err) {
    return { ok: false, message: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

/** ===================== Absen gate ===================== */
function getAbsensiTodayByPersonil_(tanggalYmd, idPersonil) {
  const sh = getSheet_('Absensi');
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0].map(h => String(h||'').trim().toLowerCase());
  const idx = (name) => headers.indexOf(name);

  const iTgl = idx('tanggal');
  const iPid = idx('id_personil');
  const iMas = idx('jam_masuk');
  const iPul = idx('jam_pulang');
  const iSt  = idx('status');
  const iSite= idx('lokasi_site');

  if (iTgl < 0 || iPid < 0) return null;

  const pidNeed = String(idPersonil||'').trim();
  let last = null;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const tgl = normalizeDateKey_(row[iTgl]);
    if (tgl !== String(tanggalYmd)) continue;

    const pid = String(row[iPid]||'').trim();
    if (pid !== pidNeed) continue;

    last = {
      jam_masuk: String(row[iMas]||'').trim(),
      jam_pulang: String(row[iPul]||'').trim(),
      status: (iSt>=0)?String(row[iSt]||'').trim():'',
      lokasi_site: (iSite>=0)?String(row[iSite]||'').trim():''
    };
  }
  return last;
}

/** ===================== Recent scan checks ===================== */
function checkRecentDuplicateScanSameCp_(idPersonil, idCheckpoint, withinSeconds) {
  const sh = getSheet_('ScanPatroli');
  const map = getHeaderMapScan_(sh);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true };

  const take = Math.min(30, lastRow - 1);
  const rows = sh.getRange(lastRow - take + 1, 1, take, sh.getLastColumn()).getValues();

  const pidNeed = String(idPersonil);
  const cpNeed = String(idCheckpoint);

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const pid = String(row[map.id_personil - 1] || '').trim();
    const cp  = String(row[map.id_checkpoint - 1] || '').trim();
    if (pid !== pidNeed || cp !== cpNeed) continue;

    const ts = String(row[map.timestamp - 1] || '').trim();
    const last = new Date(ts);
    if (isNaN(last.getTime())) return { ok: true };

    const diff = (Date.now() - last.getTime()) / 1000;
    if (diff < withinSeconds) {
      return { ok: false, message: `Duplikat checkpoint. Tunggu ${withinSeconds}s sebelum scan CP yang sama.` };
    }
    break;
  }
  return { ok: true };
}

function checkRecentDuplicateScanAnyCp_(idPersonil, withinSeconds) {
  const sh = getSheet_('ScanPatroli');
  const map = getHeaderMapScan_(sh);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true };

  const row = sh.getRange(lastRow, 1, 1, sh.getLastColumn()).getValues()[0];
  const pid = String(row[map.id_personil - 1] || '').trim();
  if (pid !== String(idPersonil)) return { ok: true };

  const ts = String(row[map.timestamp - 1] || '').trim();
  const last = new Date(ts);
  if (isNaN(last.getTime())) return { ok: true };

  const diff = (Date.now() - last.getTime()) / 1000;
  if (diff < withinSeconds) {
    return { ok: false, message: `Terlalu cepat. Tunggu ${withinSeconds}s sebelum scan lagi.` };
  }
  return { ok: true };
}

/** ===================== Scan history ===================== */
function getMyRecentScans(token, limit) {
  const ctx = requireAuth_(token, ['admin','komandan','security','cs','driver']);
  const user = ctx.user;

  if (!user.id_personil) return { ok: false, message: 'Akun belum terhubung ke id_personil.' };

  limit = Number(limit || 20);
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  const sh = getSheet_('ScanPatroli');
  const map = getHeaderMapScan_(sh);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true, data: [] };

  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  const out = [];

  for (let i = data.length - 1; i >= 0 && out.length < limit; i--) {
    const row = data[i];
    const pid = String(row[(map.id_personil - 1)] || '').trim();
    if (pid !== String(user.id_personil)) continue;

    out.push({
      timestamp: String(row[(map.timestamp - 1)] || ''),
      tanggal: normalizeDateKey_(row[(map.tanggal - 1)] || ''),
      jam: String(row[(map.jam - 1)] || ''),
      id_checkpoint: String(row[(map.id_checkpoint - 1)] || ''),
      id_area: String(row[(map.id_area - 1)] || ''),
      source: map.source ? String(row[(map.source - 1)] || '') : '',
      device_info: map.device_info ? String(row[(map.device_info - 1)] || '') : '',
      lat: map.lat ? String(row[(map.lat - 1)] || '') : '',
      lng: map.lng ? String(row[(map.lng - 1)] || '') : '',
      accuracy: map.accuracy ? String(row[(map.accuracy - 1)] || '') : ''
    });
  }

  return { ok: true, data: out };
}

/** ===================== Sheet maps & master ===================== */
function getHeaderMapScan_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h || '').trim().toLowerCase();
    if (key) map[key] = i + 1;
  });

  const required = ['timestamp', 'tanggal', 'jam', 'id_personil', 'id_area', 'id_checkpoint'];
  for (const r of required) {
    if (!map[r]) throw new Error(`Kolom wajib "${r}" tidak ditemukan di sheet ScanPatroli (baris header).`);
  }
  return map;
}

function getCheckpointById_(id) {
  const sh = getSheet_('Checkpoint');
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0].map(h => String(h || '').trim().toLowerCase());
  const idx = {};
  headers.forEach((h, i) => { if (h) idx[h] = i; });

  const idKey = 'id_checkpoint';
  if (idx[idKey] == null) throw new Error('Header "id_checkpoint" tidak ditemukan di sheet Checkpoint.');

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const rid = String(row[idx[idKey]] || '').trim();
    if (rid === String(id).trim()) {
      return {
        id_checkpoint: rid,
        id_area: idx['id_area'] != null ? row[idx['id_area']] : '',
        nama_checkpoint: idx['nama_checkpoint'] != null ? row[idx['nama_checkpoint']] : '',
        lokasi_aset: idx['lokasi_aset'] != null ? row[idx['lokasi_aset']] : '',
        deskripsi_tugas: idx['deskripsi_tugas'] != null ? row[idx['deskripsi_tugas']] : '',
        kategori: idx['kategori'] != null ? row[idx['kategori']] : ''
      };
    }
  }
  return null;
}

/** ambil geo checkpoint dari master Checkpoint (kolom: lat,lng,radius_m) */
function getCheckpointGeoById_(id) {
  const sh = getSheet_('Checkpoint');
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0].map(h => String(h || '').trim().toLowerCase());
  const idx = {};
  headers.forEach((h, i) => { if (h) idx[h] = i; });

  if (idx['id_checkpoint'] == null) throw new Error('Header "id_checkpoint" tidak ditemukan di sheet Checkpoint.');

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const rid = String(row[idx['id_checkpoint']] || '').trim();
    if (rid !== String(id).trim()) continue;

    const lat = idx['lat'] != null ? Number(row[idx['lat']]) : NaN;
    const lng = idx['lng'] != null ? Number(row[idx['lng']]) : NaN;
    const radius = idx['radius_m'] != null ? Number(row[idx['radius_m']]) : NaN;

    return {
      lat,
      lng,
      radius_m: isFinite(radius) ? radius : PATROL_RULES_.DEFAULT_RADIUS_M
    };
  }
  return null;
}

/** ===================== Signed QR helpers ===================== */
/**
 * Signature dibuat dari "cp|id_area" dengan HMAC-SHA256 + QR_SECRET (Script Properties)
 * QR link: ?page=scan&cp=CP001&sig=...
 */
function makeQrSig_(cpId, idArea) {
  const secret = PropertiesService.getScriptProperties().getProperty('QR_SECRET') || '';
  if (!secret) throw new Error('Script Property QR_SECRET belum diset.');

  const payload = `${String(cpId||'').trim()}|${String(idArea||'').trim()}`;
  const raw = Utilities.computeHmacSha256Signature(payload, secret);
  return base64Url_(raw);
}

function verifyQrSig_(cpId, idArea, sig) {
  try {
    const expected = makeQrSig_(cpId, idArea);
    return timingSafeEqual_(String(sig||''), String(expected));
  } catch(e) {
    return false;
  }
}

function base64Url_(bytes) {
  const b64 = Utilities.base64Encode(bytes);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function timingSafeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return out === 0;
}

/** ===================== GPS distance ===================== */
function haversineMeters_(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat/2)*Math.sin(dLat/2) +
    Math.cos(toRad(lat1))*Math.cos(toRad(lat2)) *
    Math.sin(dLon/2)*Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/** ===================== Append row (supports optional cols) ===================== */
function appendScanRow_(sheet, map, data) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = new Array(headers.length).fill('');

  setIfExists_(row, map, 'id_scan', data.id_scan || '');
  setIfExists_(row, map, 'timestamp', data.timestamp || '');
  setIfExists_(row, map, 'tanggal', data.tanggal || '');
  setIfExists_(row, map, 'jam', data.jam || '');
  setIfExists_(row, map, 'id_personil', data.id_personil || '');
  setIfExists_(row, map, 'id_area', data.id_area || '');
  setIfExists_(row, map, 'id_checkpoint', data.id_checkpoint || '');
  setIfExists_(row, map, 'device_info', data.device_info || '');
  setIfExists_(row, map, 'source', data.source || '');

  // optional columns (tambahkan header di ScanPatroli jika mau disimpan)
  setIfExists_(row, map, 'lat', data.lat || '');
  setIfExists_(row, map, 'lng', data.lng || '');
  setIfExists_(row, map, 'accuracy', data.accuracy || '');
  setIfExists_(row, map, 'sig', data.sig || '');

  sheet.appendRow(row);
}

/** ===================== ShiftPersonil helpers (copas dari modul shift kamu) ===================== */
function normalizeTime_(v) {
  if (v == null || v === '') return '';

  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return '';
    if (/^\d{1,2}:\d{2}$/.test(s)) return s.padStart(5, '0') + ':00';
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) {
      const parts = s.split(':');
      return String(parts[0]).padStart(2,'0') + ':' + parts[1] + ':' + parts[2];
    }
    return s;
  }

  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
    return Utilities.formatDate(v, tz, 'HH:mm:ss');
  }

  if (typeof v === 'number') {
    const totalSec = Math.round(v * 24 * 3600);
    const hh = Math.floor(totalSec / 3600) % 24;
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    return String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
  }

  return String(v).trim();
}

function getShiftForPersonil_(idPersonil, tanggalYmd) {
  const sh = getSheet_('ShiftPersonil');
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0].map(h => String(h || '').trim().toLowerCase());
  const idx = (name) => headers.indexOf(name);

  const iPid = idx('id_personil');
  const iTgl = idx('tanggal');
  const iShift = idx('shift');
  const iMulai = idx('jam_mulai');
  const iSelesai = idx('jam_selesai');

  if (iPid < 0 || iTgl < 0 || iMulai < 0 || iSelesai < 0) {
    throw new Error('ShiftPersonil: header wajib tidak lengkap. Wajib ada id_personil, tanggal, jam_mulai, jam_selesai.');
  }

  const pidNeed = String(idPersonil || '').trim();
  const tglNeed = String(tanggalYmd || '').trim();

  let found = null;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const pid = String(row[iPid] || '').trim();
    if (!pid || pid !== pidNeed) continue;

    const tgl = normalizeDateKey_(row[iTgl]);
    if (tgl !== tglNeed) continue;

    found = {
      shift: (iShift >= 0) ? String(row[iShift] || '').trim() : '',
      jam_mulai: normalizeTime_(row[iMulai]),
      jam_selesai: normalizeTime_(row[iSelesai])
    };
  }

  if (!found) {
    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      const pid = String(row[iPid] || '').trim();
      if (pid !== pidNeed) continue;

      const tgl = String(row[iTgl] || '').trim();
      if (tgl) continue;

      found = {
        shift: (iShift >= 0) ? String(row[iShift] || '').trim() : '',
        jam_mulai: normalizeTime_(row[iMulai]),
        jam_selesai: normalizeTime_(row[iSelesai])
      };
    }
  }

  return found;
}

function isNowWithinShiftWindow_(jamNow, jamMulai, jamSelesai) {
  const now = String(jamNow || '').trim();
  const start = String(jamMulai || '').trim();
  const end = String(jamSelesai || '').trim();
  if (!now || !start || !end) return false;

  if (start <= end) return (now >= start && now <= end);
  return (now >= start || now <= end);
}

function validateShiftFromDb_(idPersonil, tanggalYmd, jamNow) {
  const shf = getShiftForPersonil_(idPersonil, tanggalYmd);

  if (!shf || !shf.jam_mulai || !shf.jam_selesai) {
    return { ok: false, message: 'Jadwal shift hari ini belum diatur (ShiftPersonil). Hubungi admin/komandan.' };
  }

  const ok = isNowWithinShiftWindow_(jamNow, shf.jam_mulai, shf.jam_selesai);
  if (!ok) {
    const label = shf.shift ? `Shift ${shf.shift}` : 'Shift';
    return { ok: false, message: `${label} kamu: ${shf.jam_mulai}–${shf.jam_selesai}. Scan di luar jam shift.` };
  }
  return { ok: true, shift: shf };
}
