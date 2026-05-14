import { Router } from 'express';
import { obfuscationService } from '../services/obfuscationService.js';
import { extractProcBlock } from '../services/plsqlParser.js';
import { decryptLimiter } from '../middleware/rateLimit.js';

export const obfuscationRouter = Router();

const TOKEN_START = '##PLSQL_OBFUSCATION_TOKEN_START##';
const TOKEN_END   = '##PLSQL_OBFUSCATION_TOKEN_END##';

// 256KB body cap — embedded mapping ~50KB max
const MAX_BODY_BYTES = 256 * 1024;
function bodyCapCheck(req: any, res: any, next: any) {
  const body = req.body ?? {};
  const total = (body.code?.length ?? 0) + (body.encrypted?.length ?? 0);
  if (total > MAX_BODY_BYTES) {
    return res.status(413).json({ error: `İçerik çok büyük (max ${MAX_BODY_BYTES / 1024}KB).` });
  }
  next();
}

function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function buildEncryptResponse(code: string, key: string, pkg: string | null, proc: string | null) {
  const { obfuscated, mapping } = obfuscationService.obfuscateCode(code, key);

  const reverseMap: Record<string, string> = {};
  for (const [orig, obf] of mapping) reverseMap[obf] = orig;

  const encryptedMapping = obfuscationService.aesEncrypt(JSON.stringify(reverseMap), key);

  const finalCode = obfuscated +
    `\n\n-- ${TOKEN_START}\n` +
    `-- ${encryptedMapping}\n` +
    `-- ${TOKEN_END}`;

  const mappingTable = [...mapping.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([original, obf]) => ({ original, obf }));

  return {
    packageName: pkg,
    procedureName: proc,
    obfuscated: finalCode,
    encryptedMapping,
    identifierCount: mapping.size,
    obfuscatedAt: formatDate(new Date()),
    mappingTable,
    originalLength: code.length,
    obfuscatedLength: finalCode.length
  };
}

function extractEmbeddedToken(code: string): string | null {
  const startIdx = code.indexOf(TOKEN_START);
  const endIdx   = code.indexOf(TOKEN_END);
  if (startIdx < 0 || endIdx <= startIdx) return null;
  return code.substring(startIdx + TOKEN_START.length, endIdx)
    .split('\n').map(l => l.trim().replace(/^-+\s*/, '').trim()).filter(Boolean).join('');
}

function stripEmbeddedToken(code: string): string {
  const startIdx = code.indexOf(TOKEN_START);
  const endIdx   = code.indexOf(TOKEN_END);
  if (startIdx < 0 || endIdx <= startIdx) return code;
  let result = code.substring(0, startIdx).trimEnd();
  const afterEnd = endIdx + TOKEN_END.length;
  if (afterEnd < code.length) result += '\n' + code.substring(afterEnd);
  const lastNewline = result.lastIndexOf('\n-- ');
  if (lastNewline > 0) result = result.substring(0, lastNewline);
  return result.trimEnd();
}

// ── POST /encrypt-manual ───────────────────────────────────────────────────
// Kullanıcı kodu yapıştırır, obfuscate eder.
obfuscationRouter.post('/encrypt-manual', bodyCapCheck, (req, res) => {
  const { key, code } = req.body ?? {};
  if (!key)  return void res.status(400).json({ error: 'Anahtar boş olamaz.' });
  if (!code) return void res.status(400).json({ error: 'Kod boş olamaz.' });
  res.json(buildEncryptResponse(String(code), String(key), null, null));
});

// ── POST /encrypt-block ────────────────────────────────────────────────────
// Kaynak kod + paket/proc adı verilirse sadece o bloğu extract edip şifreler.
obfuscationRouter.post('/encrypt-block', bodyCapCheck, (req, res) => {
  const { key, code, procName } = req.body ?? {};
  if (!key)  return void res.status(400).json({ error: 'Anahtar boş olamaz.' });
  if (!code) return void res.status(400).json({ error: 'Kod boş olamaz.' });

  const block = procName
    ? extractProcBlock(String(code), String(procName).toUpperCase())
    : String(code);

  if (!block) return void res.status(404).json({ error: `'${procName}' bloğu bulunamadı.` });
  res.json(buildEncryptResponse(block, String(key), null, procName ?? null));
});

// ── POST /decrypt ──────────────────────────────────────────────────────────
// Obfuscated kodu + anahtarı alır, orijinale döndürür.
// Rate limit: 5/dk/IP (brute-force savunması)
obfuscationRouter.post('/decrypt', decryptLimiter, bodyCapCheck, (req, res) => {
  const { key, encrypted, encryptedMapping } = req.body ?? {};
  if (!key)       return void res.json({ decrypted: null, success: false, error: '⚠️ Decryption failed.' });
  if (!encrypted) return void res.json({ decrypted: null, success: false, error: '⚠️ Decryption failed.' });

  const FAIL = '⚠️ Decryption failed.';
  try {
    const embeddedToken = extractEmbeddedToken(String(encrypted));
    const encMap = embeddedToken || encryptedMapping;
    if (!encMap) return void res.json({ decrypted: null, success: false, error: FAIL });

    let mappingJson: string;
    try { mappingJson = obfuscationService.aesDecrypt(String(encMap), String(key)); }
    catch { return void res.json({ decrypted: null, success: false, error: FAIL }); }

    const reverseMap = JSON.parse(mappingJson) as Record<string, string>;
    if (!Object.keys(reverseMap).length) return void res.json({ decrypted: null, success: false, error: FAIL });

    const result = obfuscationService.deobfuscateCode(stripEmbeddedToken(String(encrypted)), reverseMap);
    res.json({ decrypted: result, success: true, identifierCount: Object.keys(reverseMap).length });
  } catch {
    res.json({ decrypted: null, success: false, error: FAIL });
  }
});
