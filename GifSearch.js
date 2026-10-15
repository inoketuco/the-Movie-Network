import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { radius, space, type, useTheme } from './theme';
import { Button, Chip, TextField } from './ui';

const REACTION_SUGGESTIONS = ['mind blown', 'standing ovation', 'plot twist', 'crying', 'bored'];

const GifSearch = ({ onGifSelected, movieTitle }) => {
  const theme = useTheme();
  const [searchTerm, setSearchTerm] = useState(movieTitle || '');
  const [gifs, setGifs] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const suggestions = movieTitle ? [movieTitle, ...REACTION_SUGGESTIONS] : REACTION_SUGGESTIONS;

  const searchGiphy = useCallback(async (term) => {
    const apiKey = process.env.EXPO_PUBLIC_GIPHY_API_KEY;
    const query = term.trim();
    if (!query) {
      setErrorMessage('Enter a search term first.');
      return;
    }
    if (!apiKey) {
      setErrorMessage('Giphy is not configured. Add EXPO_PUBLIC_GIPHY_API_KEY to .env.');
      return;
    }

    const url = `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=10&rating=pg-13`;

    try {
      setLoading(true);
      setErrorMessage('');
      const response = await fetch(url);
      const json = await response.json();
      if (!response.ok) throw new Error(json.meta?.msg || 'Could not search GIFs.');
      const results = Array.isArray(json.data) ? json.data.filter((gif) => gif.images?.fixed_height?.url) : [];
      setGifs(results);
      if (!results.length) setErrorMessage(`No GIFs found for "${query}". Try another search.`);
    } catch (error) {
      setGifs([]);
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Start with reactions related to the movie being reviewed.
  useEffect(() => {
    if (movieTitle) searchGiphy(movieTitle);
  }, [movieTitle, searchGiphy]);

  const searchSuggestion = (term) => {
    setSearchTerm(term);
    searchGiphy(term);
  };

  return (
    <View>
      <View style={styles.searchRow}>
        <TextField
          style={styles.searchField}
          placeholder="Try 'mind blown' or 'standing ovation'"
          value={searchTerm}
          onChangeText={setSearchTerm}
          onSubmitEditing={() => searchGiphy(searchTerm)}
          returnKeyType="search"
          editable={!loading}
        />
        <Button title="Search" variant="secondary" loading={loading} onPress={() => searchGiphy(searchTerm)} style={styles.searchButton} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestions} keyboardShouldPersistTaps="handled">
        {suggestions.map((term) => (
          <Chip key={term} label={term} onPress={() => searchSuggestion(term)} />
        ))}
      </ScrollView>

      {errorMessage ? <Text style={[type.caption, styles.errorText, { color: theme.danger }]}>{errorMessage}</Text> : null}

      {loading && !gifs.length ? <ActivityIndicator color={theme.primary} style={styles.loading} /> : null}

      {gifs.length ? (
        <View style={styles.results}>
          {gifs.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.gifButton, { backgroundColor: theme.surfaceRaised }, pressed && styles.pressed]}
              onPress={() => onGifSelected(item.images.fixed_height.url)}
              accessibilityRole="button"
              accessibilityLabel="Choose this GIF"
            >
              <Image source={{ uri: item.images.fixed_height.url }} style={styles.gif} />
              <View style={styles.chooseBadge}>
                <Text style={[type.caption, styles.chooseText]}>Choose</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : !loading ? (
        <View style={[styles.emptyState, { borderColor: theme.border }]}>
          <Text style={[type.bodyStrong, { color: theme.text }]}>Find the perfect reaction</Text>
          <Text style={[type.caption, styles.emptyText, { color: theme.textSecondary }]}>Search GIPHY, then tap a result to attach it.</Text>
        </View>
      ) : null}

      <Text style={[type.caption, styles.attribution, { color: theme.textTertiary }]}>Powered by GIPHY</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'flex-start' },
  searchField: { flex: 1, marginBottom: 0, marginRight: space.sm },
  searchButton: { minWidth: 88 },
  suggestions: { paddingTop: space.md, paddingBottom: space.xs },
  errorText: { marginTop: space.sm },
  loading: { marginVertical: space.xl },
  results: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingTop: space.md },
  gifButton: { width: '48.5%', aspectRatio: 1, marginBottom: space.sm, borderRadius: radius.md, overflow: 'hidden' },
  pressed: { opacity: 0.8 },
  gif: { width: '100%', height: '100%' },
  chooseBadge: { position: 'absolute', right: space.sm, bottom: space.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.sm, backgroundColor: 'rgba(7,9,15,0.8)' },
  chooseText: { color: '#fff' },
  emptyState: { marginTop: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed' },
  emptyText: { marginTop: space.xs },
  attribution: { textAlign: 'right', marginTop: space.sm },
});

export default GifSearch;
