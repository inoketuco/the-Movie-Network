const crypto = require('node:crypto');

const CODE_LENGTH = 6;
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const hashCode = (code, salt) =>
  crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');

// Only a salted hash is stored, so a leaked database record does not reveal the code.
const createLoginCode = (authTime, now = Date.now()) => {
  const code = String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    code,
    record: {
      hash: hashCode(code, salt),
      salt,
      authTime,
      attempts: 0,
      createdAt: now,
      expiresAt: now + CODE_TTL_MS,
    },
  };
};

const resendWaitSeconds = (record, now = Date.now()) => {
  if (!record) return 0;
  const waitMs = record.createdAt + RESEND_COOLDOWN_MS - now;
  return waitMs > 0 ? Math.ceil(waitMs / 1000) : 0;
};

// A code only unlocks the sign-in session (auth_time) it was issued for.
const checkLoginCode = (record, submittedCode, authTime, now = Date.now()) => {
  if (!record || record.authTime !== authTime) return { ok: false, reason: 'missing' };
  if (now > record.expiresAt) return { ok: false, reason: 'expired' };
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' };
  if (!/^\d{6}$/.test(String(submittedCode ?? ''))) return { ok: false, reason: 'format' };

  const expected = Buffer.from(record.hash, 'hex');
  const actual = Buffer.from(hashCode(submittedCode, record.salt), 'hex');
  if (crypto.timingSafeEqual(expected, actual)) return { ok: true };

  const attempts = record.attempts + 1;
  return { ok: false, reason: attempts >= MAX_ATTEMPTS ? 'locked' : 'incorrect', attempts };
};

const maskEmail = (email) => {
  const [name = '', domain = ''] = String(email || '').split('@');
  if (!domain) return 'your email';
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
};

module.exports = {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  checkLoginCode,
  createLoginCode,
  maskEmail,
  resendWaitSeconds,
};
