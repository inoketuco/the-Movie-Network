import { getApp, getApps, initializeApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);
const appAlreadyInitialized = getApps().length > 0;
const app = isFirebaseConfigured
  ? (appAlreadyInitialized ? getApp() : initializeApp(firebaseConfig))
  : null;
export const auth = app
  ? (appAlreadyInitialized
      ? getAuth(app)
      : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) }))
  : null;
export const db = app
  ? (appAlreadyInitialized
      ? getFirestore(app)
      : initializeFirestore(app, {
          experimentalForceLongPolling: true,
          useFetchStreams: false,
        }))
  : null;
