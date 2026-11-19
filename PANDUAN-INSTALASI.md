# Panduan Instalasi — CBT TKA SD 2027 (Versi API + GitHub Pages)

Arsitektur ini memisahkan **backend** (Google Apps Script, murni REST API JSON)
dari **frontend** (HTML/CSS/JS polos, di-deploy ke GitHub Pages). Keduanya proyek
terpisah dan saling bicara lewat `fetch()`.

```
Frontend (GitHub Pages)  --fetch(JSON)-->  Backend (Apps Script /exec)
     index.html, css/, js/                      Kode.gs
```

---

## BAGIAN A — Backend (Google Apps Script)

Berkas `Kode.gs` dan `appsscript.json` dibagikan terpisah di chat (bukan di dalam
ZIP ini) — salin isinya ke proyek Apps Script baru.

1. Buka **script.google.com** → **Proyek Baru**.
2. Ganti nama berkas bawaan `Code.gs` menjadi **`Kode`**, tempel seluruh isi `Kode.gs`.
3. Klik ikon ⚙️ **Project Settings** di kiri → centang **"Show appsscript.json manifest file"**.
   Buka berkas `appsscript.json` yang muncul, timpa isinya dengan isi `appsscript.json` yang dibagikan.
4. Jalankan fungsi **`setupAppEnvironment`** (pilih dari dropdown fungsi di toolbar → ▶ Jalankan):
   - Izinkan otorisasi saat diminta (klik **Lanjutan** → **Buka [nama proyek] (tidak aman)** → **Izinkan**).
   - Buka **Log Eksekusi** — tunggu sampai muncul `✅ Setup selesai!` beserta:
     - Email & kata sandi Super Admin pertama (`admin123`)
     - Token aktivasi pendaftaran (`TKASD-2027-MN01`)
   - **Catat kedua informasi ini**, akan dipakai setelah frontend online.
5. Klik **Deploy → Deployment baru**:
   - Jenis: **Aplikasi web**
   - Jalankan sebagai: **Saya**
   - Yang memiliki akses: **Siapa saja**
   - Klik **Deploy**, salin **URL** yang berakhiran `/exec`.
6. Tes cepat: buka `URL_ANDA/exec?action=ping` di tab baru — harus muncul
   `{"success":true,"message":"CBT TKA SD 2027 API aktif."...}`. Kalau ini muncul,
   backend sudah benar.

> ⚠️ Setiap kali Anda mengubah isi `Kode.gs` di kemudian hari, buat **Deployment baru**
> (bukan sekadar Simpan) agar perubahan berlaku di URL yang sama.

---

## BAGIAN B — Isi `js/config.js`

Sebelum mengunggah frontend, buka `js/config.js` di dalam ZIP ini, dan ganti:

```js
const GAS_URL = '{gas}';
```

menjadi URL `/exec` dari Bagian A langkah 5, misalnya:

```js
const GAS_URL = 'https://script.google.com/macros/s/AKfycbXXXXXXXXXXXXXXXXXXXXXXXXXX/exec';
```

Simpan berkasnya.

---

## BAGIAN C — Frontend ke GitHub Pages

Folder hasil ekstraksi ZIP ini **adalah** folder proyek — `index.html` sudah ada
tepat di root, jangan buat folder pembungkus lagi di luarnya.

Ringkasan tahapannya (ikuti bersama asisten di chat langkah demi langkah, kirim
screenshot tiap tahap agar bisa dipandu persis sesuai yang Anda lihat):

1. **Pasang Git** (kalau belum ada) — `git --version` untuk cek.
2. **Buat akun GitHub** di github.com (kalau belum ada).
3. **Setel identitas Git** (sekali seumur komputer):
   ```bash
   git config --global user.name "Nama Anda"
   git config --global user.email "email@anda.com"
   ```
4. **Buat repository baru** di GitHub (Public, tanpa centang README/.gitignore).
5. **Masuk ke folder frontend ini di terminal**, lalu verifikasi `index.html` terlihat
   di baris teratas (`dir` di PowerShell / `ls` di Git Bash/Mac/Linux) — ini langkah
   paling penting, jangan jalankan `git init` sebelum memastikan ini.
6. **Inisialisasi & push:**
   ```bash
   git init
   git add .
   git commit -m "Upload pertama"
   git branch -M main
   git remote add origin https://github.com/USERNAME/NAMA-REPO.git
   git push -u origin main
   ```
   Saat diminta Username/Password: Password diganti **Personal Access Token**
   (buat di `github.com/settings/tokens` → Generate new token (classic) → centang
   scope **repo**) — bukan password akun biasa.
7. **Aktifkan GitHub Pages:** repo di GitHub → **Settings → Pages** →
   Source: **Deploy from a branch**, Branch: **main / (root)**, centang **Enforce HTTPS** → **Save**.
8. Tunggu 1–2 menit, buka `https://USERNAME.github.io/NAMA-REPO/`.

### Update setelah perubahan
```bash
git add .
git commit -m "Deskripsi perubahan"
git push
```

---

## Uji Coba Akhir

1. Buka situs GitHub Pages Anda.
2. Klik **Masuk** → masukkan email & kata sandi Super Admin dari Bagian A.
3. Buka **DevTools (F12) → Network** — pastikan tidak ada error CORS berwarna merah.
4. Masuk ke **Pengaturan Sistem**, ganti token aktivasi & kata sandi bawaan.

## Troubleshooting Cepat

| Gejala | Penyebab | Solusi |
|---|---|---|
| Halaman tampil tapi semua tombol "Gagal terhubung ke server" | `GAS_URL` belum diisi / salah | Buka `js/config.js`, pastikan URL berakhiran `/exec` dan tanpa spasi |
| Error CORS di Console | Header fetch bukan `text/plain` | Jangan ubah `js/gas-shim.js` — header itu wajib persis seperti aslinya |
| Halaman tanpa styling (polos) | File `css/`, `js/` rata di root saat push | Lihat prosedur perbaikan folder di panduan GitHub Pages (tanya di chat) |
| 404 di GitHub Pages | `index.html` tidak di root repo | Pastikan `git init` dijalankan tepat di folder ini, bukan folder induk |
| `{"success":false,"message":"Aksi tidak dikenal..."}` | Nama aksi tidak ada di `API_ACTIONS` pada `Kode.gs` | Pastikan `Kode.gs` yang ditempel adalah versi lengkap tanpa terpotong |
| Lupa kata sandi Super Admin | — | Buka Spreadsheet database → sheet `Pengguna` → kosongkan kolom `Password` baris Super Admin, lalu daftar ulang dengan email sama |
