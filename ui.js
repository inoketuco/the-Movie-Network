import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { glassShadow, radius, space, type, useTheme } from './theme';

// Shared building blocks, so similar things look and behave the same on every screen.

const BUTTON_HEIGHT = { md: 48, sm: 36 };

const buttonColors = (theme, variant) => {
  switch (variant) {
    case 'secondary':
      return { background: theme.surfaceRaised, pressed: theme.surface, border: theme.borderStrong, text: theme.text };
    case 'ghost':
      return { background: 'transparent', pressed: theme.surface, border: 'transparent', text: theme.link };
    case 'danger':
      return { background: theme.dangerSurface, pressed: theme.dangerSurface, border: theme.danger, text: theme.danger };
    default:
      return { background: theme.primary, pressed: theme.primaryPressed, border: theme.primary, text: theme.onPrimary };
  }
};

/**
 * variant: 'primary' (one main action per view), 'secondary', 'ghost' (text-style), 'danger'.
 * size: 'md' (48 high) or 'sm' (36 high).
 */
export const Button = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const colors = buttonColors(theme, variant);
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        {
          height: BUTTON_HEIGHT[size],
          paddingHorizontal: size === 'sm' ? space.md : space.xl,
          backgroundColor: pressed || hovered ? colors.pressed : colors.background,
          borderColor: focused ? theme.primary : colors.border,
          borderWidth: focused ? 2 : variant === 'ghost' ? 0 : 1,
          opacity: disabled && !loading ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Text style={[size === 'sm' ? type.buttonSmall : type.button, { color: colors.text }, textStyle]} numberOfLines={1}>
          {title}
        </Text>
      )}
    </Pressable>
  );
};

// A translucent glass panel. `raised` makes it a little more opaque.
export const Card = ({ children, raised = false, style, padded = true }) => {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        glassShadow,
        { backgroundColor: raised ? theme.surfaceRaised : theme.surface, borderColor: theme.border },
        padded && styles.cardPadding,
        style,
      ]}
    >
      {children}
    </View>
  );
};

// An opaque panel for forms, checkout and dialogs.
export const Sheet = ({ children, style }) => {
  const theme = useTheme();
  return <View style={[styles.sheet, { backgroundColor: theme.sheet, borderColor: theme.border }, style]}>{children}</View>;
};

export const Chip = ({ label, selected = false, onPress, accessibilityRole = 'button' }) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : pressed ? theme.surfaceRaised : theme.surface,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      <Text style={[type.buttonSmall, { color: selected ? theme.onPrimary : theme.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
};

// A small label such as "Test mode" or "Admin".
export const Badge = ({ label, tone = 'neutral', style }) => {
  const theme = useTheme();
  const tones = {
    neutral: [theme.surfaceRaised, theme.textSecondary],
    primary: ['rgba(232,182,76,0.16)', theme.link],
    success: [theme.successSurface, theme.success],
    warning: [theme.warningSurface, theme.warning],
    danger: [theme.dangerSurface, theme.danger],
    info: [theme.infoSurface, theme.info],
  };
  const [background, color] = tones[tone] || tones.neutral;
  return (
    <View style={[styles.badge, { backgroundColor: background }, style]}>
      <Text style={[type.overline, { color }]}>{label}</Text>
    </View>
  );
};

// A message strip: tone is 'error', 'warning', 'info' or 'success'.
export const Banner = ({ tone = 'info', title, message, actionLabel, onAction, style }) => {
  const theme = useTheme();
  const tones = {
    error: [theme.dangerSurface, theme.danger],
    warning: [theme.warningSurface, theme.warning],
    info: [theme.infoSurface, theme.info],
    success: [theme.successSurface, theme.success],
  };
  const [background, accent] = tones[tone] || tones.info;
  return (
    <View
      style={[styles.banner, { backgroundColor: background, borderColor: accent }, style]}
      accessibilityLiveRegion={tone === 'error' ? 'polite' : undefined}
    >
      <View style={styles.bannerCopy}>
        {title ? <Text style={[type.bodyStrong, { color: theme.text }]}>{title}</Text> : null}
        {message ? <Text style={[type.bodySmall, { color: title ? theme.textSecondary : theme.text }]}>{message}</Text> : null}
      </View>
      {actionLabel ? <Button title={actionLabel} onPress={onAction} variant="ghost" size="sm" /> : null}
    </View>
  );
};

export const TextField = ({ label, error, hint, style, inputStyle, right, ...inputProps }) => {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, style]}>
      {label || right ? (
        <View style={styles.fieldLabelRow}>
          {label ? <Text style={[type.caption, { color: theme.textSecondary }]}>{label}</Text> : <View />}
          {right}
        </View>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textTertiary}
        {...inputProps}
        onFocus={(event) => {
          setFocused(true);
          inputProps.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          inputProps.onBlur?.(event);
        }}
        style={[
          styles.input,
          type.body,
          {
            color: theme.text,
            backgroundColor: theme.field,
            borderColor: error ? theme.danger : focused ? theme.primary : theme.border,
          },
          inputStyle,
        ]}
      />
      {error ? (
        <Text style={[type.caption, styles.fieldMessage, { color: theme.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={[type.caption, styles.fieldMessage, { color: theme.textTertiary }]}>{hint}</Text>
      ) : null}
    </View>
  );
};

export const ScreenHeader = ({ title, subtitle, right, style }) => {
  const theme = useTheme();
  return (
    <View style={[styles.screenHeader, style]}>
      <View style={styles.screenHeaderCopy}>
        <Text style={[type.display, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={[type.bodySmall, styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
};

export const SectionHeading = ({ overline, title, style }) => {
  const theme = useTheme();
  return (
    <View style={style}>
      {overline ? <Text style={[type.overline, { color: theme.link, marginBottom: space.xs }]}>{overline}</Text> : null}
      <Text style={[type.heading, { color: theme.text }]}>{title}</Text>
    </View>
  );
};

// A label/value line in order summaries.
export const SummaryRow = ({ label, value, emphasis = false }) => {
  const theme = useTheme();
  const textStyle = emphasis ? type.heading : type.body;
  return (
    <View style={styles.summaryRow}>
      <Text style={[textStyle, { color: emphasis ? theme.text : theme.textSecondary }]}>{label}</Text>
      <Text style={[textStyle, styles.summaryValue, { color: theme.text }]} numberOfLines={2}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    ...Platform.select({ web: { cursor: 'pointer', outlineStyle: 'none' }, default: {} }),
  },
  fullWidth: { alignSelf: 'stretch' },
  card: { borderRadius: radius.lg, borderWidth: 1 },
  cardPadding: { padding: space.lg },
  sheet: { borderRadius: radius.xl, borderWidth: 1, padding: space.xxl },
  chip: { height: 36, paddingHorizontal: space.lg, marginRight: space.sm, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.sm },
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, paddingVertical: space.md, paddingLeft: space.lg, paddingRight: space.sm },
  bannerCopy: { flex: 1, paddingRight: space.sm },
  field: { marginBottom: space.lg },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  input: { height: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md },
  fieldMessage: { marginTop: space.xs },
  screenHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg },
  screenHeaderCopy: { flex: 1, marginRight: space.md },
  subtitle: { marginTop: space.xxs },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.xs },
  summaryValue: { flexShrink: 1, marginLeft: space.lg, textAlign: 'right' },
});
