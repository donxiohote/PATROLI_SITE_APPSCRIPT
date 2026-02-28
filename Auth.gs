/** Auth.gs - login + token HMAC (mirip JWT sederhana) */

function login(username, password) {
  username = String(username || '').trim();
  password = String(password || '');

  if (!username || !password) {
    return { ok: false, message: 'Username dan password wajib diisi.' };
  }

  const users = readAllAsObjects_('User');

  // Cari user by username (case-sensitive; kalau mau case-insensitive: toLowerCase())
  const u = users.find(x => String(x.username || '').trim() === username);

  if (!u) return { ok: false, message: 'Username tidak ditemukan.' };

  // status (opsional)
  const status = String(u.status || '').toLowerCase();
  if (status && status !== 'aktif' && status !== 'active' && status !== '1' && status !== 'true') {
    // kalau kamu pakai status "Aktif/Nonaktif"
    // biarkan "aktif" lolos, selain itu blok
    // (kalau status kosong, dianggap aktif)
    return { ok: false, message: 'Akun tidak aktif.' };
  }

  const stored = String(u.password_hash || '');

  // Dukungan 2 mode:
  // 1) Kalau password_hash diawali "sha256:" -> verifikasi sha256(username:password:SALT)
  // 2) Selain itu -> bandingkan plaintext langsung (untuk tahap awal)
  const isOk = verifyPassword_(username, password, stored);

  if (!isOk) return { ok: false, message: 'Password salah.' };

  // Ambil fields penting (id_personil bisa belum ada -> fallback kosong)
  const user = {
    id_user: u.id_user ?? '',
    username: u.username ?? '',
    nama: u.nama ?? '',
    role: u.role ?? '',
    lokasi_site_default: u.lokasi_site_default ?? '',
    id_personil: u.id_personil ?? '' // user bilang sudah menambahkan kolom ini di Google Sheet
  };

  const token = signToken_(user);

  return {
    ok: true,
    token,
    user: {
      nama: user.nama,
      role: user.role,
      lokasi_site_default: user.lokasi_site_default,
      id_personil: user.id_personil
    }
  };
}

function verifyToken(token) {
  try {
    const payload = verifyAndDecodeToken_(token);
    return { ok: true, user: payload.user };
  } catch (err) {
    return { ok: false, message: String(err && err.message ? err.message : err) };
  }
}

/** ---------- Internal helpers ---------- */

function verifyPassword_(username, password, stored) {
  if (!stored) return false;

  // Mode hash: "sha256:<hex>"
  if (stored.startsWith('sha256:')) {
    const hex = stored.slice('sha256:'.length).trim();
    const computed = sha256Hex_(`${username}:${password}:${getSalt_()}`);
    return timingSafeEqual_(hex, computed);
  }

  // Mode plaintext (sementara)
  return timingSafeEqual_(stored, password);
}

function getSalt_() {
  // optional, kalau kamu mau tambah salt: set Script Property USER_SALT
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('USER_SALT') || 'PATROLI_SITE_DEFAULT_SALT';
}

function signToken_(userObj) {
  const header = { alg: 'HS256', typ: 'PT-JWT' };
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iat: now,
    exp: now + (12 * 60 * 60), // 12 jam
    user: {
      id_user: String(userObj.id_user || ''),
      username: String(userObj.username || ''),
      nama: String(userObj.nama || ''),
      role: String(userObj.role || ''),
      lokasi_site_default: String(userObj.lokasi_site_default || ''),
      id_personil: String(userObj.id_personil || '')
    }
  };

  const h = base64UrlEncode_(JSON.stringify(header));
  const p = base64UrlEncode_(JSON.stringify(payload));
  const sig = hmacSha256Base64Url_(`${h}.${p}`, getAppSecret_());

  return `${h}.${p}.${sig}`;
}

function verifyAndDecodeToken_(token) {
  if (!token) throw new Error('Token kosong. Silakan login ulang.');

  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('Format token tidak valid.');

  const [h, p, sig] = parts;
  const expected = hmacSha256Base64Url_(`${h}.${p}`, getAppSecret_());
  if (!timingSafeEqual_(sig, expected)) throw new Error('Token tidak valid (signature mismatch).');

  const payloadJson = base64UrlDecodeToString_(p);
  const payload = JSON.parse(payloadJson);

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || now > payload.exp) throw new Error('Session expired. Silakan login ulang.');

  // Validasi minimal field
  if (!payload.user || !payload.user.role) throw new Error('Token payload tidak lengkap.');

  return payload;
}

function getAppSecret_() {
  const props = PropertiesService.getScriptProperties();
  const s = props.getProperty('APP_SECRET');
  if (!s) throw new Error('APP_SECRET belum diset di Script Properties.');
  return s;
}

function hmacSha256Base64Url_(data, secret) {
  const sigBytes = Utilities.computeHmacSha256Signature(data, secret);
  const b64 = Utilities.base64Encode(sigBytes);
  return base64ToBase64Url_(b64);
}

function sha256Hex_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function base64UrlEncode_(str) {
  const b64 = Utilities.base64EncodeWebSafe(str); // already websafe, but keep consistent
  // Utilities.base64EncodeWebSafe uses '-' '_' and no padding by default
  return b64.replace(/=+$/g, '');
}

function base64UrlDecodeToString_(b64url) {
  // pad
  let s = String(b64url).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bytes = Utilities.base64Decode(s);
  return Utilities.newBlob(bytes).getDataAsString('UTF-8');
}

function base64ToBase64Url_(b64) {
  return String(b64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Timing-safe-ish string compare (best effort in JS runtime) */
function timingSafeEqual_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  let res = 0;
  for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return res === 0;
}
