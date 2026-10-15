import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

const TMDB_IMAGE = 'https://image.tmdb.org/t/p';

export const posterUrl = (path) => (path ? `${TMDB_IMAGE}/w342${path}` : null);
export const backdropUrl = (path) => (path ? `${TMDB_IMAGE}/w500${path}` : null);
export const profileUrl = (path) => (path ? `${TMDB_IMAGE}/w185${path}` : null);
// All-over shirt prints are shown large, so they use higher-resolution images.
const largeProfileUrl = (path) => (path ? `${TMDB_IMAGE}/h632${path}` : null);
const largePosterUrl = (path) => (path ? `${TMDB_IMAGE}/w500${path}` : null);

// What gets printed on each kind of product. Character products need a cast member;
// the rest only need a movie.
export const designImageFor = (kind, design) => {
  if (!design) return null;
  if (kind === 'tee-character') return largeProfileUrl(design.profilePath) || largePosterUrl(design.posterPath);
  if (kind === 'tee-poster') return largePosterUrl(design.posterPath);
  if (kind === 'pin') return profileUrl(design.profilePath) || posterUrl(design.posterPath);
  if (kind === 'backdrop-poster' || kind === 'mug') return backdropUrl(design.backdropPath) || posterUrl(design.posterPath);
  return posterUrl(design.posterPath);
};

// Shows the movie art, or a quiet monogram when there is no art (offline, no TMDb key).
const Print = ({ uri, style, iconSize }) =>
  uri ? (
    <Image source={{ uri }} style={style} resizeMode="cover" />
  ) : (
    <View style={[style, styles.printFallback]}>
      <Text style={[styles.monogram, { fontSize: Math.max(9, iconSize * 0.45) }]}>TMN</Text>
    </View>
  );

// Shirt pieces as fractions of the shirt's size. Sleeves are rotated around their centre.
const SLEEVE = { width: 0.34, height: 0.22, top: 0.12, angle: 32 };
const BODY = { left: 0.2, top: 0.06, width: 0.6, height: 0.9 };
// The print is one image laid over the whole shirt (a bit larger, so the sleeve
// tips are covered too); each piece clips its own part of it.
const PRINT_SCALE = 1.2;

// Places the shared print inside a rotated sleeve: counter-rotated and offset so
// that, once the sleeve's own rotation is applied, it lines up with the body's print.
const sleevePrintStyle = (size, sleeveLeft, angleDegrees) => {
  const printSize = size * PRINT_SCALE;
  const width = size * SLEEVE.width;
  const height = size * SLEEVE.height;
  const toShirtCentreX = size / 2 - (sleeveLeft + width / 2);
  const toShirtCentreY = size / 2 - (size * SLEEVE.top + height / 2);
  const angle = (-angleDegrees * Math.PI) / 180;
  const localX = toShirtCentreX * Math.cos(angle) - toShirtCentreY * Math.sin(angle);
  const localY = toShirtCentreX * Math.sin(angle) + toShirtCentreY * Math.cos(angle);
  return {
    position: 'absolute',
    width: printSize,
    height: printSize,
    left: width / 2 + localX - printSize / 2,
    top: height / 2 + localY - printSize / 2,
    transform: [{ rotate: `${-angleDegrees}deg` }],
  };
};

const Tee = ({ size, color, uri, caption }) => {
  const printSize = size * PRINT_SCALE;
  const printOrigin = (size - printSize) / 2;
  const sleeves = [
    { key: 'left', left: size * 0.03, angle: -SLEEVE.angle },
    { key: 'right', left: size * (1 - 0.03 - SLEEVE.width), angle: SLEEVE.angle },
  ];

  return (
    <View style={{ width: size, height: size }}>
      {sleeves.map((sleeve) => (
        <View
          key={sleeve.key}
          style={[
            styles.teePiece,
            {
              backgroundColor: color,
              left: sleeve.left,
              top: size * SLEEVE.top,
              width: size * SLEEVE.width,
              height: size * SLEEVE.height,
              borderRadius: size * 0.05,
              transform: [{ rotate: `${sleeve.angle}deg` }],
            },
          ]}
        >
          {uri ? <Image source={{ uri }} style={sleevePrintStyle(size, sleeve.left, sleeve.angle)} resizeMode="cover" /> : null}
          <View style={styles.sleeveShade} />
        </View>
      ))}
      <View
        style={[
          styles.teePiece,
          styles.teeBody,
          {
            backgroundColor: color,
            left: size * BODY.left,
            top: size * BODY.top,
            width: size * BODY.width,
            height: size * BODY.height,
            borderTopLeftRadius: size * 0.1,
            borderTopRightRadius: size * 0.1,
            borderBottomLeftRadius: size * 0.05,
            borderBottomRightRadius: size * 0.05,
          },
        ]}
      >
        {uri ? (
          <Image
            source={{ uri }}
            resizeMode="cover"
            style={{
              position: 'absolute',
              width: printSize,
              height: printSize,
              left: printOrigin - size * BODY.left,
              top: printOrigin - size * BODY.top,
            }}
          />
        ) : (
          <Text style={[styles.monogram, { fontSize: size * 0.08, marginTop: size * 0.3 }]}>TMN</Text>
        )}
        {caption && size >= 90 ? (
          <View style={[styles.teeCaptionStrip, { paddingVertical: size * 0.015 }]}>
            <Text style={[styles.teeCaption, { fontSize: Math.max(7, size * 0.05) }]} numberOfLines={1}>
              {caption.toUpperCase()}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.collar, { left: size * 0.39, top: size * 0.03, width: size * 0.22, height: size * 0.12, borderBottomLeftRadius: size * 0.11, borderBottomRightRadius: size * 0.11, borderWidth: size * 0.018 }]} />
    </View>
  );
};

