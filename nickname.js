// Nicknames are display names shown on reviews; they do not need to be unique.
// firestore.rules enforces the same 2-20 character limit.
export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 20;

export const cleanNickname = (value) => String(value || '').trim().replace(/\s+/g, ' ');

export const nicknameError = (value) => {
  const nickname = cleanNickname(value);
  if (nickname.length < NICKNAME_MIN_LENGTH) return `Use at least ${NICKNAME_MIN_LENGTH} characters.`;
  if (nickname.length > NICKNAME_MAX_LENGTH) return `Use at most ${NICKNAME_MAX_LENGTH} characters.`;
  if (!/^[A-Za-z0-9À-ÖØ-öø-ÿ _.-]+$/.test(nickname)) return 'Use letters, numbers, spaces, dots, dashes or underscores.';
  return '';
};

// The sign-up form picks the nickname before the account exists; App.js saves it into
// the new profile once Firebase reports the signed-in user.
let pendingNickname = null;
export const rememberNicknameForSignUp = (nickname) => {
  pendingNickname = cleanNickname(nickname);
};
export const takePendingNickname = () => {
  const nickname = pendingNickname;
  pendingNickname = null;
  return nickname;
};
