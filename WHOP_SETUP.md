# Whop payments setup

The app sells merch through Whop's hosted checkout:

1. The app sends the cart to the `createWhopCheckout` Cloud Function.
2. The function prices the cart from `functions/catalog.js` (never from the app), saves a
   `pending` order in Firestore, and creates a one-time Whop checkout for that total.
3. The app opens Whop's checkout page in an in-app browser.
4. After payment, Whop calls the `whopWebhook` Cloud Function. It checks Whop's signature,
   checks the amount, and marks the order `paid`.
5. The app is watching that order, so it shows the receipt as soon as it is `paid`.

Until `EXPO_PUBLIC_WHOP_CHECKOUT_ENDPOINT` is set, the app uses the demo card form instead
(`CheckoutPanel.js`).

**Everything below uses Whop's sandbox**: test payments with fake money, on
[sandbox.whop.com](https://sandbox.whop.com), which has its own accounts, companies and API
keys, separate from your real Whop account. The server talks to the sandbox unless
`WHOP_API_BASE` says otherwise, and the app shows a "Test mode" banner. See "Going live"
at the end for switching to real payments.

## 1. Prepare the Whop sandbox

1. Sign up at [sandbox.whop.com](https://sandbox.whop.com) and create a company for The Movie
   Network.
2. Note the company id (`biz_...`). Optionally create a product such as
   "The Movie Network Merch" and note its id (`prod_...`).
3. In the sandbox dashboard (Developer settings), create a company API key with these permissions:
   `checkout_configuration:create`, `checkout_configuration:basic:read`, `plan:create`,
   `access_pass:create`, `access_pass:update`.
   Keep it secret: it must never go in the root `.env` or anywhere in the app.

## 2. Prepare Firebase

The project must be on the **Blaze** plan to deploy Cloud Functions.

Copy `functions/.env.example` to `functions/.env` and fill in your **sandbox**
`WHOP_COMPANY_ID` (and `WHOP_PRODUCT_ID` if you made a product). Leave `WHOP_API_BASE` as the
sandbox URL.

Store the API key as a secret, and set a temporary webhook secret (Whop only gives you the
real one after the webhook exists):

```
npx.cmd firebase-tools functions:secrets:set WHOP_API_KEY
npx.cmd firebase-tools functions:secrets:set WHOP_WEBHOOK_SECRET
```

Deploy just the Whop functions (this avoids needing the Stripe and SMTP secrets):

```
npx.cmd firebase-tools deploy --only functions:createWhopCheckout,functions:whopWebhook
```

## 3. Create the webhook

In the **sandbox** Whop dashboard (Developer settings → Create webhook):

- URL: `https://us-central1-the-movie-network-c2507.cloudfunctions.net/whopWebhook`
- Events: `payment.succeeded` and `payment.failed`

Copy the signing secret (`ws_...`) shown once, save it, and redeploy the webhook:

```
npx.cmd firebase-tools functions:secrets:set WHOP_WEBHOOK_SECRET
npx.cmd firebase-tools deploy --only functions:whopWebhook
```

## 4. Point the app at it

Add to the root `.env`, then restart Expo with `npx expo start --tunnel --clear`:

```
EXPO_PUBLIC_WHOP_CHECKOUT_ENDPOINT=https://us-central1-the-movie-network-c2507.cloudfunctions.net/createWhopCheckout
```

## 5. Firestore rules

`firestore.rules` only lets a user read their orders from a session that passed the emailed
sign-in code (see `MFA_SETUP.md`). The app watches the order to know when it is paid, so
either deploy the sign-in code functions as well, or change the orders read rule. Then deploy
the rules:

```
npx.cmd firebase-tools deploy --only firestore:rules
```

## 6. Make a test payment

In the app, add something to the cart, check out, and tap **Pay with Whop**. On Whop's page use
test card `4242 4242 4242 4242`, any future date (e.g. `12/34`) and any 3-digit CVC. The receipt
shows the payment as a test payment.

## Going live (later)

Real payments need your real Whop company, so repeat steps 1-3 on whop.com instead of the
sandbox:

1. Check that Whop's terms allow selling physical products.
2. Create a production API key and webhook, and set them with `functions:secrets:set`.
3. In `functions/.env`, set the production `WHOP_COMPANY_ID` and
   `WHOP_API_BASE=https://api.whop.com/api/v1`.
4. Redeploy the two Whop functions.
5. Add `EXPO_PUBLIC_WHOP_TEST_MODE=false` to the root `.env` so the app hides the test banner.

## Troubleshooting

- **"Whop could not start the checkout."**: check the function logs
  (`npx.cmd firebase-tools functions:log --only createWhopCheckout`). Usually a missing
  permission on the API key or a wrong `WHOP_COMPANY_ID`.
- **The order stays `pending`**: check the webhook's delivery log in the Whop dashboard and
  `npx.cmd firebase-tools functions:log --only whopWebhook`. A signature error means
  `WHOP_WEBHOOK_SECRET` does not match the webhook.
- **An order is `needs_review`**: Whop reported a payment that didn't match the order total
  or currency. Compare it in the Whop dashboard before shipping anything.
