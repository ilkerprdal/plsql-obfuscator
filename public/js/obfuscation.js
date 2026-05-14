// obfuscation.js — Standalone PL/SQL Obfuscator

// ── Prompt tipi toggle ────────────────────────────────────────────────────
let _currentPromptType = 'analysis'; // 'analysis' | 'unittest'

function setPromptType(type) {
  _currentPromptType = type;
  const tabA = document.getElementById('prompt-tab-analysis');
  const tabU = document.getElementById('prompt-tab-unittest');
  const badge = document.getElementById('prompt-type-badge');
  if (tabA) { tabA.style.background = type === 'analysis' ? 'rgba(155,89,182,.7)' : 'transparent'; tabA.style.color = type === 'analysis' ? '#fff' : '#c39bd3'; }
  if (tabU) { tabU.style.background = type === 'unittest' ? 'rgba(155,89,182,.7)' : 'transparent'; tabU.style.color = type === 'unittest' ? '#fff' : '#c39bd3'; }
  if (badge) badge.textContent = t(type === 'analysis' ? 'enc.promptBadgeAnalysis' : 'enc.promptBadgeUnitTest');
  // Prompt textarea'yı güncelle
  const promptEl = document.getElementById('enc-prompt');
  if (promptEl && AppState._lastAnalysisPrompt !== undefined) {
    promptEl.value = type === 'analysis' ? AppState._lastAnalysisPrompt : AppState._lastUnitTestPrompt;
  }
}

