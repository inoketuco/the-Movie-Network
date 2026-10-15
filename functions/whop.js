const crypto = require('node:crypto');

// Whop signs webhooks with the Standard Webhooks scheme: HMAC-SHA256 over
// "{webhook-id}.{webhook-timestamp}.{raw body}", keyed with the literal bytes of the
// endpoint's signing secret (prefix included, not base64-decoded).
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

class WebhookVerificationError extends Error {}

const headerValue = (headers, name) => {
  const value = typeof headers.get === 'function' ? headers.get(name) : headers[name];
  return Array.isArray(value) ? value[0] : value;
};

const verifyWhopWebhook = (rawBody, headers, secret, nowSeconds = Math.floor(Date.now() / 1000)) => {
  if (!secret) throw new Error('The Whop webhook signing secret is not configured.');
  const id = headerValue(headers, 'webhook-id');
  const timestamp = headerValue(headers, 'webhook-timestamp');
  const signatureHeader = headerValue(headers, 'webhook-signature');
  if (!id || !timestamp || !signatureHeader) throw new WebhookVerificationError('Missing webhook signature headers.');

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowSeconds - sentAt) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new WebhookVerificationError('Webhook timestamp is outside the allowed window.');
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(`${id}.${timestamp}.${body}`).digest();

  // The header can hold several space-separated "v1,<base64>" signatures during secret rotation.
  const matches = signatureHeader.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const received = Buffer.from(signature, 'base64');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
  if (!matches) throw new WebhookVerificationError('Webhook signature does not match.');

  return { id, event: JSON.parse(body) };
};

// Depending on the API version a webhook is pinned to, Whop sends money either as a
// number in dollars or as { amount: "10.00", ... }. Returns cents, or null.
const toCents = (value) => {
  const amount = value && typeof value === 'object' ? value.amount : value;
  const number = Number(amount);
  return amount == null || amount === '' || !Number.isFinite(number) ? null : Math.round(number * 100);
};

// A one-time inline plan priced at the server-calculated order total. The order id in
// metadata comes back on the payment webhook, which is how the payment is matched to it.
const buildCheckoutRequest = ({ order, orderId, userId, companyId, productId }) => {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const plan = {
    account_id: companyId,
    currency: 'usd',
    initial_price: order.total / 100,
    plan_type: 'one_time',
    title: `The Movie Network order (${itemCount} ${itemCount === 1 ? 'item' : 'items'})`,
    description: order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ').slice(0, 500),
    force_create_new_plan: true,
    metadata: { orderId },
  };
  if (productId) plan.product_id = productId;

  return {
    mode: 'payment',
    plan,
    metadata: { orderId, firebaseUserId: userId },
  };
};

const WHOP_SANDBOX_API_BASE = 'https://sandbox-api.whop.com/api/v1';
const isWhopSandbox = (apiBase) => /\/\/sandbox-api\.whop\.com/.test(apiBase || '');

// Whop has returned purchase_url both as a full URL and as a path like "/checkout/ch_x/".
// A path belongs to the site matching the API: sandbox.whop.com for the sandbox.
const absolutePurchaseUrl = (purchaseUrl, apiBase) => {
  if (!purchaseUrl) return null;
  if (/^https?:\/\//.test(purchaseUrl)) return purchaseUrl;
  const site = isWhopSandbox(apiBase) ? 'https://sandbox.whop.com' : 'https://whop.com';
  return `${site}${purchaseUrl.startsWith('/') ? '' : '/'}${purchaseUrl}`;
};

// Decides what a verified webhook event means for the order it refers to.
const orderUpdateForEvent = (event, order) => {
  const payment = event?.data || {};
  if (!order) return { action: 'ignore', reason: 'unknown order' };

  if (event.type === 'payment.succeeded') {
    const paidCents = toCents(payment.total) ?? toCents(payment.subtotal) ?? toCents(payment.usd_total);
    const currency = String(payment.currency || 'usd').toLowerCase();
    if (currency !== 'usd' || paidCents == null || paidCents < Math.round(order.total * 100)) {
      return { action: 'flag', reason: `Paid ${paidCents ?? '?'} ${currency}, expected ${Math.round(order.total * 100)} usd.` };
    }
    return {
      action: 'update',
      fields: {
        status: 'paid',
        paymentReference: payment.id || null,
        paymentMethod: payment.payment_method_type ? `Whop (${payment.payment_method_type})` : 'Whop',
        paidAt: payment.paid_at || null,
      },
    };
  }

  if (event.type === 'payment.failed') {
    // A declined retry must not undo an order that has already been paid.
    if (order.status === 'paid') return { action: 'ignore', reason: 'order already paid' };
    return { action: 'update', fields: { status: 'failed', failureReason: payment.failure_message || payment.decline_code || null } };
  }

  return { action: 'ignore', reason: `unhandled event ${event.type}` };
};

module.exports = {
  WHOP_SANDBOX_API_BASE,
  WebhookVerificationError,
  absolutePurchaseUrl,
  buildCheckoutRequest,
  isWhopSandbox,
  orderUpdateForEvent,
  toCents,
  verifyWhopWebhook,
};
