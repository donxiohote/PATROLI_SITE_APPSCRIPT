/** Checkpoint.gs */

function regenCheckpointQrLinks() {
  const sh = getSheet_('Checkpoint');
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return;

  const baseUrl = ScriptApp.getService().getUrl();

  const headers = values[0].map(h => String(h||'').trim().toLowerCase());
  const idx = {};
  headers.forEach((h,i)=>{ if(h) idx[h]=i; });

  const iId = idx['id_checkpoint'];
  const iArea = idx['id_area'];
  const iLink = idx['qrcode_link'];
  if (iId == null || iLink == null) throw new Error('Checkpoint: butuh kolom id_checkpoint dan qrcode_link.');

  const out = [];
  for (let r=1; r<values.length; r++){
    const row = values[r];
    const cp = String(row[iId]||'').trim();
    if (!cp) { out.push(['']); continue; }

    const area = (iArea!=null) ? String(row[iArea]||'').trim() : '';
    const sig = makeQrSig_(cp, area);
    const url = `${baseUrl}?page=scan&cp=${encodeURIComponent(cp)}&sig=${encodeURIComponent(sig)}`;
    out.push([url]);
  }

  sh.getRange(2, iLink+1, out.length, 1).setValues(out);
}
