import { createHmac, randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';

const SQL_KEYWORDS = new Set([
  'SELECT','FROM','WHERE','AND','OR','NOT','NULL','IS','IN','BETWEEN','LIKE','ESCAPE',
  'INSERT','INTO','VALUES','UPDATE','SET','DELETE','MERGE','USING','WHEN','MATCHED',
  'CREATE','REPLACE','DROP','ALTER','TABLE','VIEW','INDEX','SEQUENCE','PROCEDURE','FUNCTION',
  'PACKAGE','BODY','TRIGGER','BEGIN','END','IF','THEN','ELSE','ELSIF','CASE','LOOP','FOR',
  'WHILE','EXIT','RETURN','DECLARE','EXCEPTION','RAISE','PRAGMA','AUTONOMOUS_TRANSACTION',
  'COMMIT','ROLLBACK','SAVEPOINT','CURSOR','OPEN','CLOSE','FETCH','BULK','COLLECT','LIMIT',
  'TYPE','RECORD','VARRAY','OF','BY','CONSTANT','DEFAULT','EXISTS',
  'INTEGER','NUMBER','VARCHAR2','CHAR','DATE','TIMESTAMP','CLOB','BLOB','BOOLEAN',
  'TRUE','FALSE','DUAL','SYSDATE','SYSTIMESTAMP','USER','NVL','COALESCE','DECODE',
  'TO_CHAR','TO_DATE','TO_NUMBER','TRUNC','ROUND','MOD','ABS','SIGN','CEIL','FLOOR',
  'SUBSTR','INSTR','LENGTH','UPPER','LOWER','TRIM','LTRIM','RTRIM','REPLACE','REGEXP_REPLACE',
  'REGEXP_SUBSTR','REGEXP_LIKE','COUNT','SUM','AVG','MIN','MAX','GROUP','ORDER','HAVING',
  'UNION','INTERSECT','MINUS','ALL','ANY','SOME','DISTINCT','UNIQUE','AS','ON','JOIN',
  'INNER','LEFT','RIGHT','FULL','OUTER','CROSS','NATURAL','PARTITION','OVER','ROW_NUMBER',
  'RANK','DENSE_RANK','LAG','LEAD','CONNECT','PRIOR','START','WITH','RECURSIVE',
  'OUT','NOCOPY','RETURNS','LANGUAGE','EXECUTE','IMMEDIATE',
  'NO_DATA_FOUND','TOO_MANY_ROWS','OTHERS','SQLCODE','SQLERRM','DBMS_OUTPUT','PUT_LINE',
  'FORALL','XMLAGG','XMLELEMENT','LISTAGG'
]);

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateObfuscatedName(identifier: string, key: string): string {
  const hmac = createHmac('sha256', key).update(identifier).digest();
  const hex = hmac.subarray(0, 8).toString('hex');
  const lower = identifier.toLowerCase();
  const prefix = lower.startsWith('v_') ? 'v_'
              : lower.startsWith('p_') ? 'p_'
              : lower.startsWith('g_') ? 'g_'
              : lower.startsWith('l_') ? 'l_'
              : 'x_';
  return prefix + hex;
}

function protectStringsAndComments(code: string, placeholders: Map<string, string>): string {
  let counter = 0;
  code = code.replace(/'([^'\\]|\\.)*'/g, (m) => {
    const ph = `__PLACEHOLDER_${counter++}__`;
    placeholders.set(ph, m);
    return ph;
  });
  code = code.replace(/--[^\n]*/g, (m) => {
    const ph = `__PLACEHOLDER_${counter++}__`;
    placeholders.set(ph, m);
    return ph;
  });
  code = code.replace(/\/\*[\s\S]*?\*\//g, (m) => {
    const ph = `__PLACEHOLDER_${counter++}__`;
    placeholders.set(ph, m);
    return ph;
  });
  return code;
}

export const obfuscationService = {
  obfuscateCode(code: string, key: string): { obfuscated: string; mapping: Map<string, string> } {
    const mapping = new Map<string, string>();
    const placeholders = new Map<string, string>();
    let protectedCode = protectStringsAndComments(code, placeholders);

    protectedCode = protectedCode.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, (identifier) => {
      const upper = identifier.toUpperCase();
      if (SQL_KEYWORDS.has(upper)) return identifier;
      if (placeholders.has(identifier)) return identifier;
      if (/^\d+$/.test(identifier)) return identifier;

      let obfuscated = mapping.get(identifier);
      if (!obfuscated) {
        obfuscated = generateObfuscatedName(identifier, key);
        mapping.set(identifier, obfuscated);
      }
      return obfuscated;
    });

    for (const [ph, original] of placeholders) {
      protectedCode = protectedCode.split(ph).join(original);
    }

    return { obfuscated: protectedCode, mapping };
  },

  deobfuscateCode(obfuscatedCode: string, reverseMap: Record<string, string>): string {
    const sortedKeys = Object.keys(reverseMap).sort((a, b) => b.length - a.length);
    let result = obfuscatedCode;
    for (const obfToken of sortedKeys) {
      const pattern = new RegExp(`\\b${escapeRegex(obfToken)}\\b`, 'g');
      result = result.replace(pattern, reverseMap[obfToken]);
    }
    return result;
  },

  aesEncrypt(plaintext: string, key: string): string {
    const salt = randomBytes(16);
    const iv = randomBytes(16);
    // PBKDF2 iter: 600000 — OWASP 2023 önerisi PBKDF2-HMAC-SHA256 için.
    // (Eski 10000 değeri 2013 standardı, security-review C-003 ile yükseltildi.)
    // pbkdf2Sync ~100-200ms blocking — tek-kullanıcı senaryosunda kabul edilebilir.
    // Eş zamanlı 5+ istekte event loop blokajı için worker_thread Sprint 2'de.
    const derivedKey = pbkdf2Sync(key, salt, 600000, 32, 'sha256');
    const cipher = createCipheriv('aes-256-cbc', derivedKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([salt, iv, encrypted]).toString('base64');
  },

  aesDecrypt(encrypted: string, key: string): string {
    const combined = Buffer.from(encrypted, 'base64');
    const salt = combined.subarray(0, 16);
    const iv = combined.subarray(16, 32);
    const cipher = combined.subarray(32);
    // PBKDF2 iter: 600000 — OWASP 2023 önerisi PBKDF2-HMAC-SHA256 için.
    // (Eski 10000 değeri 2013 standardı, security-review C-003 ile yükseltildi.)
    // pbkdf2Sync ~100-200ms blocking — tek-kullanıcı senaryosunda kabul edilebilir.
    // Eş zamanlı 5+ istekte event loop blokajı için worker_thread Sprint 2'de.
    const derivedKey = pbkdf2Sync(key, salt, 600000, 32, 'sha256');
    const decipher = createDecipheriv('aes-256-cbc', derivedKey, iv);
    return Buffer.concat([decipher.update(cipher), decipher.final()]).toString('utf8');
  }
};
