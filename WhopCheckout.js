import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import { isRealPaymentValue } from './mockPayments';
import { space, type, useTheme } from './theme';
import { Banner, Button } from './ui';
import { withTimeout } from './withTimeout';

// The createWhopCheckout Cloud Function URL (see WHOP_SETUP.md).
const WHOP_CHECKOUT_ENDPOINT = process.env.EXPO_PUBLIC_WHOP_CHECKOUT_ENDPOINT;
export const isWhopConfigured = isRealPaymentValue(WHOP_CHECKOUT_ENDPOINT);
// Matches the server's default of Whop's sandbox; set to "false" only when going live.
const WHOP_TEST_MODE = process.env.EXPO_PUBLIC_WHOP_TEST_MODE !== 'false';

const REQUEST_TIMEOUT_MS = 20000;
// How long to wait after the checkout page closes for Whop's webhook to arrive.
const CONFIRMATION_WAIT_MS = 20000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const STAGE_MESSAGES = {
  starting: 'Preparing your secure checkout…',
  paying: 'Finish paying on the Whop checkout page.',
  confirming: 'Waiting for Whop to confirm your payment…',
};

// The order is saved and marked paid on the server by Whop's webhook; the app only
// watches it, so a payment is never confirmed from the phone alone.
const WhopCheckout = ({ items, total, onSuccess, onFailure }) => {
  const theme = useTheme();
  const [stage, setStage] = useState('idle');
  const stopWatching = useRef(null);

  useEffect(() => () => stopWatching.current?.(), []);

  const pay = async () => {
    setStage('starting');
    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sign in again before starting checkout.');

      const response = await withTimeout(
        fetch(WHOP_CHECKOUT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            items: items.map(({ id, quantity, designLabel }) => ({ id, quantity, design: designLabel || undefined })),
          }),
        }),
        REQUEST_TIMEOUT_MS,
        'The payment server did not respond. Check your connection and try again.'
      );
      const checkout = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(checkout.error || 'Could not start the Whop checkout.');

      const confirmed = new Promise((resolve, reject) => {
        stopWatching.current = onSnapshot(
          doc(db, 'orders', checkout.orderId),
          (snapshot) => {
            const order = snapshot.data();
            if (order?.status === 'paid') resolve(order);
            else if (order?.status === 'failed') reject(new Error('Whop declined the payment. Your cart has been kept.'));
            else if (order?.status === 'needs_review') {
              reject(new Error("The payment didn't match your order total. It has been flagged for review."));
            }
          },
          (error) =>
            reject(
              error.code === 'permission-denied'
                ? new Error("Your checkout was created, but the app can't check its payment status. The order will still be updated once Whop confirms it.")
                : error
            )
        );
      });
      confirmed.catch(() => {}); // Handled below; avoids an unhandled-rejection warning.

      setStage('paying');
      const pageClosed = WebBrowser.openBrowserAsync(checkout.purchaseUrl, { dismissButtonStyle: 'close' });
      const first = await Promise.race([confirmed.then((order) => ({ order })), pageClosed.then(() => ({}))]);

      let order = first.order;
      if (order) {
        // iOS can close the checkout page for the user; on Android they close it themselves.
        Promise.resolve(WebBrowser.dismissBrowser?.()).catch(() => {});
      } else {
        setStage('confirming');
        order = await Promise.race([confirmed, wait(CONFIRMATION_WAIT_MS).then(() => null)]);
      }
      if (!order) {
        throw new Error('Whop has not confirmed a payment yet. If you did pay, the order will update once Whop confirms it.');
      }

      const paymentMethod = order.paymentMethod || 'Whop';
      await onSuccess({
        reference: order.paymentReference || checkout.orderId,
        paymentMethod: order.testMode || checkout.testMode ? `${paymentMethod} · test payment` : paymentMethod,
        orderSaved: true,
      });
    } catch (error) {
      onFailure(error.message || 'Payment failed.');
    } finally {
      stopWatching.current?.();
      stopWatching.current = null;
      setStage('idle');
    }
  };

  const busy = stage !== 'idle';
  return (
    <View>
      {WHOP_TEST_MODE ? (
        <Banner
          tone="info"
          title="Test mode · no real money"
          message="On Whop's page, pay with test card 4242 4242 4242 4242, any future date (e.g. 12/34) and any CVC."
          style={styles.banner}
        />
      ) : null}
      <Text style={[type.bodySmall, styles.explanation, { color: theme.textSecondary }]}>
        You'll pay securely on Whop's checkout page, then return here for your receipt.
      </Text>
      <Button title={`Pay $${total.toFixed(2)} with Whop`} fullWidth loading={busy} onPress={pay} />
      <Text style={[type.caption, styles.stage, { color: theme.textSecondary }]}>
        {busy ? STAGE_MESSAGES[stage] : 'Payments are processed by Whop.'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: { marginBottom: space.lg },
  explanation: { marginBottom: space.lg },
  stage: { textAlign: 'center', marginTop: space.md },
});

export default WhopCheckout;
