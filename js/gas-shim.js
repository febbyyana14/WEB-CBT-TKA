/* ============================================================
   GAS-SHIM — Kompatibilitas google.script.run → fetch() REST API
   ============================================================
   Kode aplikasi (app.js) ditulis memakai gaya pemanggilan Apps Script
   bawaan, misalnya:

     google.script.run
       .withSuccessHandler(res => { ... })
       .withFailureHandler(err => { ... })
       .namaFungsi(arg1, arg2);

   Shim ini membuat gaya pemanggilan itu TETAP BERFUNGSI tanpa app.js
   perlu ditulis ulang, dengan menerjemahkannya di belakang layar
   menjadi permintaan fetch() POST ke backend GAS (lihat Kode.gs
   bagian "REST API — ENTRY POINTS").

   PENTING: body dikirim dengan Content-Type text/plain;charset=utf-8
   (BUKAN application/json) — ini WAJIB agar browser tidak mengirim
   permintaan "preflight" OPTIONS yang tidak didukung Google Apps
   Script, sehingga permintaan berjalan sebagai "simple request" yang
   diizinkan lintas domain. Jangan ubah header ini.
   ============================================================ */

function _gasCallAction(actionName, args, onSuccess, onFailure) {
  if (!GAS_URL || GAS_URL.indexOf('{gas}') > -1) {
    const pesan = 'GAS_URL belum diisi di js/config.js. Buka file itu dan tempel URL /exec dari Apps Script.';
    console.error(pesan);
    if (onFailure) onFailure({ message: pesan });
    return;
  }
  fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: actionName, args: args })
  })
    .then(res => {
      if (!res.ok) throw new Error('Server membalas status ' + res.status);
      return res.json();
    })
    .then(data => { if (onSuccess) onSuccess(data); })
    .catch(err => {
      console.error('Gagal memanggil "' + actionName + '":', err);
      if (onFailure) onFailure({ message: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda. (' + err.message + ')' });
    });
}

function _createRunChain(handlers) {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'withSuccessHandler') return (fn) => _createRunChain(Object.assign({}, handlers, { success: fn }));
      if (prop === 'withFailureHandler') return (fn) => _createRunChain(Object.assign({}, handlers, { failure: fn }));
      // prop lain dianggap sebagai nama fungsi backend yang dipanggil sekarang.
      return (...args) => _gasCallAction(String(prop), args, handlers.success, handlers.failure);
    }
  });
}

// Objek global `google.script.run` tiruan — dipakai apa adanya oleh app.js.
window.google = window.google || {};
window.google.script = window.google.script || {};
window.google.script.run = _createRunChain({});
