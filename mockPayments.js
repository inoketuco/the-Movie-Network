// Placeholder Stripe and Whop values used in .env until the real payment backends are
// set up (STRIPE_SETUP.md, WHOP_SETUP.md). They point at no real service: the app
// treats them as "not configured" and keeps using the demo card form.
export const MOCK_PAYMENT_VALUES = {
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_mock_themovienetwork',
  EXPO_PUBLIC_STRIPE_PAYMENT_ENDPOINT: 'mock://stripe/create-payment-intent',
  EXPO_PUBLIC_WHOP_CHECKOUT_ENDPOINT: 'mock://whop/create-checkout',
};

const isMockValue = (value) => /^(mock:\/\/|pk_(test|live)_mock_)/.test(value);

// True only for a real key or endpoint, not a blank or a mock placeholder.
export const isRealPaymentValue = (value) => Boolean(value) && !isMockValue(value);
