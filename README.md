# 🔒 PL/SQL Obfuscator

Oracle PL/SQL kodlarını AI'ya güvenle göndermek için **identifier obfuscation** aracı.  
Değişken/parametre adları HMAC ile maskelenir, mapping AES-256 ile şifrelenir.  
Sunucu tarafında hiçbir kod veya anahtar saklanmaz.

---

## 🚀 Hızlı Başlangıç

### Gereksinimler

- [Node.js 20+](https://nodejs.org/)
- Git

### Kurulum

```bash
git clone https://github.com/ilkerprdal/plsql-obfuscator.git
cd plsql-obfuscator
npm install
cp .env.example .env
npm run dev
```

Tarayıcıda aç → **http://localhost:3030**

---

## 🖥️ Kullanım

### 1. Şifrele

1. Sol panele PL/SQL kodunu yapıştır  
2. İsteğe bağlı: sadece tek bir procedure/function bloğu için o bloğun adını yaz  
3. Güçlü bir **şifreleme anahtarı** gir (veya 🎲 ile rastgele üret)  
4. **Şifrele** → obfuscated kod + şifreli mapping token çıkar

### 2. AI'ya Gönder

Sonuç bölümünde **📝 Analiz** veya **🧪 Unit Test** sekmelerinden birini seç:

| Prompt | İçerik |
|---|---|
| 📝 Analiz | Türkçe — kodu incele, hata/iyileştirme öner |
| 🧪 Unit Test | İngilizce — utPLSQL (ut3) ile unit test üret |

Prompt'u kopyala → AI'ya yapıştır.

### 3. Geri Çevir

AI'dan dönen obfuscated kodu sağ panele yapıştır, aynı anahtarı gir, **Geri Çevir**.  
Mapping kod içine gömülüyse (token satırları) ek bir şey girmen gerekmez.

---

## 🔐 Güvenlik Modeli

- **Anahtar** hiçbir zaman sunucuya gönderilmez — yalnızca tarayıcı memory'de kalır  
- **Mapping** AES-256-CBC + PBKDF2 (600.000 iter, OWASP 2023) ile şifrelenir  
- **Identifier maskeleme** HMAC-SHA256 (8 byte → 16 hex) — tersine mühendislik yapılamaz  
- **`/decrypt`** endpoint'i rate-limited: 5 istek/dakika/IP (brute-force koruması)  
- Sunucu log'larına kod, anahtar veya mapping yazmaz

---

## ⚙️ API Endpoint'leri

| Method | Path | Açıklama |
|---|---|---|
| POST | `/api/encrypt-manual` | Yapıştırılan kodu obfuscate et |
| POST | `/api/encrypt-block` | Kaynak + `procName` → sadece o bloğu obfuscate et |
| POST | `/api/decrypt` | Obfuscated kodu geri çevir |

**Örnek:**
```bash
curl -X POST http://localhost:3030/api/encrypt-manual \
  -H "Content-Type: application/json" \
  -d '{"code":"PROCEDURE p_test IS BEGIN NULL; END;","key":"my-secret-key"}'
```

---

## 🛠️ Geliştirme

```bash
npm run dev      # tsx watch — hot reload
npm run build    # TypeScript derleme → dist/
npm start        # Production (dist/ gerekir)
```

### Ortam Değişkenleri (`.env`)

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `3030` | Sunucu portu |
| `HOST` | `127.0.0.1` | Bind adresi (prod'da `127.0.0.1` bırak) |

---

## 📁 Proje Yapısı

```
src/
  server.ts                        # Express bootstrap
  services/
    obfuscationService.ts          # AES / PBKDF2 / HMAC crypto
    plsqlParser.ts                 # PL/SQL blok çıkarıcı
  endpoints/
    obfuscationEndpoints.ts        # REST route'ları
  middleware/
    rateLimit.ts                   # decryptLimiter
public/
  index.html                       # Tek sayfa UI
  js/
    common.js                      # AppState, apiFetch, i18n
    obfuscation.js                 # UI mantığı
  css/
    main.css                       # Dark/light tema
```
