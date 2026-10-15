import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import MapView, { Callout, Marker, Polyline } from 'react-native-maps';
import { glass, glassShadow, GUTTER, radius, space, type } from './theme';
import { Banner, Button, Chip, ScreenHeader } from './ui';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const OPENWEATHER_API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;
const SEARCH_RADIUS_METERS = 15000;

// Terrain only exists on Google Maps (Android); Apple Maps (iOS) has a muted style instead.
const MAP_STYLES = [
  { key: 'standard', label: 'Standard' },
  { key: 'satellite', label: 'Satellite' },
  { key: 'hybrid', label: 'Hybrid' },
  Platform.OS === 'android' ? { key: 'terrain', label: 'Terrain' } : { key: 'mutedStandard', label: 'Muted' },
];

const MAP_LAYERS = [
  { key: 'traffic', label: 'Traffic' },
  { key: 'buildings', label: '3D buildings' },
  { key: 'indoors', label: 'Indoor maps' },
];

// `routes` is the Google Routes API travel mode; `maps` is the Google Maps URL one.
const TRAVEL_MODES = [
  { key: 'drive', label: 'Driving', routes: 'DRIVE', maps: 'driving' },
  { key: 'walk', label: 'Walking', routes: 'WALK', maps: 'walking' },
  { key: 'bicycle', label: 'Cycling', routes: 'BICYCLE', maps: 'bicycling' },
  { key: 'transit', label: 'Transit', routes: 'TRANSIT', maps: 'transit' },
];

// Google's encoded polyline format: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
export const decodePolyline = (encoded) => {
  const points = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  const nextValue = () => {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    latitude += nextValue();
    longitude += nextValue();
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
};

// "1 h 5 min" / "12 min"
const formatDuration = (seconds) => {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${Math.floor(minutes / 60)} h`;
};

const getRoute = async (origin, cinema, mode) => {
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: { location: { latLng: origin } },
      destination: { location: { latLng: cinema.location } },
      travelMode: mode.routes,
    }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Google could not plan a route. Check that the Routes API is enabled.');
  }
  const route = data.routes?.[0];
  if (!route?.polyline?.encodedPolyline) {
    throw new Error(`No ${mode.label.toLowerCase()} route was found to ${cinema.name}. Try another travel mode.`);
  }
  return {
    coordinates: decodePolyline(route.polyline.encodedPolyline),
    duration: formatDuration(parseInt(route.duration, 10) || 0),
    distance: `${((route.distanceMeters || 0) / 1000).toFixed(1)} km`,
  };
};

const distanceInKm = (from, to) => {
  const degreesToRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = degreesToRadians(to.latitude - from.latitude);
  const longitudeDelta = degreesToRadians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(degreesToRadians(from.latitude)) *
      Math.cos(degreesToRadians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getWeather = async (cinema) => {
  try {
    const { latitude, longitude } = cinema.location;
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${OPENWEATHER_API_KEY}&units=metric`
    );

    if (!response.ok) return null;
    const data = await response.json();
    return {
      temperature: Math.round(data.main.temp),
      description: data.weather?.[0]?.description || 'Weather unavailable',
      icon: data.weather?.[0]?.icon || null,
    };
  } catch {
    return null;
  }
};

