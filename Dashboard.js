import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { glass, glassShadow, GUTTER, radius, space, type } from './theme';
import { Banner, Button, Chip, ScreenHeader } from './ui';

const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;

// TMDb genre ids: https://developer.themoviedb.org/reference/genre-movie-list
const GENRE_NAMES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};
const GENRE_FILTERS = [28, 35, 27, 16, 878, 10749, 53, 18, 10751, 99];

export const CATEGORIES = [
  { key: 'trending', label: 'Trending', title: 'Trending Movies', path: 'trending/movie/day' },
  { key: 'popular', label: 'Popular', title: 'Popular Movies', path: 'movie/popular' },
  { key: 'top_rated', label: 'Top Rated', title: 'Top Rated Movies', path: 'movie/top_rated' },
  { key: 'now_playing', label: 'In Cinemas', title: 'Now in Cinemas', path: 'movie/now_playing' },
  { key: 'upcoming', label: 'Coming Soon', title: 'Upcoming Releases', path: 'movie/upcoming' },
  // A minimum vote count keeps obscure, unrated titles out of the genre lists.
  ...GENRE_FILTERS.map((id) => ({
    key: `genre-${id}`,
    label: GENRE_NAMES[id],
    title: `${GENRE_NAMES[id]} Movies`,
    path: 'discover/movie',
    query: `with_genres=${id}&sort_by=popularity.desc&vote_count.gte=50`,
  })),
];

const categoryUrl = (category) =>
  `https://api.themoviedb.org/3/${category.path}?api_key=${TMDB_API_KEY}${category.query ? `&${category.query}` : ''}`;

// Unreleased films have no votes yet, which TMDb reports as a 0.0 average.
export const formatRating = (movie) =>
  movie.vote_count > 0 && Number.isFinite(movie.vote_average) ? `★ ${movie.vote_average.toFixed(1)}` : 'Not yet rated';

