import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebaseConfig';
import { getAuthErrorMessage } from './authErrors';
import { glass, glassShadow, GUTTER, radius, space, ThemeProvider, type } from './theme';
import { Banner, Button, TextField } from './ui';
import GoogleSignInButton, { isGoogleSignInConfigured } from './GoogleSignInButton';
import { NICKNAME_MAX_LENGTH, nicknameError, rememberNicknameForSignUp, takePendingNickname } from './nickname';

const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
const DARK = glass(true);
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

const AuthScreen = ({ initialMode = 'signIn', reason, onClose }) => {
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(initialMode === 'register');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleBusy, setIsGoogleBusy] = useState(false);
  const [moviePreviews, setMoviePreviews] = useState([]);

  useEffect(() => {
    if (!TMDB_API_KEY) return undefined;

    const controller = new AbortController();
    const loadMoviePreviews = async () => {
      try {
        const response = await fetch(
          `https://api.themoviedb.org/3/trending/movie/day?api_key=${TMDB_API_KEY}`,
          { signal: controller.signal }
        );
        const data = await response.json();
        if (!response.ok) return;

        const previews = (data.results || [])
          .filter((movie) => movie.poster_path)
          .slice(0, 6)
          .map((movie) => ({
            id: movie.id,
            title: movie.title,
            imageUrl: `${IMAGE_BASE_URL}${movie.poster_path}`,
          }));
        setMoviePreviews(previews);
      } catch (error) {
        if (error.name !== 'AbortError') setMoviePreviews([]);
      }
    };

    loadMoviePreviews();
    return () => controller.abort();
  }, []);

  const handleAuth = async () => {
    if (isSubmitting || isGoogleBusy || !isFirebaseConfigured) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      Alert.alert('Missing Details', 'Enter your email and password.');
      return;
    }
    const nicknameProblem = isRegistering ? nicknameError(nickname) : '';
    if (nicknameProblem) {
      Alert.alert('Choose a Nickname', nicknameProblem);
      return;
    }
    if (isRegistering && password.length < 6) {
      Alert.alert('Password Too Short', 'Your password must contain at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegistering) {
        // App.js creates the users/{uid} profile when the auth state changes;
        // writing it here too races that write and fails the Firestore rules.
        // It picks up the nickname from here when it does.
        rememberNicknameForSignUp(nickname);
        await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        Alert.alert('Success', 'Account created successfully!');
      } else {
        await signInWithEmailAndPassword(auth, normalizedEmail, password);
      }
    } catch (error) {
      if (isRegistering) takePendingNickname(); // The account was not created.
      Alert.alert('Authentication Error', getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    if (isSubmitting || isGoogleBusy) return;
    setIsRegistering((current) => !current);
  };

  return (
    // Always dark: the card sits over a wall of movie posters.
    <ThemeProvider isDark>
      <View style={styles.screen}>
        <View style={styles.previewGrid} pointerEvents="none">
          {moviePreviews.length
            ? moviePreviews.map((movie) => (
                <Image
                  key={movie.id}
                  source={{ uri: movie.imageUrl }}
                  style={styles.previewImage}
                  resizeMode="cover"
                  accessibilityLabel={`${movie.title} poster`}
                />
              ))
            : Array.from({ length: 6 }, (_, index) => <View key={index} style={[styles.previewImage, styles.previewPlaceholder]} />)}
          <View style={styles.backgroundOverlay} />
        </View>

        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {onClose ? (
                <Button title="Continue browsing" variant="secondary" size="sm" onPress={onClose} disabled={isSubmitting} style={styles.closeButton} />
              ) : null}

              <View style={styles.column}>
                <Text style={[type.overline, { color: DARK.primary }]}>The Movie Network</Text>
                <Text style={[type.display, styles.brandTitle, { color: DARK.text }]}>Your next great movie starts here.</Text>
                <Text style={[type.body, styles.brandSubtitle, { color: DARK.textSecondary }]}>
                  Discover films, share reactions and find your cinema crowd.
                </Text>
              </View>

              <View style={[styles.column, styles.authCard, { backgroundColor: 'rgba(17,20,28,0.92)', borderColor: DARK.border }]}>
                <Text style={[type.title, { color: DARK.text }]}>{isRegistering ? 'Create your account' : 'Welcome back'}</Text>
                <Text style={[type.bodySmall, styles.cardSubtitle, { color: DARK.textSecondary }]}>
                  {isRegistering ? 'Join the community of movie fans.' : 'Sign in to continue the conversation.'}
                </Text>

                {reason ? <Banner tone="info" message={reason} style={styles.banner} /> : null}
                {!isFirebaseConfigured ? (
                  <Banner
                    tone="error"
                    message="Firebase is not configured. Fill in the missing Firebase values in .env and restart Expo."
                    style={styles.banner}
                  />
                ) : null}

                {isRegistering ? (
                  <TextField
                    label="Nickname"
                    placeholder="How movie fans will see you"
                    value={nickname}
                    onChangeText={setNickname}
                    autoCapitalize="words"
                    autoCorrect={false}
                    maxLength={NICKNAME_MAX_LENGTH + 5}
                    returnKeyType="next"
                    editable={!isSubmitting}
                  />
                ) : null}
                <TextField
                  label="Email address"
                  placeholder="you@example.com"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  returnKeyType="next"
                  editable={!isSubmitting}
                />
                <TextField
                  label="Password"
                  placeholder={isRegistering ? 'At least 6 characters' : 'Enter your password'}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  autoComplete={isRegistering ? 'new-password' : 'current-password'}
                  returnKeyType="done"
                  onSubmitEditing={handleAuth}
                  editable={!isSubmitting}
                />

                <Button
                  title={isRegistering ? 'Create account' : 'Sign in'}
                  fullWidth
                  loading={isSubmitting}
                  disabled={!isFirebaseConfigured || isGoogleBusy}
                  onPress={handleAuth}
                  style={styles.submit}
                />

                {isFirebaseConfigured && isGoogleSignInConfigured ? (
                  <>
                    <View style={styles.divider}>
                      <View style={[styles.dividerLine, { backgroundColor: DARK.border }]} />
                      <Text style={[type.caption, styles.dividerText, { color: DARK.textTertiary }]}>or</Text>
                      <View style={[styles.dividerLine, { backgroundColor: DARK.border }]} />
                    </View>
                    <GoogleSignInButton disabled={isSubmitting} onBusyChange={setIsGoogleBusy} />
                  </>
                ) : null}

                <Text style={[type.bodySmall, styles.toggleText, { color: DARK.textSecondary }]}>
                  {isRegistering ? 'Already have an account? ' : 'New to The Movie Network? '}
                  <Text
                    style={[type.bodyStrong, { color: DARK.link }]}
                    onPress={toggleMode}
                    accessibilityRole="button"
                    suppressHighlighting={false}
                  >
                    {isRegistering ? 'Sign in' : 'Create account'}
                  </Text>
                </Text>
              </View>

              <Text style={[type.caption, styles.attribution, { color: DARK.textTertiary }]}>Movie previews powered by TMDb</Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </ThemeProvider>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#07090F' },
  safeArea: { flex: 1 },
  previewGrid: { ...StyleSheet.absoluteFill, flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#07090F' },
  previewImage: { width: '50%', height: '33.34%' },
  previewPlaceholder: { backgroundColor: '#161a24', borderWidth: 1, borderColor: '#0d1017' },
  backgroundOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(7,9,15,0.78)' },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: GUTTER + space.xs, paddingVertical: space.xxxl },
  closeButton: { alignSelf: 'flex-start', marginBottom: space.xxl },
  column: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  brandTitle: { marginTop: space.sm, maxWidth: 360 },
  brandSubtitle: { marginTop: space.sm, marginBottom: space.xxl, maxWidth: 390 },
  authCard: { borderRadius: radius.xl, borderWidth: 1, padding: space.xxl, ...glassShadow },
  cardSubtitle: { marginTop: space.xs, marginBottom: space.xl },
  banner: { marginBottom: space.lg },
  submit: { marginTop: space.xs },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: space.lg },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { marginHorizontal: space.md },
  toggleText: { textAlign: 'center', marginTop: space.xl },
  attribution: { textAlign: 'center', marginTop: space.lg },
});

export default AuthScreen;
