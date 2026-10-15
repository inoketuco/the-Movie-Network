import React from 'react';
import { act, fireEventAsync, renderAsync, screen, waitFor } from '@testing-library/react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { getDoc, setDoc } from 'firebase/firestore';
import App from '../App';
import { auth as mockAuth } from '../firebaseConfig';

// End-to-end flows through the app shell: guest browsing, navigation, the sign-in
// screen, movie pages and the nickname prompt.

jest.mock('../firebaseConfig', () => ({ auth: { currentUser: null }, db: {}, isFirebaseConfigured: true }));
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
  signOut: jest.fn(async () => {}),
  updateProfile: jest.fn(async () => {}),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, ...path) => path.join('/')),
  getDoc: jest.fn(),
  setDoc: jest.fn(async () => {}),
  serverTimestamp: jest.fn(() => 'server-time'),
  collection: jest.fn((_db, name) => name),
  query: jest.fn((...parts) => parts),
  where: jest.fn((...parts) => parts),
  onSnapshot: jest.fn((_query, onNext) => {
    onNext({ docs: [] });
    return jest.fn();
  }),
  addDoc: jest.fn(),
}));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const Mock = ({ children }) => <View>{children}</View>;
  return { __esModule: true, default: Mock, Marker: Mock, Callout: Mock };
});

const MOVIE = {
  id: 7,
  title: 'Runner',
  overview: 'A courier races the clock.',
  poster_path: '/runner.jpg',
  backdrop_path: '/runner-wide.jpg',
  release_date: '2026-05-01',
  genre_ids: [28],
  vote_average: 7.6,
  vote_count: 1200,
};

let reportUser;
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.currentUser = null;
  onAuthStateChanged.mockImplementation((_auth, callback) => {
    reportUser = callback;
    return jest.fn();
  });
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    json: async () => (String(url).includes('/credits') ? { cast: [] } : { results: [MOVIE] }),
  }));
});

const renderSignedOut = async () => {
  await renderAsync(<App />);
  await act(async () => reportUser(null));
  await screen.findByText('Runner');
};

it('lets guests browse the tabs without signing in', async () => {
  await renderSignedOut();

  expect(screen.getByText('Trending Movies')).toBeOnTheScreen();
  expect(screen.getByText('★ 7.6')).toBeOnTheScreen();
  expect(screen.getByText('2026 · Action')).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByRole('tab', { name: 'Store' }));
  expect(await screen.findByText('Merchandise featuring this week\'s trending movies. Customize any item with the movie or character you love.')).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: 'Store', selected: true })).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByRole('tab', { name: 'Cinemas' }));
  expect(await screen.findByText(/Location permission is required/)).toBeOnTheScreen();
});

it('opens the sign-in screen on request and returns to browsing', async () => {
  await renderSignedOut();

  await fireEventAsync.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(screen.getByText('Welcome back')).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByRole('button', { name: 'Continue browsing' }));
  expect(screen.getByText('Trending Movies')).toBeOnTheScreen();
});

it('opens a movie page where guests are asked to sign in before reviewing', async () => {
  await renderSignedOut();

  await fireEventAsync.press(screen.getByText('Runner'));
  expect(screen.getByText('Sign in to post your review')).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByRole('button', { name: 'Sign in to review' }));
  expect(screen.getByText('Welcome back')).toBeOnTheScreen();
  expect(screen.getByText('Sign in to post your review of Runner.')).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByRole('button', { name: 'Continue browsing' }));
  await fireEventAsync.press(screen.getByRole('button', { name: 'Back to movies' }));
  expect(screen.getByText('Trending Movies')).toBeOnTheScreen();
});

it('asks a signed-in user without a nickname to choose one, then greets them', async () => {
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'user' }) });
  const user = { uid: 'user-1', email: 'fan@example.com' };
  mockAuth.currentUser = user;
  await renderAsync(<App />);
  await act(async () => reportUser(user));

  expect(await screen.findByText('Choose your nickname')).toBeOnTheScreen();
  await fireEventAsync.changeText(screen.getByPlaceholderText('e.g. PopcornQueen'), 'Reel Fan');
  await fireEventAsync.press(screen.getByRole('button', { name: 'Save nickname' }));

  await waitFor(() => expect(setDoc).toHaveBeenCalledWith('users/user-1', { nickname: 'Reel Fan' }, { merge: true }));
  expect(await screen.findByText('Reel Fan')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Log out' })).toBeOnTheScreen();
});
