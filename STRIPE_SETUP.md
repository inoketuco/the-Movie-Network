# Stripe test checkout setup

The app uses checkout simulation until both public Stripe variables are set.

## Prerequisites

- A Stripe account in test mode
- The Firebase project on the Blaze plan
- Firebase CLI authentication for `the-movie-network-c2507`

## Configure and deploy

1. Copy the Stripe test publishable key (`pk_test_...`) into the root `.env` file:

   ```env
   EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

2. Store the Stripe test secret securely. Enter the `sk_test_...` value only when the Firebase CLI prompts for it:

   ```powershell
   npx.cmd firebase-tools functions:secrets:set STRIPE_SECRET_KEY
   ```

3. Deploy the payment function:

   ```powershell
   npx.cmd firebase-tools deploy --only functions
   ```

4. Copy the deployed `createPaymentIntent` function URL into the root `.env` file:

   ```env
   EXPO_PUBLIC_STRIPE_PAYMENT_ENDPOINT=https://us-central1-the-movie-network-c2507.cloudfunctions.net/createPaymentIntent
   ```

5. Restart Expo so the public values are included in the app bundle:

   ```powershell
   npm.cmd start -- --clear
   ```

Never add a Stripe secret key to the mobile `.env` file or source code.