const TheaterMapScreen = ({ isDark = false }) => {
  const mapRef = useRef(null);
  const [userLocation, setUserLocation] = useState(null);
  const [cinemas, setCinemas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [mapType, setMapType] = useState('standard');
  const [layers, setLayers] = useState({ traffic: false, buildings: true, indoors: false });
  const [mapExpanded, setMapExpanded] = useState(false);
  const [selectedCinema, setSelectedCinema] = useState(null);
  const [travelMode, setTravelMode] = useState(TRAVEL_MODES[0]);
  // null | { status: 'loading' } | { status: 'ready', coordinates, duration, distance } | { status: 'error', message }
  const [route, setRoute] = useState(null);
  // Only the newest route request may update the map when modes are switched quickly.
  const routeRequest = useRef(0);
  const { height: windowHeight } = useWindowDimensions();
  const mapHeight = Math.round(windowHeight * (mapExpanded ? 0.75 : 0.5));

  const loadNearbyCinemas = useCallback(async () => {
    if (!GOOGLE_API_KEY || !OPENWEATHER_API_KEY) {
      const missing = [];
      if (!GOOGLE_API_KEY) missing.push('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');
      if (!OPENWEATHER_API_KEY) missing.push('EXPO_PUBLIC_OPENWEATHER_API_KEY');
      setErrorMessage(`Add ${missing.join(' and ')} to .env, then restart Expo.`);
      setHasLoaded(true);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    routeRequest.current += 1;
    setSelectedCinema(null);
    setRoute(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('Location permission is required to find cinemas near you.');
      }

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const currentLocation = {
        latitude: currentPosition.coords.latitude,
        longitude: currentPosition.coords.longitude,
      };
      setUserLocation(currentLocation);

      const placesResponse = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.rating',
        },
        body: JSON.stringify({
          includedTypes: ['movie_theater'],
          maxResultCount: 12,
          rankPreference: 'DISTANCE',
          locationRestriction: {
            circle: { center: currentLocation, radius: SEARCH_RADIUS_METERS },
          },
        }),
      });
      const placesData = await placesResponse.json();

      if (!placesResponse.ok) {
        throw new Error(placesData.error?.message || 'Google Places could not find nearby cinemas.');
      }

      const nearbyCinemas = (placesData.places || [])
        .filter((place) => place.id && place.location)
        .map((place) => ({
          id: place.id,
          name: place.displayName?.text || 'Cinema',
          address: place.formattedAddress || 'Address unavailable',
          location: place.location,
          rating: place.rating,
          distance: distanceInKm(currentLocation, place.location),
        }));

      const withWeather = await Promise.all(
        nearbyCinemas.map(async (cinema) => ({ ...cinema, weather: await getWeather(cinema) }))
      );
      setCinemas(withWeather);

      if (!withWeather.length) {
        setErrorMessage('No movie theaters were found within 15 km of your location.');
      }
    } catch (error) {
      setCinemas([]);
      setErrorMessage(error.message || 'Could not load nearby cinemas.');
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    if (!hasLoaded) loadNearbyCinemas();
  }, [hasLoaded, loadNearbyCinemas]);

  const theme = glass(isDark);

  const focusCinema = (cinema) => {
    mapRef.current?.animateToRegion(
      { ...cinema.location, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      500
    );
  };

  const selectCinema = (cinema) => {
    if (cinema.id !== selectedCinema?.id) {
      routeRequest.current += 1;
      setRoute(null);
    }
    setSelectedCinema(cinema);
    focusCinema(cinema);
  };

  const showRoute = async (cinema, mode) => {
    if (!userLocation) return;
    const request = ++routeRequest.current;
    setTravelMode(mode);
    setRoute({ status: 'loading' });

    try {
      const result = await getRoute(userLocation, cinema, mode);
      if (request !== routeRequest.current) return;
      setRoute({ status: 'ready', ...result });
      mapRef.current?.fitToCoordinates(result.coordinates, {
        edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
        animated: true,
      });
    } catch (error) {
      if (request !== routeRequest.current) return;
      setRoute({ status: 'error', message: error.message || 'Could not plan a route.' });
    }
  };

  const clearRoute = () => {
    routeRequest.current += 1;
    setRoute(null);
    if (selectedCinema) focusCinema(selectedCinema);
  };

  // Turn-by-turn navigation is left to the Google Maps app (or website if it isn't installed).
  const openInMaps = (cinema) => {
    const params = [
      'api=1',
      `destination=${cinema.location.latitude},${cinema.location.longitude}`,
      `destination_place_id=${encodeURIComponent(cinema.id)}`,
      `travelmode=${travelMode.maps}`,
    ];
    if (userLocation) params.push(`origin=${userLocation.latitude},${userLocation.longitude}`);
    Linking.openURL(`https://www.google.com/maps/dir/?${params.join('&')}`).catch(() => {});
  };

  const toggleLayer = (key) => setLayers((current) => ({ ...current, [key]: !current[key] }));

  const directionsPanel = selectedCinema ? (
    <View style={[styles.directions, glassShadow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.directionsHeader}>
        <View style={styles.cardCopy}>
          <Text style={[type.overline, { color: theme.textSecondary }]}>Directions to</Text>
          <Text style={[type.cardTitle, { color: theme.text }]} numberOfLines={1}>{selectedCinema.name}</Text>
        </View>
        <Button
          title="Close"
          variant="ghost"
          size="sm"
          onPress={() => {
            routeRequest.current += 1;
            setRoute(null);
            setSelectedCinema(null);
          }}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {TRAVEL_MODES.map((mode) => (
          <Chip
            key={mode.key}
            label={mode.label}
            selected={Boolean(route) && mode.key === travelMode.key}
            onPress={() => showRoute(selectedCinema, mode)}
          />
        ))}
      </ScrollView>
      {route?.status === 'loading' ? (
        <View style={styles.routeStatus}>
          <ActivityIndicator color={theme.primary} />
          <Text style={[type.bodySmall, styles.routeStatusText, { color: theme.textSecondary }]}>Planning route…</Text>
        </View>
      ) : null}
      {route?.status === 'ready' ? (
        <Text style={[type.heading, styles.routeSummary, { color: theme.text }]}>
          {route.duration}
          <Text style={[type.bodySmall, { color: theme.textSecondary }]}>{`  ·  ${route.distance} ${travelMode.label.toLowerCase()}`}</Text>
        </Text>
      ) : null}
      {route?.status === 'error' ? <Banner tone="error" message={route.message} style={styles.routeBanner} /> : null}
      {!route ? (
        <Text style={[type.bodySmall, styles.routeHint, { color: theme.textSecondary }]}>
          Pick how you're travelling to see the route on the map.
        </Text>
      ) : null}
      <View style={styles.directionsActions}>
        <Button title="Open in Google Maps" variant="secondary" size="sm" onPress={() => openInMaps(selectedCinema)} />
        {route ? <Button title="Clear route" variant="ghost" size="sm" onPress={clearRoute} /> : null}
      </View>
    </View>
  ) : null;

  // The heading, map and messages scroll with the list, so small screens get the most room.
  const listHeader = (
    <>
      <ScreenHeader
        title="Cinemas"
        subtitle="Nearby theatres with the current weather. Tap one for directions."
        right={<Button title="Refresh" variant="secondary" size="sm" onPress={loadNearbyCinemas} disabled={loading} />}
      />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[type.bodySmall, styles.loadingText, { color: theme.textSecondary }]}>Finding cinemas and weather…</Text>
        </View>
      ) : null}
      {errorMessage ? <Banner tone="error" message={errorMessage} style={styles.banner} /> : null}
      {userLocation ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroller}
            contentContainerStyle={styles.chipRow}
            accessibilityLabel="Map style"
          >
            {MAP_STYLES.map((style) => (
              <Chip
                key={style.key}
                label={style.label}
                selected={style.key === mapType}
                onPress={() => setMapType(style.key)}
                accessibilityRole="radio"
              />
            ))}
            <View style={[styles.chipDivider, { backgroundColor: theme.border }]} />
            {MAP_LAYERS.map((layer) => (
              <Chip
                key={layer.key}
                label={layer.label}
                selected={layers[layer.key]}
                onPress={() => toggleLayer(layer.key)}
                accessibilityRole="switch"
              />
            ))}
          </ScrollView>
          <View style={[styles.mapFrame, { borderColor: theme.border }]}>
            <MapView
              ref={mapRef}
              style={{ height: mapHeight }}
              initialRegion={{ ...userLocation, latitudeDelta: 0.16, longitudeDelta: 0.16 }}
              mapType={mapType}
              showsTraffic={layers.traffic}
              showsBuildings={layers.buildings}
              showsIndoors={layers.indoors}
              showsUserLocation
              showsMyLocationButton
              showsCompass
              showsScale
              toolbarEnabled={false}
            >
              {route?.status === 'ready' ? (
                <Polyline coordinates={route.coordinates} strokeColor={theme.primary} strokeWidth={5} />
              ) : null}
              {cinemas.map((cinema) => (
                <Marker key={cinema.id} coordinate={cinema.location} pinColor={theme.primary} onPress={() => selectCinema(cinema)}>
                  <Callout>
                    <View style={styles.callout}>
                      <Text style={type.bodyStrong}>{cinema.name}</Text>
                      <Text style={type.bodySmall}>
                        {cinema.weather ? `${cinema.weather.temperature}°C · ${cinema.weather.description}` : 'Weather unavailable'}
                      </Text>
                    </View>
                  </Callout>
                </Marker>
              ))}
            </MapView>
            <Button
              title={mapExpanded ? 'Smaller map' : 'Bigger map'}
              variant="secondary"
              size="sm"
              onPress={() => setMapExpanded((current) => !current)}
              style={styles.expandButton}
            />
          </View>
          {directionsPanel}
        </>
      ) : null}
      {cinemas.length ? (
        <Text style={[type.overline, styles.sectionLabel, { color: theme.textSecondary }]}>
          {cinemas.length} {cinemas.length === 1 ? 'cinema' : 'cinemas'} within 15 km
        </Text>
      ) : null}
    </>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={cinemas}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={listHeader}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => selectCinema(item)}
          accessibilityRole="button"
          accessibilityHint="Shows this cinema on the map with directions"
          accessibilityState={{ selected: item.id === selectedCinema?.id }}
          style={({ pressed }) => [
            styles.card,
            glassShadow,
            {
              backgroundColor: pressed ? theme.surfaceRaised : theme.surface,
              borderColor: item.id === selectedCinema?.id ? theme.primary : theme.border,
            },
          ]}
        >
          <View style={styles.cardCopy}>
            <Text style={[type.cardTitle, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[type.bodySmall, styles.address, { color: theme.textSecondary }]} numberOfLines={2}>{item.address}</Text>
            <Text style={[type.caption, styles.meta, { color: theme.textSecondary }]}>
              {item.distance.toFixed(1)} km away
              {item.rating ? <Text style={{ color: theme.rating }}>{`  ·  ★ ${item.rating}`}</Text> : null}
            </Text>
          </View>
          {item.weather ? (
            <View style={[styles.weather, { borderLeftColor: theme.border }]}>
              {item.weather.icon ? (
                <Image
                  source={{ uri: `https://openweathermap.org/img/wn/${item.weather.icon}@2x.png` }}
                  style={styles.weatherIcon}
                  accessibilityIgnoresInvertColors
                />
              ) : null}
              <Text style={[type.heading, { color: theme.text }]}>{item.weather.temperature}°C</Text>
              <Text style={[type.caption, styles.weatherDescription, { color: theme.textSecondary }]} numberOfLines={2}>
                {item.weather.description}
              </Text>
            </View>
          ) : null}
        </Pressable>
      )}
    />
  );
};