// ── Şifrele ───────────────────────────────────────────────────────────────
async function encryptProc() {
  const key      = document.getElementById('enc-key').value;
  const code     = document.getElementById('enc-manual-code').value.trim();
  const procName = (document.getElementById('enc-proc-name')?.value ?? '').trim();
  hide('enc-result'); hide('enc-error');

  if (!key)          { showEncError(t('enc.keyEmpty')); return; }
  if (key.length < 8){ showEncError(t('enc.keyTooShort')); return; }
  if (!code)         { showEncError(t('enc.codeEmpty')); return; }

  try {
    const endpoint = procName ? '/encrypt-block' : '/encrypt-manual';
    const payload  = { code, key, ...(procName ? { procName } : {}) };
    const r = await apiFetch(`${API}${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    if (!r.ok || d.error) { showEncError(d.error || t('enc.obfFailed')); return; }
    renderEncResult(d);
  } catch (e) { showEncError(t('error.network') + ': ' + e.message); }
}

function renderEncResult(d) {
  const obfWithToken = d.obfuscated || '';
  const startMarker  = '##PLSQL_OBFUSCATION_TOKEN_START##';
  const endMarker    = '##PLSQL_OBFUSCATION_TOKEN_END##';
  const startIdx = obfWithToken.indexOf(startMarker);
  const endIdx   = obfWithToken.indexOf(endMarker);

  let cleanCode = obfWithToken;
  if (startIdx > 0 && endIdx > startIdx) {
    const tokenStart = obfWithToken.lastIndexOf('\n', startIdx);
    if (tokenStart > 0) {
      cleanCode = obfWithToken.substring(0, tokenStart).trimEnd()
                + obfWithToken.substring(endIdx + endMarker.length);
    }
  }

  document.getElementById('enc-output').value = cleanCode.trim();
  document.getElementById('enc-meta').textContent = t('enc.meta', {
    count: d.identifierCount,
    orig:  d.originalLength,
    obf:   cleanCode.length,
    date:  d.obfuscatedAt || ''
  });

  const mapEl    = document.getElementById('enc-mapping-table');
  const mapCount = document.getElementById('enc-mapping-count');
  if (mapEl && d.mappingTable) {
    const arr = Array.isArray(d.mappingTable) ? d.mappingTable : Object.values(d.mappingTable);
    if (mapCount) mapCount.textContent = t('enc.identCount', { n: arr.length });
    mapEl.innerHTML = arr.map(m =>
      `<div class="map-row" data-original="${escapeHtml(m.original)}" data-obf="${escapeHtml(m.obf)}"
            style="display:flex;gap:12px;margin-bottom:3px;padding:3px 0;border-bottom:1px solid var(--border)">
        <span style="color:var(--red);min-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(m.original)}</span>
        <span style="color:var(--muted)">→</span>
        <span style="color:var(--green)">${escapeHtml(m.obf)}</span>
      </div>`
    ).join('');
  }
  const filterEl = document.getElementById('enc-map-filter');
  if (filterEl) filterEl.value = '';

  AppState.lastEncryptedMapping = d.encryptedMapping || null;

  const tokenEl = document.getElementById('enc-token');
  if (tokenEl) tokenEl.value = d.encryptedMapping || '';

  const procType = cleanCode.trim().toUpperCase().includes('FUNCTION') ? t('enc.functionWord') : t('enc.procedureWord');
  const analysisPrompt  = t('enc.promptTemplate',         { type: procType, code: cleanCode.trim() });
  const unitTestPrompt  = t('enc.unitTestPromptTemplate', { type: procType, code: cleanCode.trim() });

  AppState._lastAnalysisPrompt  = analysisPrompt;
  AppState._lastUnitTestPrompt  = unitTestPrompt;

  // Aktif sekmeye göre göster, badge'i güncelle
  document.getElementById('enc-prompt').value = _currentPromptType === 'unittest' ? unitTestPrompt : analysisPrompt;
  setPromptType(_currentPromptType);   // badge + tab renkleri sync

  show('enc-result');
}

function copyEncToken() {
  const btn     = document.getElementById('enc-token-btn');
  const tokenEl = document.getElementById('enc-token');
  if (!tokenEl?.value) return;
  navigator.clipboard.writeText(tokenEl.value).then(() => {
    if (btn) { btn.textContent = t('common.copied'); setTimeout(() => btn.textContent = t('common.copy'), 2000); }
  });
}

function filterMapping() {
  const inp = document.getElementById('enc-map-filter');
  if (!inp) return;
  const q = inp.value.toLowerCase();
  document.querySelectorAll('#enc-mapping-table .map-row').forEach(row => {
    const orig = (row.getAttribute('data-original') || '').toLowerCase();
    const obf  = (row.getAttribute('data-obf') || '').toLowerCase();
    row.style.display = (!q || orig.includes(q) || obf.includes(q)) ? '' : 'none';
  });
}

function forgetMapping() {
  AppState.lastEncryptedMapping  = null;
  AppState._lastAnalysisPrompt   = undefined;
  AppState._lastUnitTestPrompt   = undefined;
  hide('enc-result');
  ['enc-output','enc-prompt'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['enc-mapping-table'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  ['enc-map-filter','enc-mapping-count'].forEach(id => { const el = document.getElementById(id); if (el) el.value = el.textContent = ''; });
}

// ── Anahtar gücü ─────────────────────────────────────────────────────────
function scoreKey(s) {
  if (!s) return { score: 0, label: '', color: 'var(--muted)' };
  let score = 0;
  if (s.length >= 8)  score++;
  if (s.length >= 12) score++;
  if (s.length >= 16) score++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) score++;
  if (/\d/.test(s)) score++;
  if (/[^a-zA-Z0-9]/.test(s)) score++;
  if (score <= 2) return { score, label: t('enc.keyWeak'),   color: 'var(--red)' };
  if (score <= 4) return { score, label: t('enc.keyMedium'), color: 'var(--yellow)' };
  return            { score, label: t('enc.keyStrong'), color: 'var(--green)' };
}

(function bindEncKeyStrength() {
  const apply = () => {
    const inp = document.getElementById('enc-key');
    if (!inp || inp.dataset.strengthBound) return;
    inp.dataset.strengthBound = '1';
    inp.addEventListener('input', () => {
      const wrap = document.getElementById('enc-key-strength');
      if (!wrap) return;
      if (!inp.value) { wrap.style.display = 'none'; return; }
      wrap.style.display = 'block';
      const r   = scoreKey(inp.value);
      const bar = document.getElementById('enc-key-bar');
      const lbl = document.getElementById('enc-key-label');
      if (bar) { bar.style.width = `${(r.score / 6) * 100}%`; bar.style.background = r.color; }
      if (lbl) { lbl.textContent = r.label; lbl.style.color = r.color; }
    });
  };
  apply();
  document.addEventListener('DOMContentLoaded', apply);
})();

function generateRandomKey() {
  const chars   = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const special = '!@#$%^&*';
  let s = '';
  const bytes = new Uint8Array(28);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 24; i++) s += chars[bytes[i] % chars.length];
  for (let i = 24; i < 28; i++) s += special[bytes[i] % special.length];
  const inp = document.getElementById('enc-key');
  if (!inp) return;
  inp.value = s;
  inp.dispatchEvent(new Event('input'));
}

// ── Çöz ───────────────────────────────────────────────────────────────────
async function decryptCode() {
  const obfText         = document.getElementById('dec-input').value.trim();
  const key             = document.getElementById('dec-key').value;
  const externalMapping = document.getElementById('dec-mapping')?.value.trim() ?? '';
  hide('dec-result'); hide('dec-error');

  if (!obfText) { showDecError(t('enc.decTextEmpty')); return; }
  if (!key)     { showDecError(t('enc.decKeyRequired')); return; }

  const TOKEN_START = '##PLSQL_OBFUSCATION_TOKEN_START##';
  const hasEmbedded = obfText.includes(TOKEN_START);
  if (!hasEmbedded && !AppState.lastEncryptedMapping && !externalMapping) {
    showDecError(t('enc.decMissingMap'));
    return;
  }

  try {
    const r = await apiFetch(`${API}/decrypt`, {
      method: 'POST',
      body: JSON.stringify({
        encrypted: obfText,
        key,
        encryptedMapping: AppState.lastEncryptedMapping || externalMapping || null
      })
    });
    const d = await r.json();
    if (!d.success) { showDecError(d.error || t('enc.decFailed')); return; }
    document.getElementById('dec-output').textContent = d.decrypted;
    show('dec-result');
  } catch (e) { showDecError(t('error.network') + ': ' + e.message); }
}

// ── Yardımcılar ───────────────────────────────────────────────────────────
function showEncError(msg) { document.getElementById('enc-error-msg').textContent = msg; show('enc-error'); }
function showDecError(msg) { document.getElementById('dec-error-msg').textContent = msg; show('dec-error'); }

function copyEnc() {
  const btn = document.getElementById('enc-copy-btn');
  navigator.clipboard.writeText(document.getElementById('enc-output').value).then(() => {
    btn.textContent = t('common.copied');
    setTimeout(() => btn.textContent = t('common.copy'), 2000);
  });
}
function copyDec() {
  const btn = document.getElementById('dec-copy-btn');
  navigator.clipboard.writeText(document.getElementById('dec-output').textContent).then(() => {
    btn.textContent = t('common.copied');
    setTimeout(() => btn.textContent = t('common.copy'), 2000);
  });
}
function copyPrompt() {
  const btn = document.getElementById('enc-prompt-btn');
  const text = document.getElementById('enc-prompt').value;
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = t('enc.promptCopiedGeneric');
    setTimeout(() => btn.textContent = t('enc.copyPrompt'), 3000);
  });
}
