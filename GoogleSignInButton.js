import React, { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from './firebaseConfig';
import { getAuthErrorMessage } from './authErrors';
import { Button } from './ui';

// OAuth client IDs from Google Cloud Console (see GOOGLE_SIGN_IN_SETUP.md).
const GOOGLE_CLIENT_IDS = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};

// The Google provider throws while rendering if this platform has no client ID.
export const isGoogleSignInConfigured = Boolean(
  GOOGLE_CLIENT_IDS[Platform.select({ ios: 'iosClientId', android: 'androidClientId', default: 'webClientId' })]
);

// Closes the sign-in popup when Google redirects back to the web app.
WebBrowser.maybeCompleteAuthSession();

// Signs in to Firebase with a Google ID token. App.js then runs the same steps
// as an email sign-in: the emailed code check, the profile, and the nickname prompt.
const GoogleSignInButton = ({ disabled, onBusyChange }) => {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    ...GOOGLE_CLIENT_IDS,
    selectAccount: true,
  });
  const [isSigningIn, setIsSigningIn] = useState(false);

  const setBusy = (busy) => {
    setIsSigningIn(busy);
    onBusyChange?.(busy);
  };

  useEffect(() => {
    if (!response) return;
    if (response.type === 'error') {
      setBusy(false);
      Alert.alert('Google Sign-In Error', response.error?.message || 'Google sign-in failed. Please try again.');
      return;
    }
    if (response.type !== 'success') {
      setBusy(false); // Cancelled or dismissed.
      return;
    }

    const idToken = response.params?.id_token;
    if (!idToken) {
      setBusy(false);
      Alert.alert('Google Sign-In Error', 'Google did not return an ID token. Please try again.');
      return;
    }

    signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
      .catch((error) => Alert.alert('Authentication Error', getAuthErrorMessage(error)))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const handlePress = async () => {
    setBusy(true);
    try {
      const result = await promptAsync();
      if (result.type !== 'success') setBusy(false);
    } catch (error) {
      setBusy(false);
      Alert.alert('Google Sign-In Error', error.message || 'Google sign-in failed. Please try again.');
    }
  };

  return (
    <Button
      title="Continue with Google"
      variant="secondary"
      fullWidth
      loading={isSigningIn}
      disabled={disabled || !request}
      onPress={handlePress}
    />
  );
};

export default GoogleSignInButton;