// Transparent over App's glass backdrop; colours, spacing and type come from theme.js.
const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: GUTTER, paddingTop: space.xl, paddingBottom: space.xxxl },
  centered: { alignItems: 'center', paddingVertical: space.xxl },
  loadingText: { marginTop: space.sm },
  banner: { marginBottom: space.lg },
  // The chip row runs edge to edge, so it cancels the list's side padding.
  chipScroller: { marginHorizontal: -GUTTER, marginBottom: space.md },
  chipRow: { paddingHorizontal: GUTTER, alignItems: 'center' },
  chipDivider: { width: StyleSheet.hairlineWidth, height: 24, marginRight: space.sm },
  mapFrame: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: space.lg },
  expandButton: { position: 'absolute', left: space.sm, bottom: space.sm },
  callout: { width: 210, padding: space.xs },
  directions: { borderRadius: radius.lg, borderWidth: 1, paddingVertical: space.lg, marginBottom: space.xl },
  directionsHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, marginBottom: space.md },
  routeStatus: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, marginTop: space.md },
  routeStatusText: { marginLeft: space.sm },
  routeSummary: { paddingHorizontal: space.lg, marginTop: space.md },
  routeBanner: { marginHorizontal: space.lg, marginTop: space.md },
  routeHint: { paddingHorizontal: space.lg, marginTop: space.md },
  directionsActions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, marginTop: space.md, gap: space.sm },
  sectionLabel: { marginBottom: space.md },
  card: { flexDirection: 'row', borderRadius: radius.lg, borderWidth: 1, padding: space.lg, marginBottom: space.md },
  cardCopy: { flex: 1, paddingRight: space.md },
  address: { marginTop: space.xs },
  meta: { marginTop: space.sm },
  weather: { width: 88, alignItems: 'center', justifyContent: 'center', borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: space.md },
  weatherIcon: { width: 44, height: 44, marginVertical: -space.sm },
  weatherDescription: { textAlign: 'center', textTransform: 'capitalize', marginTop: space.xxs },
});

export default TheaterMapScreen;
