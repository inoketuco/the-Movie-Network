const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { logger, setGlobalOptions } = require('firebase-functions');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');
const { calculateOrder } = require('./catalog');
const { MAX_ATTEMPTS, checkLoginCode, createLoginCode, maskEmail, resendWaitSeconds } = require('./loginCode');
const {
  WHOP_SANDBOX_API_BASE,
  WebhookVerificationError,
  absolutePurchaseUrl,
  buildCheckoutRequest,
  isWhopSandbox,
  orderUpdateForEvent,
  verifyWhopWebhook,
} = require('./whop');

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const smtpUser = defineSecret('SMTP_USER');
const smtpPassword = defineSecret('SMTP_PASSWORD');
// Whop (see WHOP_SETUP.md). The API key and webhook secret are secrets; the ids are
// plain config read from functions/.env.
const whopApiKey = defineSecret('WHOP_API_KEY');
const whopWebhookSecret = defineSecret('WHOP_WEBHOOK_SECRET');
const whopCompanyId = defineString('WHOP_COMPANY_ID');
const whopProductId = defineString('WHOP_PRODUCT_ID', { default: '' });
// Whop's sandbox (test payments, fake money) is the default. Set this to
// https://api.whop.com/api/v1 in functions/.env only when going live.
const whopApiBase = defineString('WHOP_API_BASE', { default: WHOP_SANDBOX_API_BASE });

const MAX_DESIGN_LABEL_LENGTH = 120;

const isCustomerOrderError = (error) =>
  error.message?.startsWith('Unknown product:') ||
  error.message?.startsWith('Invalid quantity') ||
  error.message?.startsWith('The cart must');

const getUserFromRequest = async (request) => {
  const authorization = request.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    const error = new Error('Authentication is required.');
    error.status = 401;
    throw error;
  }

  try {
    return await getAuth().verifyIdToken(authorization.slice('Bearer '.length));
  } catch {
    const error = new Error('Your sign-in session is invalid or expired.');
    error.status = 401;
    throw error;
  }
};

exports.createPaymentIntent = onRequest(
  { cors: true, secrets: [stripeSecretKey] },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'Use POST for this endpoint.' });
      return;
    }

    try {
      const user = await getUserFromRequest(request);
      const order = calculateOrder(request.body?.items);
      const stripe = new Stripe(stripeSecretKey.value());
      const paymentIntent = await stripe.paymentIntents.create({
        amount: order.total,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          firebaseUserId: user.uid,
          itemCount: String(order.items.reduce((sum, item) => sum + item.quantity, 0)),
        },
      });

      response.status(200).json({
        paymentIntentClientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        currency: 'usd',
      });
    } catch (error) {
      logger.error('createPaymentIntent failed', { message: error.message });
      const status = error.status || (isCustomerOrderError(error) ? 400 : 500);
      response.status(status).json({
        error: status < 500 ? error.message : 'Could not create the payment.',
      });
    }
  }
);