const MerchArt = ({ kind, design, size = 130 }) => {
  const uri = designImageFor(kind, design);
  const caption = kind === 'tee-character' || kind === 'pin' ? design?.characterName : design?.movieTitle;

  if (kind === 'tee-character') {
    return <Tee size={size} color="#f8fafc" uri={uri} caption={caption} />;
  }

  if (kind === 'tee-poster') {
    return <Tee size={size} color="#1c2433" uri={uri} caption={design?.movieTitle} />;
  }

  if (kind === 'poster') {
    return (
      <View style={[styles.posterFrame, { padding: size * 0.03, transform: [{ rotate: '-3deg' }] }]}>
        <Print uri={uri} iconSize={size * 0.3} style={{ width: size * 0.54, height: size * 0.81 }} />
      </View>
    );
  }

  if (kind === 'backdrop-poster') {
    return (
      <View style={[styles.backdropFrame, { width: size, borderWidth: size * 0.03 }]}>
        <Print uri={uri} iconSize={size * 0.25} style={{ width: '100%', height: size * 0.5 }} />
        <Text style={[styles.backdropTitle, { fontSize: Math.max(8, size * 0.07) }]} numberOfLines={1}>
          {(design?.movieTitle || 'Premiere night').toUpperCase()}
        </Text>
      </View>
    );
  }

  if (kind === 'pin') {
    const pinSize = size * 0.72;
    return (
      <View style={[styles.pin, { width: pinSize, height: pinSize, borderRadius: pinSize / 2, borderWidth: size * 0.05 }]}>
        <Print uri={uri} iconSize={size * 0.3} style={StyleSheet.absoluteFill} />
        <View style={[styles.pinShine, { width: pinSize * 0.45, height: pinSize * 0.22, borderRadius: pinSize * 0.2, top: pinSize * 0.08, left: pinSize * 0.12 }]} />
      </View>
    );
  }

  // mug
  return (
    <View style={{ width: size * 0.9, height: size * 0.78 }}>
      <View style={[styles.mugHandle, { right: 0, top: size * 0.16, width: size * 0.28, height: size * 0.38, borderRadius: size * 0.13, borderWidth: size * 0.06 }]} />
      <View style={[styles.mugBody, { width: size * 0.66, height: size * 0.78, borderRadius: size * 0.07 }]}>
        <Print uri={uri} iconSize={size * 0.26} style={{ flex: 1, marginVertical: size * 0.1 }} />
        <View style={[styles.mugRim, { height: size * 0.05 }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  printFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#e5e7eb', overflow: 'hidden' },
  teePiece: { position: 'absolute', overflow: 'hidden' },
  teeBody: { alignItems: 'center', justifyContent: 'flex-start' },
  // Slightly darker sleeves give the flat drawing some depth.
  sleeveShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.12)' },
  collar: { position: 'absolute', backgroundColor: 'transparent', borderColor: 'rgba(15,23,42,0.55)', borderTopWidth: 0 },
  monogram: { color: 'rgba(100,110,130,0.7)', fontWeight: '800', letterSpacing: 2 },
  teeCaptionStrip: { position: 'absolute', left: 0, right: 0, bottom: '9%', alignItems: 'center', backgroundColor: 'rgba(12,17,27,0.62)' },
  teeCaption: { color: '#E8B64C', fontWeight: '800', letterSpacing: 1.2 },
  posterFrame: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  backdropFrame: { borderColor: '#0b0f19', backgroundColor: '#0b0f19', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  backdropTitle: { color: '#E8B64C', fontWeight: '800', letterSpacing: 1.2, textAlign: 'center', paddingVertical: 4 },
  pin: { overflow: 'hidden', borderColor: '#C99A3A', backgroundColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 6, elevation: 6 },
  pinShine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.35)', transform: [{ rotate: '-25deg' }] },
  mugHandle: { position: 'absolute', borderColor: '#f1f5f9' },
  mugBody: { position: 'absolute', left: 0, top: 0, backgroundColor: '#f1f5f9', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, elevation: 5 },
  mugRim: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: '#cbd5e1' },
});

export default MerchArt;
