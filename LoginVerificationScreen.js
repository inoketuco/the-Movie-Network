import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requestLoginCode, verifyLoginCode } from './loginVerification';
import { glass, GUTTER, radius, space, ThemeProvider, type } from './theme';
import { Badge, Button, TextField } from './ui';

const LoginVerificationScreen = ({ email, onVerified, onSignOut }) => {
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const hasRequestedInitialCode = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendCode = useCallback(async () => {
    setSending(true);
    setErrorMessage('');
    try {
      const result = await requestLoginCode();
      setSentTo(result.email || email);
      setCode('');
      setCooldown(60);
    } catch (error) {
      if (error.waitSeconds) setCooldown(error.waitSeconds);
      setErrorMessage(error.message);
    } finally {
      setSending(false);
    }
  }, [email]);

  useEffect(() => {
    // Guard against React running mount effects twice in development.
    if (hasRequestedInitialCode.current) return;
    hasRequestedInitialCode.current = true;
    sendCode();
  }, [sendCode]);

  const submitCode = async () => {
    if (verifying) return;
    if (!/^\d{6}$/.test(code)) {
      setErrorMessage('Enter the 6-digit code from your email.');
      return;
    }

    setVerifying(true);
    setErrorMessage('');
    try {
      await verifyLoginCode(code);
      onVerified();
    } catch (error) {
      const attemptsNote = Number.isInteger(error.attemptsLeft) && error.attemptsLeft > 0
        ? ` ${error.attemptsLeft} attempt${error.attemptsLeft === 1 ? '' : 's'} left.`
        : '';
      setErrorMessage(`${error.message}${attemptsNote}`);
    } finally {
      setVerifying(false);
    }
  };

  const busy = sending || verifying;
  const theme = glass(true);

  return (
    <ThemeProvider isDark>
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={[styles.card, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
              <Badge label="Two-step verification" tone="primary" />
              <Text style={[type.title, styles.title, { color: theme.text }]}>Check your email</Text>
              <Text style={[type.bodySmall, styles.description, { color: theme.textSecondary }]}>
                {sending && !sentTo
                  ? 'Sending your sign-in code…'
                  : `We sent a 6-digit code to ${sentTo || email}. It expires in 10 minutes.`}
              </Text>

              <TextField
                label="Verification code"
                placeholder="000000"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChangeText={(value) => {
                  setCode(value.replace(/\D/g, ''));
                  setErrorMessage('');
                }}
                onSubmitEditing={submitCode}
                editable={!verifying}
                accessibilityLabel="Verification code"
                error={errorMessage}
                inputStyle={styles.codeInput}
              />

              <Button title="Verify and continue" fullWidth loading={verifying} disabled={sending} onPress={submitCode} />
              <Button
                title={sending ? 'Sending…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                variant="ghost"
                fullWidth
                style={styles.secondary}
                onPress={sendCode}
                disabled={busy || cooldown > 0}
              />
              <Button title="Use a different account" variant="ghost" fullWidth onPress={onSignOut} disabled={verifying} textStyle={{ color: theme.textSecondary }} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemeProvider>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#07090F' },
  content: { flexGrow: 1, justifyContent: 'center', padding: GUTTER + space.xs },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', borderRadius: radius.xl, borderWidth: 1, padding: space.xxl },
  title: { marginTop: space.md },
  description: { marginTop: space.sm, marginBottom: space.xl },
  codeInput: { height: 56, fontSize: 24, fontWeight: '700', letterSpacing: 8, textAlign: 'center' },
  secondary: { marginTop: space.sm },
});

export default LoginVerificationScreen;
