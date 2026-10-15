import React from 'react';
import { fireEventAsync, renderAsync, screen } from '@testing-library/react-native';
import LoginVerificationScreen from '../LoginVerificationScreen';
import { requestLoginCode, verifyLoginCode } from '../loginVerification';

jest.mock('../loginVerification', () => ({
  requestLoginCode: jest.fn(),
  verifyLoginCode: jest.fn(),
}));

const renderScreen = (props = {}) =>
  renderAsync(
    <LoginVerificationScreen email="fan@example.com" onVerified={jest.fn()} onSignOut={jest.fn()} {...props} />
  );

beforeEach(() => {
  jest.clearAllMocks();
  requestLoginCode.mockResolvedValue({ sent: true, email: 'fa*@example.com' });
});

it('emails a code as soon as the screen opens', async () => {
  await renderScreen();

  expect(await screen.findByText(/We sent a 6-digit code to fa\*@example.com/)).toBeOnTheScreen();
  expect(requestLoginCode).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Resend code in \d+s/)).toBeOnTheScreen();
});

it('continues into the app when the code is correct', async () => {
  verifyLoginCode.mockResolvedValue();
  const onVerified = jest.fn();
  await renderScreen({ onVerified });

  await fireEventAsync.changeText(screen.getByLabelText('Verification code'), '123456');
  await fireEventAsync.press(screen.getByText('Verify and continue'));

  expect(verifyLoginCode).toHaveBeenCalledWith('123456');
  expect(onVerified).toHaveBeenCalled();
});

it('shows the server error and remaining attempts for a wrong code', async () => {
  verifyLoginCode.mockRejectedValue(Object.assign(new Error('That code is not correct.'), { attemptsLeft: 3 }));
  const onVerified = jest.fn();
  await renderScreen({ onVerified });

  await fireEventAsync.changeText(screen.getByLabelText('Verification code'), '000000');
  await fireEventAsync.press(screen.getByText('Verify and continue'));

  expect(await screen.findByText('That code is not correct. 3 attempts left.')).toBeOnTheScreen();
  expect(onVerified).not.toHaveBeenCalled();
});

it('rejects incomplete codes without calling the server and ignores non-digits', async () => {
  await renderScreen();

  await fireEventAsync.changeText(screen.getByLabelText('Verification code'), '12a4');
  expect(screen.getByLabelText('Verification code').props.value).toBe('124');
  await fireEventAsync.press(screen.getByText('Verify and continue'));

  expect(screen.getByText('Enter the 6-digit code from your email.')).toBeOnTheScreen();
  expect(verifyLoginCode).not.toHaveBeenCalled();
});

it('explains when the code could not be sent and lets the user sign out', async () => {
  requestLoginCode.mockRejectedValue(new Error('Could not send the sign-in code.'));
  const onSignOut = jest.fn();
  await renderScreen({ onSignOut });

  expect(await screen.findByText('Could not send the sign-in code.')).toBeOnTheScreen();
  await fireEventAsync.press(screen.getByText('Use a different account'));
  expect(onSignOut).toHaveBeenCalled();
});
