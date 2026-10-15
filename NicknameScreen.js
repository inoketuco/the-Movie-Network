import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cleanNickname, NICKNAME_MAX_LENGTH, nicknameError } from './nickname';
import { glass, GlassBackground, glassShadow, GUTTER, radius, space, type } from './theme';
import { Button, TextField } from './ui';

// Asks for a nickname: required after sign-in when the profile has none, or opened
// from the header to change it (then `onCancel` is given).
const NicknameScreen = ({ isDark = true, backdropUrl, initialNickname = '', onSave, onCancel, onSignOut }) => {
  const theme = glass(isDark);
  const [nickname, setNickname] = useState(initialNickname);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(onCancel);

  const save = async () => {
    const problem = nicknameError(nickname);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(cleanNickname(nickname));
    } catch (saveError) {
      setError(saveError.message || 'Could not save your nickname. Check your connection and try again.');
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle={theme.statusBar} />
      <GlassBackground isDark={isDark} imageUrl={backdropUrl} />
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.card, glassShadow, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
            <Text style={[type.overline, { color: theme.link }]}>{isEditing ? 'Your profile' : 'One last step'}</Text>
            <Text style={[type.title, styles.title, { color: theme.text }]}>
              {isEditing ? 'Change your nickname' : 'Choose your nickname'}
            </Text>
            <Text style={[type.bodySmall, styles.subtitle, { color: theme.textSecondary }]}>
              This is how other movie fans will see you on your reviews.
            </Text>

            <TextField
              label="Nickname"
              placeholder="e.g. PopcornQueen"
              value={nickname}
              onChangeText={(value) => {
                setNickname(value);
                if (error) setError('');
              }}
              maxLength={NICKNAME_MAX_LENGTH + 5}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={save}
              editable={!saving}
              autoFocus
              error={error}
              hint="2–20 characters. Letters, numbers, spaces, dots, dashes or underscores."
            />

            <Button title="Save nickname" fullWidth loading={saving} onPress={save} />
            {isEditing ? (
              <Button title="Cancel" variant="ghost" fullWidth style={styles.secondary} onPress={onCancel} disabled={saving} />
            ) : onSignOut ? (
              <Button title="Sign out" variant="ghost" fullWidth style={styles.secondary} onPress={onSignOut} disabled={saving} />
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: GUTTER + space.xs },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: space.xxl, borderRadius: radius.xl, borderWidth: 1 },
  title: { marginTop: space.sm },
  subtitle: { marginTop: space.sm, marginBottom: space.xl },
  secondary: { marginTop: space.sm },
});

export default NicknameScreen;
