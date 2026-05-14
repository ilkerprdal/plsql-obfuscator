import rateLimit from 'express-rate-limit';

// /decrypt: 5 istek/dk/IP — brute-force savunması
export const decryptLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek. Lütfen bekleyin.' }
});
