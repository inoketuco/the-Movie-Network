import React, { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import GifSearch from './GifSearch';
import MovieDetails from './MovieDetails';
import { db, auth, isFirebaseConfigured } from './firebaseConfig';
import { collection, addDoc, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { withTimeout } from './withTimeout';
import { GlassBackground, GUTTER, radius, space, type, useTheme } from './theme';
import { Badge, Banner, Button, Card, SectionHeading, Sheet, TextField } from './ui';

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w780';
const REVIEW_CHARACTER_LIMIT = 800;

// Reviews posted before nicknames existed have no authorName.
const authorLabel = (review, currentUserId) => {
  const isOwn = review.userId === currentUserId;
  if (review.authorName) return isOwn ? `${review.authorName} (you)` : review.authorName;
  return isOwn ? 'You' : 'Movie fan';
};
const FIRESTORE_WRITE_TIMEOUT_MS = 15000;

const ReviewScreen = ({ movie, isSignedIn = false, nickname = '', onRequestSignIn }) => {
  const [reviewText, setReviewText] = useState('');
  const [selectedGif, setSelectedGif] = useState(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [postedMessage, setPostedMessage] = useState('');
  const [reviews, setReviews] = useState([]);
  const [reviewsError, setReviewsError] = useState('');
  const theme = useTheme();

  useEffect(() => {
    if (!isFirebaseConfigured || !db || movie?.id == null) return undefined;

    const reviewsQuery = query(collection(db, 'reviews'), where('movieId', '==', movie.id));
    return onSnapshot(
      reviewsQuery,
      (snapshot) => {
        const loaded = snapshot.docs
          .map((reviewDoc) => ({ id: reviewDoc.id, ...reviewDoc.data() }))
          .sort((a, b) => (b.timestamp?.toMillis?.() ?? Date.now()) - (a.timestamp?.toMillis?.() ?? Date.now()));
        setReviews(loaded);
        setReviewsError('');
      },
      (error) => setReviewsError(error.message || 'Could not load reviews.')
    );
  }, [movie?.id]);

  const movieTitle = movie?.title || 'this movie';
  const releaseYear = movie?.release_date?.slice(0, 4) || 'Now showing';
  const rating = Number.isFinite(movie?.vote_average)
    ? movie.vote_average.toFixed(1)
    : null;
  const artworkPath = movie?.backdrop_path || movie?.poster_path;
  const artworkUrl = artworkPath ? `${TMDB_IMAGE_BASE_URL}${artworkPath}` : null;
  const canSubmit = Boolean(reviewText.trim() && selectedGif && !isSubmitting);

  const handleGifSelection = (gifUrl) => {
    setSelectedGif(gifUrl);
  };

  const initiateSubmit = () => {
    if (!isFirebaseConfigured || !auth?.currentUser) {
      onRequestSignIn?.('signIn');
      return;
    }
    if (!reviewText.trim() || !selectedGif) return;
    setOtpCode('');
    setOtpError('');
    setPostedMessage('');
    setShowOtpModal(true);
  };

  const closeOtpModal = () => {
    if (isSubmitting) return;
    setShowOtpModal(false);
    setOtpError('');
  };

  // The modal stays open while saving so any error is shown inside it; an
  // Alert raised while a modal is dismissing can be silently dropped on iOS.
  const verifyAndSaveReview = async () => {
    if (otpCode.trim() !== '123456') {
      setOtpError('That code is not correct. Enter 123456.');
      return;
    }

    setOtpError('');
    setIsSubmitting(true);

    try {
      await withTimeout(
        addDoc(collection(db, 'reviews'), {
          userId: auth.currentUser ? auth.currentUser.uid : 'guest',
          authorName: nickname || null,
          movieId: movie?.id ?? null,
          movieTitle: movie?.title ?? null,
          reviewText: reviewText.trim(),
          gifUrl: selectedGif,
          timestamp: serverTimestamp(),
        }),
        FIRESTORE_WRITE_TIMEOUT_MS,
        'The server did not respond. Check your connection and try again.'
      );

      setShowOtpModal(false);
      setReviewText('');
      setSelectedGif(null);
      setOtpCode('');
      setPostedMessage('Review posted! You can see it below.');
    } catch (error) {
      console.error('Error adding document: ', error);
      setOtpError(
        error.code === 'permission-denied'
          ? 'Firestore rejected the review. Deploy firestore.rules and try again.'
          : error.message || 'Could not save review. Check your connection and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const hint = !reviewText.trim() && !selectedGif
    ? 'Write a review and choose a GIF to continue.'
    : !reviewText.trim()
      ? 'Write your review in Step 1 to continue.'
      : 'Search for a GIF and tap one in Step 2 to continue.';

  return (
    <View style={styles.screen}>
      <GlassBackground isDark imageUrl={artworkUrl} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {artworkUrl ? <Image source={{ uri: artworkUrl }} style={styles.heroArtwork} resizeMode="cover" /> : null}
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            <Text style={[type.overline, { color: theme.primary }]}>Reviews</Text>
            <Text style={[type.display, styles.heroTitle, { color: theme.text }]}>{movieTitle}</Text>
            <Text style={[type.bodyStrong, styles.heroMeta, { color: theme.textSecondary }]}>
              {releaseYear}
              {rating ? <Text style={{ color: theme.rating }}>{`  ·  ★ ${rating}`}</Text> : null}
            </Text>
          </View>
        </View>

        <MovieDetails movie={movie} />

        {!isSignedIn ? (
          <Card raised style={styles.panel}>
            <Text style={[type.overline, { color: theme.link }]}>Join the conversation</Text>
            <Text style={[type.title, styles.panelTitle, { color: theme.text }]}>Sign in to post your review</Text>
            <Text style={[type.bodySmall, styles.panelText, { color: theme.textSecondary }]}>
              Anyone can read the reviews below. To share your own take on {movieTitle} with a GIF reaction, sign in or
              create a free account. We'll bring you right back here.
            </Text>
            <Button title="Sign in to review" fullWidth onPress={() => onRequestSignIn?.('signIn')} />
            <Button
              title="Create a free account"
              variant="secondary"
              fullWidth
              style={styles.secondaryAction}
              onPress={() => onRequestSignIn?.('register')}
            />
          </Card>
        ) : (
          <Card raised style={styles.panel}>
            <View style={styles.sectionRow}>
              <SectionHeading overline="Step 1" title="Write your review" />
              <Text style={[type.caption, { color: theme.textTertiary }]}>{reviewText.length}/{REVIEW_CHARACTER_LIMIT}</Text>
            </View>
            <TextField
              placeholder={`What did you think of ${movieTitle}?`}
              multiline
              scrollEnabled={false}
              maxLength={REVIEW_CHARACTER_LIMIT}
              textAlignVertical="top"
              value={reviewText}
              onChangeText={setReviewText}
              style={styles.reviewField}
              inputStyle={styles.reviewInput}
            />

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <SectionHeading overline="Step 2" title="Add a reaction" />
            <Text style={[type.bodySmall, styles.panelText, { color: theme.textSecondary }]}>
              Pick a GIF that captures your mood after the credits rolled.
            </Text>

            {selectedGif ? (
              <View style={[styles.selectedGifCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Image source={{ uri: selectedGif }} style={styles.selectedGif} resizeMode="cover" />
                <View style={styles.gifActions}>
                  <View style={styles.gifCopy}>
                    <Text style={[type.bodyStrong, { color: theme.text }]}>Reaction ready</Text>
                    <Text style={[type.caption, { color: theme.textSecondary }]}>This GIF will appear with your review.</Text>
                  </View>
                  <Button title="Change" variant="secondary" size="sm" onPress={() => setSelectedGif(null)} />
                </View>
              </View>
            ) : (
              <GifSearch onGifSelected={handleGifSelection} movieTitle={movie?.title} />
            )}

            <Button
              title="Verify and post review"
              fullWidth
              style={styles.submit}
              onPress={initiateSubmit}
              disabled={!canSubmit}
              loading={isSubmitting}
            />
            {!canSubmit && !isSubmitting ? (
              <Text style={[type.caption, styles.hint, { color: theme.textTertiary }]}>{hint}</Text>
            ) : null}
            {postedMessage ? <Banner tone="success" message={postedMessage} style={styles.posted} /> : null}
          </Card>
        )}

        <View style={styles.reviewsSection}>
          <Text style={[type.heading, styles.reviewsHeading, { color: theme.text }]}>
            Reviews for {movieTitle} ({reviews.length})
          </Text>
          {reviewsError ? <Banner tone="error" message={reviewsError} style={styles.reviewsError} /> : null}
          {!reviews.length && !reviewsError ? (
            <Text style={[type.bodySmall, { color: theme.textSecondary }]}>No reviews yet. Be the first to share your take.</Text>
          ) : null}
          {reviews.map((review) => (
            <Card key={review.id} style={styles.reviewItem} padded={false}>
              {review.gifUrl ? <Image source={{ uri: review.gifUrl }} style={styles.reviewItemGif} resizeMode="cover" /> : null}
              <View style={styles.reviewItemCopy}>
                <Text style={[type.caption, styles.reviewAuthor, { color: theme.link }]}>
                  {authorLabel(review, auth?.currentUser?.uid)}
                </Text>
                <Text style={[type.bodySmall, { color: theme.text }]}>{review.reviewText}</Text>
              </View>
            </Card>
          ))}
        </View>

        <Text style={[type.caption, styles.footerNote, { color: theme.textTertiary }]}>
          Be thoughtful. Great conversations start with honest reviews.
        </Text>
      </ScrollView>

      <Modal visible={showOtpModal} animationType="fade" transparent statusBarTranslucent onRequestClose={closeOtpModal}>
        <KeyboardAvoidingView
          style={[styles.modalOverlay, { backgroundColor: theme.scrim }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Sheet style={styles.modalSheet}>
            <Badge label="Secure post" tone="primary" style={styles.centered} />
            <Text style={[type.title, styles.modalTitle, { color: theme.text }]}>One quick check</Text>
            <Text style={[type.bodySmall, styles.modalText, { color: theme.textSecondary }]}>
              Enter the demo verification code below to publish your review.
            </Text>
            <Text style={[type.caption, styles.modalText, { color: theme.link }]}>Demo code: 123456</Text>
            <TextField
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              value={otpCode}
              onChangeText={(value) => {
                setOtpCode(value);
                setOtpError('');
              }}
              textContentType="oneTimeCode"
              editable={!isSubmitting}
              autoFocus
              error={otpError}
              style={styles.otpField}
              inputStyle={styles.otpInput}
            />
            <Button title="Verify and post" fullWidth loading={isSubmitting} onPress={verifyAndSaveReview} />
            <Button title="Cancel" variant="ghost" fullWidth style={styles.secondaryAction} onPress={closeOtpModal} disabled={isSubmitting} />
          </Sheet>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

// Always dark (App.js wraps this page in a dark ThemeProvider) over the movie's own artwork.
const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  scrollView: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: space.xxxl * 1.5 },
  hero: { minHeight: 210, justifyContent: 'flex-end', overflow: 'hidden' },
  heroArtwork: { ...StyleSheet.absoluteFill },
  heroOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(7,9,15,0.6)' },
  heroContent: { paddingHorizontal: GUTTER, paddingTop: space.xxxl, paddingBottom: space.xxl },
  heroTitle: { marginTop: space.sm },
  heroMeta: { marginTop: space.sm },
  panel: { marginHorizontal: GUTTER, padding: space.xl },
  panelTitle: { marginTop: space.sm },
  panelText: { marginTop: space.sm, marginBottom: space.lg },
  secondaryAction: { marginTop: space.sm },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  reviewField: { marginTop: space.md, marginBottom: 0 },
  reviewInput: { height: undefined, minHeight: 140, paddingTop: space.md, paddingBottom: space.md },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.xxl },
  selectedGifCard: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  selectedGif: { width: '100%', height: 220 },
  gifActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md },
  gifCopy: { flex: 1, marginRight: space.md },
  submit: { marginTop: space.xxl },
  hint: { textAlign: 'center', marginTop: space.sm },
  posted: { marginTop: space.md },
  reviewsSection: { marginHorizontal: GUTTER, marginTop: space.xxxl },
  reviewsHeading: { marginBottom: space.md },
  reviewsError: { marginBottom: space.md },
  reviewItem: { flexDirection: 'row', padding: space.md, marginBottom: space.md },
  reviewItemGif: { width: 72, height: 72, borderRadius: radius.sm, marginRight: space.md, backgroundColor: 'rgba(255,255,255,0.06)' },
  reviewItemCopy: { flex: 1 },
  reviewAuthor: { fontWeight: '700', marginBottom: space.xs },
  footerNote: { textAlign: 'center', marginHorizontal: space.xxxl, marginTop: space.xl },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: space.xl },
  modalSheet: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  centered: { alignSelf: 'center' },
  modalTitle: { textAlign: 'center', marginTop: space.md },
  modalText: { textAlign: 'center', marginTop: space.sm },
  otpField: { marginTop: space.lg },
  otpInput: { height: 56, fontSize: 24, fontWeight: '700', letterSpacing: 8, textAlign: 'center' },
});

export default ReviewScreen;