const formatVotes = (count) =>
  !count ? '' : count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k votes` : `${count} votes`;

// "2025 · Action, Thriller"
export const movieMeta = (movie) => {
  const year = movie.release_date?.slice(0, 4);
  const genres = (movie.genre_ids || []).map((id) => GENRE_NAMES[id]).filter(Boolean).slice(0, 2).join(', ');
  return [year, genres].filter(Boolean).join(' · ');
};

const MovieCard = ({ movie, onPress, theme }) => {
  const meta = movieMeta(movie);
  const rated = movie.vote_count > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Opens reviews for this movie"
      style={({ pressed }) => [
        styles.card,
        glassShadow,
        { backgroundColor: pressed ? theme.surfaceRaised : theme.surface, borderColor: theme.border },
        pressed && styles.cardPressed,
      ]}
    >
      {movie.poster_path ? (
        <Image source={{ uri: `https://image.tmdb.org/t/p/w342${movie.poster_path}` }} style={styles.poster} />
      ) : (
        <View style={[styles.poster, styles.posterPlaceholder, { backgroundColor: theme.surfaceRaised }]}>
          <Text style={[type.caption, { color: theme.textTertiary }]}>No poster</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={[type.cardTitle, { color: theme.text }]} numberOfLines={2}>{movie.title}</Text>
        {meta ? <Text style={[type.caption, styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>{meta}</Text> : null}
        {movie.overview ? (
          <Text style={[type.bodySmall, styles.overview, { color: theme.textSecondary }]} numberOfLines={3}>
            {movie.overview}
          </Text>
        ) : null}
        <View style={styles.ratingRow}>
          <Text style={[type.bodyStrong, { color: rated ? theme.rating : theme.textTertiary }]}>{formatRating(movie)}</Text>
          {rated ? <Text style={[type.caption, styles.votes, { color: theme.textTertiary }]}>{formatVotes(movie.vote_count)}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
};

const Dashboard = ({ onSelectMovie, isDark = false, onToggleTheme }) => {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [switching, setSwitching] = useState(false);
  // Ignores a slow response for a category the user has already moved away from.
  const latestRequest = useRef(0);
  const theme = glass(isDark);

  const fetchMovies = useCallback(async (selectedCategory) => {
    if (!TMDB_API_KEY) {
      setErrorMessage('TMDb is not configured. Add EXPO_PUBLIC_TMDB_API_KEY to .env.');
      return;
    }

    const requestId = ++latestRequest.current;
    try {
      const response = await fetch(categoryUrl(selectedCategory));
      const data = await response.json();
      if (requestId !== latestRequest.current) return;
      if (!response.ok) throw new Error(data.status_message || 'Could not load movies.');
      setMovies(Array.isArray(data.results) ? data.results : []);
      setErrorMessage('');
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      // Keep any movies already shown; the banner offers a retry.
      setErrorMessage(
        error instanceof TypeError ? 'Could not reach TMDb. Check your connection.' : error.message
      );
    }
  }, []);

  useEffect(() => {
    fetchMovies(CATEGORIES[0]).finally(() => setLoading(false));
  }, [fetchMovies]);

  const selectCategory = async (nextCategory) => {
    if (nextCategory.key === category.key) return;
    setCategory(nextCategory);
    setMovies([]);
    setErrorMessage('');
    setSwitching(true);
    await fetchMovies(nextCategory);
    setSwitching(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetchMovies(category);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[type.bodySmall, styles.loadingText, { color: theme.textSecondary }]}>Loading movies…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={category.title}
        subtitle="Tap a movie to read and write reviews."
        right={
          <Button
            title={isDark ? 'Light mode' : 'Dark mode'}
            variant="secondary"
            size="sm"
            onPress={onToggleTheme}
            accessibilityLabel={`Switch to ${isDark ? 'light' : 'dark'} theme`}
          />
        }
        style={styles.header}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller} contentContainerStyle={styles.chipRow}>
        {CATEGORIES.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            selected={item.key === category.key}
            onPress={() => selectCategory(item)}
            accessibilityRole="tab"
          />
        ))}
      </ScrollView>
      {errorMessage ? (
        <Banner
          tone="error"
          message={errorMessage}
          actionLabel={refreshing ? 'Retrying…' : 'Retry'}
          onAction={refresh}
          style={styles.banner}
        />
      ) : null}

      <FlatList
        style={styles.movieList}
        contentContainerStyle={styles.movieListContent}
        data={movies}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} colors={[theme.primary]} />}
        ListEmptyComponent={
          switching ? (
            <ActivityIndicator style={styles.switchingIndicator} size="large" color={theme.primary} />
          ) : !errorMessage ? (
            <Text style={[type.bodySmall, styles.emptyText, { color: theme.textSecondary }]}>
              No movies in this category right now. Pull down to refresh.
            </Text>
          ) : null
        }
        renderItem={({ item }) => <MovieCard movie={item} theme={theme} onPress={() => onSelectMovie(item)} />}
      />
    </View>
  );
};

// Transparent over App's glass backdrop; colours, spacing and type come from theme.js.
const POSTER_WIDTH = 92;

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: space.xl },
  header: { paddingHorizontal: GUTTER },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: space.md },
  chipScroller: { flexGrow: 0, marginBottom: space.lg },
  chipRow: { paddingHorizontal: GUTTER },
  banner: { marginHorizontal: GUTTER, marginBottom: space.md },
  movieList: { flex: 1 },
  movieListContent: { paddingHorizontal: GUTTER, paddingBottom: space.xxxl },
  switchingIndicator: { marginTop: space.xxxl * 1.5 },
  emptyText: { textAlign: 'center', marginTop: space.xxxl },
  card: { flexDirection: 'row', marginBottom: space.md, borderRadius: radius.lg, borderWidth: 1, padding: space.sm },
  cardPressed: { transform: [{ scale: 0.985 }] },
  poster: { width: POSTER_WIDTH, aspectRatio: 2 / 3, borderRadius: radius.md },
  posterPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, paddingHorizontal: space.md, paddingVertical: space.xs },
  meta: { marginTop: space.xs },
  overview: { marginTop: space.sm },
  ratingRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 'auto', paddingTop: space.sm },
  votes: { marginLeft: space.sm },
});

export default Dashboard;
