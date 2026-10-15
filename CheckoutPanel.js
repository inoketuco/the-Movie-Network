import React from 'react';
import MockCardCheckout from './MockCardCheckout';
import LiveStripeCheckout, { isStripeConfigured } from './StripeCheckout';
import WhopCheckout, { isWhopConfigured } from './WhopCheckout';

// Picks the payment method: Whop once its endpoint is set (WHOP_SETUP.md), then Stripe,
// and otherwise the demo card form, which charges nothing.
const CheckoutPanel = (props) => {
  if (isWhopConfigured) return <WhopCheckout {...props} />;
  if (isStripeConfigured) return <LiveStripeCheckout {...props} />;
  return <MockCardCheckout {...props} />;
};

export default CheckoutPanel;
