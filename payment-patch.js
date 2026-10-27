/* ===========================================================
   TEMANGURUTK — PATCH: QRIS Dinamis + Upload Bukti + Verifikasi Admin
   Pasang SATU baris ini di index.html, tepat sebelum </body>:
   <script src="payment-patch.js"></script>
   (harus setelah script utama)
=========================================================== */
(function(){
/* ---------- 1. QRIS DINAMIS ---------- */
// Payload QRIS statis toko (hasil baca dari gambar QRIS, NMID ID1026610211074)
const STATIC_QRIS = '00020101021126570011ID.DANA.WWW011893600915303578233302090357823330303UMI51440014ID.CO.QRIS.WWW0215ID10266102110740303UMI5204899953033605802ID5913Ummu, Service6011Kab. Klaten61055746463' + '04642B';

function crc16(s){
  let c = 0xFFFF;
  for(let i=0;i<s.length;i++){
    c ^= s.charCodeAt(i) << 8;
    for(let j=0;j<8;j++) c = (c & 0x8000) ? ((c<<1) ^ 0x1021) & 0xFFFF : (c<<1) & 0xFFFF;
  }
  return c.toString(16).toUpperCase().padStart(4,'0');
}
function buildDynamicQris(amount){
  let body = STATIC_QRIS.slice(0, -4);                 // buang CRC lama (tag 6304 tetap ada)
  body = body.replace('010211', '010212');             // 11 = statis -> 12 = dinamis
  const amt = String(Math.round(amount));
  const tag54 = '54' + String(amt.length).padStart(2,'0') + amt;
  body = body.replace('5802ID', tag54 + '5802ID');     // sisipkan nominal sebelum kode negara
  return body + crc16(body);
}
window.buildQrisPayload = (trxId, amount) => buildDynamicQris(amount);
QRIS_CONFIG.mode = 'dynamic';

window.createTransactionOnServer = async function(item, amount){
  const trxId = 'TGTK-' + Date.now().toString().slice(-8);
  return { trxId, qrPayload: buildDynamicQris(amount) };
};
window.renderQRIS = function(trxId, amount, payload){
  const canvas = document.getElementById('qrCanvas');
  document.getElementById('qrImageStatic').style.display = 'none';
  const note = document.getElementById('qrImageNominalNote');
  note.style.display = 'block';
  note.innerHTML = '✅ Nominal sudah terisi otomatis: <b>Rp' + amount.toLocaleString('id-ID') + '</b>. Jangan ubah jumlahnya.';
  canvas.style.display = 'block';
  payload = payload || buildDynamicQris(amount);
  canvas.dataset.payload = payload;
  QRCode.toCanvas(canvas, payload, {width:188, margin:1, errorCorrectionLevel:'M', color:{dark:'#000000', light:'#FFFFFF'}}, e=>{ if(e) console.log(e); });
};
window.toggleWaitingMode = function(){
  document.getElementById('payConfirmBtn').style.display = 'block';
  document.getElementById('payConfirmBtn').textContent = '✅ Saya Sudah Membayar — Unggah Bukti';
  document.getElementById('payDemoHint').style.display = 'none';
  document.getElementById('payDemoInfoBox').innerHTML = 'ℹ️ Setelah membayar, <b>wajib unggah bukti pembayaran</b>. Premium aktif setelah admin memverifikasi.';
  document.getElementById('payStatusText').textContent = 'Menunggu pembayaran Anda...';
};

/* ---------- 2. LANGKAH UNGGAH BUKTI ---------- */
const proofHTML = `
<div id="payStepProof" style="display:none;">
  <div class="modal-header border-0" style="background:linear-gradient(135deg,var(--toska),var(--toska-dark));color:#fff;">
    <h6 class="modal-title fw-bold mb-0">📎 Unggah Bukti Pembayaran</h6>
    <button type="button" class="btn-close btn-close-white" onclick="backToQr()"></button>
  </div>
  <div class="modal-body py-3">
    <div class="small text-muted mb-2">Unggah screenshot / foto bukti transfer yang menampilkan nominal <b id="proofAmount"></b>.</div>
    <input type="file" class="form-control mb-2" id="proofFile" accept="image/*" onchange="previewProof(this)">
    <img id="proofPreview" style="display:none;max-width:100%;max-height:240px;border-radius:12px;border:1px solid #EAE3D6;margin-bottom:8px;" alt="">
    <div class="text-danger small mb-2" id="proofError"></div>
    <button class="btn btn-orange w-100" id="proofSubmitBtn" onclick="submitProof()">📤 Kirim Bukti</button>
    <button class="btn btn-sm btn-outline-toska w-100 mt-2" onclick="backToQr()">← Kembali ke QR</button>
  </div>
</div>`;
document.getElementById('payStep2').insertAdjacentHTML('afterend', proofHTML);

const _open = openPaymentModal;
window.openPaymentModal = function(o){
  _open(o);
  document.getElementById('payStepProof').style.display = 'none';
  document.getElementById('proofFile').value = '';
  document.getElementById('proofPreview').style.display = 'none';
  document.getElementById('proofError').textContent = '';
  const b = document.getElementById('proofSubmitBtn'); b.disabled = false; b.textContent = '📤 Kirim Bukti';
};
window.confirmPaymentReceived = function(){
  if(currentPayment.expired){ showToast('QR sudah kedaluwarsa, perbarui QR'); return; }
  document.getElementById('proofAmount').textContent = 'Rp' + currentPayment.amount.toLocaleString('id-ID');
  document.getElementById('payStep2').style.display = 'none';
  document.getElementById('payStepProof').style.display = 'block';
};
window.backToQr = function(){
  document.getElementById('payStepProof').style.display = 'none';
  document.getElementById('payStep2').style.display = 'block';
};
window.previewProof = function(inp){
  const f = inp.files[0], img = document.getElementById('proofPreview');
  if(!f){ img.style.display = 'none'; return; }
  img.src = URL.createObjectURL(f); img.style.display = 'block';
};
window.submitProof = async function(){
  const err = document.getElementById('proofError'), btn = document.getElementById('proofSubmitBtn');
  err.textContent = '';
  const f = document.getElementById('proofFile').files[0];
  if(!f){ err.textContent = 'Pilih foto bukti pembayaran dulu.'; return; }
  if(!/^image\//.test(f.type)){ err.textContent = 'File harus berupa gambar.'; return; }
  if(f.size > 5*1024*1024){ err.textContent = 'Ukuran gambar maksimal 5 MB.'; return; }
  const u = getUserRecord();
  if(!sb || !u || !u.id){ err.textContent = 'Sesi login tidak ditemukan. Masuk ulang lalu coba lagi.'; return; }
  btn.disabled = true; btn.textContent = '⏳ Mengunggah...';
  try{
    const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
    const path = `${u.id}/${currentPayment.trxId}.${ext}`;
    let r = await sb.storage.from('payment-proofs').upload(path, f, {contentType:f.type, upsert:true});
    if(r.error) throw r.error;
    r = await sb.from('payments').insert({
      user_id:u.id, email:u.email, full_name:u.name, trx_id:currentPayment.trxId,
      plan:currentPayment.planKey, amount:currentPayment.amount, proof_path:path, status:'pending'
    });
    if(r.error) throw r.error;
    db.transactions.unshift({id:currentPayment.trxId, method:'QRIS', date:new Date().toISOString(), amount:currentPayment.amount, item:currentPayment.item, status:'pending'});
    save();
    document.getElementById('payTrxIdDone').textContent = currentPayment.trxId;
    const s3 = document.getElementById('payStep3');
    s3.children[0].children[0].textContent = '📨';
    s3.querySelector('.fw-bold').textContent = 'Bukti Terkirim';
    document.getElementById('payDoneMessage').innerHTML = 'Admin akan memeriksa pembayaranmu. Premium aktif otomatis setelah disetujui. Cek statusnya di menu <b>Profil</b>.';
    document.getElementById('payStepProof').style.display = 'none';
    s3.style.display = 'block';
    loadMyPayments();
  }catch(e){
    console.error(e);
    err.textContent = 'Gagal mengirim: ' + (e.message || e) + ' (pastikan SQL payments sudah dijalankan di Supabase).';
    btn.disabled = false; btn.textContent = '📤 Kirim Bukti';
  }
};

/* ---------- 3. RIWAYAT PEMBAYARAN USER (Profil) ---------- */
document.getElementById('screen-premium').insertAdjacentHTML('beforeend',
  `<div class="card-soft" id="payHistoryCard" style="display:none;"><div class="fw-semibold mb-2">Riwayat Pembayaran</div><div id="payHistoryList"></div></div>`);
const STATUS_LBL = {pending:['⏳ Menunggu verifikasi','orange'], approved:['✅ Disetujui',''], rejected:['❌ Ditolak','orange']};
window.loadMyPayments = async function(){
  const u = getUserRecord(), card = document.getElementById('payHistoryCard');
  if(!sb || !u || !u.id){ card.style.display = 'none'; return; }
  const {data, error} = await sb.from('payments').select('*').eq('user_id', u.id).order('created_at',{ascending:false}).limit(5);
  if(error || !data || !data.length){ card.style.display = 'none'; return; }
  card.style.display = 'block';
  document.getElementById('payHistoryList').innerHTML = data.map(p=>{
    const s = STATUS_LBL[p.status] || [p.status,''];
    return `<div class="py-2" style="border-bottom:1px solid #F0EBE0;">
      <div class="d-flex justify-content-between small"><b>${PLANS[p.plan]?PLANS[p.plan].item:escH(p.plan)}</b><span>Rp${Number(p.amount).toLocaleString('id-ID')}</span></div>
      <div class="d-flex justify-content-between align-items-center"><span class="text-muted" style="font-size:.72rem;">${escH(p.trx_id)} · ${fmtDT(p.created_at)}</span><span class="chip ${s[1]}">${s[0]}</span></div>
      ${p.status==='rejected' && p.note ? `<div class="text-danger" style="font-size:.72rem;">Alasan: ${escH(p.note)}</div>` : ''}
    </div>`;
  }).join('');
  if(data.some(p=>p.status==='approved') && !isPremium() && !window._payResynced){
    window._payResynced = true; restoreSession();    // tarik status premium terbaru dari server
  }
};

/* ---------- 4. PANEL ADMIN: VERIFIKASI BUKTI ---------- */
document.getElementById('admList').insertAdjacentHTML('beforebegin', `
  <div class="section-title"><span class="dot"></span>Pembayaran Masuk <span class="chip orange" id="admPayCount">0</span></div>
  <div class="card-soft py-2 px-3">
    <div class="d-flex gap-2">
      <select class="form-select form-select-sm" id="admPayFilter" onchange="renderAdminPayments()">
        <option value="pending">Menunggu verifikasi</option><option value="all">Semua</option>
        <option value="approved">Disetujui</option><option value="rejected">Ditolak</option>
      </select>
      <button class="btn btn-sm btn-outline-toska" onclick="loadAdminPayments()">🔄</button>
    </div>
  </div>
  <div id="admPayList" class="mb-3"></div>
  <div class="section-title"><span class="dot"></span>Daftar Pengguna</div>`);

let admPays = [];
window.loadAdminPayments = async function(){
  if(!sb || !isAdmin()) return;
  const {data, error} = await sb.from('payments').select('*').order('created_at',{ascending:false}).limit(100);
  if(error){ document.getElementById('admPayList').innerHTML = `<p class="text-danger small">Gagal memuat: ${escH(error.message)}</p>`; return; }
  admPays = data || []; renderAdminPayments();
};
window.renderAdminPayments = function(){
  const f = document.getElementById('admPayFilter').value;
  document.getElementById('admPayCount').textContent = admPays.filter(p=>p.status==='pending').length + ' baru';
  const list = admPays.filter(p => f==='all' || p.status===f);
  document.getElementById('admPayList').innerHTML = list.length ? list.map(p=>{
    const s = STATUS_LBL[p.status] || [p.status,''];
    return `<div class="card-soft py-2 px-3" id="pay-${p.id}">
      <div class="d-flex justify-content-between align-items-start">
        <div style="min-width:0;"><div class="fw-semibold small text-truncate">${escH(p.full_name||'-')}</div>
          <div class="text-muted text-truncate" style="font-size:.72rem;">${escH(p.email||'')}</div></div>
        <span class="chip ${s[1]}">${s[0]}</span>
      </div>
      <div class="small mt-1"><b>${PLANS[p.plan]?PLANS[p.plan].item:escH(p.plan)}</b> · Rp${Number(p.amount).toLocaleString('id-ID')}</div>
      <div class="text-muted" style="font-size:.72rem;">${escH(p.trx_id)} · ${fmtDT(p.created_at)}</div>
      ${p.note?`<div class="text-muted" style="font-size:.72rem;">Catatan: ${escH(p.note)}</div>`:''}
      <div id="proofBox-${p.id}"></div>
      <div class="d-flex gap-2 mt-2">
        <button class="btn btn-outline-toska btn-sm flex-fill" onclick="viewProof('${p.id}')">🖼️ Lihat Bukti</button>
        ${p.status==='pending'?`<button class="btn btn-toska btn-sm flex-fill" onclick="approvePayment('${p.id}')">✔ Setujui</button>
        <button class="btn btn-sm btn-outline-danger flex-fill" onclick="rejectPayment('${p.id}')">✕ Tolak</button>`:''}
      </div></div>`;
  }).join('') : '<p class="text-muted small">Tidak ada pembayaran.</p>';
};
window.viewProof = async function(id){
  const p = admPays.find(x=>x.id===id), box = document.getElementById('proofBox-'+id);
  if(!p || !box) return;
  if(box.innerHTML){ box.innerHTML=''; return; }
  const {data, error} = await sb.storage.from('payment-proofs').createSignedUrl(p.proof_path, 300);
  if(error){ showToast('Gagal memuat bukti: ' + error.message); return; }
  box.innerHTML = `<a href="${data.signedUrl}" target="_blank" rel="noopener"><img src="${data.signedUrl}" style="max-width:100%;border-radius:12px;border:1px solid #EAE3D6;margin-top:8px;" alt="Bukti"></a>`;
};
window.approvePayment = async function(id){
  const p = admPays.find(x=>x.id===id); if(!p || !PLANS[p.plan]) return;
  if(!confirm(`Setujui ${p.full_name} — Rp${Number(p.amount).toLocaleString('id-ID')} dan aktifkan Premium?`)) return;
  try{
    const pr = await sb.from('profiles').select('premium_until').eq('id', p.user_id).maybeSingle();
    const cur = pr.data && pr.data.premium_until ? Date.parse(pr.data.premium_until) : 0;
    const until = new Date(Math.max(cur, Date.now()) + PLANS[p.plan].days*86400000).toISOString();
    let r = await sb.from('profiles').update({premium:true, premium_plan:p.plan, premium_until:until}).eq('id', p.user_id).select();
    if(r.error) throw r.error;
    if(!r.data || !r.data.length) throw new Error('Profil pengguna tidak berubah (cek RLS admin).');
    r = await sb.from('payments').update({status:'approved', reviewed_at:new Date().toISOString()}).eq('id', id);
    if(r.error) throw r.error;
    showToast('Pembayaran disetujui, Premium aktif ✅');
    loadAdminPayments(); loadAdminUsers();
  }catch(e){ console.error(e); showToast('Gagal: ' + (e.message||e)); }
};
window.rejectPayment = async function(id){
  const note = prompt('Alasan penolakan (akan terlihat oleh pengguna):', 'Bukti tidak sesuai / nominal salah');
  if(note === null) return;
  const r = await sb.from('payments').update({status:'rejected', note, reviewed_at:new Date().toISOString()}).eq('id', id);
  if(r.error){ showToast('Gagal: ' + r.error.message); return; }
  showToast('Pembayaran ditolak'); loadAdminPayments();
};

/* ---------- 5. HOOK NAVIGASI ---------- */
const _goTo = goTo;
window.goTo = function(name){
  _goTo(name);
  if(name==='premium') loadMyPayments();
  if(name==='admin') loadAdminPayments();
};
})();
