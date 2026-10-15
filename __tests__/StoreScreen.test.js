import React from 'react';
import { act, fireEvent, fireEventAsync, renderAsync, screen } from '@testing-library/react-native';
import { addDoc } from 'firebase/firestore';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import StoreScreen from '../StoreScreen';

jest.mock('../firebaseConfig', () => ({
  auth: { currentUser: { uid: 'user-1', email: 'fan@example.com' } },
  db: {},
  isFirebaseConfigured: true,
}));
jest.mock('firebase/firestore', () => ({
  addDoc: jest.fn(async () => ({ id: 'order-1' })),
  collection: jest.fn((_db, name) => name),
  serverTimestamp: jest.fn(() => 'server-time'),
}));

const addFirstProduct = async (times = 1) => {
  for (let i = 0; i < times; i += 1) {
    await fireEventAsync.press(screen.getAllByText('Add to cart')[0]);
  }
};

// Pays through the demo card form. The demo takes 1.5 s to "process"; press and
// wait inside one act() so the order save and PDF generation that follow are applied.
const payWithCard = async (cardNumber = '4242 4242 4242 4242') => {
  await fireEventAsync.press(screen.getByLabelText('Cart (1)'));
  await fireEventAsync.press(screen.getByText('Proceed to checkout'));
  await fireEventAsync.changeText(screen.getByPlaceholderText('Movie Fan'), 'Movie Fan');
  await fireEventAsync.changeText(screen.getByPlaceholderText('1234 5678 9012 3456'), cardNumber);
  await fireEventAsync.changeText(screen.getByPlaceholderText('MM/YY'), '1234');
  await fireEventAsync.changeText(screen.getByPlaceholderText('123'), '123');
  await fireEventAsync.changeText(screen.getByPlaceholderText('e.g. 1000'), '1000');
  await act(async () => {
    fireEvent.press(screen.getByText(/^Pay \$/));
    await new Promise((resolve) => setTimeout(resolve, 1700));
  });
};

const MOVIES = [
  { id: 7, title: 'Runner', poster_path: '/runner.jpg', backdrop_path: '/runner-wide.jpg' },
  { id: 8, title: 'Orbit', poster_path: '/orbit.jpg', backdrop_path: '/orbit-wide.jpg' },
];
const CAST = {
  7: [{ id: 101, name: 'Ana Actor', character: 'The Courier', profile_path: '/ana.jpg' }],
  8: [
    { id: 201, name: 'Ben Actor', character: 'Commander Hale', profile_path: '/ben.jpg' },
    { id: 202, name: 'Cy Actor', character: 'Captain Vale', profile_path: '/cy.jpg' },
  ],
};

const renderStore = async (props = { isSignedIn: true }) => {
  await renderAsync(<StoreScreen {...props} />);
  // Wait for the TMDb art and characters, so the featured designs are settled.
  await screen.findAllByText('Featuring The Courier · Runner');
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async (url) => {
    const credits = url.match(/movie\/(\d+)\/credits/);
    const body = credits ? { cast: CAST[credits[1]] || [] } : { results: MOVIES };
    return { ok: true, json: async () => body };
  });
});

it('caps each item at 10, matching the payment server', async () => {
  await renderStore();

  await addFirstProduct(12);

  expect(screen.getByLabelText('Cart (10)')).toBeOnTheScreen();
});

it('shows cart totals with 5% tax', async () => {
  await renderStore();
  await addFirstProduct(2);

  await fireEventAsync.press(screen.getByLabelText('Cart (2)'));

  expect(screen.getByText('$49.98')).toBeOnTheScreen(); // subtotal: 2 x $24.99
  expect(screen.getByText('$2.50')).toBeOnTheScreen(); // tax
  expect(screen.getByText('$52.48')).toBeOnTheScreen(); // total
});

it('shows feedback for a declined payment and keeps the cart', async () => {
  await renderStore();
  await addFirstProduct();

  await payWithCard('4000 0000 0000 0002');

  expect(screen.getByText('Your card was declined.')).toBeOnTheScreen();
  expect(addDoc).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Cart (1)')).toBeOnTheScreen();
});

it('saves the order and generates the PDF receipt automatically after payment', async () => {
  await renderStore();
  await addFirstProduct();

  await payWithCard();

  expect(await screen.findByText('Payment successful', {}, { timeout: 3000 })).toBeOnTheScreen();
  expect(await screen.findByText(/PDF receipt ready: receipt-DEMO-\d+\.pdf/)).toBeOnTheScreen();
  expect(Print.printToFileAsync).toHaveBeenCalledWith(expect.objectContaining({ base64: true }));
  expect(Print.printToFileAsync.mock.calls[0][0].html).toContain('Character T-Shirt — The Courier · Runner');
  expect(Print.printToFileAsync.mock.calls[0][0].html).toContain('Visa •••• 4242 (demo)');
  expect(addDoc).toHaveBeenCalledWith(
    'orders',
    expect.objectContaining({ userId: 'user-1', status: 'paid', total: 26.24, currency: 'USD' })
  );
});

