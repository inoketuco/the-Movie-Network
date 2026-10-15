import React from 'react';
import { act, fireEvent, fireEventAsync, renderAsync, screen } from '@testing-library/react-native';
import Dashboard from '../Dashboard';

const movie = (overrides) => ({
  id: 1,
  title: 'Runner',
  overview: 'A courier races the clock.',
  poster_path: '/runner.jpg',
  vote_average: 7.6,
  vote_count: 300,
  ...overrides,
});

const jsonResponse = (body, ok = true) => ({ ok, json: async () => body });

afterEach(() => {
  delete global.fetch;
});

it('shows a loading state, then renders trending movies from TMDb in a list', async () => {
  global.fetch = jest.fn(async () =>
    jsonResponse({ results: [movie(), movie({ id: 2, title: 'Doomsday', poster_path: null, vote_average: 0, vote_count: 0 })] })
  );

  await renderAsync(<Dashboard onSelectMovie={jest.fn()} />);

  expect(await screen.findByText('Runner')).toBeOnTheScreen();
  expect(screen.getByText('★ 7.6')).toBeOnTheScreen();
  expect(screen.getByText('Doomsday')).toBeOnTheScreen();
  expect(screen.getByText('No poster')).toBeOnTheScreen();
  expect(screen.getByText('Not yet rated')).toBeOnTheScreen();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('api.themoviedb.org/3/trending/movie/day'));
});

it('opens a movie when its card is pressed', async () => {
  global.fetch = jest.fn(async () => jsonResponse({ results: [movie()] }));
  const onSelectMovie = jest.fn();

  await renderAsync(<Dashboard onSelectMovie={onSelectMovie} />);
  await fireEventAsync.press(await screen.findByText('Runner'));

  expect(onSelectMovie).toHaveBeenCalledWith(expect.objectContaining({ id: 1, title: 'Runner' }));
});

it('shows the API error and recovers when Retry succeeds', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(jsonResponse({ status_message: 'Invalid API key' }, false))
    .mockResolvedValueOnce(jsonResponse({ results: [movie()] }));

  await renderAsync(<Dashboard onSelectMovie={jest.fn()} />);
  expect(await screen.findByText('Invalid API key')).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByText('Retry'));

  expect(await screen.findByText('Runner')).toBeOnTheScreen();
  expect(screen.queryByText('Invalid API key')).not.toBeOnTheScreen();
});

it('explains a network failure instead of showing a blank screen', async () => {
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });

  await renderAsync(<Dashboard onSelectMovie={jest.fn()} />);

  expect(await screen.findByText('Could not reach TMDb. Check your connection.')).toBeOnTheScreen();
});

it('switches between categories and genres', async () => {
  global.fetch = jest.fn(async (url) => {
    if (url.includes('movie/top_rated')) return jsonResponse({ results: [movie({ id: 3, title: 'Classic Hit' })] });
    if (url.includes('with_genres=27')) return jsonResponse({ results: [movie({ id: 4, title: 'Night Terror' })] });
    return jsonResponse({ results: [movie()] });
  });

  await renderAsync(<Dashboard onSelectMovie={jest.fn()} />);
  expect(await screen.findByText('Trending Movies')).toBeOnTheScreen();

  await fireEventAsync.press(screen.getByText('Top Rated'));
  expect(await screen.findByText('Classic Hit')).toBeOnTheScreen();
  expect(screen.getByText('Top Rated Movies')).toBeOnTheScreen();
  expect(screen.queryByText('Runner')).not.toBeOnTheScreen();

  await fireEventAsync.press(screen.getByText('Horror'));
  expect(await screen.findByText('Night Terror')).toBeOnTheScreen();
  expect(screen.getByText('Horror Movies')).toBeOnTheScreen();
  expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('discover/movie'));
});

it('ignores a slow response from a category the user already left', async () => {
  let finishPopular;
  global.fetch = jest.fn((url) => {
    if (url.includes('movie/popular')) return new Promise((resolve) => { finishPopular = resolve; });
    if (url.includes('movie/upcoming')) return Promise.resolve(jsonResponse({ results: [movie({ id: 5, title: 'Next Summer' })] }));
    return Promise.resolve(jsonResponse({ results: [movie()] }));
  });

  await renderAsync(<Dashboard onSelectMovie={jest.fn()} />);
  await screen.findByText('Runner');

  // Not awaited: this request is held open until the end of the test.
  fireEvent.press(screen.getByText('Popular'));
  await fireEventAsync.press(screen.getByText('Coming Soon'));
  expect(await screen.findByText('Next Summer')).toBeOnTheScreen();

  await act(async () => finishPopular(jsonResponse({ results: [movie({ id: 6, title: 'Stale Pick' })] })));
  expect(screen.queryByText('Stale Pick')).not.toBeOnTheScreen();
  expect(screen.getByText('Upcoming Releases')).toBeOnTheScreen();
});
