<div class="container py-3">
  <div class="d-flex align-items-center justify-content-between mb-3">
    <div>
      <h4 class="mb-1">Master Checkpoint</h4>
      <div class="text-muted" id="info" style="font-size:13px;"></div>
    </div>
    <a class="btn btn-outline-secondary btn-sm" href="<?= baseUrl ?>?page=dashboard">Kembali</a>
  </div>

  <div id="msg" class="alert" style="display:none;"></div>

  <div class="card mb-3">
    <div class="card-body">
      <div class="row g-2 align-items-end">
        <div class="col-md-3">
          <label class="form-label">Filter id_area</label>
          <input id="fArea" class="form-control" placeholder="contoh: BLM19">
        </div>
        <div class="col-md-3">
          <label class="form-label">Filter kategori</label>
          <input id="fKat" class="form-control" placeholder="Security / CS / Driver">
        </div>
        <div class="col-md-6 d-flex gap-2">
          <button class="btn btn-primary" onclick="load()">Refresh</button>
          <button class="btn btn-success" onclick="openForm()">+ Tambah</button>
          <button class="btn btn-outline-dark" onclick="genQr('missing')">Generate QR (yang kosong)</button>
          <button class="btn btn-outline-danger" onclick="genQr('all')">Generate QR (overwrite)</button>
          <button class="btn btn-outline-secondary" onclick="printQr()">Print QR</button>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-body">
      <div class="table-responsive">
        <table class="table table-sm table-striped align-middle">
          <thead>
            <tr>
              <th>ID</th><th>Area</th><th>Nama</th><th>Lokasi</th><th>Kategori</th><th>QR Link</th><th style="width:140px;">Aksi</th>
            </tr>
          </thead>
          <tbody id="tb"><tr><td colspan="7" class="text-muted"><i>Loading...</i></td></tr></tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<!-- Modal Form -->
<div class="modal fade" id="mdl" tabindex="-1">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="mdlTitle">Checkpoint</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="row g-2">
          <div class="col-md-3">
            <label class="form-label">id_checkpoint</label>
            <input id="id_checkpoint" class="form-control" placeholder="CP001">
          </div>
          <div class="col-md-3">
            <label class="form-label">id_area</label>
            <input id="id_area" class="form-control" placeholder="BLM19">
          </div>
          <div class="col-md-6">
            <label class="form-label">nama_checkpoint</label>
            <input id="nama_checkpoint" class="form-control" placeholder="Blok M19">
          </div>

          <div class="col-md-6">
            <label class="form-label">lokasi_aset</label>
            <input id="lokasi_aset" class="form-control" placeholder="Contoh: Lantai 1 dekat tangga">
          </div>
          <div class="col-md-6">
            <label class="form-label">kategori</label>
            <input id="kategori" class="form-control" placeholder="Security">
          </div>

          <div class="col-12">
            <label class="form-label">deskripsi_tugas</label>
            <textarea id="deskripsi_tugas" class="form-control" rows="3" placeholder="Instruksi patroli..."></textarea>
          </div>

          <div class="col-12">
            <label class="form-label">qrcode_link (opsional, biasanya auto generate)</label>
            <input id="qrcode_link" class="form-control" placeholder="<?= baseUrl ?>?page=scan&cp=CP001">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Batal</button>
        <button class="btn btn-primary" onclick="save()">Simpan</button>
      </div>
    </div>
  </div>
</div>

