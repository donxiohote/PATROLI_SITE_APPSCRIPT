/** Code.gs - routing page -> view */

function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) ? String(e.parameter.page) : 'login';

  // logout tidak pakai Layout (langsung clear localStorage)
  if (page === 'logout') return renderLogout_();

  const view = resolveView_(page);
  if (!view) {
    return HtmlService
      .createHtmlOutput('<div style="font-family:Arial;padding:16px"><h3>404 - Page not found</h3><div>page: '+escapeHtml_(page)+'</div></div>')
      .setTitle('404 - Page not found');
  }

  const baseUrl = getBaseUrl_();

  // Render konten view dulu (sebagai string HTML)
  const contentTpl = HtmlService.createTemplateFromFile(view);
  contentTpl.baseUrl = baseUrl;
  contentTpl.page = page;
  const contentHtml = contentTpl.evaluate().getContent();

  // Render Layout sebagai template (agar <?= baseUrl ?> bekerja)
  const layoutTpl = HtmlService.createTemplateFromFile('Layout');
  layoutTpl.baseUrl = baseUrl;
  layoutTpl.page = page;
  layoutTpl.content = contentHtml; // injeksi konten ke Layout
  const out = layoutTpl.evaluate();

  out.setTitle('PATROLI SITE');
  out.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return out;
}

function resolveView_(page) {
  const routes = {
    // auth
    '': 'Login',
    login: 'Login',
    dashboard: 'Dashboard',

    // user ops
    absen: 'Absen',
    scan: 'Scan',
    riwayat_absen: 'RiwayatAbsen',
    riwayat_scan: 'RiwayatScan',
    profil: 'Profil',
    panic: 'Panic',

    checkpoint_master: 'CheckpointMaster',

    // ✅ admin monitoring (baru)
    monitor_admin: 'AdminMonitoring'
  };
  return routes[page] || null;
}

function getBaseUrl_() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (e) {
    return '';
  }
}

function renderLogout_() {
  const baseUrl = getBaseUrl_();
  const html = `
    <div class="container" style="padding:24px">
      <h4>Logout...</h4>
      <script>
        try { localStorage.removeItem('PT_TOKEN'); localStorage.removeItem('PT_USER'); } catch(e) {}
        window.location.href = '${baseUrl}?page=login';
      </script>
    </div>
  `;
  return HtmlService.createHtmlOutput(html).setTitle('Logout');
}

function escapeHtml_(s){
  return String(s||'').replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}
