const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  checkLoginCode,
  createLoginCode,
  maskEmail,
  resendWaitSeconds,
} = require('./loginCode');

const AUTH_TIME = 1790000000;
const NOW = 1_790_000_000_000;

test('creates a random 6-digit code and stores only its hash', () => {
  const { code, record } = createLoginCode(AUTH_TIME, NOW);
  assert.match(code, /^\d{6}$/);
  assert.notEqual(record.hash, code);
  assert.equal(JSON.stringify(record).includes(code), false);
  assert.equal(record.expiresAt, NOW + CODE_TTL_MS);
});

test('accepts the correct code for the same sign-in session', () => {
  const { code, record } = createLoginCode(AUTH_TIME, NOW);
  assert.deepEqual(checkLoginCode(record, code, AUTH_TIME, NOW + 1000), { ok: true });
});

test('rejects wrong, malformed, expired and other-session codes', () => {
  const { code, record } = createLoginCode(AUTH_TIME, NOW);
  const wrong = code === '000000' ? '111111' : '000000';
  assert.deepEqual(checkLoginCode(record, wrong, AUTH_TIME, NOW), { ok: false, reason: 'incorrect', attempts: 1 });
  assert.equal(checkLoginCode(record, '12ab', AUTH_TIME, NOW).reason, 'format');
  assert.equal(checkLoginCode(record, code, AUTH_TIME, NOW + CODE_TTL_MS + 1).reason, 'expired');
  assert.equal(checkLoginCode(record, code, AUTH_TIME + 1, NOW).reason, 'missing');
  assert.equal(checkLoginCode(null, code, AUTH_TIME, NOW).reason, 'missing');
});

test('locks the code after too many wrong attempts, even if the right code follows', () => {
  const { code, record } = createLoginCode(AUTH_TIME, NOW);
  const wrong = code === '000000' ? '111111' : '000000';
  assert.equal(checkLoginCode({ ...record, attempts: MAX_ATTEMPTS - 1 }, wrong, AUTH_TIME, NOW).reason, 'locked');
  assert.equal(checkLoginCode({ ...record, attempts: MAX_ATTEMPTS }, code, AUTH_TIME, NOW).reason, 'locked');
});

test('enforces a resend cooldown and masks email addresses', () => {
  const { record } = createLoginCode(AUTH_TIME, NOW);
  assert.equal(resendWaitSeconds(record, NOW + 10_000), 50);
  assert.equal(resendWaitSeconds(record, NOW + 61_000), 0);
  assert.equal(resendWaitSeconds(null, NOW), 0);
  assert.equal(maskEmail('movielover@example.com'), 'mo********@example.com');
});
