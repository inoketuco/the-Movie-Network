import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import * as WebBrowser from 'expo-web-browser';
import { GUTTER, radius, space, type, useTheme } from './theme';
import { Button, Chip } from './ui';

const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
// Plots longer than this start collapsed behind "Read more".
const LONG_PLOT_LENGTH = 280;

// The best YouTube video to play: an official trailer, then any trailer, then a teaser.
// Featurettes, clips and fan uploads are skipped.
export const pickTrailer = (videos = []) => {
  const youtube = videos.filter((video) => video.site === 'YouTube' && video.key);
  const rank = (video) =>
    (video.type === 'Trailer' ? 0 : video.type === 'Teaser' ? 2 : 9) + (video.official ? 0 : 1);
  const best = youtube.filter((video) => rank(video) < 9).sort((a, b) => rank(a) - rank(b))[0];
  return best ? { key: best.key, name: best.name } : null;
};

// "2h 19m"
export const formatRuntime = (minutes) => {
  if (!minutes) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ''}` : `${rest}m`;
};

const youtubeUrl = (key) => `https://www.youtube.com/watch?v=${key}`;

// Trailer (played inside the app) and storyline for a movie page.
const MovieDetails = ({ movie }) => {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(Boolean(TMDB_API_KEY && movie?.id != null));
  // Some studios block embedding; those trailers open on YouTube instead.
  const [playerFailed, setPlayerFailed] = useState(false);
  const [plotExpanded, setPlotExpanded] = useState(false);

  useEffect(() => {
    if (!TMDB_API_KEY || movie?.id == null) return undefined;
    let active = true;
    fetch(`https://api.themoviedb.org/3/movie/${movie.id}?api_key=${TMDB_API_KEY}&append_to_response=videos`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active) setDetails(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [movie?.id]);

  const trailer = pickTrailer(details?.videos?.results);
  const plot = details?.overview || movie?.overview || '';
  const isLongPlot = plot.length > LONG_PLOT_LENGTH;
  const runtime = formatRuntime(details?.runtime);
  const genres = (details?.genres || []).map((genre) => genre.name);
  const playerWidth = Math.min(width, 720) - GUTTER * 2;
  const playerHeight = Math.round((playerWidth * 9) / 16);

  const openOnYouTube = () => WebBrowser.openBrowserAsync(youtubeUrl(trailer.key)).catch(() => {});

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={[styles.frame, { height: playerHeight, backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : trailer ? (
        <View style={styles.section}>
          <Text style={[type.heading, styles.heading, { color: theme.text }]}>Trailer</Text>
          <View style={[styles.frame, { height: playerHeight, borderColor: theme.border }]}>
            {playerFailed ? (
              <View style={styles.fallback}>
                <Image
                  source={{ uri: `https://img.youtube.com/vi/${trailer.key}/hqdefault.jpg` }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} />
                <Text style={[type.bodySmall, styles.fallbackText, { color: theme.text }]}>
                  This trailer can only be played on YouTube.
                </Text>
                <Button title="Watch on YouTube" size="sm" onPress={openOnYouTube} />
              </View>
            ) : (
              <YoutubePlayer
                height={playerHeight}
                width={playerWidth}
                videoId={trailer.key}
                onError={() => setPlayerFailed(true)}
                initialPlayerParams={{ modestbranding: true, rel: false }}
                webViewProps={{ allowsFullscreenVideo: true, allowsInlineMediaPlayback: true }}
              />
            )}
          </View>
          {trailer.name ? (
            <Text style={[type.caption, styles.trailerName, { color: theme.textTertiary }]} numberOfLines={1}>
              {trailer.name}
            </Text>
          ) : null}
        </View>
      ) : null}

      {plot || details?.tagline || runtime || genres.length ? (
        <View style={styles.section}>
          <Text style={[type.heading, styles.heading, { color: theme.text }]}>Storyline</Text>
          {details?.tagline ? (
            <Text style={[type.bodyStrong, styles.tagline, { color: theme.link }]}>{details.tagline}</Text>
          ) : null}
          {plot ? (
            <Text
              style={[type.body, { color: theme.textSecondary }]}
              numberOfLines={isLongPlot && !plotExpanded ? 5 : undefined}
            >
              {plot}
            </Text>
          ) : (
            <Text style={[type.bodySmall, { color: theme.textTertiary }]}>No storyline is available for this movie yet.</Text>
          )}
          {isLongPlot ? (
            <Button
              title={plotExpanded ? 'Show less' : 'Read more'}
              variant="ghost"
              size="sm"
              style={styles.readMore}
              onPress={() => setPlotExpanded((expanded) => !expanded)}
            />
          ) : null}
          {runtime || genres.length ? (
            <View style={styles.facts}>
              {runtime ? <Chip label={runtime} accessibilityRole="text" /> : null}
              {genres.map((genre) => (
                <Chip key={genre} label={genre} accessibilityRole="text" />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: GUTTER, paddingTop: space.xl },
  section: { marginBottom: space.xxl },
  heading: { marginBottom: space.md },
  frame: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  trailerName: { marginTop: space.sm },
  fallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  fallbackText: { textAlign: 'center', marginBottom: space.md },
  tagline: { fontStyle: 'italic', marginBottom: space.sm },
  readMore: { alignSelf: 'flex-start', marginLeft: -space.md, marginTop: space.xs },
  facts: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.lg, rowGap: space.sm },
});

export default MovieDetails;
