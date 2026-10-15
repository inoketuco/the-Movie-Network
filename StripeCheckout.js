import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { auth } from './firebaseConfig';
import { isRealPaymentValue } from './mockPayments';
import { space, type, useTheme } from './theme';
import { Badge, Button } from './ui';

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const STRIPE_PAYMENT_ENDPOINT = process.env.EXPO_PUBLIC_STRIPE_PAYMENT_ENDPOINT;

const LiveStripeCheckout = ({ items, total, onSuccess, onFailure }) => {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

  const pay = async () => {
    setLoading(true);
    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sign in again before starting checkout.');

      const response = await fetch(STRIPE_PAYMENT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          items: items.map(({ id, quantity }) => ({ id, quantity })),
          currency: 'usd',
        }),
      });
      const paymentData = await response.json();
      if (!response.ok) throw new Error(paymentData.error || 'The payment server rejected the request.');

      const clientSecret = paymentData.paymentIntentClientSecret || paymentData.paymentIntent;
      const { error: initializationError } = await initPaymentSheet({
        merchantDisplayName: 'The Movie Network',
        paymentIntentClientSecret: clientSecret,
        customerId: paymentData.customer,
        customerEphemeralKeySecret: paymentData.ephemeralKey,
        returnURL: 'themovienetwork://stripe-redirect',
      });
      if (initializationError) throw new Error(initializationError.message);

      const { error: paymentError } = await presentPaymentSheet();
      if (paymentError) throw new Error(paymentError.message);

      const reference = paymentData.paymentIntentId || clientSecret?.split('_secret_')[0];
      await onSuccess({ reference: reference || `STRIPE-${Date.now()}`, paymentMethod: 'Stripe test payment' });
    } catch (error) {
      onFailure(error.message || 'Payment failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Badge label="Stripe test mode" tone="info" style={styles.badge} />
      <Text style={[type.bodySmall, styles.explanation, { color: theme.textSecondary }]}>
        Stripe's secure payment sheet opens for your card details.
      </Text>
      <Button title={`Pay $${total.toFixed(2)} with Stripe`} fullWidth loading={loading} onPress={pay} />
    </View>
  );
};

// Stripe is used only once its payment endpoint is deployed (see STRIPE_SETUP.md).
export const isStripeConfigured = isRealPaymentValue(STRIPE_PUBLISHABLE_KEY) && isRealPaymentValue(STRIPE_PAYMENT_ENDPOINT);

const styles = StyleSheet.create({
  badge: { marginBottom: space.md },
  explanation: { marginBottom: space.lg },
});

export default LiveStripeCheckout;
