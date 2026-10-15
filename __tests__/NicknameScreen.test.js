import React from 'react';
import { fireEventAsync, renderAsync, screen } from '@testing-library/react-native';
import NicknameScreen from '../NicknameScreen';

it('validates, then saves the cleaned nickname', async () => {
  const onSave = jest.fn(async () => {});
  await renderAsync(<NicknameScreen onSave={onSave} onSignOut={jest.fn()} />);

  expect(screen.getByText('Choose your nickname')).toBeOnTheScreen();
  await fireEventAsync.press(screen.getByText('Save nickname'));
  expect(screen.getByText('Use at least 2 characters.')).toBeOnTheScreen();
  expect(onSave).not.toHaveBeenCalled();

  await fireEventAsync.changeText(screen.getByPlaceholderText('e.g. PopcornQueen'), '  Reel   Fan ');
  await fireEventAsync.press(screen.getByText('Save nickname'));
  expect(onSave).toHaveBeenCalledWith('Reel Fan');
});

it('shows a save error and lets the user try again', async () => {
  const onSave = jest.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce();
  await renderAsync(<NicknameScreen onSave={onSave} />);

  await fireEventAsync.changeText(screen.getByPlaceholderText('e.g. PopcornQueen'), 'Reel Fan');
  await fireEventAsync.press(screen.getByText('Save nickname'));
  expect(screen.getByText('Offline')).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByText('Save nickname'));
  expect(onSave).toHaveBeenCalledTimes(2);
});

it('offers Cancel when changing an existing nickname, and Sign out when choosing the first one', async () => {
  const onCancel = jest.fn();
  await renderAsync(<NicknameScreen initialNickname="Reel Fan" onSave={jest.fn()} onCancel={onCancel} onSignOut={jest.fn()} />);
  expect(screen.getByText('Change your nickname')).toBeOnTheScreen();
  expect(screen.queryByText('Sign out')).not.toBeOnTheScreen();
  await fireEventAsync.press(screen.getByText('Cancel'));
  expect(onCancel).toHaveBeenCalled();
});
