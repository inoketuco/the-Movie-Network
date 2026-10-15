import { auth } from './firebaseConfig';
import { withTimeout } from './withTimeout';

// e.g. https://us-central1-<project-id>.cloudfunctions.net (see MFA_SETUP.md)
const FUNCTIONS_BASE_URL = process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL?.replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 20000;

export const isLoginVerificationConfigured = Boolean(FUNCTIONS_BASE_URL);

const callFunction = async (name, body = {}) => {
  const idToken = await auth?.currentUser?.getIdToken();
  if (!idToken) throw new Error('Sign in again to continue.');

  const response = await withTimeout(
    fetch(`${FUNCTIONS_BASE_URL}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    }),
    REQUEST_TIMEOUT_MS,
    'The server did not respond. Check your connection and try again.'
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), data);
  }
  return data;
};

// The verifyLoginCode function stamps the sign-in session's auth_time into a
// custom claim, so a session stays verified until the user signs out.
export const isSessionVerified = async (user) => {
  const { claims } = await user.getIdTokenResult();
  return claims.mfaAuthTime != null && claims.mfaAuthTime === claims.auth_time;
};

export const requestLoginCode = () => callFunction('sendLoginCode');

export const verifyLoginCode = async (code) => {
  await callFunction('verifyLoginCode', { code });
  // Refresh the ID token so it carries the new claim that firestore.rules check.
  await auth.currentUser.getIdToken(true);
};
