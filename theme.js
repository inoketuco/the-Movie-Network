import React, { createContext, useContext } from 'react';
import { Image, StyleSheet, View } from 'react-native';

// The Movie Network design tokens. Every screen and the shared components in ui.js
// take colours, spacing, radii and type from here, so similar things look the same.

// One accent for every primary action, active state and link.
const GOLD = '#E8B64C';

const DARK = {
  isDark: true,
  statusBar: 'light-content',
  fallback: '#07090F',
  tint: 'rgba(7,9,15,0.74)',
  surface: 'rgba(255,255,255,0.06)',
  surfaceRaised: 'rgba(255,255,255,0.10)',
  // Opaque surface for sheets and forms, where legibility matters more than glass.
  sheet: '#11141C',
  field: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.12)',
  borderStrong: 'rgba(255,255,255,0.24)',
  text: '#F4F5F7',
  textSecondary: 'rgba(236,238,242,0.68)',
  textTertiary: 'rgba(236,238,242,0.44)',
  primary: GOLD,
  primaryPressed: '#D4A23A',
  onPrimary: '#16120A',
  link: GOLD,
  rating: GOLD,
  danger: '#F2555A',
  dangerSurface: 'rgba(242,85,90,0.12)',
  success: '#46C17F',
  successSurface: 'rgba(70,193,127,0.12)',
  warning: '#F0A94B',
  warningSurface: 'rgba(240,169,75,0.12)',
  info: '#7AA2F7',
  infoSurface: 'rgba(122,162,247,0.12)',
  scrim: 'rgba(3,5,10,0.72)',
};

const LIGHT = {
  isDark: false,
  statusBar: 'dark-content',
  fallback: '#EEF0F4',
  tint: 'rgba(244,245,248,0.80)',
  surface: 'rgba(255,255,255,0.72)',
  surfaceRaised: 'rgba(255,255,255,0.90)',
  sheet: '#FFFFFF',
  field: 'rgba(18,21,28,0.04)',
  border: 'rgba(18,21,28,0.09)',
  borderStrong: 'rgba(18,21,28,0.18)',
  text: '#12151C',
  textSecondary: '#586072',
  textTertiary: '#8A91A0',
  primary: GOLD,
  primaryPressed: '#D4A23A',
  onPrimary: '#16120A',
  // Darker gold so links and ratings stay readable on white.
  link: '#9A6A0E',
  rating: '#A8740F',
  danger: '#D93036',
  dangerSurface: 'rgba(217,48,54,0.08)',
  success: '#1F8A53',
  successSurface: 'rgba(31,138,83,0.09)',
  warning: '#B26B0A',
  warningSurface: 'rgba(178,107,10,0.09)',
  info: '#2F5FD0',
  infoSurface: 'rgba(47,95,208,0.08)',
  scrim: 'rgba(12,14,20,0.55)',
};

export const glass = (isDark) => (isDark ? DARK : LIGHT);

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
// Horizontal margin for every screen.
export const GUTTER = space.lg;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

export const type = StyleSheet.create({
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  cardTitle: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  bodySmall: { fontSize: 13, lineHeight: 19, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  price: { fontSize: 16, lineHeight: 20, fontWeight: '700' },
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: 0.2 },
  buttonSmall: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.2 },
});

// A soft shadow that lifts panels off the backdrop. Android elevation is left off:
// it draws an opaque slab behind translucent views.
export const glassShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.16,
  shadowRadius: 18,
  elevation: 0,
};

// Components read the palette from context; App.js provides it from the theme toggle.
const ThemeContext = createContext(DARK);
export const ThemeProvider = ({ isDark, children }) => (
  <ThemeContext.Provider value={glass(isDark)}>{children}</ThemeContext.Provider>
);
export const useTheme = () => useContext(ThemeContext);

// Full-screen blurred backdrop. `imageUrl` is usually a trending movie's backdrop;
// without one, the plain fallback colour is used.
export const GlassBackground = ({ isDark, imageUrl }) => {
  const theme = glass(isDark);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.fallback }]} pointerEvents="none">
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={28} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.tint }]} />
    </View>
  );
};
