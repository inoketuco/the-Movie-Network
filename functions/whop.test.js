const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { calculateOrder } = require('./catalog');
const {
  WHOP_SANDBOX_API_BASE,
  WebhookVerificationError,
  absolutePurchaseUrl,
  buildCheckoutRequest,
  isWhopSandbox,
  orderUpdateForEvent,
  toCents,
  verifyWhopWebhook,
} = require('./whop');

const SECRET = 'ws_test_secret_value';
const NOW = 1_790_000_000;

// Signs like Whop's backend: HMAC-SHA256 keyed with the literal secret bytes.
const sign = (id, timestamp, body, secret = SECRET) =>
  `v1,${crypto.createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64')}`;

const deliver = (body, overrides = {}) => ({
  'webhook-id': 'msg_1',
  'webhook-timestamp': String(NOW),
  'webhook-signature': sign('msg_1', NOW, body),
  ...overrides,
});

test('accepts a correctly signed webhook and returns the event', () => {
  const body = JSON.stringify({ type: 'payment.succeeded', data: { id: 'pay_1' } });
  const { id, event } = verifyWhopWebhook(Buffer.from(body), deliver(body), SECRET, NOW);

  assert.equal(id, 'msg_1');
  assert.equal(event.data.id, 'pay_1');
});

test('accepts any matching signature when several are sent during secret rotation', () => {
  const body = '{"type":"payment.succeeded"}';
  const headers = deliver(body, { 'webhook-signature': `v1,${Buffer.from('old').toString('base64')} ${sign('msg_1', NOW, body)}` });

  assert.doesNotThrow(() => verifyWhopWebhook(body, headers, SECRET, NOW));
});

test('rejects tampered bodies, wrong secrets, stale timestamps and missing headers', () => {
  const body = '{"type":"payment.succeeded","data":{"total":1}}';
  const headers = deliver(body);

  assert.throws(() => verifyWhopWebhook(body.replace('1', '9'), headers, SECRET, NOW), WebhookVerificationError);
  assert.throws(() => verifyWhopWebhook(body, headers, 'ws_other', NOW), WebhookVerificationError);
  assert.throws(() => verifyWhopWebhook(body, headers, SECRET, NOW + 6 * 60), /outside the allowed window/);
  assert.throws(() => verifyWhopWebhook(body, { ...headers, 'webhook-signature': undefined }, SECRET, NOW), /Missing/);
});

test('reads money sent as a number or as a Money object', () => {
  assert.equal(toCents(26.24), 2624);
  assert.equal(toCents({ amount: '26.24', currency: 'usd' }), 2624);
  assert.equal(toCents(null), null);
  assert.equal(toCents({ amount: 'n/a' }), null);
});

test('builds a one-time checkout priced from the server catalog', () => {
  const order = calculateOrder([{ id: 'classic-logo-tee', quantity: 2 }]);
  const request = buildCheckoutRequest({ order, orderId: 'order_1', userId: 'user_1', companyId: 'biz_1', productId: 'prod_1' });

  assert.equal(request.mode, 'payment');
  assert.equal(request.plan.plan_type, 'one_time');
  assert.equal(request.plan.initial_price, 52.48); // 2 × $24.99 + 5% tax
  assert.equal(request.plan.account_id, 'biz_1');
  assert.equal(request.plan.product_id, 'prod_1');
  assert.deepEqual(request.metadata, { orderId: 'order_1', firebaseUserId: 'user_1' });
  assert.equal(buildCheckoutRequest({ order, orderId: 'o', userId: 'u', companyId: 'biz_1', productId: '' }).plan.product_id, undefined);
});

test('turns a relative purchase_url into a full link on the matching Whop site', () => {
  assert.equal(absolutePurchaseUrl('/checkout/ch_1/', WHOP_SANDBOX_API_BASE), 'https://sandbox.whop.com/checkout/ch_1/');
  assert.equal(absolutePurchaseUrl('/checkout/ch_1/', 'https://api.whop.com/api/v1'), 'https://whop.com/checkout/ch_1/');
  assert.equal(absolutePurchaseUrl('https://whop.com/checkout/ch_1/', WHOP_SANDBOX_API_BASE), 'https://whop.com/checkout/ch_1/');
  assert.equal(absolutePurchaseUrl(null), null);
});

test('recognises the sandbox API', () => {
  assert.equal(isWhopSandbox(WHOP_SANDBOX_API_BASE), true);
  assert.equal(isWhopSandbox('https://api.whop.com/api/v1'), false);
});

test('marks the order paid only when the full amount was paid in USD', () => {
  const order = { total: 26.24, status: 'pending' };
  const paid = orderUpdateForEvent(
    { type: 'payment.succeeded', data: { id: 'pay_1', total: { amount: '26.24' }, currency: 'usd', payment_method_type: 'card' } },
    order
  );
  assert.equal(paid.action, 'update');
  assert.equal(paid.fields.status, 'paid');
  assert.equal(paid.fields.paymentReference, 'pay_1');

  const short = orderUpdateForEvent({ type: 'payment.succeeded', data: { total: 1, currency: 'usd' } }, order);
  assert.equal(short.action, 'flag');
  const otherCurrency = orderUpdateForEvent({ type: 'payment.succeeded', data: { total: 26.24, currency: 'eur' } }, order);
  assert.equal(otherCurrency.action, 'flag');
});

test('records failures but never un-pays a paid order, and ignores unknown orders', () => {
  const failed = orderUpdateForEvent({ type: 'payment.failed', data: {} }, { total: 10, status: 'pending' });
  assert.equal(failed.fields.status, 'failed');
  assert.equal(orderUpdateForEvent({ type: 'payment.failed', data: {} }, { total: 10, status: 'paid' }).action, 'ignore');
  assert.equal(orderUpdateForEvent({ type: 'payment.succeeded', data: {} }, null).action, 'ignore');
});
