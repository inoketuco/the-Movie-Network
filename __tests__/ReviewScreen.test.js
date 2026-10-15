import React from 'react';
import { fireEventAsync, renderAsync, screen } from '@testing-library/react-native';
import { addDoc, onSnapshot } from 'firebase/firestore';
import ReviewScreen from '../ReviewScreen';

jest.mock('../firebaseConfig', () => ({
  auth: { currentUser: { uid: 'user-1', email: 'fan@example.com' } },
  db: {},
  isFirebaseConfigured: true,
}));
jest.mock('firebase/firestore', () => ({
  addDoc: jest.fn(async () => ({ id: 'review-1' })),
  collection: jest.fn((_db, name) => name),
  onSnapshot: jest.fn(),
  query: jest.fn((...parts) => parts),
  serverTimestamp: jest.fn(() => 'server-time'),
  where: jest.fn((...parts) => parts),
}));

const MOVIE = { id: 42, title: 'Runner', release_date: '2026-05-01', vote_average: 7.6 };
const GIF_URL = 'https://media.giphy.com/runner.gif';

const snapshotOf = (reviews) => ({
  docs: reviews.map(({ id, ...data }) => ({ id, data: () => data })),
});

beforeEach(() => {
  jest.clearAllMocks();
  onSnapshot.mockImplementation((_query, onNext) => {
    onNext(snapshotOf([{ id: 'r1', userId: 'someone-else', reviewText: 'Loved the chase scenes.', gifUrl: GIF_URL }]));
    return jest.fn();
  });
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ data: [{ id: 'g1', images: { fixed_height: { url: GIF_URL } } }] }),
  }));
});

it('loads existing reviews for this movie', async () => {
  await renderAsync(<ReviewScreen movie={MOVIE} isSignedIn />);

  expect(screen.getByText('Reviews for Runner (1)')).toBeOnTheScreen();
  expect(screen.getByText('Loved the chase scenes.')).toBeOnTheScreen();
});

it('suggests GIFs related to the movie being reviewed', async () => {
  await renderAsync(<ReviewScreen movie={MOVIE} isSignedIn />);

  expect(await screen.findAllByLabelText('Choose this GIF')).toHaveLength(1);
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('q=Runner'));
});

it('posts a review with a GIF after the verification code is entered', async () => {
  await renderAsync(<ReviewScreen movie={MOVIE} isSignedIn nickname="Reel Fan" />);

  await fireEventAsync.changeText(screen.getByPlaceholderText('What did you think of Runner?'), '  Tense and fun.  ');
  await fireEventAsync.press((await screen.findAllByLabelText('Choose this GIF'))[0]);
  expect(screen.getByText('Reaction ready')).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByText('Verify and post review'));
  await fireEventAsync.changeText(screen.getByPlaceholderText('000000'), '111111');
  await fireEventAsync.press(screen.getByText('Verify and post'));
  expect(screen.getByText('That code is not correct. Enter 123456.')).toBeOnTheScreen();
  expect(addDoc).not.toHaveBeenCalled();

  await fireEventAsync.changeText(screen.getByPlaceholderText('000000'), '123456');
  await fireEventAsync.press(screen.getByText('Verify and post'));

  expect(addDoc).toHaveBeenCalledWith(
    'reviews',
    expect.objectContaining({ userId: 'user-1', authorName: 'Reel Fan', movieId: 42, reviewText: 'Tense and fun.', gifUrl: GIF_URL })
  );
  expect(await screen.findByText('Review posted! You can see it below.')).toBeOnTheScreen();
});

it('keeps the post button disabled until there is text and a GIF', async () => {
  await renderAsync(<ReviewScreen movie={MOVIE} isSignedIn />);

  expect(screen.getByText('Write a review and choose a GIF to continue.')).toBeOnTheScreen();
  await fireEventAsync.press(screen.getByText('Verify and post review'));
  expect(screen.queryByText('One quick check')).not.toBeOnTheScreen();
});

it('shows guests a sign-in prompt instead of the review form, but still shows reviews', async () => {
  const onRequestSignIn = jest.fn();
  await renderAsync(<ReviewScreen movie={MOVIE} onRequestSignIn={onRequestSignIn} />);

  expect(screen.getByText('Sign in to post your review')).toBeOnTheScreen();
  expect(screen.queryByPlaceholderText('What did you think of Runner?')).not.toBeOnTheScreen();
  expect(screen.getByText('Loved the chase scenes.')).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByText('Sign in to review'));
  expect(onRequestSignIn).toHaveBeenLastCalledWith('signIn');
  await fireEventAsync.press(screen.getByText('Create a free account'));
  expect(onRequestSignIn).toHaveBeenLastCalledWith('register');
});

it('shows reviewers by nickname, marks your own, and falls back for older reviews', async () => {
  onSnapshot.mockImplementation((_query, onNext) => {
    onNext(snapshotOf([
      { id: 'r1', userId: 'someone-else', authorName: 'Cine Sam', reviewText: 'Great score.' },
      { id: 'r2', userId: 'user-1', authorName: 'Reel Fan', reviewText: 'Loved it.' },
      { id: 'r3', userId: 'old-user', reviewText: 'Posted before nicknames.' },
    ]));
    return jest.fn();
  });
  await renderAsync(<ReviewScreen movie={MOVIE} isSignedIn nickname="Reel Fan" />);

  expect(screen.getByText('Cine Sam')).toBeOnTheScreen();
  expect(screen.getByText('Reel Fan (you)')).toBeOnTheScreen();
  expect(screen.getByText('Movie fan')).toBeOnTheScreen();
});
