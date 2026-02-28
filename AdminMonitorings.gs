/** AdminMonitoring.gs - Dashboard Admin Monitoring (LIVE) OPTIMIZED */

function adminGetTodayMonitoring(token, tanggalYmd, filter) {
  requireAuth_(token, ['admin','komandan']);

  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const tanggal = tanggalYmd || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  filter = filter || {};
  const fSite = String(filter.lokasi_site || '').trim();
  const fKat  = String(filter.kategori || '').trim();

  // ===== Cache (biar refresh super cepat) =====
  // cache per tanggal + filter, TTL 15 detik (ubah kalau mau)
  const cache = CacheService.getScriptCache();
  const cacheKey = `MON_${tanggal}|S:${fSite}|K:${fKat}`;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // --- personil aktif (relatif kecil) ---
  const personil = getActivePersonilFast_(fSite, fKat);

  // --- absensi hari ini (scan minimal kolom) ---
  const absMap = getAbsensiMapByTanggalFast_(tanggal);

  // --- scan patroli hari ini (scan minimal kolom) ---
  const scanMap = getScanAggByTanggalFast_(tanggal);

  // --- build outputs ---
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
      jam_pulang: a.jam_pulang || '',
      status: a.status || ''
    });

    if (a.jam_masuk && !a.jam_pulang) {
      belumPulang.push({
        id_personil: pid,
        nama: p.nama || '',
        kategori: p.kategori || '',
        lokasi_site: p.lokasi_site || '',
        jam_masuk: a.jam_masuk || '',
        status: a.status || ''
      });
    }

    // belum scan: hanya yang sudah masuk
    if ((s.count || 0) === 0) {
      belumScan.push({
        id_personil: pid,
        nama: p.nama || '',
        kategori: p.kategori || '',
        lokasi_site: p.lokasi_site || '',
        jam_masuk: a.jam_masuk || ''
      });
    }
  }

  scanSummary.sort((x, y) => (y.scan_count || 0) - (x.scan_count || 0));

  const result = {
    ok: true,
    tanggal,
    filter: { lokasi_site: fSite, kategori: fKat },
    totals: {
      personil_aktif: personil.length,
      hadir: hadir.length,
      belum_masuk: belumMasuk.length,
      belum_pulang: belumPulang.length,
      belum_scan: belumScan.length,
      total_scan: scanSummary.reduce((acc, r) => acc + (Number(r.scan_count) || 0), 0)
    },
    data: { belumMasuk, belumPulang, belumScan, hadir, scanSummary }
  };

  // simpan cache 15 detik
  cache.put(cacheKey, JSON.stringify(result), 15);

  return result;
}

/* =========================
   FAST HELPERS (OPTIMIZED)
========================= */

function getActivePersonilFast_(lokasiSite, kategori) {
  const sh = getSheet_('Personil');
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return [];

  // baca header saja
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h||'').trim().toLowerCase());
  const idx = (name) => headers.indexOf(name);

  const iId = idx('id_personil');
  if (iId < 0) throw new Error('Personil: kolom id_personil tidak ditemukan');

  const iNama = idx('nama');
  const iKat = idx('kategori');
  const iSite = idx('lokasi_site');
  const iStatus = idx('status');
  const iLevel = idx('level_akses');

  // baca data tanpa getDataRange (lebih ringan)
  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const out = [];
  for (let r = 0; r < values.length; r++) {
    const row = values[r];
    const id = String(row[iId] || '').trim();
    if (!id) continue;

    const st = (iStatus >= 0) ? String(row[iStatus]||'').trim().toUpperCase() : 'AKTIF';
    if (st && st !== 'AKTIF' && st !== 'ACTIVE') continue;

    const site = (iSite >= 0) ? String(row[iSite]||'').trim() : '';
    const kat  = (iKat >= 0) ? String(row[iKat]||'').trim() : '';

    if (lokasiSite && site !== lokasiSite) continue;
    if (kategori && kat !== kategori) continue;

    out.push({
      id_personil: id,
      nama: (iNama >= 0) ? String(row[iNama]||'').trim() : '',
      kategori: kat,
      lokasi_site: site,
      status: st,
      level_akses: (iLevel >= 0) ? String(row[iLevel]||'').trim() : ''
    });
  }
  return out;
}

function getAbsensiMapByTanggalFast_(tanggal) {
  const sh = getSheet_('Absensi');
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return {};

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h||'').trim().toLowerCase());
  const idx = (name) => headers.indexOf(name);

  const iTgl = idx('tanggal');
  const iPid = idx('id_personil');
  if (iTgl < 0 || iPid < 0) throw new Error('Absensi: kolom tanggal / id_personil tidak ditemukan');

  const iMas = idx('jam_masuk');
  const iPul = idx('jam_pulang');
  const iSt  = idx('status');
  const iSite= idx('lokasi_site');

  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const out = {};
  for (let r = 0; r < values.length; r++) {
    const row = values[r];
    const tgl = normalizeDateKey_(row[iTgl]);
    if (tgl !== tanggal) continue;

    const pid = String(row[iPid] || '').trim();
    if (!pid) continue;

    // override bila ada lebih dari 1 entry di tanggal sama
    out[pid] = {
      jam_masuk: iMas >= 0 ? String(row[iMas]||'') : '',
      jam_pulang: iPul >= 0 ? String(row[iPul]||'') : '',
      status: iSt >= 0 ? String(row[iSt]||'') : '',
      lokasi_site: iSite >= 0 ? String(row[iSite]||'') : ''
    };
  }
  return out;
}

function getScanAggByTanggalFast_(tanggal) {
  const sh = getSheet_('ScanPatroli');
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return {};

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h||'').trim().toLowerCase());
  const idx = (name) => headers.indexOf(name);

  const iTgl = idx('tanggal');
  const iPid = idx('id_personil');
  if (iTgl < 0 || iPid < 0) throw new Error('ScanPatroli: kolom tanggal / id_personil tidak ditemukan');

  const iJam = idx('jam');
  const iCp  = idx('id_checkpoint');
  const iArea= idx('id_area');

  // NOTE: ini tetap baca semua baris, tapi hanya sekali, dan dipercepat
  // Kalau scan sudah sangat besar (puluhan ribu), kita lanjut step "index cache harian"
  const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const out = {};
  for (let r = 0; r < values.length; r++) {
    const row = values[r];

    const tgl = normalizeDateKey_(row[iTgl]);
    if (tgl !== tanggal) continue;

    const pid = String(row[iPid] || '').trim();
    if (!pid) continue;

    let o = out[pid];
    if (!o) o = out[pid] = { count: 0, last_jam: '', last_checkpoint: '', last_area: '' };
    o.count++;

    const jam = iJam >= 0 ? String(row[iJam]||'') : '';
    if (jam && jam >= (o.last_jam || '')) {
      o.last_jam = jam;
      o.last_checkpoint = iCp >= 0 ? String(row[iCp]||'') : '';
      o.last_area = iArea >= 0 ? String(row[iArea]||'') : '';
    }
  }
  return out;
}