// Starts a Whop checkout for the cart. Prices come from catalog.js, never the app,
// and the order is saved as pending until Whop's webhook confirms the payment.
exports.createWhopCheckout = onRequest(
  { cors: true, secrets: [whopApiKey] },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'Use POST for this endpoint.' });
      return;
    }

    if (!whopCompanyId.value()) {
      logger.error('WHOP_COMPANY_ID is not set in functions/.env');
      response.status(503).json({ error: 'Whop checkout is not configured yet.' });
      return;
    }

    try {
      const user = await getUserFromRequest(request);
      const requestedItems = request.body?.items;
      const order = calculateOrder(requestedItems);
      // The chosen movie/character is a label only; it never affects the price.
      const designs = requestedItems.map(({ design }) =>
        typeof design === 'string' && design.trim() ? design.trim().slice(0, MAX_DESIGN_LABEL_LENGTH) : null
      );

      const orderRef = getFirestore().collection('orders').doc();
      const whopResponse = await fetch(`${whopApiBase.value()}/checkout_configurations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${whopApiKey.value()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildCheckoutRequest({
            order,
            orderId: orderRef.id,
            userId: user.uid,
            companyId: whopCompanyId.value(),
            productId: whopProductId.value(),
          })
        ),
      });
      const checkout = await whopResponse.json().catch(() => ({}));
      const purchaseUrl = absolutePurchaseUrl(checkout.purchase_url, whopApiBase.value());
      const testMode = isWhopSandbox(whopApiBase.value());
      if (!whopResponse.ok || !purchaseUrl) {
        logger.error('Whop checkout creation failed', { status: whopResponse.status, error: checkout.error });
        const error = new Error('Whop could not start the checkout.');
        error.status = 502;
        throw error;
      }

      await orderRef.set({
        userId: user.uid,
        customerEmail: user.email || null,
        provider: 'whop',
        status: 'pending',
        items: order.items.map((item, index) => ({
          id: item.id,
          name: designs[index] ? `${item.name} — ${designs[index]}` : item.name,
          quantity: item.quantity,
          price: item.unitAmount / 100,
        })),
        subtotal: order.subtotal / 100,
        tax: order.tax / 100,
        total: order.total / 100,
        currency: 'USD',
        whopCheckoutId: checkout.id || null,
        testMode,
        createdAt: FieldValue.serverTimestamp(),
      });

      response.status(200).json({ orderId: orderRef.id, purchaseUrl, total: order.total / 100, testMode });
    } catch (error) {
      logger.error('createWhopCheckout failed', { message: error.message });
      const status = error.status || (isCustomerOrderError(error) ? 400 : 500);
      response.status(status).json({
        error: status < 500 || status === 502 ? error.message : 'Could not start the checkout.',
      });
    }
  }
);

// Whop calls this after a payment. The signature is checked against the raw body,
// and each delivery id is recorded so Whop's retries are only applied once.
exports.whopWebhook = onRequest({ secrets: [whopWebhookSecret] }, async (request, response) => {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Use POST for this endpoint.' });
    return;
  }

  let verified;
  try {
    verified = verifyWhopWebhook(request.rawBody, request.headers, whopWebhookSecret.value());
  } catch (error) {
    logger.warn('Rejected a Whop webhook', { message: error.message });
    response.status(error instanceof WebhookVerificationError ? 400 : 500).json({ error: 'Invalid webhook.' });
    return;
  }

  const { id: deliveryId, event } = verified;
  const db = getFirestore();
  try {
    await db.runTransaction(async (transaction) => {
      const eventRef = db.collection('whopEvents').doc(deliveryId);
      if ((await transaction.get(eventRef)).exists) return;

      const orderId = event.data?.metadata?.orderId;
      const orderRef = orderId ? db.collection('orders').doc(String(orderId)) : null;
      const orderSnapshot = orderRef ? await transaction.get(orderRef) : null;
      const order = orderSnapshot?.exists && orderSnapshot.data().provider === 'whop' ? orderSnapshot.data() : null;
      const decision = orderUpdateForEvent(event, order);

      if (decision.action === 'update') {
        transaction.update(orderRef, { ...decision.fields, updatedAt: FieldValue.serverTimestamp() });
      } else if (decision.action === 'flag') {
        logger.error('Whop payment did not match its order', { orderId, reason: decision.reason });
        transaction.update(orderRef, { status: 'needs_review', reviewReason: decision.reason, updatedAt: FieldValue.serverTimestamp() });
      }
      transaction.set(eventRef, {
        type: event.type || null,
        orderId: orderId || null,
        action: decision.action,
        reason: decision.reason || null,
        receivedAt: FieldValue.serverTimestamp(),
      });
    });
    response.status(200).json({ received: true });
  } catch (error) {
    // A 5xx makes Whop retry the delivery later.
    logger.error('whopWebhook failed', { message: error.message });
    response.status(500).json({ error: 'Could not process the webhook.' });
  }
});

const LOGIN_CODE_ERRORS = {
  missing: 'No active code. Request a new one.',
  expired: 'That code has expired. Request a new one.',
  locked: `Too many incorrect attempts. Request a new code.`,
  format: 'Enter the 6-digit code from your email.',
  incorrect: 'That code is not correct.',
};

const sendJsonError = (response, error, fallback) => {
  logger.error(fallback, { message: error.message });
  const status = error.status || 500;
  response.status(status).json({ error: status < 500 ? error.message : fallback });
};

// Step 2 of sign-in: email a one-time code for the current sign-in session.
exports.sendLoginCode = onRequest(
  { cors: true, secrets: [smtpUser, smtpPassword] },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'Use POST for this endpoint.' });
      return;
    }

    try {
      const user = await getUserFromRequest(request);
      if (!user.email) {
        response.status(400).json({ error: 'This account has no email address.' });
        return;
      }

      const codeRef = getFirestore().collection('loginCodes').doc(user.uid);
      const existing = (await codeRef.get()).data();
      const waitSeconds = existing?.authTime === user.auth_time ? resendWaitSeconds(existing) : 0;
      if (waitSeconds > 0) {
        response.status(429).json({ error: `Wait ${waitSeconds} seconds before requesting another code.`, waitSeconds });
        return;
      }

      const { code, record } = createLoginCode(user.auth_time);
      await codeRef.set(record);

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: smtpUser.value(), pass: smtpPassword.value() },
      });
      await transporter.sendMail({
        from: `"The Movie Network" <${smtpUser.value()}>`,
        to: user.email,
        subject: `${code} is your The Movie Network sign-in code`,
        text: `Your sign-in code is ${code}. It expires in 10 minutes. If you did not try to sign in, change your password.`,
      });

      response.status(200).json({ sent: true, email: maskEmail(user.email) });
    } catch (error) {
      sendJsonError(response, error, 'Could not send the sign-in code.');
    }
  }
);

// Checks the code and marks this sign-in session as verified with a custom claim
// that firestore.rules require (mfaAuthTime must equal the token's auth_time).
exports.verifyLoginCode = onRequest({ cors: true }, async (request, response) => {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Use POST for this endpoint.' });
    return;
  }

  try {
    const user = await getUserFromRequest(request);
    const codeRef = getFirestore().collection('loginCodes').doc(user.uid);
    const record = (await codeRef.get()).data();
    const result = checkLoginCode(record, request.body?.code, user.auth_time);

    if (!result.ok) {
      if (result.attempts) await codeRef.update({ attempts: result.attempts });
      const attemptsLeft = result.attempts ? Math.max(0, MAX_ATTEMPTS - result.attempts) : undefined;
      response.status(400).json({ error: LOGIN_CODE_ERRORS[result.reason], reason: result.reason, attemptsLeft });
      return;
    }

    await codeRef.delete();
    const { customClaims = {} } = await getAuth().getUser(user.uid);
    await getAuth().setCustomUserClaims(user.uid, { ...customClaims, mfaAuthTime: user.auth_time });
    response.status(200).json({ verified: true });
  } catch (error) {
    sendJsonError(response, error, 'Could not verify the sign-in code.');
  }
});
