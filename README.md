# CBT TKA SD 2027 — Frontend (GitHub Pages)

Frontend statis (HTML/CSS/JS polos, tanpa framework) untuk Portal CBT TKA SD 2027.
Berkomunikasi dengan backend Google Apps Script murni lewat `fetch()` — lihat `js/config.js`.

## Struktur
```
index.html       ← wajib di root, ini yang dibaca GitHub Pages
css/style.css    ← seluruh tampilan (terang & gelap)
js/config.js     ← ISI GAS_URL DI SINI setelah deploy backend
js/gas-shim.js   ← lapisan kompatibilitas google.script.run → fetch()
js/app.js        ← seluruh logika aplikasi
```

## Sebelum deploy
1. Backend (`Kode.gs` + `appsscript.json`, dibagikan terpisah) harus sudah di-deploy sebagai Web App terlebih dahulu.
2. Jalankan `setupAppEnvironment` sekali di Apps Script, salin URL `/exec`-nya.
3. Buka `js/config.js`, ganti `{gas}` dengan URL tersebut.
4. Baru kemudian folder ini di-push ke GitHub Pages.

Panduan lengkap langkah demi langkah ada di `PANDUAN-INSTALASI.md`.
