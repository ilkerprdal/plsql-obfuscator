// PL/SQL source parsing utilities — shared between obfuscation and call-tree features.

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts the source block for a named procedure or function from a PACKAGE BODY
 * source string. Returns empty string if not found.
 *
 * Handles: string/comment masking, BEGIN/END depth tracking, compound END LOOP/IF/CASE.
 */
export function extractProcBlock(source: string, procName: string): string {
  const masked = source
    .replace(/'([^'\\]|\\.)*'/g, (m) => ' '.repeat(m.length))
    .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));

  const upper = masked.toUpperCase();

  const procRe = new RegExp(`\\b(?:PROCEDURE|FUNCTION)\\s+${escapeRegex(procName)}\\b`, 'g');
  const match = procRe.exec(upper);
  if (!match) return '';
  const startIdx = match.index;

  const tokenRe = /\b(BEGIN|END|IS|AS|DECLARE)\b/g;
  tokenRe.lastIndex = startIdx;

  let depth = 0;
  let started = false;
  let endIdx = source.length;
  let m: RegExpExecArray | null;

  while ((m = tokenRe.exec(upper)) !== null) {
    const tok = m[0];

    if (tok === 'BEGIN' || tok === 'IS' || tok === 'AS' || tok === 'DECLARE') {
      depth++;
      started = true;
      continue;
    }

    if (tok === 'END') {
      const tail = upper.slice(m.index + 3);
      if (/^\s*(LOOP|IF|CASE|FOR|WHILE)\b/.test(tail)) continue;

      if (started && depth > 0) {
        depth--;
        if (depth === 0) {
          const semi = source.indexOf(';', m.index);
          endIdx = semi >= 0 ? semi + 1 : m.index + 3;
          break;
        }
      }
    }
  }

  return source.substring(startIdx, endIdx);
}

// Oracle system packages and prefixes to exclude from call detection.
const SYSTEM_PKGS = new Set([
  'SYS', 'SYSTEM', 'STANDARD', 'DUAL', 'PUBLIC',
  'DBMS_OUTPUT', 'DBMS_SQL', 'DBMS_UTILITY', 'DBMS_LOB', 'DBMS_CRYPTO',
  'DBMS_SCHEDULER', 'DBMS_LOCK', 'DBMS_PIPE', 'DBMS_ALERT', 'DBMS_TRANSACTION',
  'DBMS_METADATA', 'DBMS_STATS', 'DBMS_RANDOM', 'DBMS_SESSION',
  'DBMS_APPLICATION_INFO', 'DBMS_XMLGEN', 'DBMS_XMLDOM',
  'UTL_FILE', 'UTL_HTTP', 'UTL_SMTP', 'UTL_TCP', 'UTL_URL',
  'UTL_I18N', 'UTL_RAW', 'UTL_ENCODE', 'UTL_COMPRESS',
  'HTP', 'OWA', 'OWA_UTIL', 'XMLDOM', 'XMLPARSER',
]);

const SYSTEM_PREFIXES = [
  'DBMS_', 'UTL_', 'APEX_', 'SDO_', 'CTX_', 'OWA_',
  'DBA_', 'ALL_', 'USER_', 'V$', 'GV$',
];

export interface PlsqlCallee {
  pkg: string;
  proc: string;
}

/**
 * Scans a PL/SQL procedure body and returns unique cross-package calls of the
 * form PKG.PROC( (or SCHEMA.PKG.PROC( — in which case the last two parts are used).
 * Strings, comments, and Oracle system packages are excluded.
 */
export function findPlsqlCallees(body: string): PlsqlCallee[] {
  const masked = body
    .replace(/'(?:[^']|'')*'/g, m => ' '.repeat(m.length))
    .replace(/--[^\n]*/g, m => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));

  const upper = masked.toUpperCase();
  const results: PlsqlCallee[] = [];
  const seen = new Set<string>();

  // Match A.B( or A.B.C( — for 3-part qualified names use the last two segments.
  const re = /\b([A-Z][A-Z0-9_$#]{0,127})\s*\.\s*([A-Z][A-Z0-9_$#]{0,127})(?:\s*\.\s*([A-Z][A-Z0-9_$#]{0,127}))?\s*\(/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(upper)) !== null) {
    let pkg: string;
    let proc: string;

    if (m[3]) {
      // SCHEMA.PKG.PROC( → use PKG.PROC
      pkg = m[2];
      proc = m[3];
    } else {
      pkg = m[1];
      proc = m[2];
    }

    if (SYSTEM_PKGS.has(pkg)) continue;
    if (SYSTEM_PREFIXES.some(p => pkg.startsWith(p))) continue;

    const key = `${pkg}.${proc}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ pkg, proc });
    }
  }

  return results;
}
