import { cleanNickname, nicknameError, rememberNicknameForSignUp, takePendingNickname } from '../nickname';

it('tidies spacing', () => {
  expect(cleanNickname('  Popcorn   Queen ')).toBe('Popcorn Queen');
});

it('accepts 2-20 characters of letters, numbers and simple punctuation', () => {
  expect(nicknameError('Jo')).toBe('');
  expect(nicknameError('Zoë_the-critic.99')).toBe('');
  expect(nicknameError('J')).toBe('Use at least 2 characters.');
  expect(nicknameError('x'.repeat(21))).toBe('Use at most 20 characters.');
  expect(nicknameError('<script>')).toMatch(/Use letters, numbers/);
});

it('hands the sign-up nickname over exactly once', () => {
  rememberNicknameForSignUp(' Reel  Fan ');
  expect(takePendingNickname()).toBe('Reel Fan');
  expect(takePendingNickname()).toBeNull();
});