<script>
  let TOKEN = null;
  let MODAL = null;

  function showMsg(type, text){
    const el = document.getElementById('msg');
    el.className = 'alert alert-' + (type || 'info');
    el.style.display = text ? 'block' : 'none';
    el.textContent = text || '';
  }
  function esc(s){
    return String(s||'').replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }

  function load(){
    showMsg('', '');
    const id_area = document.getElementById('fArea').value.trim();
    const kategori = document.getElementById('fKat').value.trim();

    document.getElementById('tb').innerHTML = `<tr><td colspan="7" class="text-muted"><i>Loading...</i></td></tr>`;

    google.script.run
      .withSuccessHandler(function(res){
        if (!res || !res.ok) return showMsg('warning', res && res.message ? res.message : 'Gagal load.');

        document.getElementById('info').textContent = `Total: ${res.rows.length} • filter area="${id_area}" kategori="${kategori}"`;

        const rows = res.rows || [];
        document.getElementById('tb').innerHTML = rows.length ? rows.map(r => {
          const qr = String(r.qrcode_link||'');
          return `<tr>
            <td><b>${esc(r.id_checkpoint)}</b></td>
            <td>${esc(r.id_area)}</td>
            <td>${esc(r.nama_checkpoint)}</td>
            <td>${esc(r.lokasi_aset)}</td>
            <td>${esc(r.kategori)}</td>
            <td style="max-width:280px; word-break:break-all;">${qr ? esc(qr) : '<span class="text-muted">(kosong)</span>'}</td>
            <td>
              <button class="btn btn-sm btn-outline-primary" onclick='openForm(${JSON.stringify(r)})'>Edit</button>
              <button class="btn btn-sm btn-outline-danger" onclick='del("${esc(r.id_checkpoint)}")'>Hapus</button>
            </td>
          </tr>`;
        }).join('') : `<tr><td colspan="7" class="text-muted"><i>Belum ada data.</i></td></tr>`;
      })
      .withFailureHandler(function(err){
        showMsg('warning', err && err.message ? err.message : 'Error');
      })
      .adminListCheckpoints(TOKEN, { id_area, kategori });
  }

  function getModal_(){
    const el = document.getElementById('mdl');
    if (!el) {
      showMsg('warning', 'Modal #mdl tidak ditemukan (cek id modal).');
      return null;
    }
    if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
      showMsg('warning', 'Bootstrap JS belum ter-load. Pastikan bootstrap.bundle.min.js ada di Layout.');
      return null;
    }
    // init sekali
    if (!MODAL) MODAL = new bootstrap.Modal(el);
    return MODAL;
  }

  function openForm(row){
    row = row || {};
    document.getElementById('mdlTitle').textContent = row.id_checkpoint ? ('Edit ' + row.id_checkpoint) : 'Tambah Checkpoint';

    document.getElementById('id_checkpoint').value = row.id_checkpoint || '';
    document.getElementById('id_checkpoint').disabled = !!row.id_checkpoint; // id tidak boleh berubah
    document.getElementById('id_area').value = row.id_area || '';
    document.getElementById('nama_checkpoint').value = row.nama_checkpoint || '';
    document.getElementById('lokasi_aset').value = row.lokasi_aset || '';
    document.getElementById('kategori').value = row.kategori || '';
    document.getElementById('deskripsi_tugas').value = row.deskripsi_tugas || '';
    document.getElementById('qrcode_link').value = row.qrcode_link || '';

    const m = getModal_();
    if (m) m.show();
  }

  function save(){
    showMsg('', '');
    const data = {
      id_checkpoint: document.getElementById('id_checkpoint').value.trim(),
      id_area: document.getElementById('id_area').value.trim(),
      nama_checkpoint: document.getElementById('nama_checkpoint').value.trim(),
      lokasi_aset: document.getElementById('lokasi_aset').value.trim(),
      kategori: document.getElementById('kategori').value.trim(),
      deskripsi_tugas: document.getElementById('deskripsi_tugas').value.trim(),
      qrcode_link: document.getElementById('qrcode_link').value.trim()
    };

    google.script.run
      .withSuccessHandler(function(res){
        if (!res || !res.ok) return showMsg('warning', res && res.message ? res.message : 'Gagal simpan');
        const m = getModal_();
        if (m) m.hide();
        load();
      })
      .withFailureHandler(function(err){
        showMsg('warning', err && err.message ? err.message : 'Error');
      })
      .adminSaveCheckpoint(TOKEN, data);
  }

  function del(id){
    if (!confirm('Hapus checkpoint ' + id + ' ?')) return;
    google.script.run
      .withSuccessHandler(function(res){
        if (!res || !res.ok) return showMsg('warning', res && res.message ? res.message : 'Gagal hapus');
        load();
      })
      .withFailureHandler(function(err){
        showMsg('warning', err && err.message ? err.message : 'Error');
      })
      .adminDeleteCheckpoint(TOKEN, id);
  }

  function genQr(mode){
    if (mode === 'all' && !confirm('Overwrite semua qrcode_link?')) return;
    google.script.run
      .withSuccessHandler(function(res){
        if (!res || !res.ok) return showMsg('warning', res && res.message ? res.message : 'Gagal generate');
        showMsg('success', res.message || 'OK');
        load();
      })
      .withFailureHandler(function(err){
        showMsg('warning', err && err.message ? err.message : 'Error');
      })
      .adminGenerateCheckpointQrLinks(TOKEN, mode);
  }

  function printQr(){
    const id_area = document.getElementById('fArea').value.trim();
    const kategori = document.getElementById('fKat').value.trim();

    google.script.run
      .withSuccessHandler(function(res){
        if (!res || !res.ok) return showMsg('warning', res && res.message ? res.message : 'Gagal print');
        const w = window.open('', '_blank');
        w.document.open();
        w.document.write(res.html || '<p>(kosong)</p>');
        w.document.close();
      })
      .withFailureHandler(function(err){
        showMsg('warning', err && err.message ? err.message : 'Error');
      })
      .adminGetCheckpointPrintHtml(TOKEN, { id_area, kategori });
  }

  (function init(){
    try { TOKEN = localStorage.getItem('PT_TOKEN'); } catch(e) {}
    if (!TOKEN) return window.location.href = '<?= baseUrl ?>?page=login';

    MODAL = new bootstrap.Modal(document.getElementById('mdl'));

    google.script.run.withSuccessHandler(function(res){
      if (!res || !res.ok) {
        try { localStorage.removeItem('PT_TOKEN'); localStorage.removeItem('PT_USER'); } catch(e){}
        window.location.href = '<?= baseUrl ?>?page=login';
        return;
      }
      const u = res.user || {};
      const role = String(u.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'komandan') {
        window.location.href = '<?= baseUrl ?>?page=dashboard';
        return;
      }
      load();
    }).verifyToken(TOKEN);
  })();
</script>
