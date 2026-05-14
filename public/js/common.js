// common.js — Standalone PL/SQL Obfuscator

const API = '/api';

const AppState = {
  lastEncryptedMapping: null,
  theme: localStorage.getItem('theme') || 'dark',
};

// ── Tema ──────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  AppState.theme = theme;
  localStorage.setItem('theme', theme);
}
document.addEventListener('DOMContentLoaded', () => applyTheme(AppState.theme));

// ── Utilities ──────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

function toggleKeyVis(inputId, btnId) {
  const inp = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (btn) btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

async function apiFetch(url, opts = {}) {
  return fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) } });
}

// ── i18n — Türkçe sabit (tek dil) ─────────────────────────────────────────
const STRINGS = {
  'enc.title':           '🔒 PL/SQL Kodu Obfuscate Et',
  'enc.codeLabel':       'PL/SQL Kodu',
  'enc.procNameLabel':   'Procedure / Fonksiyon Adı (opsiyonel)',
  'enc.procNameHint':    'Belirtilirse sadece o blok şifrelenir',
  'enc.keyLabel':        'Şifreleme Anahtarı',
  'enc.keyPlaceholder':  'Gizli anahtar...',
  'enc.randomKey':       'Güçlü rastgele anahtar üret',
  'enc.doEncrypt':       '🔒 Şifrele',
  'enc.done':            '✅ Tamamlandı',
  'enc.outLabel':        'Obfuscated kod:',
  'enc.mapHeader':       '🗺️ Gizlenen tanımlayıcılar',
  'enc.mapFilterPlaceholder': 'Mapping ara...',
  'enc.forgetMapping':   'Mapping\'i RAM\'den temizle',
  'enc.tokenLabel':      '🔑 Şifreli Mapping Token',
  'enc.tokenHint':       '— ayrı paylaşmak istersen',
  'enc.aiPrompt':        '🤖 AI Test Prompt\'u',
  'enc.copyPrompt':           '📋 Prompt\'u Kopyala',
  'enc.promptCopiedGeneric':  '✅ Kopyalandı',
  'enc.promptBadgeAnalysis':  '📝 Kodu analiz et / hata bul / iyileştir',
  'enc.promptBadgeUnitTest':  '🧪 utPLSQL unit test üret (İngilizce prompt — AI için daha etkili)',
  'enc.err':             '🚨 Hata',
  'enc.keyEmpty':        'Anahtar boş olamaz.',
  'enc.keyTooShort':     'Anahtar en az 8 karakter olmalı.',
  'enc.codeEmpty':       'Kod boş olamaz.',
  'enc.obfFailed':       'Obfuscation başarısız.',
  'enc.keyWeak':         'Zayıf',
  'enc.keyMedium':       'Orta',
  'enc.keyStrong':       'Güçlü',
  'enc.decTitle':        '🔓 Obfuscated Kodu Geri Çevir',
  'enc.decInputLabel':   'Obfuscated / Test Kodu',
  'enc.decInputPlaceholder': 'AI\'dan dönen kodu yapıştırın...',
  'enc.decMapLabel':     'Şifreli mapping (kod içinde yoksa)',
  'enc.decMapHint':      '— başka birinden aldıysan',
  'enc.decMapPlaceholder': 'Base64 mapping...',
  'enc.decKeyLabel':     '🔑 Anahtar',
  'enc.decKeyPlaceholder': 'Obfuscate ederken kullandığın anahtar...',
  'enc.doDecrypt':       '🔓 Anahtar ile Geri Çevir',
  'enc.decDone':         '✅ Çözüldü',
  'enc.securityNote':    '🔒 Güvenlik: Şifreli mapping bu browser session\'ında tutulur — AI\'ya gönderilmez.',
  'enc.decTextEmpty':    'Obfuscated metin boş olamaz.',
  'enc.decKeyRequired':  'Anahtar gerekli.',
  'enc.decMissingMap':   'Mapping bulunamadı. Token\'ı koda göm veya ayrı yapıştır.',
  'enc.decFailed':       'Decryption başarısız.',
  'enc.functionWord':    'Fonksiyon',
  'enc.procedureWord':   'Prosedür',
  'enc.promptTemplate':         (v) => `Aşağıdaki Oracle PL/SQL ${v.type} kodunu incele ve hata/iyileştirme öner. Tanımlayıcılar obfuscate edilmiştir — içerikten çıkarım yapma, sadece mantığa bak:\n\n${v.code}`,
  'enc.unitTestPromptTemplate': (v) => `Write Oracle PL/SQL unit tests for the ${v.type} below using the utPLSQL (ut3) framework.

Context:
- All identifiers (variable names, parameter names, local types) have been obfuscated for confidentiality.
  Do NOT infer business logic from the names — focus purely on the visible code structure.
- The test package will be run against the real (unobfuscated) schema, so use the obfuscated names as-is.

Requirements:
- Annotate the test package with --%suite(<suite_name>) and each test procedure with --%test(<description>)
- Use ut3 assertions: ut.expect().to_equal(), ut.expect().to_be_null(), ut.expect().to_be_true(), ut.expect().to_throw() etc.
- Cover: happy path, NULL / boundary inputs, and expected exception paths (WHEN OTHERS / named exceptions)
- Each test procedure must be independent — no shared mutable state
- Add a one-line comment above each test explaining what it verifies
- If the procedure has OUT / NOCOPY parameters, declare and pass local variables
- If DML (INSERT/UPDATE/DELETE) is involved, wrap in a transaction and rollback in teardown (--%aftertest)

Obfuscated source:

${v.code}`,
  'enc.identCount':      (v) => `${v.n} tanımlayıcı`,
  'enc.meta':            (v) => `${v.count} tanımlayıcı · ${v.orig}→${v.obf} karakter · ${v.date}`,
  'common.copy':         '📋 Kopyala',
  'common.copied':       '✅ Kopyalandı',
  'common.error':        'Hata',
  'error.network':       'Ağ hatası',
};

function t(key, vars) {
  const val = STRINGS[key];
  if (!val) return key;
  if (typeof val === 'function') return val(vars ?? {});
  return val;
}

// data-i18n attribute'larını uygula
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val && val !== key) el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = t(key);
    if (val && val !== key) el.placeholder = val;
  });
});
