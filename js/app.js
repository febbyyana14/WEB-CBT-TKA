/* ============================================================
   CBT TKA SD 2027 — Frontend Logic (JavaScript.html)
   Arsitektur: SPA murni (aman iframe) + Instant UX
   - Navigasi antar section: show/hide client-side, TANPA google.script.run (0ms)
   - Jawaban ujian: optimistic UI + localStorage, sync ke server di background
   - Cache data master di memori (window.AppState.cache) agar tidak fetch berulang
   ============================================================ */

const AppState = {
  token: null, user: null, config: {},
  currentView: null, currentPage: null,
  cache: { paketAdmin: null, paketUser: {}, soalByPaket: {}, kisiKisi: null, pengguna: null, hasilSaya: null, hasilSemua: null, configAdmin: null, backupLog: null, riwayat: null },
  exam: null,
  chartInstances: {}
};

// ────────────────────────────────────────────────────────────
// BOOTSTRAP
// ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('cbt_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const toggle = document.getElementById('darkModeToggle');
  if (toggle) toggle.checked = savedTheme === 'dark';

  AppState.token = localStorage.getItem('cbt_token') || null;

  google.script.run
    .withSuccessHandler(onBootstrapSuccess)
    .withFailureHandler(onBootstrapFailure)
    .bootstrapApp(AppState.token);
});

function onBootstrapSuccess(res) {
  if (!res.success) { onBootstrapFailure({ message: res.message }); return; }
  AppState.config = res.data.config || {};
  applyBrandingConfig();

  if (res.data.session && res.data.session.valid) {
    AppState.user = res.data.session.user;
    AppState.dashboardAwal = res.data.dashboard;
    enterApp();
  } else {
    localStorage.removeItem('cbt_token');
    AppState.token = null;
    navigateTo('landing');
  }
  hideLoadingOverlay();
}

function onBootstrapFailure(err) {
  console.warn('Bootstrap gagal:', err && err.message);
  hideLoadingOverlay();
  navigateTo('landing');
}

function hideLoadingOverlay() {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = 'none';
}

function applyBrandingConfig() {
  const cfg = AppState.config || {};
  const nama = cfg.namaPortal || 'CBT TKA SD 2027';
  document.title = nama;
  ['landingBrandName','sidebarAppTitle'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = nama; });
  const footBrand = document.getElementById('footerBrandName'); if (footBrand) footBrand.textContent = nama;
  const footCopy = document.getElementById('footerCopyright'); if (footCopy && cfg.footerCopyright) footCopy.textContent = cfg.footerCopyright;
  const wa = document.getElementById('footerWhatsapp');
  if (wa && cfg.whatsappHelpdesk) wa.onclick = () => window.open('https://wa.me/' + cfg.whatsappHelpdesk.replace(/[^0-9]/g, ''), '_blank');
  if (cfg.logoUrl) {
    document.querySelectorAll('.logo-badge').forEach(el => { el.innerHTML = '<img src="' + cfg.logoUrl + '" alt="logo">'; });
  }
}

// ────────────────────────────────────────────────────────────
// ROUTER SPA — navigasi instant, TANPA reload, TANPA ubah URL
// ────────────────────────────────────────────────────────────
function navigateTo(view) {
  ['view-landing','view-login','view-register'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  document.getElementById('appShell').classList.remove('ready');

  if (view === 'app') {
    document.getElementById('appShell').classList.add('ready');
  } else {
    const el = document.getElementById('view-' + view);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
  }
  AppState.currentView = view;
}

function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function togglePasswordView(inputId) {
  const el = document.getElementById(inputId);
  el.type = el.type === 'password' ? 'text' : 'password';
}

// ────────────────────────────────────────────────────────────
// AUTENTIKASI
// ────────────────────────────────────────────────────────────
function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('btnLoginSubmit');
  const original = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-sm"></span> Memproses...'; btn.disabled = true;

  google.script.run
    .withSuccessHandler(res => {
      btn.innerHTML = original; btn.disabled = false;
      if (!res.success) { showToast('Gagal Masuk', res.message, 'danger'); return; }
      AppState.token = res.data.token; AppState.user = res.data.user;
      localStorage.setItem('cbt_token', AppState.token);
      showToast('Selamat Datang', res.message, 'success');
      google.script.run.withSuccessHandler(boot => {
        AppState.dashboardAwal = (boot.success && boot.data.dashboard) || null;
        enterApp();
      }).withFailureHandler(() => enterApp()).bootstrapApp(AppState.token);
    })
    .withFailureHandler(err => { btn.innerHTML = original; btn.disabled = false; showToast('Error', err.message, 'danger'); })
    .loginUser(email, password);
  return false;
}

function handleRegister(event) {
  event.preventDefault();
  const pw = document.getElementById('regPassword').value;
  const pwConfirm = document.getElementById('regPasswordConfirm').value;
  if (pw !== pwConfirm) { showToast('Periksa Kembali', 'Konfirmasi kata sandi tidak cocok.', 'warning'); return false; }

  const form = {
    nama: document.getElementById('regNama').value.trim(),
    email: document.getElementById('regEmail').value.trim(),
    asalSekolah: document.getElementById('regSekolah').value.trim(),
    kelas: document.getElementById('regKelas').value.trim(),
    nomorIdentitas: document.getElementById('regNISN').value.trim(),
    token: document.getElementById('regToken').value.trim(),
    ajukanTanpaToken: document.getElementById('regTanpaToken').checked,
    password: pw
  };
  const btn = document.getElementById('btnRegisterSubmit');
  const original = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-sm"></span> Memproses...'; btn.disabled = true;

  google.script.run
    .withSuccessHandler(res => {
      btn.innerHTML = original; btn.disabled = false;
      if (!res.success) { showToast('Pendaftaran Gagal', res.message, 'danger'); return; }
      showToast('Pendaftaran Berhasil', res.message, 'success');
      if (res.data.status === 'aktif') {
        document.getElementById('loginEmail').value = form.email;
        navigateTo('login');
      } else {
        navigateTo('login');
      }
    })
    .withFailureHandler(err => { btn.innerHTML = original; btn.disabled = false; showToast('Error', err.message, 'danger'); })
    .registerUser(form);
  return false;
}

function handleLogout() {
  showConfirm('Keluar dari Portal', 'Anda yakin ingin keluar?', () => {
    google.script.run.withSuccessHandler(() => {}).withFailureHandler(() => {}).logoutUser(AppState.token);
    localStorage.removeItem('cbt_token');
    AppState.token = null; AppState.user = null; AppState.cache = {};
    closeModal();
    navigateTo('login');
  });
}

function enterApp() {
  renderSidebarNav();
  renderBottomNav();
  const avatar = document.getElementById('topbarAvatar');
  if (avatar) avatar.textContent = (AppState.user.nama || '?').charAt(0).toUpperCase();
  const roleLabel = document.getElementById('sidebarRoleLabel');
  if (roleLabel) roleLabel.textContent = AppState.user.peran === 'SUPER_ADMIN' ? 'Super Admin' : 'Siswa / Guru';
  navigateTo('app');
  goToPage(AppState.user.peran === 'SUPER_ADMIN' ? 'admin-beranda' : 'user-beranda');
}

/* ============================================================
   UI HELPERS — Toast, Modal, Tema, Sidebar/Bottom-nav, Util
   ============================================================ */
function showToast(title, message, type) {
  const host = document.getElementById('toastHost');
  const icon = { success: '✅', danger: '⚠️', warning: '⚠️', info: 'ℹ️' }[type] || 'ℹ️';
  const el = document.createElement('div');
  el.className = 'toast-item ' + (type || 'info') + ' fade-in';
  el.innerHTML = '<span>' + icon + '</span><div><strong style="display:block;font-size:13px;">' + escapeHtml(title) + '</strong><span class="text-muted" style="font-size:12.5px;">' + escapeHtml(message || '') + '</span></div>';
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 4000);
}

function openModal(title, bodyHtml, footHtml, size) {
  document.getElementById('modalTitle').innerHTML = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFoot').innerHTML = footHtml || '';
  document.getElementById('modalBox').className = 'modal-box' + (size === 'lg' ? ' modal-lg' : '');
  document.getElementById('modalBackdrop').classList.add('show');
}
function closeModal() { document.getElementById('modalBackdrop').classList.remove('show'); }

function showConfirm(title, message, onConfirm, confirmLabel, danger) {
  openModal(escapeHtml(title), '<p>' + escapeHtml(message) + '</p>',
    '<button class="btn btn-outline" onclick="closeModal()">Batal</button>' +
    '<button class="btn ' + (danger === false ? 'btn-primary' : 'btn-danger') + '" id="btnModalConfirm">' + (confirmLabel || 'Ya, Lanjutkan') + '</button>');
  document.getElementById('btnModalConfirm').onclick = onConfirm;
}

function toggleDarkMode() {
  const checked = document.getElementById('darkModeToggle').checked;
  const theme = checked ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('cbt_theme', theme);
  updateChartsTheme(theme);
}

function toggleSidebar(forceState) {
  const sb = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const show = forceState !== undefined ? forceState : !sb.classList.contains('open');
  sb.classList.toggle('open', show);
  overlay.classList.toggle('show', show);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function debounce(fn, delay) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; }
function fmtTgl(v) { if (!v) return '—'; const d = new Date(v); if (isNaN(d)) return v; return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }
function mapelPill(m) { return m === 'Matematika' ? 'pill-mtk' : 'pill-bin'; }
function statusPill(s) {
  const map = { aktif: 'pill-success', menunggu: 'pill-warning', nonaktif: 'pill-neutral', ditolak: 'pill-danger', draft: 'pill-neutral', tampil: 'pill-info', sembunyi: 'pill-neutral' };
  return map[s] || 'pill-neutral';
}

// ── Navigasi sidebar (desktop) & bottom-nav (mobile), berbeda per peran ──
const MENU_ADMIN = [
  { page: 'admin-beranda', label: 'Beranda', icon: '🏠' },
  { page: 'admin-akun', label: 'Manajemen Akun', icon: '👥' },
  { page: 'admin-banksoal', label: 'Bank Soal', icon: '📚' },
  { page: 'admin-hasil', label: 'Hasil & Laporan', icon: '📊' },
  { page: 'admin-pengaturan', label: 'Pengaturan Sistem', icon: '⚙️' }
];
const MENU_USER = [
  { page: 'user-beranda', label: 'Beranda', icon: '🏠' },
  { page: 'user-kisikisi', label: 'Kisi-kisi', icon: '📋' },
  { page: 'user-latihan', label: 'Latihan', icon: '📝' },
  { page: 'user-tryout', label: 'Try Out', icon: '⏱️' },
  { page: 'user-hasil', label: 'Hasil', icon: '📈' },
  { page: 'user-profil', label: 'Profil', icon: '👤' }
];
function currentMenu() { return AppState.user.peran === 'SUPER_ADMIN' ? MENU_ADMIN : MENU_USER; }

function renderSidebarNav() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = currentMenu().map(m =>
    '<div class="nav-item" data-page="' + m.page + '" onclick="goToPage(\'' + m.page + '\')"><span>' + m.icon + '</span><span>' + m.label + '</span></div>'
  ).join('');
}
function renderBottomNav() {
  const nav = document.getElementById('bottomNav');
  nav.innerHTML = currentMenu().slice(0, 5).map(m =>
    '<div class="bottom-nav-item" data-page="' + m.page + '" onclick="goToPage(\'' + m.page + '\')"><span>' + m.icon + '</span><span>' + m.label.split(' ')[0] + '</span></div>'
  ).join('');
}
function updateActiveNav(pageName) {
  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === pageName));
}

// ── Router internal App Shell: tampilkan/bangun halaman TANPA network trip ──
function goToPage(pageName, params) {
  AppState.currentPage = pageName;
  updateActiveNav(pageName);
  toggleSidebar(false);
  const container = document.getElementById('pageContainer');
  const builder = PAGES[pageName];
  if (!builder) { container.innerHTML = '<div class="empty-state">Halaman tidak ditemukan.</div>'; return; }
  const titleMap = {}; currentMenu().forEach(m => titleMap[m.page] = m.label);
  document.getElementById('topbarTitle').textContent = params && params.title ? params.title : (titleMap[pageName] || 'CBT TKA SD');
  container.innerHTML = '<div class="fade-in">' + builder.render(params) + '</div>';
  container.scrollTop = 0;
  if (builder.init) builder.init(params);
}

const PAGES = {}; // diisi oleh bagian-bagian berikutnya: PAGES['nama-halaman'] = { render(params), init(params) }

/* ============================================================
   HALAMAN SUPER ADMIN — Beranda
   ============================================================ */
