const AUTH_ERROR_MESSAGES = {
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/invalid-credential': 'The email or password is incorrect.',
  'auth/wrong-password': 'The email or password is incorrect.',
  'auth/user-not-found': 'The email or password is incorrect.',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/weak-password': 'Your password must contain at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/network-request-failed': 'Could not reach the server. Check your connection and try again.',
};

export const getAuthErrorMessage = (error) =>
  AUTH_ERROR_MESSAGES[error?.code] || error?.message || 'Something went wrong. Please try again.';
