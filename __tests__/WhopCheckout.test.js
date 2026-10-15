import React from 'react';
import { act, fireEvent, renderAsync, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { onSnapshot } from 'firebase/firestore';

process.env.EXPO_PUBLIC_WHOP_CHECKOUT_ENDPOINT = 'https://functions.example/createWhopCheckout';
const WhopCheckout = require('../WhopCheckout').default;

jest.mock('../firebaseConfig', () => ({
  auth: { currentUser: { getIdToken: jest.fn(async () => 'id-token') } },
  db: {},
}));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, collection, id) => `${collection}/${id}`),
  onSnapshot: jest.fn(),
}));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
  dismissBrowser: jest.fn(),
}));

const ITEMS = [{ id: 'classic-logo-tee', quantity: 2, designLabel: 'The Courier · Runner', price: 24.99 }];

// Captures the order listener so a test can play the webhook's update to the order.
let pushOrder;
beforeEach(() => {
  jest.clearAllMocks();
  onSnapshot.mockImplementation((_ref, onNext) => {
    pushOrder = (order) => onNext({ data: () => order });
    return jest.fn();
  });
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ orderId: 'order_1', purchaseUrl: 'https://whop.com/checkout/ch_1/' }),
  }));
});

const renderCheckout = async () => {
  const handlers = { onSuccess: jest.fn(), onFailure: jest.fn() };
  await renderAsync(<WhopCheckout items={ITEMS} total={52.48} {...handlers} />);
  return handlers;
};

it('starts a server checkout, opens Whop, and succeeds once the webhook marks the order paid', async () => {
  WebBrowser.openBrowserAsync.mockReturnValue(new Promise(() => {})); // page stays open
  const { onSuccess, onFailure } = await renderCheckout();

  fireEvent.press(screen.getByText('Pay $52.48 with Whop'));
  await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalled());

  expect(global.fetch).toHaveBeenCalledWith(
    'https://functions.example/createWhopCheckout',
    expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer id-token' }) })
  );
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
    items: [{ id: 'classic-logo-tee', quantity: 2, design: 'The Courier · Runner' }],
  });
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://whop.com/checkout/ch_1/', expect.any(Object));

  await act(async () => pushOrder({ status: 'paid', paymentReference: 'pay_1', paymentMethod: 'Whop (card)' }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalled());

  expect(onSuccess).toHaveBeenCalledWith({ reference: 'pay_1', paymentMethod: 'Whop (card)', orderSaved: true });
  expect(WebBrowser.dismissBrowser).toHaveBeenCalled();
  expect(onFailure).not.toHaveBeenCalled();
});

it('reports a declined payment', async () => {
  WebBrowser.openBrowserAsync.mockReturnValue(new Promise(() => {}));
  const { onSuccess, onFailure } = await renderCheckout();

  fireEvent.press(screen.getByText('Pay $52.48 with Whop'));
  await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalled());
  await act(async () => pushOrder({ status: 'failed' }));
  await waitFor(() => expect(onFailure).toHaveBeenCalled());

  expect(onFailure).toHaveBeenCalledWith('Whop declined the payment. Your cart has been kept.');
  expect(onSuccess).not.toHaveBeenCalled();
});

it('waits for a late confirmation after the page closes, then stops waiting', async () => {
  WebBrowser.openBrowserAsync.mockResolvedValue({ type: 'cancel' });
  const { onSuccess, onFailure } = await renderCheckout();

  fireEvent.press(screen.getByText('Pay $52.48 with Whop'));
  expect(await screen.findByText('Waiting for Whop to confirm your payment…')).toBeOnTheScreen();

  // The confirmation window is 20 s; wait it out for real.
  await waitFor(() => expect(onFailure).toHaveBeenCalled(), { timeout: 22000 });
  expect(onFailure).toHaveBeenCalledWith(expect.stringMatching(/has not confirmed a payment yet/));
  expect(onSuccess).not.toHaveBeenCalled();
}, 30000);

it('succeeds when the confirmation arrives after the page is closed', async () => {
  WebBrowser.openBrowserAsync.mockResolvedValue({ type: 'cancel' });
  const { onSuccess } = await renderCheckout();

  fireEvent.press(screen.getByText('Pay $52.48 with Whop'));
  await screen.findByText('Waiting for Whop to confirm your payment…');
  await act(async () => pushOrder({ status: 'paid', paymentReference: 'pay_2' }));

  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ reference: 'pay_2', orderSaved: true })));
});

it('shows the server error when the checkout cannot start', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({ error: 'Whop could not start the checkout.' }) }));
  const { onFailure } = await renderCheckout();

  fireEvent.press(screen.getByText('Pay $52.48 with Whop'));

  await waitFor(() => expect(onFailure).toHaveBeenCalledWith('Whop could not start the checkout.'));
  expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
});

it('shows the test-mode banner and marks sandbox receipts as test payments', async () => {
  WebBrowser.openBrowserAsync.mockReturnValue(new Promise(() => {}));
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ orderId: 'order_3', purchaseUrl: 'https://sandbox.whop.com/checkout/ch_3/', testMode: true }),
  }));
  const { onSuccess } = await renderCheckout();
  expect(screen.getByText('Test mode · no real money')).toBeOnTheScreen();

  fireEvent.press(screen.getByText('Pay $52.48 with Whop'));
  await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalled());
  await act(async () => pushOrder({ status: 'paid', paymentReference: 'pay_3', paymentMethod: 'Whop (card)' }));

  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'Whop (card) · test payment' })));
});
