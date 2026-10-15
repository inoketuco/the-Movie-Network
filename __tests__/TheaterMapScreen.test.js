import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, renderAsync, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';
import TheaterMapScreen, { decodePolyline } from '../TheaterMapScreen';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockMap = ({ children, ref, ...props }) => {
    React.useImperativeHandle(ref, () => ({ animateToRegion: jest.fn(), fitToCoordinates: jest.fn() }));
    return <View testID="map" {...props}>{children}</View>;
  };
  const Marker = ({ children }) => <View testID="marker">{children}</View>;
  const Callout = ({ children }) => <View>{children}</View>;
  const Polyline = (props) => <View testID="route" {...props} />;
  return { __esModule: true, default: MockMap, Marker, Callout, Polyline };
});

const USER = { latitude: -18.1416, longitude: 178.4419 }; // Suva
const PLACE = {
  id: 'cinema-1',
  displayName: { text: 'Damodar City Cinemas' },
  formattedAddress: 'Damodar City, Suva, Fiji',
  location: { latitude: -18.1316, longitude: 178.4419 },
  rating: 4.2,
};

// Google's documented example: (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
const ENCODED_ROUTE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

const mockApis = ({ places = [PLACE], weatherOk = true, routes } = {}) => {
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes('places.googleapis.com')) {
      return { ok: true, json: async () => ({ places }) };
    }
    if (String(url).includes('routes.googleapis.com')) {
      return {
        ok: true,
        json: async () => ({
          routes: routes ?? [{ duration: '754s', distanceMeters: 4321, polyline: { encodedPolyline: ENCODED_ROUTE } }],
        }),
      };
    }
    return weatherOk
      ? { ok: true, json: async () => ({ main: { temp: 27.6 }, weather: [{ description: 'light rain', icon: '10d' }] }) }
      : { ok: false, json: async () => ({ message: 'Invalid API key' }) };
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Location.getCurrentPositionAsync.mockResolvedValue({ coords: USER });
});

it('finds nearby cinemas with Google Places and shows weather at each one', async () => {
  mockApis();
  await renderAsync(<TheaterMapScreen />);

  // Shown twice: in the map marker's callout and in the list below the map.
  expect(await screen.findAllByText('Damodar City Cinemas')).toHaveLength(2);
  expect(screen.getByText('1.1 km away · ★ 4.2')).toBeOnTheScreen();
  expect(screen.getByText('28°C')).toBeOnTheScreen();
  expect(screen.getByText('light rain')).toBeOnTheScreen();
  expect(screen.getAllByTestId('marker')).toHaveLength(1);

  const [placesUrl, placesRequest] = global.fetch.mock.calls[0];
  expect(placesUrl).toBe('https://places.googleapis.com/v1/places:searchNearby');
  expect(JSON.parse(placesRequest.body).locationRestriction.circle.center).toEqual(USER);
  expect(global.fetch).toHaveBeenCalledWith(expect.stringMatching(/openweathermap\.org.*lat=-18\.1316&lon=178\.4419/));
});

it('still lists cinemas when the weather service fails', async () => {
  mockApis({ weatherOk: false });
  await renderAsync(<TheaterMapScreen />);

  // Shown twice: in the map marker's callout and in the list below the map.
  expect(await screen.findAllByText('Damodar City Cinemas')).toHaveLength(2);
  expect(screen.getByText('Weather unavailable')).toBeOnTheScreen(); // map callout
  expect(screen.queryByText(/°C$/)).not.toBeOnTheScreen();
});

it('explains that location permission is needed', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
  mockApis();
  await renderAsync(<TheaterMapScreen />);

  expect(await screen.findByText('Location permission is required to find cinemas near you.')).toBeOnTheScreen();
  expect(global.fetch).not.toHaveBeenCalled();
});

it('says so when there are no cinemas nearby', async () => {
  mockApis({ places: [] });
  await renderAsync(<TheaterMapScreen />);

  expect(await screen.findByText('No movie theaters were found within 15 km of your location.')).toBeOnTheScreen();
});

it('decodes Google encoded polylines', () => {
  expect(decodePolyline(ENCODED_ROUTE)).toEqual([
    { latitude: 38.5, longitude: -120.2 },
    { latitude: 40.7, longitude: -120.95 },
    { latitude: 43.252, longitude: -126.453 },
  ]);
});

it('lets the user pick a map style and layers', async () => {
  mockApis();
  await renderAsync(<TheaterMapScreen />);
  await screen.findAllByText('Damodar City Cinemas');

  expect(screen.getByTestId('map').props.mapType).toBe('standard');
  fireEvent.press(screen.getByText('Satellite'));
  expect(screen.getByTestId('map').props.mapType).toBe('satellite');

  expect(screen.getByTestId('map').props.showsTraffic).toBe(false);
  fireEvent.press(screen.getByText('Traffic'));
  expect(screen.getByTestId('map').props.showsTraffic).toBe(true);
});

it('makes the map bigger and smaller', async () => {
  mockApis();
  await renderAsync(<TheaterMapScreen />);
  await screen.findAllByText('Damodar City Cinemas');

  const smallHeight = screen.getByTestId('map').props.style.height;
  fireEvent.press(screen.getByText('Bigger map'));
  expect(screen.getByTestId('map').props.style.height).toBeGreaterThan(smallHeight);
  fireEvent.press(screen.getByText('Smaller map'));
  expect(screen.getByTestId('map').props.style.height).toBe(smallHeight);
});

it('shows a route to the chosen cinema for the chosen travel mode', async () => {
  mockApis();
  await renderAsync(<TheaterMapScreen />);
  const [, listItem] = await screen.findAllByText('Damodar City Cinemas');

  fireEvent.press(listItem);
  expect(screen.getByText('Directions to')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Walking'));

  expect(await screen.findByText('13 min  ·  4.3 km walking')).toBeOnTheScreen();
  expect(screen.getByTestId('route').props.coordinates).toHaveLength(3);

  const routeCall = global.fetch.mock.calls.find(([url]) => String(url).includes('routes.googleapis.com'));
  const body = JSON.parse(routeCall[1].body);
  expect(body.travelMode).toBe('WALK');
  expect(body.origin.location.latLng).toEqual(USER);
  expect(body.destination.location.latLng).toEqual(PLACE.location);

  fireEvent.press(screen.getByText('Clear route'));
  expect(screen.queryByTestId('route')).not.toBeOnTheScreen();
});

it('explains when there is no route for a travel mode', async () => {
  mockApis({ routes: [] });
  await renderAsync(<TheaterMapScreen />);
  const [, listItem] = await screen.findAllByText('Damodar City Cinemas');

  fireEvent.press(listItem);
  fireEvent.press(screen.getByText('Cycling'));

  expect(
    await screen.findByText('No cycling route was found to Damodar City Cinemas. Try another travel mode.')
  ).toBeOnTheScreen();
  expect(screen.queryByTestId('route')).not.toBeOnTheScreen();
});

it('opens Google Maps for turn-by-turn directions', async () => {
  mockApis();
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await renderAsync(<TheaterMapScreen />);
  const [, listItem] = await screen.findAllByText('Damodar City Cinemas');

  fireEvent.press(listItem);
  fireEvent.press(screen.getByText('Open in Google Maps'));

  expect(openURL).toHaveBeenCalledWith(
    'https://www.google.com/maps/dir/?api=1&destination=-18.1316,178.4419&destination_place_id=cinema-1&travelmode=driving&origin=-18.1416,178.4419'
  );
});
