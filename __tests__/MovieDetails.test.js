import React from 'react';
import { act, fireEventAsync, renderAsync, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import MovieDetails, { formatRuntime, pickTrailer } from '../MovieDetails';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

const MOVIE = { id: 550, title: 'Fight Club', overview: 'Short list overview.' };
const PLOT = 'A ticking-time-bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy. '.repeat(3);

const video = (overrides) => ({ site: 'YouTube', key: 'k', type: 'Trailer', official: true, name: 'Trailer', ...overrides });

const mockDetails = (details) => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => details }));
};

beforeEach(() => jest.clearAllMocks());

describe('pickTrailer', () => {
  it('prefers an official trailer, then any trailer, then a teaser', () => {
    expect(pickTrailer([
      video({ key: 'fan', official: false }),
      video({ key: 'featurette', type: 'Featurette' }),
      video({ key: 'official' }),
    ]).key).toBe('official');
    expect(pickTrailer([video({ key: 'teaser', type: 'Teaser' }), video({ key: 'fan', official: false })]).key).toBe('fan');
    expect(pickTrailer([video({ key: 'teaser', type: 'Teaser' })]).key).toBe('teaser');
  });

  it('ignores featurettes, clips and non-YouTube videos', () => {
    expect(pickTrailer([video({ type: 'Featurette' }), video({ type: 'Clip' }), video({ site: 'Vimeo' })])).toBeNull();
    expect(pickTrailer(undefined)).toBeNull();
  });
});

it('formats runtimes', () => {
  expect(formatRuntime(139)).toBe('2h 19m');
  expect(formatRuntime(120)).toBe('2h');
  expect(formatRuntime(45)).toBe('45m');
  expect(formatRuntime(0)).toBe('');
});

it('plays the trailer in the app and shows the storyline under it', async () => {
  mockDetails({
    overview: 'Full storyline from TMDb.',
    tagline: 'Mischief. Mayhem. Soap.',
    runtime: 139,
    genres: [{ name: 'Drama' }, { name: 'Thriller' }],
    videos: { results: [video({ key: 'dfeUzm6KF4g', name: '20th Anniversary Trailer' })] },
  });
  await renderAsync(<MovieDetails movie={MOVIE} />);

  expect(await screen.findByLabelText('Trailer dfeUzm6KF4g')).toBeOnTheScreen();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/movie/550?api_key=test-tmdb-key&append_to_response=videos'));
  expect(screen.getByText('20th Anniversary Trailer')).toBeOnTheScreen();
  expect(screen.getByText('Storyline')).toBeOnTheScreen();
  expect(screen.getByText('Mischief. Mayhem. Soap.')).toBeOnTheScreen();
  expect(screen.getByText('Full storyline from TMDb.')).toBeOnTheScreen();
  expect(screen.getByText('2h 19m')).toBeOnTheScreen();
  expect(screen.getByText('Thriller')).toBeOnTheScreen();
});

it('opens the trailer on YouTube when its studio blocks in-app playback', async () => {
  mockDetails({ overview: 'Plot.', videos: { results: [video({ key: 'blocked' })] } });
  await renderAsync(<MovieDetails movie={MOVIE} />);

  const player = await screen.findByLabelText('Trailer blocked');
  await act(async () => player.props.onError('embed_not_allowed'));

  expect(screen.getByText('This trailer can only be played on YouTube.')).toBeOnTheScreen();
  await fireEventAsync.press(screen.getByRole('button', { name: 'Watch on YouTube' }));
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://www.youtube.com/watch?v=blocked');
});

it('shows just the storyline when there is no trailer, and expands long plots', async () => {
  mockDetails({ overview: PLOT, videos: { results: [video({ type: 'Featurette' })] } });
  await renderAsync(<MovieDetails movie={MOVIE} />);

  expect(await screen.findByText('Storyline')).toBeOnTheScreen();
  expect(screen.queryByText('Trailer')).not.toBeOnTheScreen();
  expect(screen.queryByTestId('youtube-player')).not.toBeOnTheScreen();

  expect(screen.getByText(PLOT).props.numberOfLines).toBe(5);
  await fireEventAsync.press(screen.getByRole('button', { name: 'Read more' }));
  expect(screen.getByText(PLOT).props.numberOfLines).toBeUndefined();
  expect(screen.getByRole('button', { name: 'Show less' })).toBeOnTheScreen();
});

it('falls back to the list overview when TMDb cannot be reached', async () => {
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
  await renderAsync(<MovieDetails movie={MOVIE} />);

  expect(await screen.findByText('Short list overview.')).toBeOnTheScreen();
  expect(screen.queryByTestId('youtube-player')).not.toBeOnTheScreen();
});