PAGES['admin-beranda'] = {
  render() {
    return '' +
      '<div class="grid grid-4 mb-3" id="adminKpiGrid">' + skeletonKpis(4) + '</div>' +
      '<div class="grid" style="grid-template-columns:1.3fr 1fr;" id="adminChartsGrid">' +
        '<div class="card card-pad"><strong style="font-size:14px;">Rata-rata Nilai per Mata Pelajaran</strong><div style="height:220px;margin-top:10px;"><canvas id="chartMapel"></canvas></div></div>' +
        '<div class="card card-pad"><strong style="font-size:14px;">Status Akun Pengguna</strong><div style="height:220px;margin-top:10px;"><canvas id="chartStatus"></canvas></div></div>' +
      '</div>' +
      '<div class="card card-pad mt-3" style="margin-top:14px;">' +
        '<strong style="font-size:14px;">Aktivitas Pengerjaan Terbaru</strong>' +
        '<div class="table-wrap" style="margin-top:12px;"><table class="data-table"><thead><tr><th>Nama</th><th>Paket</th><th>Mapel</th><th>Nilai</th><th>Waktu</th></tr></thead><tbody id="tblAktivitasTerbaru"><tr><td colspan="5" class="text-center text-muted">Memuat...</td></tr></tbody></table></div>' +
      '</div>';
  },
  init() {
    if (AppState.dashboardAwal) { renderAdminDashboard(AppState.dashboardAwal); AppState.dashboardAwal = null; return; }
    refreshAdminDashboard();
  }
};
function refreshAdminDashboard() {
  google.script.run.withSuccessHandler(res => { if (res.success) renderAdminDashboard(res.data.dashboard); })
    .withFailureHandler(err => showToast('Error', err.message, 'danger')).bootstrapApp(AppState.token);
}
function renderAdminDashboard(d) {
  if (!d) return;
  const kpiGrid = document.getElementById('adminKpiGrid');
  if (kpiGrid) kpiGrid.innerHTML =
    kpiCard('👥', 'var(--info-bg)', 'var(--info-text)', d.totalPengguna, 'Total Pengguna') +
    kpiCard('⏳', 'var(--warning-bg)', 'var(--warning-text)', d.statusCounts.menunggu, 'Menunggu Persetujuan') +
    kpiCard('📚', 'var(--mapel-mtk-bg)', 'var(--mapel-mtk-text)', d.totalBankSoal, 'Total Bank Soal') +
    kpiCard('📈', 'var(--success-bg)', 'var(--success-text)', d.rataNilai, 'Rata-rata Nilai');

  const tbl = document.getElementById('tblAktivitasTerbaru');
  if (tbl) {
    tbl.innerHTML = (d.aktivitasTerbaru || []).length
      ? d.aktivitasTerbaru.map(a => '<tr><td>' + escapeHtml(a.nama) + '</td><td>' + escapeHtml(a.paket) + '</td><td><span class="pill ' + mapelPill(a.mapel) + '">' + escapeHtml(a.mapel) + '</span></td><td class="mono">' + a.nilai + '</td><td class="text-muted">' + fmtTgl(a.waktu) + '</td></tr>').join('')
      : '<tr><td colspan="5" class="text-center text-muted">Belum ada aktivitas.</td></tr>';
  }
  renderChartMapel(d.rataPerMapel || {});
  renderChartStatus(d.statusCounts || {});
}
function kpiCard(icon, bg, color, value, label) {
  return '<div class="kpi-card"><div class="kpi-icon" style="background:' + bg + ';color:' + color + ';">' + icon + '</div><div class="kpi-value">' + value + '</div><div class="kpi-label">' + label + '</div></div>';
}
function skeletonKpis(n) { return Array(n).fill('<div class="kpi-card"><div class="skeleton" style="height:60px;"></div></div>').join(''); }

function isDarkMode() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
function renderChartMapel(data) {
  const ctx = document.getElementById('chartMapel'); if (!ctx) return;
  if (AppState.chartInstances.mapel) AppState.chartInstances.mapel.destroy();
  const textColor = isDarkMode() ? '#EAF1FB' : '#1A2233';
  AppState.chartInstances.mapel = new Chart(ctx, {
    type: 'bar',
    data: { labels: Object.keys(data), datasets: [{ label: 'Rata-rata Nilai', data: Object.values(data), backgroundColor: ['#1D4E89', '#F28C28'], borderRadius: 8 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100, ticks: { color: textColor } }, x: { ticks: { color: textColor } } }, plugins: { legend: { display: false } } }
  });
}
function renderChartStatus(data) {
  const ctx = document.getElementById('chartStatus'); if (!ctx) return;
  if (AppState.chartInstances.status) AppState.chartInstances.status.destroy();
  const textColor = isDarkMode() ? '#EAF1FB' : '#1A2233';
  AppState.chartInstances.status = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: ['Aktif', 'Menunggu', 'Nonaktif', 'Ditolak'], datasets: [{ data: [data.aktif||0, data.menunggu||0, data.nonaktif||0, data.ditolak||0], backgroundColor: ['#166534', '#854D0E', '#475569', '#991B1B'] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: textColor, boxWidth: 12, padding: 10 } } } }
  });
}
function updateChartsTheme() {
  const d1 = AppState.chartInstances.mapel && AppState.chartInstances.mapel.data.datasets[0].data;
  const d2 = AppState.chartInstances.status && AppState.chartInstances.status.data.datasets[0].data;
  if (d1) renderChartMapel(Object.fromEntries(AppState.chartInstances.mapel.data.labels.map((l, i) => [l, d1[i]])));
  if (d2) renderChartStatus({ aktif: d2[0], menunggu: d2[1], nonaktif: d2[2], ditolak: d2[3] });
}

/* ============================================================
   HALAMAN SUPER ADMIN — Manajemen Akun (US-03)
   ============================================================ */
PAGES['admin-akun'] = {
  render() {
    return '' +
      '<div class="table-toolbar">' +
        '<input class="input" id="filterAkunKeyword" placeholder="🔎 Cari nama, email, sekolah..." oninput="debouncedFilterAkun()">' +
        '<select class="input" id="filterAkunStatus" style="max-width:180px;" onchange="loadDaftarAkun()">' +
          '<option value="">Semua Status</option><option value="menunggu">Menunggu</option><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option><option value="ditolak">Ditolak</option>' +
        '</select>' +
        '<button class="btn btn-outline btn-sm" onclick="loadDaftarAkun(true)">↻ Muat Ulang</button>' +
      '</div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Nama</th><th>Email</th><th>Asal Sekolah</th><th>Status</th><th>Terakhir Aktif</th><th>Aksi</th></tr></thead>' +
      '<tbody id="tblAkun"><tr><td colspan="6" class="text-center text-muted">Memuat data...</td></tr></tbody></table></div>';
  },
  init() { loadDaftarAkun(); }
};
const debouncedFilterAkun = debounce(() => loadDaftarAkun(), 350);

