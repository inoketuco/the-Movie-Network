const mockUser = {
  getIdToken: jest.fn(async () => 'id-token'),
  getIdTokenResult: jest.fn(),
};

jest.mock('../firebaseConfig', () => ({ auth: { currentUser: mockUser } }));

const loadModule = () => {
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL = 'https://functions.example.com/';
  let loaded;
  jest.isolateModules(() => {
    loaded = require('../loginVerification');
  });
  return loaded;
};

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  delete process.env.EXPO_PUBLIC_FUNCTIONS_BASE_URL;
  delete global.fetch;
});

it('treats a session as verified only when the claim matches this sign-in', async () => {
  const { isSessionVerified } = loadModule();

  mockUser.getIdTokenResult.mockResolvedValueOnce({ claims: { auth_time: 100, mfaAuthTime: 100 } });
  await expect(isSessionVerified(mockUser)).resolves.toBe(true);

  mockUser.getIdTokenResult.mockResolvedValueOnce({ claims: { auth_time: 200, mfaAuthTime: 100 } });
  await expect(isSessionVerified(mockUser)).resolves.toBe(false);

  mockUser.getIdTokenResult.mockResolvedValueOnce({ claims: { auth_time: 200 } });
  await expect(isSessionVerified(mockUser)).resolves.toBe(false);
});

it('sends the ID token to the function and refreshes it after a correct code', async () => {
  const { isLoginVerificationConfigured, verifyLoginCode } = loadModule();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ verified: true }) }));

  await verifyLoginCode('123456');

  expect(isLoginVerificationConfigured).toBe(true);
  expect(global.fetch).toHaveBeenCalledWith(
    'https://functions.example.com/verifyLoginCode',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer id-token' }),
      body: JSON.stringify({ code: '123456' }),
    })
  );
  expect(mockUser.getIdToken).toHaveBeenLastCalledWith(true);
});

it('passes the server error message and details back to the screen', async () => {
  const { requestLoginCode } = loadModule();
  global.fetch = jest.fn(async () => ({
    ok: false,
    json: async () => ({ error: 'Wait 30 seconds before requesting another code.', waitSeconds: 30 }),
  }));

  await expect(requestLoginCode()).rejects.toMatchObject({
    message: 'Wait 30 seconds before requesting another code.',
    waitSeconds: 30,
  });
});
