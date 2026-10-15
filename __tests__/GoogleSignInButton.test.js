import React from 'react';
import { Alert } from 'react-native';
import { fireEventAsync, renderAsync, screen, waitFor } from '@testing-library/react-native';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import GoogleSignInButton from '../GoogleSignInButton';

jest.mock('../firebaseConfig', () => ({ auth: { name: 'test-auth' }, isFirebaseConfigured: true }));
jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: { credential: jest.fn((idToken) => ({ providerId: 'google.com', idToken })) },
  signInWithCredential: jest.fn(),
}));

let promptAsync;
const mockGoogleResponse = (response) => {
  Google.useIdTokenAuthRequest.mockReturnValue([{ url: 'https://accounts.google.com' }, response, promptAsync]);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  promptAsync = jest.fn(async () => ({ type: 'success' }));
  mockGoogleResponse(null);
});

it('opens the Google prompt when pressed', async () => {
  await renderAsync(<GoogleSignInButton />);

  await fireEventAsync.press(screen.getByText('Continue with Google'));

  expect(promptAsync).toHaveBeenCalled();
});

it('signs in to Firebase with the Google ID token', async () => {
  signInWithCredential.mockResolvedValue({});
  mockGoogleResponse({ type: 'success', params: { id_token: 'google-id-token' } });

  await renderAsync(<GoogleSignInButton />);

  await waitFor(() =>
    expect(signInWithCredential).toHaveBeenCalledWith({ name: 'test-auth' }, { providerId: 'google.com', idToken: 'google-id-token' })
  );
  expect(GoogleAuthProvider.credential).toHaveBeenCalledWith('google-id-token');
});

it('shows a readable message when Firebase rejects the sign-in', async () => {
  signInWithCredential.mockRejectedValue({ code: 'auth/network-request-failed' });
  mockGoogleResponse({ type: 'success', params: { id_token: 'google-id-token' } });

  await renderAsync(<GoogleSignInButton />);

  await waitFor(() =>
    expect(Alert.alert).toHaveBeenCalledWith('Authentication Error', 'Could not reach the server. Check your connection and try again.')
  );
});

it('does nothing when the user cancels the Google prompt', async () => {
  mockGoogleResponse({ type: 'cancel' });

  await renderAsync(<GoogleSignInButton />);

  expect(signInWithCredential).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

it('is disabled until the Google request is ready', async () => {
  Google.useIdTokenAuthRequest.mockReturnValue([null, null, promptAsync]);
  await renderAsync(<GoogleSignInButton />);

  await fireEventAsync.press(screen.getByText('Continue with Google'));

  expect(promptAsync).not.toHaveBeenCalled();
});
