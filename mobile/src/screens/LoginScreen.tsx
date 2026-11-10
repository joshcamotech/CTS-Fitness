import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, Linking,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { ColorTokens } from '../theme/colorways';
import { useTheme } from '../theme/ThemeContext';
import { FONT, RADIUS } from '../constants/theme';
import { useFormStyles } from '../constants/formStyles';
import { LEGAL } from '../constants/legal';
import { supabase } from '../lib/supabase';
import { Logo } from '../components/Logo';
import { GradientButton } from '../components/GradientButton';
import { ForgotPasswordModal } from '../components/ForgotPasswordModal';
import { haptics } from '../utils/haptics';

export function LoginScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useFormStyles();
  const [mode,            setMode]            = useState<'signIn' | 'signUp'>('signIn');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting,      setSubmitting]      = useState(false);
  // Guideline 1.2 requires users to agree to terms carrying a
  // zero-tolerance clause before they can post user-generated content.
  // Gating account creation is the one point every user passes through.
  const [agreed,          setAgreed]          = useState(false);

  const [showForgot,       setShowForgot]       = useState(false);

  const isSignUp = mode === 'signUp';

  const toggleMode = () => {
    haptics.tap();
    setMode(m => (m === 'signIn' ? 'signUp' : 'signIn'));
    setPassword('');
    setConfirmPassword('');
    setAgreed(false);
  };

  const openLegal = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open that page', `Visit ${url} in your browser.`);
    }
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Enter your email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email:    email.trim(),
        password,
      });
      if (error) throw error;
      haptics.success();
      // On success, the auth state listener in App.tsx switches to the main stack.
    } catch (e) {
      Alert.alert('Sign in failed', (e as Error).message ?? 'Check your credentials and connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password || !confirmPassword) {
      Alert.alert('Missing info', 'Fill in your email and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords don’t match', 'Double-check your password and try again.');
      return;
    }
    if (!agreed) {
      Alert.alert(
        'Agree to continue',
        'Please accept the Terms of Use and Privacy Policy to create an account.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email:    email.trim(),
        password,
        options:  { emailRedirectTo: LEGAL.confirmedUrl },
      });
      if (error) throw error;

      if (!data.session) {
        // Email confirmation is required before a session is issued.
        Alert.alert(
          'Confirm your email',
          'We sent you a confirmation link. Tap it, then come back here and sign in.'
        );
        setMode('signIn');
        setPassword('');
        setConfirmPassword('');
      } else {
        haptics.success();
      }
      // If a session was returned, the auth state listener in App.tsx switches to the main stack.
    } catch (e) {
      Alert.alert('Sign up failed', (e as Error).message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => (isSignUp ? handleSignUp() : handleSignIn());

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flexFill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Brand hero ── */}
          <View style={styles.hero}>
            <Logo size={88} withWordmark />
            <Text style={styles.subtitle}>
              {isSignUp ? 'Create an account to get started' : 'Sign in to view your workouts'}
            </Text>
          </View>

          {/* ── Form card ── */}
          <View style={styles.formCard}>
            <Text style={formStyles.label}>Email</Text>
            <TextInput
              style={formStyles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
            />

            <Text style={formStyles.label}>Password</Text>
            <TextInput
              style={formStyles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={isSignUp ? 'password-new' : 'password'}
              returnKeyType={isSignUp ? 'next' : 'done'}
              onSubmitEditing={isSignUp ? undefined : handleSubmit}
            />

            {!isSignUp && (
              <TouchableOpacity
                style={styles.forgotBtn}
                onPress={() => { haptics.tap(); setShowForgot(true); }}
                disabled={submitting}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            {isSignUp && (
              <>
                <Text style={formStyles.label}>Confirm Password</Text>
                <TextInput
                  style={formStyles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password-new"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </>
            )}

            {isSignUp && (
              <TouchableOpacity
                style={styles.agreeRow}
                onPress={() => { haptics.tap(); setAgreed(a => !a); }}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreed }}
              >
                <Feather
                  name={agreed ? 'check-square' : 'square'}
                  size={20}
                  color={agreed ? colors.primary : colors.textMuted}
                />
                <Text style={styles.agreeText}>
                  I agree to the{' '}
                  <Text style={styles.agreeLink} onPress={() => openLegal(LEGAL.termsUrl)}>
                    Terms of Use
                  </Text>
                  {' '}and{' '}
                  <Text style={styles.agreeLink} onPress={() => openLegal(LEGAL.privacyUrl)}>
                    Privacy Policy
                  </Text>
                  . There is no tolerance for objectionable content or abusive users.
                </Text>
              </TouchableOpacity>
            )}

            <GradientButton
              title={isSignUp ? 'Sign Up' : 'Sign In'}
              onPress={handleSubmit}
              loading={submitting}
              disabled={isSignUp && !agreed}
              style={styles.submitBtn}
            />
          </View>

          {/* ── Mode toggle ── */}
          <TouchableOpacity
            style={styles.toggleModeBtn}
            onPress={toggleMode}
            disabled={submitting}
            activeOpacity={0.7}
          >
            <Text style={styles.toggleModeText}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={styles.toggleModeTextAccent}>{isSignUp ? 'Sign In' : 'Sign Up'}</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {showForgot && (
        <ForgotPasswordModal
          visible
          onClose={() => setShowForgot(false)}
          initialEmail={email}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: colors.bg,
  },
  flexFill: { flex: 1 },
  content: {
    flexGrow:          1,
    justifyContent:    'center',
    paddingHorizontal: 24,
    paddingVertical:   32,
  },
  hero: {
    alignItems:   'center',
    marginBottom: 36,
  },
  subtitle: {
    marginTop:  12,
    fontSize:   14,
    color:      colors.textSub,
    textAlign:  'center',
  },
  formCard: {
    backgroundColor: colors.bgAlt,
    borderRadius:    RADIUS.xl,
    borderWidth:      1,
    borderColor:      colors.cardBorder,
    padding:         20,
  },
  agreeRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           10,
    marginBottom:  16,
  },
  agreeText: {
    flex:       1,
    fontSize:   12,
    lineHeight: 18,
    color:      colors.textSub,
  },
  agreeLink: {
    fontFamily: FONT.semibold,
    color:      colors.primary,
  },
  submitBtn: {
    marginTop: 6,
  },
  forgotBtn: {
    alignSelf:       'flex-end',
    marginTop:       10,
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 13,
    color:    colors.primary,
  },
  toggleModeBtn: {
    marginTop:  24,
    alignItems: 'center',
  },
  toggleModeText: {
    fontSize: 14,
    color:    colors.textSub,
  },
  toggleModeTextAccent: {
    fontFamily: FONT.bold,
    color:      colors.primary,
  },
});
