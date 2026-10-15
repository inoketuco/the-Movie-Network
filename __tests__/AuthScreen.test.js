import React from 'react';
import { Alert } from 'react-native';
import { fireEventAsync, renderAsync, screen } from '@testing-library/react-native';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import AuthScreen from '../AuthScreen';
import { takePendingNickname } from '../nickname';

jest.mock('../firebaseConfig', () => ({ auth: { name: 'test-auth' }, isFirebaseConfigured: true }));
jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ results: [] }) }));
});

const fillForm = async (email, password) => {
  await fireEventAsync.changeText(screen.getByPlaceholderText('you@example.com'), email);
  await fireEventAsync.changeText(screen.getByPlaceholderText(/password|characters/i), password);
};

it('signs in with a trimmed, lower-cased email', async () => {
  signInWithEmailAndPassword.mockResolvedValue({});
  await renderAsync(<AuthScreen />);

  await fillForm('  Fan@Example.com ', 'secret123');
  await fireEventAsync.press(screen.getByText('Sign in'));

  expect(signInWithEmailAndPassword).toHaveBeenCalledWith({ name: 'test-auth' }, 'fan@example.com', 'secret123');
});

it('asks for both fields before contacting Firebase', async () => {
  await renderAsync(<AuthScreen />);

  await fireEventAsync.press(screen.getByText('Sign in'));

  expect(Alert.alert).toHaveBeenCalledWith('Missing Details', 'Enter your email and password.');
  expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
});

it('shows a readable message when the password is wrong', async () => {
  signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/invalid-credential', message: 'Firebase: Error' });
  await renderAsync(<AuthScreen />);

  await fillForm('fan@example.com', 'wrong-pass');
  await fireEventAsync.press(screen.getByText('Sign in'));

  expect(Alert.alert).toHaveBeenCalledWith('Authentication Error', 'The email or password is incorrect.');
});

it('registers new accounts with a nickname and enforces the 6-character password minimum', async () => {
  createUserWithEmailAndPassword.mockResolvedValue({});
  await renderAsync(<AuthScreen />);
  await fireEventAsync.press(screen.getByText('Create account'));

  await fillForm('new@example.com', 'abcdef');
  await fireEventAsync.press(screen.getByText('Create account'));
  expect(Alert.alert).toHaveBeenCalledWith('Choose a Nickname', 'Use at least 2 characters.');
  expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();

  await fireEventAsync.changeText(screen.getByPlaceholderText('How movie fans will see you'), '  Popcorn   Queen ');
  await fillForm('new@example.com', 'abc');
  await fireEventAsync.press(screen.getByText('Create account'));
  expect(Alert.alert).toHaveBeenCalledWith('Password Too Short', expect.any(String));
  expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();

  await fillForm('new@example.com', 'abcdef');
  await fireEventAsync.press(screen.getByText('Create account'));
  expect(createUserWithEmailAndPassword).toHaveBeenCalledWith({ name: 'test-auth' }, 'new@example.com', 'abcdef');
  // App.js picks this up when it creates the new profile.
  expect(takePendingNickname()).toBe('Popcorn Queen');
});

it('does not ask for a nickname when signing in', async () => {
  await renderAsync(<AuthScreen />);
  expect(screen.queryByPlaceholderText('How movie fans will see you')).not.toBeOnTheScreen();
});

it('lets guests go back to browsing and explains why sign-in is needed', async () => {
  const onClose = jest.fn();
  await renderAsync(<AuthScreen initialMode="register" reason="Sign in to post your review of Runner." onClose={onClose} />);

  expect(screen.getByText('Create your account')).toBeOnTheScreen();
  expect(screen.getByText(/Sign in to post your review of Runner\./)).toBeOnTheScreen();
  await fireEventAsync.press(screen.getByText(/Continue browsing/));
  expect(onClose).toHaveBeenCalled();
});
