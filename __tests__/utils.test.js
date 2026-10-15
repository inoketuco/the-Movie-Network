import fs from 'fs';
import path from 'path';
import { getAuthErrorMessage } from '../authErrors';
import { formatRating } from '../Dashboard';
import { withTimeout } from '../withTimeout';

const projectRoot = path.resolve(__dirname, '..');

describe('withTimeout', () => {
  it('rejects a write that never settles', async () => {
    await expect(withTimeout(new Promise(() => {}), 20, 'The server did not respond.')).rejects.toMatchObject({
      code: 'timeout',
      message: 'The server did not respond.',
    });
  });

  it('passes through results and errors that arrive in time', async () => {
    await expect(withTimeout(Promise.resolve('saved'), 1000, 'timeout')).resolves.toBe('saved');
    await expect(withTimeout(Promise.reject(new Error('permission-denied')), 1000, 'timeout')).rejects.toThrow('permission-denied');
  });
});

describe('getAuthErrorMessage', () => {
  it('shows readable messages for Firebase auth errors', () => {
    expect(getAuthErrorMessage({ code: 'auth/invalid-credential' })).toBe('The email or password is incorrect.');
    expect(getAuthErrorMessage({ code: 'auth/invalid-email' })).toBe('Enter a valid email address.');
    expect(getAuthErrorMessage({ code: 'auth/unknown', message: 'Raw message' })).toBe('Raw message');
  });
});

describe('formatRating', () => {
  it('shows "Not yet rated" for movies without votes instead of 0.0', () => {
    expect(formatRating({ vote_average: 7.26, vote_count: 120 })).toBe('★ 7.3');
    expect(formatRating({ vote_average: 0, vote_count: 0 })).toBe('Not yet rated');
  });
});

// React Native 0.86 removed StyleSheet.absoluteFillObject; spreading it silently yields
// no styles, which broke the auth backdrop, review hero, and store checkout overlays.
it('app code does not use the removed StyleSheet.absoluteFillObject API', () => {
  const sourceFiles = fs.readdirSync(projectRoot).filter((name) => name.endsWith('.js'));
  const offenders = sourceFiles.filter((name) =>
    fs.readFileSync(path.join(projectRoot, name), 'utf8').includes('absoluteFillObject')
  );
  expect(offenders).toEqual([]);
});
