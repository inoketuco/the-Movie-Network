const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

module.exports = {
  expo: {
    name: 'The Movie Network',
    slug: 'the-movie-network',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'themovienetwork',
    userInterfaceStyle: 'light',
    plugins: [
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Allow The Movie Network to use your location to find nearby cinemas.',
        },
      ],
      'expo-sharing',
      'expo-web-browser',
      ['@stripe/stripe-react-native', { enableGooglePay: false }],
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.themovienetwork.app',
      config: { googleMapsApiKey },
    },
    android: {
      package: 'com.themovienetwork.app',
      config: { googleMaps: { apiKey: googleMapsApiKey } },
    },
  },
};