function loadDaftarAkun(force) {
  if (!force && AppState.cache.pengguna) { renderTabelAkun(AppState.cache.pengguna); return; }
  const filter = { keyword: (document.getElementById('filterAkunKeyword') || {}).value || '', status: (document.getElementById('filterAkunStatus') || {}).value || '' };
  google.script.run.withSuccessHandler(res => {
    if (!res.success) { showToast('Error', res.message, 'danger'); return; }
    AppState.cache.pengguna = res.data;
    renderTabelAkun(res.data, filter);
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getDaftarPengguna(AppState.token, null);
}
function renderTabelAkun(data, filter) {
  filter = filter || { keyword: (document.getElementById('filterAkunKeyword') || {}).value || '', status: (document.getElementById('filterAkunStatus') || {}).value || '' };
  let hasil = data;
  if (filter.status) hasil = hasil.filter(r => r.Status === filter.status);
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    hasil = hasil.filter(r => (r.Nama||'').toLowerCase().includes(kw) || (r.Email||'').toLowerCase().includes(kw) || (r.AsalSekolah||'').toLowerCase().includes(kw));
  }
  const tbl = document.getElementById('tblAkun');
  if (!tbl) return;
  if (!hasil.length) { tbl.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Tidak ada data yang cocok.</td></tr>'; return; }
  tbl.innerHTML = hasil.map(u => {
    let aksi = '';
    if (u.Status === 'menunggu') aksi += '<button class="btn btn-primary btn-sm" onclick="aksiAkun(\'' + u.ID + '\',\'aktif\')">✓ Setujui</button> <button class="btn btn-danger btn-sm" onclick="aksiAkun(\'' + u.ID + '\',\'ditolak\')">✕ Tolak</button>';
    if (u.Status === 'aktif') aksi += '<button class="btn btn-outline btn-sm" onclick="aksiAkun(\'' + u.ID + '\',\'nonaktif\')">Nonaktifkan</button>';
    if (u.Status === 'nonaktif' || u.Status === 'ditolak') aksi += '<button class="btn btn-primary btn-sm" onclick="aksiAkun(\'' + u.ID + '\',\'aktif\')">Aktifkan</button>';
    aksi += ' <button class="btn btn-ghost btn-sm" onclick="aksiResetPassword(\'' + u.ID + '\',\'' + escapeHtml(u.Nama) + '\')">🔑 Reset Sandi</button>';
    return '<tr><td>' + escapeHtml(u.Nama) + '<div class="text-muted" style="font-size:11.5px;">' + escapeHtml(u.Kelas||'-') + '</div></td><td>' + escapeHtml(u.Email) +
      '</td><td>' + escapeHtml(u.AsalSekolah) + '</td><td><span class="pill ' + statusPill(u.Status) + '">' + u.Status + '</span></td>' +
      '<td class="text-muted" style="white-space:nowrap;">' + fmtTgl(u.TerakhirAktif) + '</td><td style="white-space:nowrap;">' + aksi + '</td></tr>';
  }).join('');
}
function aksiAkun(id, statusBaru) {
  const label = { aktif: 'mengaktifkan', ditolak: 'menolak', nonaktif: 'menonaktifkan' }[statusBaru] || 'mengubah';
  showConfirm('Konfirmasi', 'Yakin ingin ' + label + ' akun ini?', () => {
    closeModal();
    google.script.run.withSuccessHandler(res => {
      if (res.success) { showToast('Berhasil', res.message, 'success'); loadDaftarAkun(true); }
      else showToast('Gagal', res.message, 'danger');
    }).withFailureHandler(err => showToast('Error', err.message, 'danger')).ubahStatusPengguna(AppState.token, id, statusBaru);
  }, 'Ya, Lanjutkan', statusBaru !== 'aktif');
}
function aksiResetPassword(id, nama) {
  openModal('Reset Kata Sandi — ' + escapeHtml(nama),
    '<div class="field"><label>Kata Sandi Baru</label><input type="text" class="input" id="newPwInput" placeholder="Minimal 8 karakter" value="cbtsd2027"></div>' +
    '<p class="text-muted" style="font-size:12.5px;">Kata sandi baru ini wajib disampaikan langsung kepada pengguna.</p>',
    '<button class="btn btn-outline" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="submitResetPassword(\'' + id + '\')">Simpan</button>');
}
function submitResetPassword(id) {
  const pw = document.getElementById('newPwInput').value;
  if (pw.length < 8) { showToast('Periksa Kembali', 'Kata sandi minimal 8 karakter.', 'warning'); return; }
  google.script.run.withSuccessHandler(res => {
    closeModal();
    if (res.success) showToast('Berhasil', res.message, 'success'); else showToast('Gagal', res.message, 'danger');
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).resetPasswordPengguna(AppState.token, id, pw);
}

/* ============================================================
   HALAMAN SUPER ADMIN — Bank Soal (Kisi-kisi + Paket) — US-04..06
   ============================================================ */
PAGES['admin-banksoal'] = {
  render() {
    return '' +
      '<div class="flex gap-2 mb-3" id="bankSoalTabs">' +
        '<button class="btn btn-primary btn-sm" id="tabBtn-paket" onclick="tabBankSoal(\'paket\')">📦 Paket Latihan &amp; Try Out</button>' +
        '<button class="btn btn-outline btn-sm" id="tabBtn-kisikisi" onclick="tabBankSoal(\'kisikisi\')">📋 Kisi-kisi 2027</button>' +
      '</div>' +
      '<div id="tabContent-paket">' +
        '<div class="flex justify-between items-center mb-2"><span class="text-muted" style="font-size:13px;">Kelola paket latihan soal &amp; simulasi try out.</span><button class="btn btn-primary btn-sm" onclick="bukaFormPaket()">+ Buat Paket Baru</button></div>' +
        '<div class="grid grid-3" id="gridPaket"><div class="skeleton" style="height:140px;"></div><div class="skeleton" style="height:140px;"></div><div class="skeleton" style="height:140px;"></div></div>' +
      '</div>' +
      '<div id="tabContent-kisikisi" style="display:none;">' +
        '<div class="flex justify-between items-center mb-2"><span class="text-muted" style="font-size:13px;">Kisi-kisi indikator soal resmi tahun 2027.</span><button class="btn btn-primary btn-sm" onclick="bukaFormKisiKisi()">+ Tambah Kisi-kisi</button></div>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr><th>Mapel</th><th>Materi</th><th>Kompetensi</th><th>Status</th><th>Aksi</th></tr></thead><tbody id="tblKisiKisi"><tr><td colspan="5" class="text-center text-muted">Memuat...</td></tr></tbody></table></div>' +
      '</div>';
  },
  init() { loadGridPaket(); loadTabelKisiKisi(); }
};
function tabBankSoal(tab) {
  ['paket', 'kisikisi'].forEach(t => {
    document.getElementById('tabContent-' + t).style.display = t === tab ? 'block' : 'none';
    document.getElementById('tabBtn-' + t).className = 'btn btn-sm ' + (t === tab ? 'btn-primary' : 'btn-outline');
  });
}

/* ── Kisi-kisi CRUD ── */
function loadTabelKisiKisi() {
  google.script.run.withSuccessHandler(res => {
    const tbl = document.getElementById('tblKisiKisi'); if (!tbl) return;
    if (!res.success) { showToast('Error', res.message, 'danger'); return; }
    AppState.cache.kisiKisi = res.data;
    tbl.innerHTML = res.data.length ? res.data.map(k =>
      '<tr><td><span class="pill ' + mapelPill(k.MataPelajaran) + '">' + escapeHtml(k.MataPelajaran) + '</span></td><td>' + escapeHtml(k.Materi) + '</td><td class="text-muted">' + escapeHtml(k.Kompetensi) + '</td>' +
      '<td><span class="pill ' + (k.StatusPublikasi === 'terbit' ? 'pill-success' : 'pill-neutral') + '">' + k.StatusPublikasi + '</span></td>' +
      '<td><button class="btn btn-ghost btn-sm" onclick=\'bukaFormKisiKisi(' + JSON.stringify(k).replace(/'/g, '&#39;') + ')\'>✎ Ubah</button> <button class="btn btn-ghost btn-sm" onclick="hapusKisiKisiConfirm(\'' + k.ID + '\')">🗑</button></td></tr>'
    ).join('') : '<tr><td colspan="5" class="text-center text-muted">Belum ada kisi-kisi.</td></tr>';
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getKisiKisi(AppState.token);
}
function bukaFormKisiKisi(data) {
  data = data || {};
  openModal(data.ID ? 'Ubah Kisi-kisi' : 'Tambah Kisi-kisi', '' +
    '<input type="hidden" id="kkID" value="' + (data.ID||'') + '">' +
    '<div class="grid grid-2"><div class="field"><label>Tahun</label><input class="input" id="kkTahun" value="' + (data.Tahun||'2027') + '"></div>' +
    '<div class="field"><label>Mata Pelajaran</label><select class="input" id="kkMapel"><option ' + (data.MataPelajaran==='Matematika'?'selected':'') + '>Matematika</option><option ' + (data.MataPelajaran==='Bahasa Indonesia'?'selected':'') + '>Bahasa Indonesia</option></select></div></div>' +
    '<div class="field"><label>Materi</label><input class="input" id="kkMateri" value="' + escapeHtml(data.Materi||'') + '"></div>' +
    '<div class="field"><label>Kompetensi</label><textarea class="input" id="kkKompetensi">' + escapeHtml(data.Kompetensi||'') + '</textarea></div>' +
    '<div class="field"><label>Indikator</label><textarea class="input" id="kkIndikator">' + escapeHtml(data.Indikator||'') + '</textarea></div>' +
    '<div class="field"><label>Status</label><select class="input" id="kkStatus"><option value="draft" ' + (data.StatusPublikasi==='draft'?'selected':'') + '>Draft</option><option value="terbit" ' + (data.StatusPublikasi==='terbit'?'selected':'') + '>Terbit</option></select></div>',
    '<button class="btn btn-outline" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="simpanFormKisiKisi()">Simpan</button>');
}
function simpanFormKisiKisi() {
  const obj = { ID: document.getElementById('kkID').value || undefined, Tahun: document.getElementById('kkTahun').value, MataPelajaran: document.getElementById('kkMapel').value,
    Materi: document.getElementById('kkMateri').value, Kompetensi: document.getElementById('kkKompetensi').value, Indikator: document.getElementById('kkIndikator').value, StatusPublikasi: document.getElementById('kkStatus').value };
  google.script.run.withSuccessHandler(res => { closeModal(); if (res.success) { showToast('Tersimpan', res.message, 'success'); loadTabelKisiKisi(); } else showToast('Gagal', res.message, 'danger'); })
    .withFailureHandler(err => showToast('Error', err.message, 'danger')).simpanKisiKisi(AppState.token, obj);
}
function hapusKisiKisiConfirm(id) {
  showConfirm('Hapus Kisi-kisi', 'Data ini akan dihapus permanen.', () => {
    closeModal();
    google.script.run.withSuccessHandler(res => { if (res.success) { showToast('Terhapus', res.message, 'success'); loadTabelKisiKisi(); } }).withFailureHandler(err => showToast('Error', err.message, 'danger')).hapusKisiKisi(AppState.token, id);
  });
}

/* ── Paket Soal CRUD ── */
function loadGridPaket() {
  google.script.run.withSuccessHandler(res => {
    const grid = document.getElementById('gridPaket'); if (!grid) return;
    if (!res.success) { showToast('Error', res.message, 'danger'); return; }
    AppState.cache.paketAdmin = res.data;
    grid.innerHTML = res.data.length ? res.data.map(paketCardAdmin).join('') : '<div class="empty-state" style="grid-column:1/-1;">📦<br>Belum ada paket. Klik "Buat Paket Baru".</div>';
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getDaftarPaketAdmin(AppState.token);
}
function paketCardAdmin(p) {
  return '<div class="card card-pad">' +
    '<div class="flex justify-between items-start mb-1"><span class="pill ' + mapelPill(p.MataPelajaran) + '">' + escapeHtml(p.MataPelajaran) + '</span><span class="pill ' + statusPill(p.Status) + '">' + p.Status + '</span></div>' +
    '<strong style="font-size:14px;display:block;margin-bottom:4px;">' + escapeHtml(p.Nama) + '</strong>' +
    '<span class="text-muted" style="font-size:12px;">' + (p.Jenis === 'tryout' ? '⏱️ Simulasi Try Out · ' + (p.Durasi||0) + ' menit' : '📝 Latihan Soal · tanpa batas waktu') + '</span>' +
    '<div class="flex items-center gap-2" style="margin-top:10px;font-size:12.5px;color:var(--text-secondary);"><span>📄 ' + (p.JumlahSoal||0) + ' soal</span><span>·</span><span>🎯 ' + p.SkorPerSoal + ' poin/soal</span></div>' +
    '<div class="flex gap-2" style="margin-top:12px;flex-wrap:wrap;">' +
      '<button class="btn btn-primary btn-sm" onclick="goToPage(\'admin-paket-editor\',{idPaket:\'' + p.ID + '\'})">✎ Kelola Soal</button>' +
      '<button class="btn btn-outline btn-sm" onclick=\'bukaFormPaket(' + JSON.stringify(p).replace(/'/g, '&#39;') + ')\'>Edit</button>' +
      (p.Status === 'aktif' ? '<button class="btn btn-ghost btn-sm" onclick="ubahStatusPaketUI(\'' + p.ID + '\',\'nonaktif\')">Nonaktifkan</button>' : '<button class="btn btn-ghost btn-sm" onclick="ubahStatusPaketUI(\'' + p.ID + '\',\'aktif\')">Aktifkan</button>') +
      '<button class="btn btn-ghost btn-sm" onclick="hapusPaketConfirm(\'' + p.ID + '\')">🗑</button>' +
    '</div></div>';
}
function bukaFormPaket(data) {
  data = data || {};
  openModal(data.ID ? 'Ubah Paket' : 'Buat Paket Baru', '' +
    '<input type="hidden" id="pkID" value="' + (data.ID||'') + '">' +
    '<div class="field"><label>Nama Paket *</label><input class="input" id="pkNama" value="' + escapeHtml(data.Nama||'') + '" placeholder="Contoh: Latihan Matematika Bab Pecahan"></div>' +
    '<div class="grid grid-2">' +
      '<div class="field"><label>Mata Pelajaran</label><select class="input" id="pkMapel"><option ' + (data.MataPelajaran==='Matematika'?'selected':'') + '>Matematika</option><option ' + (data.MataPelajaran==='Bahasa Indonesia'?'selected':'') + '>Bahasa Indonesia</option></select></div>' +
      '<div class="field"><label>Jenis Paket</label><select class="input" id="pkJenis" onchange="togglePkDurasi()"><option value="latihan" ' + (data.Jenis==='latihan'?'selected':'') + '>Latihan Soal</option><option value="tryout" ' + (data.Jenis==='tryout'?'selected':'') + '>Simulasi Try Out</option></select></div>' +
    '</div>' +
    '<div class="field"><label>Deskripsi / Petunjuk</label><textarea class="input" id="pkDeskripsi">' + escapeHtml(data.Deskripsi||'') + '</textarea></div>' +
    '<div class="grid grid-2">' +
      '<div class="field"><label>Skor per Soal (default)</label><input type="number" class="input" id="pkSkor" value="' + (data.SkorPerSoal!==undefined?data.SkorPerSoal:4) + '"></div>' +
      '<div class="field" id="pkDurasiWrap" style="display:' + (data.Jenis==='tryout'?'block':'none') + ';"><label>Durasi (menit)</label><input type="number" class="input" id="pkDurasi" value="' + (data.Durasi||45) + '"></div>' +
    '</div>' +
    '<div class="grid grid-2">' +
      '<div class="field"><label>Batas Percobaan (0 = tanpa batas)</label><input type="number" class="input" id="pkPercobaan" value="' + (data.JumlahPercobaan!==undefined?data.JumlahPercobaan:0) + '"></div>' +
      '<div class="field"><label>Status Tampil</label><select class="input" id="pkStatusTampil"><option value="tampil" ' + (data.StatusTampil==='tampil'?'selected':'') + '>Tampil</option><option value="sembunyi" ' + (data.StatusTampil==='sembunyi'?'selected':'') + '>Sembunyi</option></select></div>' +
    '</div>' +
    '<div class="grid grid-2">' +
      '<div class="field"><label>Tampilkan Nilai</label><select class="input" id="pkTampilNilai"><option value="langsung" ' + (data.TampilkanNilai==='langsung'?'selected':'') + '>Langsung setelah selesai</option><option value="setelah_diizinkan" ' + (data.TampilkanNilai==='setelah_diizinkan'?'selected':'') + '>Setelah diizinkan Admin</option></select></div>' +
      '<div class="field"><label>Tampilkan Pembahasan</label><select class="input" id="pkTampilPembahasan"><option value="langsung" ' + (data.TampilkanPembahasan==='langsung'?'selected':'') + '>Langsung setelah selesai</option><option value="setelah_diizinkan" ' + (data.TampilkanPembahasan==='setelah_diizinkan'?'selected':'') + '>Setelah diizinkan Admin</option></select></div>' +
    '</div>' +
    '<div class="field"><label>Status Paket</label><select class="input" id="pkStatus"><option value="draft" ' + (data.Status==='draft'?'selected':'') + '>Draft</option><option value="aktif" ' + (data.Status==='aktif'?'selected':'') + '>Aktif</option><option value="nonaktif" ' + (data.Status==='nonaktif'?'selected':'') + '>Nonaktif</option></select></div>',
    '<button class="btn btn-outline" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="simpanFormPaket()">Simpan</button>');
}
function togglePkDurasi() { document.getElementById('pkDurasiWrap').style.display = document.getElementById('pkJenis').value === 'tryout' ? 'block' : 'none'; }
function simpanFormPaket() {
  const nama = document.getElementById('pkNama').value.trim();
  if (!nama) { showToast('Periksa Kembali', 'Nama paket wajib diisi.', 'warning'); return; }
  const obj = {
    ID: document.getElementById('pkID').value || undefined, Nama: nama, MataPelajaran: document.getElementById('pkMapel').value,
    Jenis: document.getElementById('pkJenis').value, Deskripsi: document.getElementById('pkDeskripsi').value,
    SkorPerSoal: Number(document.getElementById('pkSkor').value) || 4, Durasi: Number(document.getElementById('pkDurasi').value) || 0,
    JumlahPercobaan: Number(document.getElementById('pkPercobaan').value) || 0, StatusTampil: document.getElementById('pkStatusTampil').value,
    TampilkanNilai: document.getElementById('pkTampilNilai').value, TampilkanPembahasan: document.getElementById('pkTampilPembahasan').value,
    Status: document.getElementById('pkStatus').value
  };
  google.script.run.withSuccessHandler(res => { closeModal(); if (res.success) { showToast('Tersimpan', res.message, 'success'); loadGridPaket(true); } else showToast('Gagal', res.message, 'danger'); })
    .withFailureHandler(err => showToast('Error', err.message, 'danger')).simpanPaket(AppState.token, obj);
}
function ubahStatusPaketUI(id, status) {
  google.script.run.withSuccessHandler(res => { if (res.success) { showToast('Diperbarui', res.message, 'success'); loadGridPaket(); } })
    .withFailureHandler(err => showToast('Error', err.message, 'danger')).ubahStatusPaket(AppState.token, id, status);
}
function hapusPaketConfirm(id) {
  showConfirm('Hapus Paket', 'Seluruh soal dalam paket ini juga akan terhapus permanen. Lanjutkan?', () => {
    closeModal();
    google.script.run.withSuccessHandler(res => { if (res.success) { showToast('Terhapus', res.message, 'success'); loadGridPaket(); } })
      .withFailureHandler(err => showToast('Error', err.message, 'danger')).hapusPaket(AppState.token, id);
  });
}

/* ============================================================
   HALAMAN SUPER ADMIN — Editor Soal (Lampiran A.2-A.6)
   Satu halaman, kartu per soal, auto-save sebagai draft.
   ============================================================ */
function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 8); }
function gambarUrlFromId(fileId) { return fileId ? 'https://lh3.googleusercontent.com/d/' + fileId : ''; }
const HURUF = ['A', 'B', 'C', 'D', 'E'];

function defaultPilihan(jenis) {
  if (jenis === 'PG' || jenis === 'PG_KOMPLEKS') return { opsi: [{ teks: '', gambar: '' }, { teks: '', gambar: '' }] };
  if (jenis === 'BS') return { pernyataan: [{ id: uid('p'), teks: '' }, { id: uid('p'), teks: '' }] };
  if (jenis === 'JODOH') return { kiri: [{ id: uid('k'), teks: '' }, { id: uid('k'), teks: '' }], kanan: [{ id: uid('k'), teks: '' }, { id: uid('k'), teks: '' }] };
  if (jenis === 'ISIAN') return { tipe: 'teks' };
  return {};
}
function defaultKunci(jenis) {
  if (jenis === 'PG') return 'A';
  if (jenis === 'PG_KOMPLEKS') return [];
  if (jenis === 'BS') return {};
  if (jenis === 'JODOH') return {};
  if (jenis === 'ISIAN') return [''];
  return null;
}

PAGES['admin-paket-editor'] = {
  render(params) {
    return '' +
      '<div class="flex items-center gap-2 mb-2">' +
        '<button class="icon-btn" onclick="goToPage(\'admin-banksoal\')">←</button>' +
        '<div><strong id="editorPaketNama" style="font-size:15px;display:block;">Memuat paket...</strong><span class="text-muted" style="font-size:12.5px;" id="editorPaketInfo"></span></div>' +
      '</div>' +
      '<div class="card card-pad mb-3" style="background:var(--bg-tint);border:none;"><strong style="font-size:13px;">📝 Petunjuk Soal Pilihan Ganda Kompleks, Benar-Salah, Menjodohkan, dan Isian</strong><p class="text-muted" style="font-size:12.5px;margin:6px 0 0;">Tiap jenis soal memiliki cara kunci dan penilaian masing-masing — lihat Lampiran A.3 panduan penilaian untuk rincian rumus skor parsial.</p></div>' +
      '<div id="soalCardsContainer"><div class="skeleton" style="height:70px;margin-bottom:10px;"></div><div class="skeleton" style="height:70px;"></div></div>' +
      '<button class="btn btn-primary btn-block" style="margin-top:14px;" onclick="tambahSoalBaru()">+ Tambah Soal Baru</button>';
  },
  init(params) { loadSoalEditor(params.idPaket); }
};

function loadSoalEditor(idPaket) {
  AppState.editorIdPaket = idPaket;
  google.script.run.withSuccessHandler(res => {
    if (!res.success) { showToast('Error', res.message, 'danger'); return; }
    document.getElementById('editorPaketNama').textContent = res.data.paket.Nama;
    document.getElementById('editorPaketInfo').textContent = res.data.paket.MataPelajaran + ' · ' + (res.data.paket.Jenis === 'tryout' ? 'Simulasi Try Out' : 'Latihan Soal');
    AppState.soalList = res.data.soal.map(s => {
      const c = Object.assign({}, s);
      try { c.Pilihan = JSON.parse(c.Pilihan || '{}'); } catch (e) { c.Pilihan = {}; }
      try { c.Kunci = JSON.parse(c.Kunci || 'null'); } catch (e) { c.Kunci = null; }
      c._open = false;
      return c;
    });
    renderSoalCardsContainer();
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getPaketDetail(AppState.token, idPaket);
}

function renderSoalCardsContainer() {
  const el = document.getElementById('soalCardsContainer');
  if (!AppState.soalList.length) { el.innerHTML = '<div class="empty-state">📄<br>Belum ada soal pada paket ini.</div>'; return; }
  el.innerHTML = AppState.soalList.map((s, i) => buildSoalCard(i)).join('');
}
function renderSingleCard(idx) {
  const wrap = document.getElementById('soalCard-' + idx);
  if (wrap) wrap.outerHTML = buildSoalCard(idx);
}
function toggleSoalCard(idx) { AppState.soalList[idx]._open = !AppState.soalList[idx]._open; renderSingleCard(idx); }

function buildSoalCard(idx) {
  const s = AppState.soalList[idx];
  const preview = (s.Pertanyaan || '<em>(Pertanyaan belum diisi)</em>').replace(/<(?!em|\/em)/g, '&lt;');
  return '<div class="soal-card' + (s._open ? ' open' : '') + '" id="soalCard-' + idx + '">' +
    '<div class="soal-card-head" onclick="toggleSoalCard(' + idx + ')">' +
      '<span class="nomor-badge">' + (s.Nomor_Urut || idx + 1) + '</span>' +
      '<div style="flex:1;min-width:0;"><div class="flex items-center gap-2"><span class="pill pill-info">' + jenisLabel(s.Jenis_Soal) + '</span><span class="text-muted" style="font-size:12px;">🎯 ' + s.Skor + ' poin</span></div>' +
      '<div style="font-size:13px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + preview.substring(0, 90) + '</div></div>' +
      '<span>' + (s._open ? '▲' : '▼') + '</span>' +
    '</div>' +
    '<div class="soal-card-body">' + buildSoalForm(idx) + '</div>' +
  '</div>';
}
function jenisLabel(j) { return { PG: 'Pilihan Ganda', PG_KOMPLEKS: 'PG Kompleks', BS: 'Benar/Salah', JODOH: 'Menjodohkan', ISIAN: 'Isian Singkat' }[j] || j; }

function buildSoalForm(idx) {
  const s = AppState.soalList[idx];
  let html = '' +
    '<div class="grid grid-2">' +
      '<div class="field"><label>Jenis Soal</label><select class="input" onchange="gantiJenisSoal(' + idx + ',this.value)">' +
        ['PG','PG_KOMPLEKS','BS','JODOH','ISIAN'].map(j => '<option value="' + j + '" ' + (s.Jenis_Soal === j ? 'selected' : '') + '>' + jenisLabel(j) + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label>Skor Soal</label><input type="number" class="input" value="' + s.Skor + '" oninput="setSoalField(' + idx + ',\'Skor\',Number(this.value))"></div>' +
    '</div>' +
    '<div class="field"><label>Pertanyaan</label><textarea class="input" oninput="setSoalField(' + idx + ',\'Pertanyaan\',this.value)">' + escapeHtml(s.Pertanyaan) + '</textarea></div>' +
    '<div class="field"><label>Gambar Pertanyaan (opsional)</label>' +
      '<div class="img-upload-box">' +
        (s.ID_Gambar_Pertanyaan ? '<img class="img-thumb" src="' + gambarUrlFromId(s.ID_Gambar_Pertanyaan) + '">' : '<span class="img-thumb flex items-center justify-center" style="font-size:18px;">🖼️</span>') +
        '<div style="flex:1;"><input type="file" accept="image/jpeg,image/png,image/webp" id="fileGambar-' + idx + '" style="display:none;" onchange="uploadSoalGambar(' + idx + ')">' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById(\'fileGambar-' + idx + '\').click()">📤 Unggah Gambar</button>' +
        (s.ID_Gambar_Pertanyaan ? ' <button type="button" class="btn btn-ghost btn-sm" onclick="setSoalField(' + idx + ',\'ID_Gambar_Pertanyaan\',\'\');renderSingleCard(' + idx + ')">Hapus</button>' : '') + '</div>' +
      '</div></div>';

  html += buildJenisSpesifik(idx);

  html += '<div class="field"><label>Pembahasan (opsional)</label><textarea class="input" oninput="setSoalField(' + idx + ',\'Pembahasan\',this.value)">' + escapeHtml(s.Pembahasan) + '</textarea></div>' +
    '<div class="flex gap-2" style="flex-wrap:wrap;">' +
      '<button class="btn btn-primary btn-sm" onclick="simpanSoalCard(' + idx + ')">💾 Simpan Soal</button>' +
      '<button class="btn btn-outline btn-sm" onclick="duplikasiSoalCard(' + idx + ')">⧉ Duplikasi</button>' +
      '<button class="btn btn-danger btn-sm" onclick="hapusSoalCard(' + idx + ')">🗑 Hapus Soal</button>' +
    '</div>';
  return html;
}

function buildJenisSpesifik(idx) {
  const s = AppState.soalList[idx];
  if (s.Jenis_Soal === 'PG' || s.Jenis_Soal === 'PG_KOMPLEKS') {
    const opsi = s.Pilihan.opsi || [];
    const kunci = s.Jenis_Soal === 'PG' ? s.Kunci : (s.Kunci || []);
    let html = '<div class="field"><label>Pilihan Jawaban (' + opsi.length + '/5) — tandai kunci jawaban yang benar</label>';
    opsi.forEach((o, oi) => {
      const huruf = HURUF[oi];
      const isKunci = s.Jenis_Soal === 'PG' ? kunci === huruf : kunci.includes(huruf);
      html += '<div class="opsi-row">' +
        '<span class="opsi-letter' + (isKunci ? ' is-kunci' : '') + '" style="cursor:pointer;" onclick="' + (s.Jenis_Soal === 'PG' ? 'setKunciPG(' + idx + ',\'' + huruf + '\')' : 'toggleKunciKompleks(' + idx + ',\'' + huruf + '\')') + '">' + huruf + '</span>' +
        '<input class="input" style="flex:1;" placeholder="Teks pilihan ' + huruf + '" value="' + escapeHtml(o.teks) + '" oninput="setOpsiTeks(' + idx + ',' + oi + ',this.value)">' +
        (opsi.length > 2 ? '<button class="btn btn-ghost btn-sm" onclick="hapusOpsi(' + idx + ',' + oi + ')">✕</button>' : '') +
      '</div>';
    });
    html += '</div>';
    if (opsi.length < 5) html += '<button class="btn btn-outline btn-sm" onclick="tambahOpsi(' + idx + ')">+ Tambah Pilihan</button>';
    html += '<div class="field" style="margin-top:12px;"><span class="hint">Klik lingkaran huruf untuk ' + (s.Jenis_Soal === 'PG' ? 'memilih satu kunci jawaban.' : 'menandai satu atau lebih kunci jawaban (skor parsial otomatis).') + '</span></div>';
    return html;
  }
  if (s.Jenis_Soal === 'BS') {
    const pernyataan = s.Pilihan.pernyataan || [];
    let html = '<div class="field"><label>Daftar Pernyataan — tandai Benar/Salah sebagai kunci</label>';
    pernyataan.forEach((p, pi) => {
      html += '<div class="opsi-row">' +
        '<input class="input" style="flex:1;" placeholder="Pernyataan ' + (pi+1) + '" value="' + escapeHtml(p.teks) + '" oninput="setPernyataanTeks(' + idx + ',' + pi + ',this.value)">' +
        '<select class="input" style="max-width:110px;" onchange="setKunciBS(' + idx + ',\'' + p.id + '\',this.value)"><option value="B" ' + (s.Kunci[p.id]==='B'?'selected':'') + '>Benar</option><option value="S" ' + (s.Kunci[p.id]==='S'?'selected':'') + '>Salah</option></select>' +
        (pernyataan.length > 2 ? '<button class="btn btn-ghost btn-sm" onclick="hapusPernyataan(' + idx + ',' + pi + ')">✕</button>' : '') +
      '</div>';
    });
    html += '</div><button class="btn btn-outline btn-sm" onclick="tambahPernyataan(' + idx + ')">+ Tambah Pernyataan</button>';
    html += '<div class="field" style="margin-top:12px;"><label>Aturan Penilaian</label><select class="input" onchange="setSoalField(' + idx + ',\'Aturan_Penilaian\',this.value)">' +
      '<option value="per_pernyataan" ' + (s.Aturan_Penilaian!=='semua_benar'?'selected':'') + '>Skor proporsional per pernyataan</option>' +
      '<option value="semua_benar" ' + (s.Aturan_Penilaian==='semua_benar'?'selected':'') + '>Skor penuh hanya jika semua benar</option></select></div>';
    return html;
  }
  if (s.Jenis_Soal === 'JODOH') {
    const kiri = s.Pilihan.kiri || [], kanan = s.Pilihan.kanan || [];
    let html = '<div class="grid grid-2">' +
      '<div class="field"><label>Kolom Kiri</label>' + kiri.map((k, ki) =>
        '<div class="opsi-row"><input class="input" placeholder="Item kiri ' + (ki+1) + '" value="' + escapeHtml(k.teks) + '" oninput="setKiriTeks(' + idx + ',' + ki + ',this.value)">' +
        (kiri.length > 2 ? '<button class="btn btn-ghost btn-sm" onclick="hapusKiri(' + idx + ',' + ki + ')">✕</button>' : '') + '</div>'
      ).join('') + (kiri.length < 6 ? '<button class="btn btn-outline btn-sm" onclick="tambahKiri(' + idx + ')">+ Item Kiri</button>' : '') + '</div>' +
      '<div class="field"><label>Kolom Kanan</label>' + kanan.map((k, ki) =>
        '<div class="opsi-row"><input class="input" placeholder="Item kanan ' + (ki+1) + '" value="' + escapeHtml(k.teks) + '" oninput="setKananTeks(' + idx + ',' + ki + ',this.value)">' +
        (kanan.length > 2 ? '<button class="btn btn-ghost btn-sm" onclick="hapusKanan(' + idx + ',' + ki + ')">✕</button>' : '') + '</div>'
      ).join('') + (kanan.length < 6 ? '<button class="btn btn-outline btn-sm" onclick="tambahKanan(' + idx + ')">+ Item Kanan</button>' : '') + '</div>' +
    '</div>' +
    '<div class="field"><label>Kunci Pasangan (pilih jodoh yang benar untuk tiap item kiri)</label>' +
      kiri.map((k, ki) => '<div class="opsi-row"><span style="min-width:110px;font-size:13px;">' + escapeHtml(k.teks || ('Item kiri ' + (ki+1))) + ' →</span>' +
        '<select class="input" onchange="setKunciJodoh(' + idx + ',\'' + k.id + '\',this.value)"><option value="">— pilih —</option>' +
        kanan.map(kn => '<option value="' + kn.id + '" ' + (s.Kunci[k.id]===kn.id?'selected':'') + '>' + escapeHtml(kn.teks || '(kosong)') + '</option>').join('') + '</select></div>').join('') +
    '</div>' +
    '<div class="field"><label>Aturan Penilaian</label><select class="input" onchange="setSoalField(' + idx + ',\'Aturan_Penilaian\',this.value)">' +
      '<option value="per_pasangan" ' + (s.Aturan_Penilaian!=='semua_benar'?'selected':'') + '>Skor proporsional per pasangan</option>' +
      '<option value="semua_benar" ' + (s.Aturan_Penilaian==='semua_benar'?'selected':'') + '>Skor penuh hanya jika semua cocok</option></select></div>';
    return html;
  }
  if (s.Jenis_Soal === 'ISIAN') {
    const kunci = Array.isArray(s.Kunci) ? s.Kunci : [''];
    let html = '<div class="field"><label>Tipe Jawaban</label><select class="input" onchange="setTipeIsian(' + idx + ',this.value)">' +
      '<option value="teks" ' + (s.Pilihan.tipe==='teks'?'selected':'') + '>Teks</option><option value="angka" ' + (s.Pilihan.tipe==='angka'?'selected':'') + '>Angka</option></select>' +
      '<div class="hint">Tipe "Angka" mengabaikan spasi dan menyamakan koma dengan titik desimal saat penilaian.</div></div>';
    html += '<div class="field"><label>Kunci Jawaban yang Diterima</label>';
    kunci.forEach((k, ki) => html += '<div class="opsi-row"><input class="input" placeholder="Jawaban diterima ' + (ki+1) + '" value="' + escapeHtml(k) + '" oninput="setKunciIsian(' + idx + ',' + ki + ',this.value)">' +
      (kunci.length > 1 ? '<button class="btn btn-ghost btn-sm" onclick="hapusKunciIsian(' + idx + ',' + ki + ')">✕</button>' : '') + '</div>');
    html += '</div><button class="btn btn-outline btn-sm" onclick="tambahKunciIsian(' + idx + ')">+ Tambah Variasi Jawaban</button>';
    return html;
  }
  return '';
}

/* ── Setter: field datar ── */
function setSoalField(idx, field, value) { AppState.soalList[idx][field] = value; }

/* ── PG / PG_KOMPLEKS ── */
function setOpsiTeks(idx, oi, val) { AppState.soalList[idx].Pilihan.opsi[oi].teks = val; }
function tambahOpsi(idx) { AppState.soalList[idx].Pilihan.opsi.push({ teks: '', gambar: '' }); renderSingleCard(idx); }
function hapusOpsi(idx, oi) {
  const s = AppState.soalList[idx];
  const huruf = HURUF[oi];
  s.Pilihan.opsi.splice(oi, 1);
  if (s.Jenis_Soal === 'PG' && s.Kunci === huruf) s.Kunci = HURUF[0];
  if (s.Jenis_Soal === 'PG_KOMPLEKS') s.Kunci = (s.Kunci || []).filter(k => k !== huruf);
  renderSingleCard(idx);
}
function setKunciPG(idx, huruf) { AppState.soalList[idx].Kunci = huruf; renderSingleCard(idx); }
function toggleKunciKompleks(idx, huruf) {
  const s = AppState.soalList[idx];
  if (!Array.isArray(s.Kunci)) s.Kunci = [];
  const i = s.Kunci.indexOf(huruf);
  if (i > -1) s.Kunci.splice(i, 1); else s.Kunci.push(huruf);
  renderSingleCard(idx);
}

/* ── BS ── */
function setPernyataanTeks(idx, pi, val) { AppState.soalList[idx].Pilihan.pernyataan[pi].teks = val; }
function tambahPernyataan(idx) { const id = uid('p'); AppState.soalList[idx].Pilihan.pernyataan.push({ id: id, teks: '' }); AppState.soalList[idx].Kunci[id] = 'B'; renderSingleCard(idx); }
function hapusPernyataan(idx, pi) { const s = AppState.soalList[idx]; const id = s.Pilihan.pernyataan[pi].id; s.Pilihan.pernyataan.splice(pi, 1); delete s.Kunci[id]; renderSingleCard(idx); }
function setKunciBS(idx, id, val) { AppState.soalList[idx].Kunci[id] = val; }

/* ── JODOH ── */
function setKiriTeks(idx, ki, val) { AppState.soalList[idx].Pilihan.kiri[ki].teks = val; }
function setKananTeks(idx, ki, val) { AppState.soalList[idx].Pilihan.kanan[ki].teks = val; }
function tambahKiri(idx) { AppState.soalList[idx].Pilihan.kiri.push({ id: uid('k'), teks: '' }); renderSingleCard(idx); }
function tambahKanan(idx) { AppState.soalList[idx].Pilihan.kanan.push({ id: uid('k'), teks: '' }); renderSingleCard(idx); }
function hapusKiri(idx, ki) { const s = AppState.soalList[idx]; const id = s.Pilihan.kiri[ki].id; s.Pilihan.kiri.splice(ki, 1); delete s.Kunci[id]; renderSingleCard(idx); }
function hapusKanan(idx, ki) {
  const s = AppState.soalList[idx]; const id = s.Pilihan.kanan[ki].id; s.Pilihan.kanan.splice(ki, 1);
  Object.keys(s.Kunci).forEach(k => { if (s.Kunci[k] === id) s.Kunci[k] = ''; });
  renderSingleCard(idx);
}
function setKunciJodoh(idx, kiriId, kananId) { AppState.soalList[idx].Kunci[kiriId] = kananId; }

/* ── ISIAN ── */
function setTipeIsian(idx, val) { AppState.soalList[idx].Pilihan.tipe = val; }
function setKunciIsian(idx, ki, val) { AppState.soalList[idx].Kunci[ki] = val; }
function tambahKunciIsian(idx) { AppState.soalList[idx].Kunci.push(''); renderSingleCard(idx); }
function hapusKunciIsian(idx, ki) { AppState.soalList[idx].Kunci.splice(ki, 1); renderSingleCard(idx); }

function gantiJenisSoal(idx, jenisBaru) {
  const s = AppState.soalList[idx];
  s.Jenis_Soal = jenisBaru; s.Pilihan = defaultPilihan(jenisBaru); s.Kunci = defaultKunci(jenisBaru);
  if (jenisBaru === 'BS') s.Pilihan.pernyataan.forEach(p => s.Kunci[p.id] = 'B');
  renderSingleCard(idx);
}

/* ── Upload gambar soal (kompresi sisi klien) ── */
function uploadSoalGambar(idx) {
  const input = document.getElementById('fileGambar-' + idx);
  const file = input.files[0]; if (!file) return;
  if (!['image/jpeg','image/jpg','image/png','image/webp'].includes(file.type)) { showToast('Format Tidak Didukung', 'Gunakan JPG, PNG, atau WebP.', 'warning'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxW = 1000; const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale; canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      const base64 = dataUrl.split(',')[1];
      showToast('Mengunggah...', 'Gambar sedang dikompres & diunggah.', 'info');
      google.script.run.withSuccessHandler(res => {
        if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
        AppState.soalList[idx].ID_Gambar_Pertanyaan = res.data.fileId;
        renderSingleCard(idx);
        showToast('Berhasil', 'Gambar terunggah.', 'success');
      }).withFailureHandler(err => showToast('Error', err.message, 'danger')).uploadGambar(AppState.token, base64, file.name, 'image/jpeg', 'soal');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ── Simpan / Hapus / Duplikasi kartu soal ── */
function simpanSoalCard(idx) {
  const s = AppState.soalList[idx];
  if (!s.Pertanyaan || !s.Pertanyaan.trim()) { showToast('Periksa Kembali', 'Pertanyaan tidak boleh kosong.', 'warning'); return; }
  const payload = { ID_Soal: s.ID_Soal || undefined, ID_Paket: AppState.editorIdPaket, Jenis_Soal: s.Jenis_Soal, Pertanyaan: s.Pertanyaan,
    ID_Gambar_Pertanyaan: s.ID_Gambar_Pertanyaan || '', Pilihan: s.Pilihan, Kunci: s.Kunci, Skor: s.Skor, Aturan_Penilaian: s.Aturan_Penilaian || '', Pembahasan: s.Pembahasan || '' };
  google.script.run.withSuccessHandler(res => {
    if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
    s.ID_Soal = res.data.ID_Soal; s.Nomor_Urut = res.data.Nomor_Urut || s.Nomor_Urut;
    showToast('Tersimpan', res.message, 'success');
    renderSingleCard(idx);
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).simpanSoal(AppState.token, payload);
}
function hapusSoalCard(idx) {
  const s = AppState.soalList[idx];
  showConfirm('Hapus Soal', 'Soal nomor ' + (s.Nomor_Urut || idx + 1) + ' akan dihapus permanen.', () => {
    closeModal();
    if (!s.ID_Soal) { AppState.soalList.splice(idx, 1); renderSoalCardsContainer(); return; }
    google.script.run.withSuccessHandler(res => {
      if (res.success) { showToast('Terhapus', res.message, 'success'); loadSoalEditor(AppState.editorIdPaket); }
    }).withFailureHandler(err => showToast('Error', err.message, 'danger')).hapusSoal(AppState.token, s.ID_Soal, AppState.editorIdPaket);
  });
}
function duplikasiSoalCard(idx) {
  const s = AppState.soalList[idx];
  if (!s.ID_Soal) { showToast('Simpan Dahulu', 'Simpan soal ini sebelum menduplikasi.', 'warning'); return; }
  google.script.run.withSuccessHandler(res => { if (res.success) { showToast('Diduplikasi', res.message, 'success'); loadSoalEditor(AppState.editorIdPaket); } })
    .withFailureHandler(err => showToast('Error', err.message, 'danger')).duplikasiSoal(AppState.token, s.ID_Soal);
}
function tambahSoalBaru() {
  const paket = (AppState.cache.paketAdmin || []).find(p => p.ID === AppState.editorIdPaket) || { SkorPerSoal: 4 };
  AppState.soalList.push({ ID_Soal: null, ID_Paket: AppState.editorIdPaket, Nomor_Urut: AppState.soalList.length + 1, Jenis_Soal: 'PG',
    Pertanyaan: '', ID_Gambar_Pertanyaan: '', Pilihan: defaultPilihan('PG'), Kunci: 'A', Skor: paket.SkorPerSoal || 4, Aturan_Penilaian: '', Pembahasan: '', _open: true });
  renderSoalCardsContainer();
  setTimeout(() => { const el = document.getElementById('soalCard-' + (AppState.soalList.length - 1)); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
}

/* ============================================================
   HALAMAN SUPER ADMIN — Hasil & Laporan (US-11, US-13)
   ============================================================ */
PAGES['admin-hasil'] = {
  render() {
    return '' +
      '<div class="table-toolbar">' +
        '<input class="input" id="filterHasilKeyword" placeholder="🔎 Cari nama, sekolah, paket..." oninput="debouncedFilterHasil()">' +
        '<select class="input" id="filterHasilMapel" style="max-width:180px;" onchange="loadTabelHasil()"><option value="">Semua Mapel</option><option>Matematika</option><option>Bahasa Indonesia</option></select>' +
        '<input type="date" class="input" id="filterHasilMulai" style="max-width:160px;" onchange="loadTabelHasil()">' +
        '<input type="date" class="input" id="filterHasilAkhir" style="max-width:160px;" onchange="loadTabelHasil()">' +
        '<button class="btn btn-outline btn-sm" onclick="exportHasilKeCSV()">⬇ Ekspor CSV</button>' +
      '</div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Nama</th><th>Sekolah</th><th>Paket</th><th>Mapel</th><th>Nilai</th><th>Benar/Salah</th><th>Selesai</th><th></th></tr></thead>' +
      '<tbody id="tblHasil"><tr><td colspan="8" class="text-center text-muted">Memuat...</td></tr></tbody></table></div>';
  },
  init() { loadTabelHasil(); }
};
const debouncedFilterHasil = debounce(() => loadTabelHasil(), 350);
function loadTabelHasil() {
  const filter = {
    keyword: (document.getElementById('filterHasilKeyword')||{}).value || '',
    mataPelajaran: (document.getElementById('filterHasilMapel')||{}).value || '',
    tanggalMulai: (document.getElementById('filterHasilMulai')||{}).value || '',
    tanggalAkhir: (document.getElementById('filterHasilAkhir')||{}).value || ''
  };
  google.script.run.withSuccessHandler(res => {
    const tbl = document.getElementById('tblHasil'); if (!tbl) return;
    if (!res.success) { showToast('Error', res.message, 'danger'); return; }
    AppState.cache.hasilSemua = res.data;
    tbl.innerHTML = res.data.length ? res.data.map(h =>
      '<tr><td>' + escapeHtml(h.Nama) + '</td><td class="text-muted">' + escapeHtml(h.AsalSekolah) + '</td><td>' + escapeHtml(h.NamaPaket) + '</td>' +
      '<td><span class="pill ' + mapelPill(h.MataPelajaran) + '">' + escapeHtml(h.MataPelajaran) + '</span></td>' +
      '<td class="mono" style="font-weight:700;">' + h.Nilai + '</td><td class="text-muted">' + h.JumlahBenar + ' / ' + h.JumlahSalah + '</td>' +
      '<td class="text-muted" style="white-space:nowrap;">' + fmtTgl(h.SelesaiPada) + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" onclick="lihatDetailHasilAdmin(\'' + h.ID_Pengerjaan + '\')">Detail</button></td></tr>'
    ).join('') : '<tr><td colspan="8" class="text-center text-muted">Belum ada data hasil.</td></tr>';
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getHasilSemuaPengguna(AppState.token, filter);
}
function exportHasilKeCSV() {
  const filter = { keyword: document.getElementById('filterHasilKeyword').value, mataPelajaran: document.getElementById('filterHasilMapel').value,
    tanggalMulai: document.getElementById('filterHasilMulai').value, tanggalAkhir: document.getElementById('filterHasilAkhir').value };
  showToast('Memproses', 'Menyiapkan berkas ekspor...', 'info');
  google.script.run.withSuccessHandler(res => {
    if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
    const blob = new Blob(['\uFEFF' + res.data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'Hasil_CBT_TKA_SD_' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('Berhasil', 'Berkas CSV siap diunduh (dapat dibuka di Excel).', 'success');
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).exportHasilCSV(AppState.token, filter);
}
function lihatDetailHasilAdmin(idPengerjaan) {
  openModal('Detail Pengerjaan', '<div class="text-center" style="padding:20px;"><span class="spinner"></span></div>', '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>', 'lg');
  google.script.run.withSuccessHandler(res => {
    if (!res.success) { document.getElementById('modalBody').innerHTML = '<p class="text-muted">' + res.message + '</p>'; return; }
    document.getElementById('modalBody').innerHTML = renderDetailPengerjaanHtml(res.data);
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getDetailPengerjaan(AppState.token, idPengerjaan);
}
function renderDetailPengerjaanHtml(data) {
  if (data.terkunci) return '<div class="empty-state">🔒<br>' + escapeHtml(data.pesan) + '</div>';
  return (data.soal || []).map((s, i) => '' +
    '<div class="card card-pad mb-2"><div class="flex items-center gap-2 mb-1"><span class="pill pill-info">Soal ' + (i+1) + '</span><span class="text-muted" style="font-size:12px;">Skor: ' + (s.SkorDiperoleh||0) + ' / ' + s.Skor + '</span></div>' +
    '<p style="font-size:13.5px;margin:4px 0;">' + escapeHtml(s.Pertanyaan) + '</p>' +
    (s.Pembahasan ? '<div class="pill pill-neutral" style="display:block;white-space:normal;margin-top:6px;">💡 ' + escapeHtml(s.Pembahasan) + '</div>' : '') +
    '</div>'
  ).join('') || '<p class="text-muted">Tidak ada data soal.</p>';
}

/* ============================================================
   HALAMAN SUPER ADMIN — Pengaturan Sistem & Branding (US-14,15,16)
   ============================================================ */
PAGES['admin-pengaturan'] = {
  render() {
    return '' +
      '<div class="grid" style="grid-template-columns:1.4fr 1fr;gap:16px;">' +
        '<div class="card card-pad">' +
          '<strong style="font-size:14px;">🏷️ Identitas Portal</strong>' +
          '<div class="field" style="margin-top:14px;"><label>Nama Portal</label><input class="input" id="cfgNamaPortal"></div>' +
          '<div class="field"><label>Nama Instansi</label><input class="input" id="cfgNamaLembaga"></div>' +
          '<div class="grid grid-2">' +
            '<div class="field"><label>WhatsApp Helpdesk</label><input class="input" id="cfgWhatsapp"></div>' +
            '<div class="field"><label>Email Dukungan</label><input class="input" id="cfgEmail"></div>' +
          '</div>' +
          '<div class="field"><label>Token Aktivasi Pendaftaran</label><input class="input input-token" id="cfgRegToken"><div class="hint">Token ini dibagikan ke peserta agar akun langsung aktif tanpa menunggu persetujuan.</div></div>' +
          '<div class="field"><label>Teks Footer / Hak Cipta</label><input class="input" id="cfgFooter"></div>' +
          '<button class="btn btn-primary" onclick="simpanPengaturanUmum()">💾 Simpan Pengaturan</button>' +
        '</div>' +
        '<div class="card card-pad">' +
          '<strong style="font-size:14px;">🖼️ Logo &amp; Gambar Portal</strong>' +
          '<div class="field" style="margin-top:14px;"><label>Logo Resmi</label><div class="img-upload-box"><img class="img-thumb" id="previewLogo" src=""><div><input type="file" id="fileLogo" accept="image/*" style="display:none;" onchange="uploadBrandingFile(\'logoUrl\',this)"><button class="btn btn-outline btn-sm" onclick="document.getElementById(\'fileLogo\').click()">Ganti Logo</button></div></div></div>' +
          '<div class="field"><label>Gambar Landing Page</label><div class="img-upload-box"><img class="img-thumb" id="previewLanding" src=""><div><input type="file" id="fileLanding" accept="image/*" style="display:none;" onchange="uploadBrandingFile(\'landingImageUrl\',this)"><button class="btn btn-outline btn-sm" onclick="document.getElementById(\'fileLanding\').click()">Ganti Gambar</button></div></div></div>' +
          '<div class="field"><label>Gambar Halaman Masuk</label><div class="img-upload-box"><img class="img-thumb" id="previewLogin" src=""><div><input type="file" id="fileLogin" accept="image/*" style="display:none;" onchange="uploadBrandingFile(\'loginImageUrl\',this)"><button class="btn btn-outline btn-sm" onclick="document.getElementById(\'fileLogin\').click()">Ganti Gambar</button></div></div></div>' +
        '</div>' +
      '</div>' +
      '<div class="card card-pad" style="margin-top:16px;">' +
        '<div class="flex justify-between items-center"><strong style="font-size:14px;">🗄️ Backup &amp; Restore Data</strong><button class="btn btn-primary btn-sm" onclick="buatBackupSekarang()">+ Buat Backup Sekarang</button></div>' +
        '<div class="table-wrap" style="margin-top:12px;"><table class="data-table"><thead><tr><th>Waktu</th><th>Jenis</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody id="tblBackupLog"><tr><td colspan="4" class="text-center text-muted">Memuat...</td></tr></tbody></table></div>' +
      '</div>' +
      '<div class="card card-pad" style="margin-top:16px;">' +
        '<strong style="font-size:14px;">📜 Riwayat Aktivitas Sistem</strong>' +
        '<div class="table-wrap" style="margin-top:12px;"><table class="data-table"><thead><tr><th>Waktu</th><th>Email</th><th>Aksi</th><th>Keterangan</th></tr></thead><tbody id="tblRiwayat"><tr><td colspan="4" class="text-center text-muted">Memuat...</td></tr></tbody></table></div>' +
      '</div>';
  },
  init() { loadPengaturanAdmin(); loadBackupLog(); loadRiwayatAdmin(); }
};
function loadPengaturanAdmin() {
  google.script.run.withSuccessHandler(res => {
    if (!res.success) { showToast('Error', res.message, 'danger'); return; }
    AppState.cache.configAdmin = res.data;
    const c = res.data;
    document.getElementById('cfgNamaPortal').value = c.namaPortal || '';
    document.getElementById('cfgNamaLembaga').value = c.namaLembaga || '';
    document.getElementById('cfgWhatsapp').value = c.whatsappHelpdesk || '';
    document.getElementById('cfgEmail').value = c.emailDukungan || '';
    document.getElementById('cfgRegToken').value = c.regToken || '';
    document.getElementById('cfgFooter').value = c.footerCopyright || '';
    if (c.logoUrl) document.getElementById('previewLogo').src = c.logoUrl;
    if (c.landingImageUrl) document.getElementById('previewLanding').src = c.landingImageUrl;
    if (c.loginImageUrl) document.getElementById('previewLogin').src = c.loginImageUrl;
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getAllConfigAdmin(AppState.token);
}
function simpanPengaturanUmum() {
  const obj = { namaPortal: document.getElementById('cfgNamaPortal').value, namaLembaga: document.getElementById('cfgNamaLembaga').value,
    whatsappHelpdesk: document.getElementById('cfgWhatsapp').value, emailDukungan: document.getElementById('cfgEmail').value,
    regToken: document.getElementById('cfgRegToken').value, footerCopyright: document.getElementById('cfgFooter').value };
  google.script.run.withSuccessHandler(res => {
    if (res.success) { showToast('Tersimpan', res.message, 'success'); AppState.config = Object.assign(AppState.config, obj); applyBrandingConfig(); }
    else showToast('Gagal', res.message, 'danger');
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).simpanConfig(AppState.token, obj);
}
function uploadBrandingFile(configKey, inputEl) {
  const file = inputEl.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxW = configKey === 'logoUrl' ? 400 : 1600; const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale; canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      showToast('Mengunggah...', 'Sedang mengunggah gambar.', 'info');
      google.script.run.withSuccessHandler(res => {
        if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
        google.script.run.withSuccessHandler(r2 => {
          if (r2.success) { showToast('Berhasil', 'Gambar branding diperbarui.', 'success'); AppState.config[configKey] = res.data.fileUrl; applyBrandingConfig(); loadPengaturanAdmin(); }
        }).withFailureHandler(err => showToast('Error', err.message, 'danger')).simpanConfig(AppState.token, { [configKey]: res.data.fileUrl });
      }).withFailureHandler(err => showToast('Error', err.message, 'danger')).uploadGambar(AppState.token, base64, file.name, 'image/jpeg', 'branding');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function buatBackupSekarang() {
  showConfirm('Buat Backup', 'Sistem akan menyalin seluruh data saat ini ke berkas backup baru.', () => {
    closeModal();
    showToast('Memproses', 'Sedang membuat backup...', 'info');
    google.script.run.withSuccessHandler(res => { if (res.success) { showToast('Berhasil', res.message, 'success'); loadBackupLog(); } else showToast('Gagal', res.message, 'danger'); })
      .withFailureHandler(err => showToast('Error', err.message, 'danger')).backupData(AppState.token);
  }, 'Ya, Buat Backup', false);
}
function loadBackupLog() {
  google.script.run.withSuccessHandler(res => {
    const tbl = document.getElementById('tblBackupLog'); if (!tbl) return;
    if (!res.success) return;
    AppState.cache.backupLog = res.data;
    tbl.innerHTML = res.data.length ? res.data.map(b =>
      '<tr><td class="text-muted">' + fmtTgl(b.Waktu) + '</td><td><span class="pill ' + (b.Jenis === 'backup' ? 'pill-info' : 'pill-warning') + '">' + b.Jenis + '</span></td><td>' + escapeHtml(b.Keterangan) + '</td>' +
      '<td>' + (b.Jenis === 'backup' ? '<button class="btn btn-ghost btn-sm" onclick="restoreDariBackup(\'' + b.FileUrl + '\')">↺ Restore</button> <a href="' + b.FileUrl + '" target="_blank" class="btn btn-ghost btn-sm">🔗 Buka</a>' : '') + '</td></tr>'
    ).join('') : '<tr><td colspan="4" class="text-center text-muted">Belum ada backup.</td></tr>';
  }).withFailureHandler(() => {}).getBackupLog(AppState.token);
}
function restoreDariBackup(url) {
  showConfirm('Pulihkan Data dari Backup', 'TINDAKAN INI AKAN MENIMPA seluruh data saat ini dengan isi backup tersebut. Pastikan Anda yakin.', () => {
    closeModal();
    showToast('Memproses', 'Sedang memulihkan data...', 'info');
    google.script.run.withSuccessHandler(res => {
      if (res.success) { showToast('Berhasil', res.message, 'success'); location.reload ? refreshAllCaches() : null; }
      else showToast('Gagal', res.message, 'danger');
    }).withFailureHandler(err => showToast('Error', err.message, 'danger')).restoreData(AppState.token, url);
  }, 'Ya, Pulihkan Sekarang', true);
}
function refreshAllCaches() { AppState.cache = {}; goToPage('admin-beranda'); }
function loadRiwayatAdmin() {
  google.script.run.withSuccessHandler(res => {
    const tbl = document.getElementById('tblRiwayat'); if (!tbl || !res.success) return;
    tbl.innerHTML = res.data.length ? res.data.map(r => '<tr><td class="text-muted" style="white-space:nowrap;">' + fmtTgl(r.Waktu) + '</td><td>' + escapeHtml(r.Email) + '</td><td><span class="pill pill-neutral">' + r.Aksi + '</span></td><td class="text-muted">' + escapeHtml(r.Keterangan) + '</td></tr>').join('') : '<tr><td colspan="4" class="text-center text-muted">Belum ada aktivitas.</td></tr>';
  }).withFailureHandler(() => {}).getRiwayatAktivitas(AppState.token, 50);
}

/* ============================================================
   HALAMAN PENGGUNA — Beranda, Kisi-kisi, Latihan, Try Out
   ============================================================ */
PAGES['user-beranda'] = {
  render() {
    const nama = (AppState.user && AppState.user.nama) || 'Siswa';
    return '' +
      '<div class="card card-pad" style="background:var(--primary);color:#fff;border:none;">' +
        '<span class="pill" style="background:rgba(255,255,255,.18);color:#fff;">● Fokus Ujian 2027</span>' +
        '<h2 style="margin:10px 0 4px;font-size:19px;">Halo, ' + escapeHtml(nama.split(' ')[0]) + '! 👋</h2>' +
        '<p style="margin:0 0 16px;font-size:13px;color:rgba(255,255,255,.85);">' + escapeHtml(AppState.user.kelas || '') + ' · ' + escapeHtml(AppState.user.asalSekolah || '') + '</p>' +
        '<button class="btn btn-primary" onclick="goToPage(\'user-latihan\')">Lanjut Latihan Soal →</button>' +
      '</div>' +
      '<div class="grid grid-3 mb-3" style="margin-top:14px;" id="userKpiGrid">' + skeletonKpis(3) + '</div>' +
      '<div class="card card-pad">' +
        '<strong style="font-size:14px;">Hasil Belajar Terakhir</strong>' +
        '<div class="table-wrap" style="margin-top:10px;"><table class="data-table"><thead><tr><th>Paket</th><th>Mapel</th><th>Nilai</th><th>Tanggal</th></tr></thead><tbody id="tblHasilTerbaruUser"><tr><td colspan="4" class="text-center text-muted">Memuat...</td></tr></tbody></table></div>' +
      '</div>';
  },
  init() {
    if (AppState.dashboardAwal) { renderUserDashboard(AppState.dashboardAwal); AppState.dashboardAwal = null; return; }
    google.script.run.withSuccessHandler(res => { if (res.success) renderUserDashboard(res.data.dashboard); }).withFailureHandler(() => {}).bootstrapApp(AppState.token);
  }
};
function renderUserDashboard(d) {
  if (!d) return;
  const grid = document.getElementById('userKpiGrid');
  if (grid) grid.innerHTML =
    kpiCard('📦', 'var(--info-bg)', 'var(--info-text)', d.paketSelesai, 'Paket Selesai') +
    kpiCard('⭐', 'var(--success-bg)', 'var(--success-text)', d.rataNilai, 'Rata-rata Nilai') +
    kpiCard('🔥', 'var(--warning-bg)', 'var(--warning-text)', (d.hasilTerbaru||[]).length, 'Aktivitas Terbaru');
  const tbl = document.getElementById('tblHasilTerbaruUser');
  if (tbl) tbl.innerHTML = (d.hasilTerbaru||[]).length
    ? d.hasilTerbaru.map(h => '<tr><td>' + escapeHtml(h.paket) + '</td><td><span class="pill ' + mapelPill(h.mapel) + '">' + escapeHtml(h.mapel) + '</span></td><td class="mono" style="font-weight:700;">' + h.nilai + '</td><td class="text-muted">' + fmtTgl(h.waktu) + '</td></tr>').join('')
    : '<tr><td colspan="4" class="text-center text-muted">Belum ada pengerjaan.</td></tr>';
}

/* ── Kisi-kisi ── */
PAGES['user-kisikisi'] = {
  render() { return '<div class="grid" id="gridKisiKisiUser" style="grid-template-columns:1fr;gap:12px;"><div class="skeleton" style="height:90px;"></div></div>'; },
  init() {
    google.script.run.withSuccessHandler(res => {
      const grid = document.getElementById('gridKisiKisiUser'); if (!grid) return;
      if (!res.success) return;
      const terbit = res.data.filter(k => k.StatusPublikasi === 'terbit');
      grid.innerHTML = terbit.length ? terbit.map(k => '' +
        '<div class="card card-pad"><span class="pill ' + mapelPill(k.MataPelajaran) + '">' + escapeHtml(k.MataPelajaran) + '</span>' +
        '<h3 style="font-size:14.5px;margin:8px 0 4px;">' + escapeHtml(k.Materi) + '</h3>' +
        '<p class="text-muted" style="font-size:13px;margin:0 0 6px;"><strong>Kompetensi:</strong> ' + escapeHtml(k.Kompetensi) + '</p>' +
        '<p class="text-muted" style="font-size:13px;margin:0;"><strong>Indikator:</strong> ' + escapeHtml(k.Indikator) + '</p></div>'
      ).join('') : '<div class="empty-state">📋<br>Kisi-kisi belum diterbitkan.</div>';
    }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getKisiKisi(AppState.token);
  }
};

/* ── Daftar Paket: Latihan & Try Out ── */
function buildPaketListPage(jenis) {
  return { render() { return '<div class="grid grid-3" id="gridPaketUser-' + jenis + '"><div class="skeleton" style="height:150px;"></div><div class="skeleton" style="height:150px;"></div></div>'; },
    init() {
      google.script.run.withSuccessHandler(res => {
        const grid = document.getElementById('gridPaketUser-' + jenis); if (!grid) return;
        if (!res.success) { showToast('Error', res.message, 'danger'); return; }
        grid.innerHTML = res.data.length ? res.data.map(p => paketCardUser(p)).join('') : '<div class="empty-state" style="grid-column:1/-1;">📭<br>Belum ada ' + (jenis === 'latihan' ? 'latihan' : 'try out') + ' yang tersedia.</div>';
      }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getDaftarPaket(AppState.token, { jenis: jenis });
    }
  };
}
PAGES['user-latihan'] = buildPaketListPage('latihan');
PAGES['user-tryout'] = buildPaketListPage('tryout');

function paketCardUser(p) {
  return '<div class="card card-pad">' +
    '<span class="pill ' + mapelPill(p.MataPelajaran) + '">' + escapeHtml(p.MataPelajaran) + '</span>' +
    '<h3 style="font-size:14.5px;margin:8px 0 4px;">' + escapeHtml(p.Nama) + '</h3>' +
    '<p class="text-muted" style="font-size:12.5px;margin:0 0 10px;">' + escapeHtml(p.Deskripsi || '') + '</p>' +
    '<div class="flex items-center gap-2" style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;flex-wrap:wrap;">' +
      '<span>📄 ' + (p.JumlahSoal||0) + ' soal</span>' + (p.Jenis === 'tryout' ? '<span>⏱ ' + p.Durasi + ' menit</span>' : '<span>∞ tanpa batas waktu</span>') +
      (Number(p.JumlahPercobaan) > 0 ? '<span>🔁 maks ' + p.JumlahPercobaan + 'x</span>' : '') +
    '</div>' +
    '<button class="btn btn-primary btn-block" onclick="konfirmasiMulaiUjian(\'' + p.ID + '\',\'' + escapeHtml(p.Nama).replace(/'/g,'') + '\')">' + (p.Jenis === 'tryout' ? 'Mulai Simulasi →' : 'Mulai Latihan →') + '</button>' +
  '</div>';
}
function konfirmasiMulaiUjian(idPaket, nama) {
  showConfirm('Mulai "' + nama + '"', 'Pastikan koneksi internet stabil. Jawaban akan tersimpan otomatis selama pengerjaan.', () => { closeModal(); mulaiUjianSekarang(idPaket); }, 'Mulai Sekarang', false);
}

/* ============================================================
   MESIN UJIAN — Latihan & Try Out (US-07..10)
   Optimistic UI: jawaban tersimpan instan ke localStorage,
   disinkronkan ke server di latar belakang (Instant UX Prinsip 2).
   ============================================================ */
function mulaiUjianSekarang(idPaket) {
  showToast('Menyiapkan', 'Memuat soal ujian...', 'info');
  google.script.run.withSuccessHandler(res1 => {
    if (!res1.success) { showToast('Tidak Dapat Memulai', res1.message, 'danger'); return; }
    google.script.run.withSuccessHandler(res2 => {
      if (!res2.success) { showToast('Gagal', res2.message, 'danger'); return; }
      initExamState(res1.data, res2.data);
      goToPage('user-ujian');
    }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getSoalUntukPengerjaan(AppState.token, idPaket);
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).mulaiPengerjaan(AppState.token, idPaket);
}

function initExamState(startData, soalList) {
  const draftKey = 'cbt_examDraft_' + startData.idPengerjaan;
  let jawaban = {}, raguRagu = {};
  try { const d = JSON.parse(localStorage.getItem(draftKey) || '{}'); jawaban = d.jawaban || {}; raguRagu = d.raguRagu || {}; } catch (e) {}
  const isTryout = startData.paket.Jenis === 'tryout';
  const durasiDetik = (Number(startData.paket.Durasi) || 0) * 60;
  const elapsedSinceStart = Math.floor((Date.now() - startData.waktuMulaiMs) / 1000);

  if (AppState.exam && AppState.exam.timerInterval) clearInterval(AppState.exam.timerInterval);
  AppState.exam = {
    idPengerjaan: startData.idPengerjaan, idPaket: startData.paket.ID, paket: startData.paket, soal: soalList,
    currentIndex: 0, jawaban: jawaban, raguRagu: raguRagu, isTryout: isTryout,
    remainingSec: isTryout ? Math.max(0, durasiDetik - elapsedSinceStart) : null, draftKey: draftKey, dirty: {}, syncInterval: null
  };
  saveExamDraft();
  if (isTryout) startExamTimer();
  AppState.exam.syncInterval = setInterval(syncJawabanKeServer, 8000);
}

function saveExamDraft() {
  if (!AppState.exam) return;
  localStorage.setItem(AppState.exam.draftKey, JSON.stringify({ jawaban: AppState.exam.jawaban, raguRagu: AppState.exam.raguRagu }));
}

PAGES['user-ujian'] = {
  render() { return AppState.exam ? renderExamLayout() : '<div class="empty-state">Sesi ujian tidak ditemukan.</div>'; },
  init() {}
};

function renderExamLayout() {
  const ex = AppState.exam;
  return '' +
    '<div class="exam-header" style="margin:-18px -16px 16px;">' +
      '<strong style="font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(ex.paket.Nama) + '</strong>' +
      (ex.isTryout ? '<span class="exam-timer" id="examTimerDisplay">⏱ --:--</span>' : '<span class="pill pill-info">Tanpa Batas Waktu</span>') +
      '<button class="icon-btn" onclick="toggleExamNavDrawer()">☰</button>' +
    '</div>' +
    '<div class="grid" style="grid-template-columns:1fr 220px;gap:16px;align-items:start;">' +
      '<div><div id="examQuestionArea">' + buildSoalContent(ex.currentIndex) + '</div></div>' +
      '<div class="card card-pad" id="examNavPanel" style="position:sticky;top:76px;">' + buildExamNavPanel() + '</div>' +
    '</div>' +
    '<div class="modal-backdrop" id="examNavDrawerBackdrop" onclick="if(event.target===this)toggleExamNavDrawer(false)">' +
      '<div class="modal-box" style="max-width:320px;"><div class="modal-head"><h3>Daftar Nomor Soal</h3><button class="icon-btn" onclick="toggleExamNavDrawer(false)">✕</button></div>' +
      '<div class="modal-body" id="examNavPanelMobile">' + buildExamNavPanel() + '</div></div></div>';
}

function toggleExamNavDrawer(force) {
  const el = document.getElementById('examNavDrawerBackdrop');
  const show = force !== undefined ? force : !el.classList.contains('show');
  el.classList.toggle('show', show);
}

function buildExamNavPanel() {
  const ex = AppState.exam;
  const totalDijawab = Object.keys(ex.jawaban).filter(k => isJawabanTerisi(ex.jawaban[k])).length;
  const totalRagu = Object.keys(ex.raguRagu).filter(k => ex.raguRagu[k]).length;
  return '' +
    '<div class="flex gap-2 mb-2" style="font-size:11.5px;">' +
      '<span class="pill pill-success" style="flex:1;">' + totalDijawab + ' Dijawab</span>' +
      '<span class="pill pill-warning" style="flex:1;">' + totalRagu + ' Ragu</span>' +
    '</div>' +
    '<div class="exam-grid" id="examNavGrid">' + ex.soal.map((s, i) => buildNavCell(s, i)).join('') + '</div>' +
    '<button class="btn btn-danger btn-block" style="margin-top:14px;" onclick="konfirmasiSelesaiUjian()">✓ Selesai &amp; Kumpulkan</button>';
}
function buildNavCell(s, i) {
  const ex = AppState.exam;
  const terisi = isJawabanTerisi(ex.jawaban[s.Nomor_Urut]);
  const ragu = !!ex.raguRagu[s.Nomor_Urut];
  let cls = 'nomor-nav';
  if (terisi) cls += ' dijawab'; if (ragu) cls += ' ragu'; if (i === ex.currentIndex) cls += ' active';
  return '<div class="' + cls + '" onclick="pindahKeSoal(' + i + ')">' + s.Nomor_Urut + '</div>';
}
function isJawabanTerisi(v) {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.values(v).some(x => x !== '' && x !== undefined);
  return true;
}
function updateExamNavUI() {
  const grid1 = document.getElementById('examNavGrid'); if (grid1) grid1.innerHTML = AppState.exam.soal.map((s, i) => buildNavCell(s, i)).join('');
  const panelMobile = document.getElementById('examNavPanelMobile'); if (panelMobile) panelMobile.innerHTML = buildExamNavPanel();
  const panelDesktop = document.getElementById('examNavPanel'); if (panelDesktop) panelDesktop.innerHTML = buildExamNavPanel();
}

const PETUNJUK_JENIS = {
  PG: 'Pilih satu jawaban yang paling tepat.',
  PG_KOMPLEKS: 'Pilihlah lebih dari satu kotak jawaban yang menurutmu paling tepat. Klik kembali kotak untuk membatalkan pilihan.',
  BS: 'Tentukan Benar atau Salah untuk setiap pernyataan di bawah ini.',
  JODOH: 'Pasangkan setiap item di kolom kiri dengan jawaban yang sesuai di kolom kanan.',
  ISIAN: 'Isilah jawaban pada kolom yang tersedia.'
};

function buildSoalContent(idx) {
  const ex = AppState.exam;
  const s = ex.soal[idx];
  const isRagu = !!ex.raguRagu[s.Nomor_Urut];
  return '' +
    '<div class="flex items-center gap-2 mb-2" style="flex-wrap:wrap;">' +
      '<span class="pill pill-info">Soal ' + (idx + 1) + ' / ' + ex.soal.length + '</span>' +
      '<span class="pill ' + mapelPill(ex.paket.MataPelajaran) + '">' + escapeHtml(ex.paket.MataPelajaran) + '</span>' +
      '<span class="text-muted" style="font-size:12px;">🎯 ' + s.Skor + ' poin · ' + jenisLabel(s.Jenis_Soal) + '</span>' +
    '</div>' +
    '<div class="card card-pad" style="background:var(--bg-tint);border:none;margin-bottom:14px;"><span style="font-size:12.5px;">ℹ️ ' + PETUNJUK_JENIS[s.Jenis_Soal] + '</span></div>' +
    '<div class="card card-pad mb-2">' +
      '<p style="font-size:15px;line-height:1.6;margin:0 0 ' + (s.ID_Gambar_Pertanyaan ? '12px' : '16px') + ';">' + escapeHtml(s.Pertanyaan) + '</p>' +
      (s.ID_Gambar_Pertanyaan ? '<img src="' + gambarUrlFromId(s.ID_Gambar_Pertanyaan) + '" style="max-width:100%;border-radius:8px;margin-bottom:16px;display:block;">' : '') +
      buildJawabanArea(s, idx) +
    '</div>' +
    '<div class="flex justify-between gap-2" style="flex-wrap:wrap;">' +
      '<button class="btn btn-secondary' + (idx === 0 ? '' : '') + '" ' + (idx === 0 ? 'disabled' : '') + ' onclick="pindahKeSoal(' + (idx - 1) + ')">← Sebelumnya</button>' +
      '<button class="btn ' + (isRagu ? 'btn-warning' : 'btn-outline') + '" onclick="toggleRaguRagu()">🔖 ' + (isRagu ? 'Ditandai Ragu-ragu' : 'Tandai Ragu-ragu') + '</button>' +
      '<button class="btn btn-primary" ' + (idx === ex.soal.length - 1 ? 'onclick="konfirmasiSelesaiUjian()"' : 'onclick="pindahKeSoal(' + (idx + 1) + ')"') + '>' + (idx === ex.soal.length - 1 ? 'Selesai ✓' : 'Simpan & Lanjut →') + '</button>' +
    '</div>';
}

function buildJawabanArea(s, idx) {
  const ex = AppState.exam;
  const jwb = ex.jawaban[s.Nomor_Urut];
  if (s.Jenis_Soal === 'PG') {
    return (s.Pilihan.opsi || []).map((o, oi) => {
      const huruf = HURUF[oi]; const selected = jwb === huruf;
      return '<div class="option-card' + (selected ? ' selected' : '') + '" onclick="jawabPG(' + idx + ',\'' + huruf + '\')"><span class="option-letter">' + huruf + '</span><span>' + escapeHtml(o.teks) + '</span></div>';
    }).join('');
  }
  if (s.Jenis_Soal === 'PG_KOMPLEKS') {
    const arr = Array.isArray(jwb) ? jwb : [];
    return (s.Pilihan.opsi || []).map((o, oi) => {
      const huruf = HURUF[oi]; const selected = arr.includes(huruf);
      return '<div class="option-card' + (selected ? ' selected' : '') + '" onclick="jawabPGKompleks(' + idx + ',\'' + huruf + '\')"><span class="option-letter">' + (selected ? '✓' : huruf) + '</span><span>' + escapeHtml(o.teks) + '</span></div>';
    }).join('');
  }
  if (s.Jenis_Soal === 'BS') {
    const obj = jwb || {};
    return (s.Pilihan.pernyataan || []).map(p => '' +
      '<div class="flex items-center justify-between gap-2" style="padding:12px 0;border-bottom:1px solid var(--border-color);">' +
        '<span style="flex:1;font-size:14px;">' + escapeHtml(p.teks) + '</span>' +
        '<div class="flex gap-2">' +
          '<button class="btn btn-sm ' + (obj[p.id] === 'B' ? 'btn-primary' : 'btn-outline') + '" onclick="jawabBS(' + idx + ',\'' + p.id + '\',\'B\')">Benar</button>' +
          '<button class="btn btn-sm ' + (obj[p.id] === 'S' ? 'btn-primary' : 'btn-outline') + '" onclick="jawabBS(' + idx + ',\'' + p.id + '\',\'S\')">Salah</button>' +
        '</div></div>'
    ).join('');
  }
  if (s.Jenis_Soal === 'JODOH') {
    const obj = jwb || {};
    const kanan = s.Pilihan.kanan || [];
    return (s.Pilihan.kiri || []).map(k => '' +
      '<div class="flex items-center gap-2" style="padding:8px 0;">' +
        '<span style="flex:1;font-size:13.5px;">' + escapeHtml(k.teks) + '</span><span>→</span>' +
        '<select class="input" style="max-width:180px;" onchange="jawabJodoh(' + idx + ',\'' + k.id + '\',this.value)">' +
          '<option value="">— pilih —</option>' + kanan.map(kn => '<option value="' + kn.id + '" ' + (obj[k.id] === kn.id ? 'selected' : '') + '>' + escapeHtml(kn.teks) + '</option>').join('') +
        '</select></div>'
    ).join('');
  }
  if (s.Jenis_Soal === 'ISIAN') {
    return '<input class="input" style="max-width:300px;" inputmode="' + (s.Pilihan.tipe === 'angka' ? 'decimal' : 'text') + '" placeholder="Ketik jawabanmu..." value="' + escapeHtml(jwb || '') + '" oninput="jawabIsian(' + idx + ',this.value)">';
  }
  return '';
}

/* ── Handler jawaban: optimistic update + localStorage instan ── */
function setJawabanDanRender(nomorSoal, idSoal, value) {
  AppState.exam.jawaban[nomorSoal] = value;
  AppState.exam.dirty[nomorSoal] = { nomorSoal: nomorSoal, idSoal: idSoal, jawaban: value, raguRagu: !!AppState.exam.raguRagu[nomorSoal] };
  saveExamDraft();
  const area = document.getElementById('examQuestionArea');
  if (area) area.innerHTML = buildSoalContent(AppState.exam.currentIndex);
  updateExamNavUI();
}
function jawabPG(idx, huruf) { const s = AppState.exam.soal[idx]; setJawabanDanRender(s.Nomor_Urut, s.ID_Soal, huruf); }
function jawabPGKompleks(idx, huruf) {
  const s = AppState.exam.soal[idx]; const cur = Array.isArray(AppState.exam.jawaban[s.Nomor_Urut]) ? AppState.exam.jawaban[s.Nomor_Urut].slice() : [];
  const i = cur.indexOf(huruf); if (i > -1) cur.splice(i, 1); else cur.push(huruf);
  setJawabanDanRender(s.Nomor_Urut, s.ID_Soal, cur);
}
function jawabBS(idx, pernyataanId, val) {
  const s = AppState.exam.soal[idx]; const cur = Object.assign({}, AppState.exam.jawaban[s.Nomor_Urut] || {});
  cur[pernyataanId] = val; setJawabanDanRender(s.Nomor_Urut, s.ID_Soal, cur);
}
function jawabJodoh(idx, kiriId, kananId) {
  const s = AppState.exam.soal[idx]; const cur = Object.assign({}, AppState.exam.jawaban[s.Nomor_Urut] || {});
  cur[kiriId] = kananId; setJawabanDanRender(s.Nomor_Urut, s.ID_Soal, cur);
}
function jawabIsian(idx, value) {
  const s = AppState.exam.soal[idx];
  AppState.exam.jawaban[s.Nomor_Urut] = value;
  AppState.exam.dirty[s.Nomor_Urut] = { nomorSoal: s.Nomor_Urut, idSoal: s.ID_Soal, jawaban: value, raguRagu: !!AppState.exam.raguRagu[s.Nomor_Urut] };
  saveExamDraft();
  updateExamNavUI();
}

function toggleRaguRagu() {
  const s = AppState.exam.soal[AppState.exam.currentIndex];
  AppState.exam.raguRagu[s.Nomor_Urut] = !AppState.exam.raguRagu[s.Nomor_Urut];
  saveExamDraft();
  const area = document.getElementById('examQuestionArea');
  if (area) area.innerHTML = buildSoalContent(AppState.exam.currentIndex);
  updateExamNavUI();
}
function pindahKeSoal(idx) {
  if (idx < 0 || idx >= AppState.exam.soal.length) return;
  AppState.exam.currentIndex = idx;
  const area = document.getElementById('examQuestionArea');
  if (area) { area.innerHTML = buildSoalContent(idx); area.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  updateExamNavUI();
  toggleExamNavDrawer(false);
}

/* ── Sinkronisasi latar belakang (fire & forget) ── */
function syncJawabanKeServer() {
  if (!AppState.exam) return;
  const batch = Object.values(AppState.exam.dirty);
  if (!batch.length) return;
  AppState.exam.dirty = {};
  google.script.run.withSuccessHandler(() => {}).withFailureHandler(err => console.warn('Sinkronisasi gagal (akan dicoba lagi):', err)).simpanJawabanBatch(AppState.token, AppState.exam.idPengerjaan, batch);
}

/* ── Timer (hanya Try Out) ── */
function startExamTimer() {
  updateTimerDisplay();
  AppState.exam.timerInterval = setInterval(() => {
    if (!AppState.exam) return;
    AppState.exam.remainingSec--;
    if (AppState.exam.remainingSec <= 0) { AppState.exam.remainingSec = 0; updateTimerDisplay(); selesaikanUjianSekarang(true); return; }
    updateTimerDisplay();
  }, 1000);
}
function updateTimerDisplay() {
  const el = document.getElementById('examTimerDisplay'); if (!el || !AppState.exam) return;
  const s = AppState.exam.remainingSec;
  const mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
  el.textContent = '⏱ ' + mm + ':' + ss;
  el.classList.toggle('urgent', s < 300);
}

/* ── Selesai ujian ── */
function konfirmasiSelesaiUjian() {
  const ex = AppState.exam;
  const totalKosong = ex.soal.length - Object.keys(ex.jawaban).filter(k => isJawabanTerisi(ex.jawaban[k])).length;
  showConfirm('Selesaikan Ujian?', totalKosong > 0 ? 'Masih ada ' + totalKosong + ' soal yang belum dijawab. Yakin ingin menyelesaikan ujian sekarang?' : 'Seluruh soal telah dijawab. Kumpulkan ujian sekarang?',
    () => { closeModal(); selesaikanUjianSekarang(false); }, 'Ya, Kumpulkan Ujian', totalKosong > 0);
}
function selesaikanUjianSekarang(otomatis) {
  const ex = AppState.exam;
  if (ex.timerInterval) clearInterval(ex.timerInterval);
  if (ex.syncInterval) clearInterval(ex.syncInterval);
  if (otomatis) showToast('Waktu Habis', 'Ujian otomatis dikumpulkan.', 'warning');
  const jawabanFinal = Object.values(ex.dirty);
  showToast('Memproses', 'Sedang menilai jawabanmu...', 'info');
  google.script.run.withSuccessHandler(res => {
    if (!res.success) { showToast('Gagal', res.message, 'danger'); return; }
    localStorage.removeItem(ex.draftKey);
    tampilkanHasilUjian(res.data);
    AppState.exam = null;
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).selesaikanPengerjaan(AppState.token, ex.idPengerjaan, jawabanFinal);
}
function tampilkanHasilUjian(data) {
  const container = document.getElementById('pageContainer');
  document.getElementById('topbarTitle').textContent = 'Hasil Ujian';
  container.innerHTML = '<div class="fade-in text-center" style="max-width:420px;margin:20px auto;">' +
    '<div class="card card-pad">' +
      '<div style="font-size:42px;margin-bottom:6px;">' + (data.nilai >= 75 ? '🎉' : '💪') + '</div>' +
      '<h2 style="margin:0 0 6px;">Ujian Selesai!</h2>' +
      (data.tampilkanNilai ? '<div style="font-size:40px;font-weight:700;font-family:var(--font-mono);color:var(--primary);margin:10px 0;">' + data.nilai + '</div>' : '<p class="text-muted">Nilai akan ditampilkan setelah diizinkan Super Admin.</p>') +
      (data.tampilkanNilai ? '<div class="flex justify-center gap-2 mb-3"><span class="pill pill-success">' + data.jumlahBenar + ' Benar</span><span class="pill pill-danger">' + data.jumlahSalah + ' Salah</span></div>' : '') +
      '<div class="flex gap-2" style="justify-content:center;flex-wrap:wrap;">' +
        '<button class="btn btn-primary" onclick="goToPage(\'user-beranda\')">Kembali ke Beranda</button>' +
        (data.tampilkanPembahasan ? '<button class="btn btn-outline" onclick="lihatPembahasanUser(\'' + data.idPengerjaan + '\')">Lihat Pembahasan</button>' : '') +
      '</div>' +
    '</div></div>';
}

/* ============================================================
   HALAMAN PENGGUNA — Hasil Belajar & Profil (US-10, US-12, US-16)
   ============================================================ */
PAGES['user-hasil'] = {
  render() { return '<div class="table-wrap"><table class="data-table"><thead><tr><th>Paket</th><th>Mapel</th><th>Nilai</th><th>Benar/Salah</th><th>Tanggal</th><th></th></tr></thead><tbody id="tblHasilSaya"><tr><td colspan="6" class="text-center text-muted">Memuat...</td></tr></tbody></table></div>'; },
  init() {
    google.script.run.withSuccessHandler(res => {
      const tbl = document.getElementById('tblHasilSaya'); if (!tbl) return;
      if (!res.success) { showToast('Error', res.message, 'danger'); return; }
      tbl.innerHTML = res.data.length ? res.data.map(h =>
        '<tr><td>' + escapeHtml(h.NamaPaket) + '</td><td><span class="pill ' + mapelPill(h.MataPelajaran) + '">' + escapeHtml(h.MataPelajaran) + '</span></td>' +
        '<td class="mono" style="font-weight:700;">' + h.Nilai + '</td><td class="text-muted">' + h.JumlahBenar + ' / ' + h.JumlahSalah + '</td>' +
        '<td class="text-muted" style="white-space:nowrap;">' + fmtTgl(h.SelesaiPada) + '</td>' +
        '<td><button class="btn btn-ghost btn-sm" onclick="lihatPembahasanUser(\'' + h.ID_Pengerjaan + '\')">Lihat</button></td></tr>'
      ).join('') : '<tr><td colspan="6" class="text-center text-muted">Belum ada riwayat pengerjaan.</td></tr>';
    }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getHasilSaya(AppState.token);
  }
};
function lihatPembahasanUser(idPengerjaan) {
  openModal('Pembahasan Soal', '<div class="text-center" style="padding:24px;"><span class="spinner"></span></div>', '<button class="btn btn-outline" onclick="closeModal()">Tutup</button>', 'lg');
  google.script.run.withSuccessHandler(res => {
    if (!res.success) { document.getElementById('modalBody').innerHTML = '<p class="text-muted">' + escapeHtml(res.message) + '</p>'; return; }
    document.getElementById('modalBody').innerHTML = renderPembahasanUserHtml(res.data);
  }).withFailureHandler(err => showToast('Error', err.message, 'danger')).getDetailPengerjaan(AppState.token, idPengerjaan);
}
function renderPembahasanUserHtml(data) {
  if (data.terkunci) return '<div class="empty-state">🔒<br>' + escapeHtml(data.pesan) + '</div>';
  return (data.soal || []).map((s, i) => {
    const benar = s.SkorDiperoleh >= s.Skor - 0.001;
    return '<div class="card card-pad mb-2">' +
      '<div class="flex items-center gap-2 mb-1"><span class="pill pill-info">Soal ' + (i + 1) + '</span><span class="pill ' + (benar ? 'pill-success' : (s.SkorDiperoleh > 0 ? 'pill-warning' : 'pill-danger')) + '">Skor ' + (s.SkorDiperoleh || 0) + ' / ' + s.Skor + '</span></div>' +
      '<p style="font-size:13.5px;margin:4px 0 10px;">' + escapeHtml(s.Pertanyaan) + '</p>' +
      (s.Pembahasan ? '<div class="card card-pad" style="background:var(--bg-tint);border:none;"><strong style="font-size:12.5px;">💡 Pembahasan:</strong><p style="font-size:13px;margin:6px 0 0;">' + escapeHtml(s.Pembahasan) + '</p></div>' : '<span class="text-muted" style="font-size:12px;">Pembahasan belum tersedia untuk soal ini.</span>') +
    '</div>';
  }).join('') || '<p class="text-muted">Tidak ada data.</p>';
}

PAGES['user-profil'] = {
  render() {
    const u = AppState.user;
    return '' +
      '<div class="card card-pad mb-3"><div class="flex items-center gap-3"><div class="avatar" style="width:52px;height:52px;font-size:20px;">' + escapeHtml((u.nama||'?').charAt(0)) + '</div>' +
      '<div><strong style="font-size:15px;display:block;">' + escapeHtml(u.nama) + '</strong><span class="text-muted" style="font-size:13px;">' + escapeHtml(u.email) + '</span></div></div>' +
      '<hr class="divider">' +
      '<div class="grid grid-2" style="font-size:13.5px;">' +
        '<div><span class="text-muted">Asal Sekolah</span><div style="font-weight:600;">' + escapeHtml(u.asalSekolah || '-') + '</div></div>' +
        '<div><span class="text-muted">Kelas</span><div style="font-weight:600;">' + escapeHtml(u.kelas || '-') + '</div></div>' +
      '</div></div>' +
      '<div class="card card-pad mb-3"><div class="flex items-center justify-between"><strong style="font-size:14px;">🌙 Mode Tampilan Gelap</strong>' +
        '<label class="switch"><input type="checkbox" id="darkModeToggleProfil" onchange="syncDarkModeFromProfil()"><span class="slider"></span></label></div></div>' +
      '<div class="card card-pad"><strong style="font-size:14px;">Bantuan</strong>' +
        '<p class="text-muted" style="font-size:13px;margin:8px 0;">Hubungi pengawas/Super Admin sekolah jika mengalami kendala saat login atau pengerjaan ujian.</p>' +
        '<p style="font-size:13px;margin:0;">📧 ' + escapeHtml(AppState.config.emailDukungan || '-') + '<br>📱 ' + escapeHtml(AppState.config.whatsappHelpdesk || '-') + '</p></div>' +
      '<button class="btn btn-outline btn-block" style="margin-top:16px;" onclick="handleLogout()">⎋ Keluar dari Akun</button>';
  },
  init() { const t = document.getElementById('darkModeToggleProfil'); if (t) t.checked = document.documentElement.getAttribute('data-theme') === 'dark'; }
};
function syncDarkModeFromProfil() {
  const checked = document.getElementById('darkModeToggleProfil').checked;
  document.getElementById('darkModeToggle').checked = checked;
  toggleDarkMode();
}
