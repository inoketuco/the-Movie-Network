// Test-only API keys so screens take their "configured" code paths. No real
// network calls are made: every test mocks global.fetch.
process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-tmdb-key';
process.env.EXPO_PUBLIC_GIPHY_API_KEY = 'test-giphy-key';
process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-maps-key';
process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY = 'test-weather-key';

// SafeAreaProvider waits for native inset measurements that never arrive under Jest.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Native modules that do not exist under Jest.
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(async () => ({ uri: 'file:///print/receipt.pdf', base64: 'JVBERi0x' })),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));
jest.mock('expo-file-system', () => {
  class File {
    constructor(...parts) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    write = jest.fn();
  }
  class Directory {
    constructor(uri) {
      this.uri = uri;
    }
    createFile = jest.fn((name) => new File(this.uri, name));
    static pickDirectoryAsync = jest.fn(async () => new Directory('content://downloads'));
  }
  return { File, Directory, Paths: { cache: { uri: 'file:///cache' } } };
});
// The YouTube player is a WebView; tests get a stand-in that exposes its props.
jest.mock('react-native-youtube-iframe', () => {
  const { View } = require('react-native');
  return ({ videoId, onError }) => <View testID="youtube-player" accessibilityLabel={`Trailer ${videoId}`} onError={onError} />;
});
jest.mock('@stripe/stripe-react-native', () => ({
  StripeProvider: ({ children }) => children,
  useStripe: () => ({ initPaymentSheet: jest.fn(), presentPaymentSheet: jest.fn() }),
}));
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: jest.fn(() => [null, null, jest.fn()]),
}));