it('lets the user save and share the receipt PDF', async () => {
  await renderStore();
  await addFirstProduct();
  await payWithCard();
  await screen.findByText(/PDF receipt ready/, {}, { timeout: 3000 });

  await fireEventAsync.press(screen.getByText('Share PDF'));

  expect(Sharing.shareAsync).toHaveBeenCalledWith(
    expect.stringMatching(/^file:\/\/\/cache\/receipt-DEMO-\d+\.pdf$/),
    expect.objectContaining({ mimeType: 'application/pdf' })
  );
});

it('warns on the receipt when the order cannot be saved, without losing the receipt', async () => {
  addDoc.mockRejectedValueOnce(new Error('permission-denied'));
  await renderStore();
  await addFirstProduct();

  await payWithCard();

  expect(await screen.findByText(/order could not be saved to your account/, {}, { timeout: 3000 })).toBeOnTheScreen();
  expect(await screen.findByText(/PDF receipt ready/)).toBeOnTheScreen();
});

it('offers a retry when the PDF cannot be generated', async () => {
  Print.printToFileAsync.mockRejectedValueOnce(new Error('Printing failed'));
  await renderStore();
  await addFirstProduct();

  await payWithCard();

  expect(await screen.findByText('Printing failed', {}, { timeout: 3000 })).toBeOnTheScreen();
  await fireEventAsync.press(screen.getByText('Try creating the PDF again'));
  expect(await screen.findByText(/PDF receipt ready/)).toBeOnTheScreen();
});

it('lets guests fill a cart but asks them to sign in before checkout', async () => {
  const onRequestSignIn = jest.fn();
  await renderStore({ onRequestSignIn });
  await addFirstProduct(1);

  await fireEventAsync.press(screen.getByLabelText('Cart (1)'));
  await fireEventAsync.press(screen.getByText('Proceed to checkout'));

  expect(screen.getByText('Sign in to complete your purchase')).toBeOnTheScreen();
  expect(screen.queryByText('Secure checkout')).not.toBeOnTheScreen();

  await fireEventAsync.press(screen.getByText('Keep browsing'));
  expect(screen.queryByText('Sign in to complete your purchase')).not.toBeOnTheScreen();

  await fireEventAsync.press(screen.getByText('Proceed to checkout'));
  await fireEventAsync.press(screen.getByText(/Sign in to checkout/));
  expect(onRequestSignIn).toHaveBeenCalledWith('signIn');
});

it('shows each product with art and characters from trending movies', async () => {
  await renderStore();

  expect(screen.getAllByText('Featuring Orbit').length).toBeGreaterThan(0); // alternate products use the second movie
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/movie/7/credits'));
});

it('lets the user design their own character shirt and keeps each design as its own cart line', async () => {
  await renderStore();
  await addFirstProduct();

  await fireEventAsync.press(screen.getByLabelText('Customize Character T-Shirt'));
  await fireEventAsync.press(screen.getByLabelText('Choose Orbit'));
  // The first character is picked automatically; then the user picks another.
  expect(await screen.findByText('Commander Hale · Orbit')).toBeOnTheScreen();
  await fireEventAsync.press(screen.getByLabelText('Choose Captain Vale'));
  expect(screen.getByText('Captain Vale · Orbit')).toBeOnTheScreen();
  await fireEventAsync.press(screen.getByText('Add to cart · $24.99'));

  expect(screen.getByLabelText('Cart (2)')).toBeOnTheScreen();
  await fireEventAsync.press(screen.getByLabelText('Cart (2)'));
  expect(screen.getByText('The Courier · Runner')).toBeOnTheScreen();
  expect(screen.getByText('Captain Vale · Orbit')).toBeOnTheScreen();
});

it('still sells products when TMDb is unavailable', async () => {
  global.fetch = jest.fn(async () => { throw new TypeError('Network request failed'); });
  await renderAsync(<StoreScreen isSignedIn />);

  await addFirstProduct();

  expect(screen.getByLabelText('Cart (1)')).toBeOnTheScreen();
  expect(screen.queryByText(/Featuring/)).not.toBeOnTheScreen();
});

it('checks the card details before taking a demo payment', async () => {
  await renderStore();
  await addFirstProduct();
  await fireEventAsync.press(screen.getByLabelText('Cart (1)'));
  await fireEventAsync.press(screen.getByText('Proceed to checkout'));

  await fireEventAsync.changeText(screen.getByPlaceholderText('1234 5678 9012 3456'), '4242 4242 4242 4241');
  await fireEventAsync.changeText(screen.getByPlaceholderText('MM/YY'), '0120');
  await fireEventAsync.press(screen.getByText(/^Pay \$/));

  expect(screen.getByText('Enter the name on the card.')).toBeOnTheScreen();
  expect(screen.getByText('Enter a valid card number.')).toBeOnTheScreen();
  expect(screen.getByText('This card has expired.')).toBeOnTheScreen();
  expect(screen.queryByText(/Processing payment/)).not.toBeOnTheScreen();
  expect(addDoc).not.toHaveBeenCalled();
});
