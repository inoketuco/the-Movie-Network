import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { onAuthStateChanged, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { StripeProvider } from '@stripe/stripe-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { auth, db, isFirebaseConfigured } from './firebaseConfig';
import AdminDashboard from './AdminDashboard';
import AuthScreen from './AuthScreen';
import Dashboard from './Dashboard';
import LoginVerificationScreen from './LoginVerificationScreen';
import { isRealPaymentValue } from './mockPayments';
import { isLoginVerificationConfigured, isSessionVerified } from './loginVerification';
import { takePendingNickname } from './nickname';
import NicknameScreen from './NicknameScreen';
import ReviewScreen from './ReviewScreen';
import StoreScreen from './StoreScreen';
import TheaterMapScreen from './TheaterMapScreen';
import { glass, GlassBackground, GUTTER, space, ThemeProvider, type } from './theme';
import { Banner, Button } from './ui';

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
const THEME_STORAGE_KEY = 'movie-network-theme';

const TABS = [
  { key: 'movies', label: 'Movies' },
  { key: 'cinemas', label: 'Cinemas' },
  { key: 'store', label: 'Store' },
];
const ADMIN_TAB = { key: 'admin', label: 'Admin' };

function MovieNetworkApp() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState('user');
  const [screen, setScreen] = useState('movies');
  const [selectedMovie, setSelectedMovie] = useState(null);
  // Guests browse freely; the sign-in screen only opens when they ask for it.
  // null | { mode: 'signIn' | 'register', reason?: string }
  const [authPrompt, setAuthPrompt] = useState(null);
  // Kept here so a guest's cart survives the trip through the sign-in screen.
  const [storeCart, setStoreCart] = useState({});
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured);
  // 'checking' | 'required' | 'verified': the emailed sign-in code step (see MFA_SETUP.md).
  const [verification, setVerification] = useState('checking');
  const [profileWarning, setProfileWarning] = useState('');
  // 'idle' | 'loading' | 'loaded' | 'error'. The nickname prompt waits for 'loaded'.
  const [profileStatus, setProfileStatus] = useState('idle');
  const [nickname, setNickname] = useState('');
  const [editingNickname, setEditingNickname] = useState(false);
  // Dark suits a streaming app; a saved choice still wins.
  const [theme, setTheme] = useState('dark');
  const [backdropUrl, setBackdropUrl] = useState(null);
  const isDark = theme === 'dark';
  const colors = glass(isDark);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((savedTheme) => {
        if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme);
      })
      .catch(() => {});
  }, []);

  // Today's top trending movie supplies the blurred backdrop behind the glass panels.
  useEffect(() => {
    if (!TMDB_API_KEY) return;
    fetch(`https://api.themoviedb.org/3/trending/movie/day?api_key=${TMDB_API_KEY}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const movie = (data?.results || []).find((result) => result.backdrop_path);
        if (movie) setBackdropUrl(`https://image.tmdb.org/t/p/w780${movie.backdrop_path}`);
      })
      .catch(() => {});
  }, []);

  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark';
    setTheme(nextTheme);
    AsyncStorage.setItem(THEME_STORAGE_KEY, nextTheme).catch(() => {});
  };

  const loadUserProfile = useCallback(async (currentUser) => {
    if (!currentUser) return;
    setProfileWarning('');
    setProfileStatus('loading');

    try {
      const profileRef = doc(db, 'users', currentUser.uid);
      const profile = await getDoc(profileRef);
      // Set on the sign-up form, before the account (and its profile) existed.
      const signUpNickname = takePendingNickname();

      if (profile.exists()) {
        const data = profile.data();
        const role = data.role;
        setUserRole(role === 'admin' ? 'admin' : 'user');
        if (role === 'admin') setScreen('admin');
        const savedNickname = data.nickname || signUpNickname || '';
        setNickname(savedNickname);
        const updates = { lastVisited: serverTimestamp() };
        if (!data.nickname && signUpNickname) updates.nickname = signUpNickname;
        setDoc(profileRef, updates, { merge: true }).catch(() => {
          setProfileWarning('Your last visit could not be updated. Tap retry to sync your profile.');
        });
      } else {
        await setDoc(profileRef, {
          email: currentUser.email,
          role: 'user',
          ...(signUpNickname ? { nickname: signUpNickname } : {}),
          createdAt: serverTimestamp(),
          lastVisited: serverTimestamp(),
        });
        setUserRole('user');
        setNickname(signUpNickname || '');
      }
      setProfileStatus('loaded');
    } catch (error) {
      setUserRole('user');
      setProfileStatus('error');
      setProfileWarning('Your profile could not sync. Check your connection and try again.');
    }
  }, []);

  const saveNickname = async (nextNickname) => {
    await setDoc(doc(db, 'users', auth.currentUser.uid), { nickname: nextNickname }, { merge: true });
    // Also kept on the Firebase account; failing here does not undo the profile change.
    updateProfile(auth.currentUser, { displayName: nextNickname }).catch(() => {});
    setNickname(nextNickname);
    setEditingNickname(false);
  };

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;

    // The current screen and movie are kept across sign-in, so a guest who signs
    // in to post a review lands back on that movie.
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthPrompt(null);
      setUserRole('user');
      setScreen((current) => (current === 'admin' ? 'movies' : current));
      setNickname('');
      setEditingNickname(false);
      setProfileStatus('idle');
      setAuthLoading(false);

      if (!currentUser) {
        setProfileWarning('');
        setStoreCart({});
        return;
      }

      if (!isLoginVerificationConfigured) {
        setVerification('verified');
        return;
      }
      setVerification('checking');
      isSessionVerified(currentUser)
        .then((isVerified) => {
          if (auth.currentUser === currentUser) setVerification(isVerified ? 'verified' : 'required');
        })
        .catch(() => {
          if (auth.currentUser === currentUser) setVerification('required');
        });
    });
  }, []);

  // The profile is only loaded once the sign-in code step is complete, because
  // firestore.rules require a verified session for most data.
  useEffect(() => {
    if (user && verification === 'verified') loadUserProfile(user);
  }, [user, verification, loadUserProfile]);

  // The sign-in and movie detail views are plain state, so Android's back button would otherwise exit the app.
  useEffect(() => {
    if (!selectedMovie && !authPrompt && !editingNickname) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editingNickname) setEditingNickname(false);
      else if (authPrompt) setAuthPrompt(null);
      else setSelectedMovie(null);
      return true;
    });
    return () => subscription.remove();
  }, [selectedMovie, authPrompt, editingNickname]);

  const openSignIn = (mode = 'signIn', reason) => setAuthPrompt({ mode, reason });

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      Alert.alert('Logout Error', error.message);
    }
  };

  let content;
  if (authLoading || (user && verification === 'checking')) {
    content = (
      <View style={styles.loading}>
        <GlassBackground isDark={isDark} imageUrl={backdropUrl} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[type.bodySmall, styles.loadingText, { color: colors.textSecondary }]}>Loading your account…</Text>
      </View>
    );
  } else if (!user && authPrompt) {
    content = (
      <>
        <StatusBar barStyle="light-content" />
        <AuthScreen
          initialMode={authPrompt.mode}
          reason={authPrompt.reason}
          onClose={() => setAuthPrompt(null)}
        />
      </>
    );
  } else if (user && verification === 'required') {
    content = (
      <>
        <StatusBar barStyle={colors.statusBar} />
        <LoginVerificationScreen
          email={user.email}
          onVerified={() => setVerification('verified')}
          onSignOut={handleLogout}
        />
      </>
    );
  } else if (user && (editingNickname || (profileStatus === 'loaded' && !nickname))) {
    // Signed-in users without a nickname choose one before continuing.
    content = (
      <NicknameScreen
        isDark={isDark}
        backdropUrl={backdropUrl}
        initialNickname={nickname}
        onSave={saveNickname}
        onCancel={editingNickname && nickname ? () => setEditingNickname(false) : undefined}
        onSignOut={handleLogout}
      />
    );
  } else if (selectedMovie) {
    // Movie pages are always dark, over the movie's own artwork.
    content = (
      <ThemeProvider isDark>
        <SafeAreaView style={[styles.container, styles.reviewContainer]}>
          <StatusBar barStyle="light-content" />
          <View style={styles.reviewTopBar}>
            <Button
              title="Back"
              variant="secondary"
              size="sm"
              onPress={() => setSelectedMovie(null)}
              accessibilityLabel="Back to movies"
            />
            {!user ? <Button title="Sign in" size="sm" onPress={() => openSignIn()} /> : null}
          </View>
          <ReviewScreen
            movie={selectedMovie}
            isSignedIn={Boolean(user)}
            nickname={nickname}
            onRequestSignIn={(mode) => openSignIn(mode, `Sign in to post your review of ${selectedMovie.title || 'this movie'}.`)}
          />
        </SafeAreaView>
      </ThemeProvider>
    );
  } else {
    const tabs = userRole === 'admin' ? [...TABS, ADMIN_TAB] : TABS;
    content = (
      <View style={styles.container}>
        <GlassBackground isDark={isDark} imageUrl={backdropUrl} />
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
          <StatusBar barStyle={colors.statusBar} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerTop}>
              <View style={styles.brandBlock}>
                <Text style={[styles.brand, { color: colors.text }]} numberOfLines={1}>
                  The <Text style={{ color: colors.primary }}>Movie</Text> Network
                </Text>
                {user && nickname ? (
                  <Text style={[type.caption, styles.greeting, { color: colors.textSecondary }]} numberOfLines={1}>
                    Signed in as <Text style={{ color: colors.text }}>{nickname}</Text>
                    {'   '}
                    <Text
                      style={{ color: colors.link }}
                      onPress={() => setEditingNickname(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Change nickname"
                    >
                      Edit
                    </Text>
                  </Text>
                ) : null}
              </View>
              {user ? (
                <Button title="Log out" variant="secondary" size="sm" onPress={handleLogout} />
              ) : (
                <Button title="Sign in" size="sm" onPress={() => openSignIn()} />
              )}
            </View>
            <View style={styles.tabBar} accessibilityRole="tablist">
              {tabs.map((tab) => {
                const isActive = screen === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
                    onPress={() => setScreen(tab.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={tab.label}
                  >
                    <Text style={[type.bodyStrong, { color: isActive ? colors.text : colors.textSecondary }]} numberOfLines={1}>
                      {tab.label}
                    </Text>
                    <View style={[styles.tabIndicator, { backgroundColor: isActive ? colors.primary : 'transparent' }]} />
                  </Pressable>
                );
              })}
            </View>
          </View>
          {profileWarning ? (
            <Banner
              tone="warning"
              message={profileWarning}
              actionLabel="Retry"
              onAction={() => loadUserProfile(user)}
              style={styles.warningBanner}
            />
          ) : null}
          {screen === 'admin' && userRole === 'admin' ? (
            <AdminDashboard isDark={isDark} />
          ) : screen === 'cinemas' ? (
            <TheaterMapScreen isDark={isDark} />
          ) : screen === 'store' ? (
            <StoreScreen
              isDark={isDark}
              isSignedIn={Boolean(user)}
              onRequestSignIn={(mode) => openSignIn(mode, 'Sign in to complete your purchase. Your cart is saved.')}
              cart={storeCart}
              onCartChange={setStoreCart}
            />
          ) : (
            <Dashboard
              onSelectMovie={setSelectedMovie}
              isDark={isDark}
              onToggleTheme={toggleTheme}
            />
          )}
        </SafeAreaView>
      </View>
    );
  }

  return <ThemeProvider isDark={isDark}>{content}</ThemeProvider>;
}

export default function App() {
  const app = (
    <SafeAreaProvider>
      <MovieNetworkApp />
    </SafeAreaProvider>
  );
  if (!isRealPaymentValue(STRIPE_PUBLISHABLE_KEY)) return app;

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} urlScheme="themovienetwork">
      {app}
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: space.md },
  header: { paddingHorizontal: GUTTER, paddingTop: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  brandBlock: { flex: 1, marginRight: space.md },
  brand: { fontSize: 19, lineHeight: 24, fontWeight: '800', letterSpacing: -0.3 },
  greeting: { marginTop: space.xxs },
  tabBar: { flexDirection: 'row' },
  tab: { marginRight: space.xxl, paddingTop: space.xs, alignItems: 'center' },
  tabPressed: { opacity: 0.7 },
  tabIndicator: { alignSelf: 'stretch', height: 2, borderRadius: 1, marginTop: space.sm },
  reviewContainer: { backgroundColor: '#07090F' },
  reviewTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, paddingVertical: space.sm },
  warningBanner: { marginHorizontal: GUTTER, marginTop: space.md },
});
