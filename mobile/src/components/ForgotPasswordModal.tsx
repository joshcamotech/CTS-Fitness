import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Modal, TextInput, TouchableOpacity,
  StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { ColorTokens } from '../theme/colorways';
import { useTheme } from '../theme/ThemeContext';
import { FONT } from '../constants/theme';
import { useFormStyles } from '../constants/formStyles';
import { supabase } from '../lib/supabase';
import { GradientButton } from './GradientButton';
import { haptics } from '../utils/haptics';

/** Seconds before another code can be requested. Supabase enforces its own
 *  limit server-side; this just stops the button inviting a refusal. */
const RESEND_COOLDOWN_S = 60;
/** Supabase's email OTP is 6 digits by default and configurable up to 10. */
const CODE_PATTERN = /^\d{6,10}$/;
const MIN_PASSWORD = 6;

interface Props {
  visible:      boolean;
  onClose:      () => void;
  /** Whatever the user already typed on the login screen. */
  initialEmail: string;
}

/** Password reset by emailed one-time code, for someone who is signed out.
 *
 *  Two steps: enter an email, then enter the code with a new password.
 *  A code rather than a link keeps this free of deep-link handling.
 *
 *  Verifying the code creates a session, and App.tsx swaps to the signed-in
 *  stack the moment a session exists, which unmounts this modal. So the new
 *  password is collected *with* the code and validated up front, and the
 *  verify -> update sequence runs without waiting on any UI.
 *
 *  The "code sent" message is the same whether or not the email has an
 *  account: Supabase does not say, and neither should we. */
export function ForgotPasswordModal({ visible, onClose, initialEmail }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useFormStyles();

  const [step,     setStep]     = useState<'email' | 'code'>('email');
  const [email,    setEmail]    = useState(initialEmail);
  const [code,     setCode]     = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [busy,     setBusy]     = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // The login screen mounts this fresh on every open, so all state, including
  // the email seeded from `initialEmail`, starts clean and nothing needs
  // resetting on close.
  const close = () => {
    if (busy) return;
    onClose();
  };

  const sendCode = async () => {
    const address = email.trim();
    if (!address) {
      Alert.alert('Missing info', 'Enter the email address on your account.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address);
      if (error) throw error;
      haptics.success();
      setStep('code');
      setCooldown(RESEND_COOLDOWN_S);
    } catch (e) {
      // Includes Supabase's "you can only request this after N seconds".
      Alert.alert('Could not send the code', (e as Error).message ?? 'Please try again.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const submitReset = async () => {
    if (!CODE_PATTERN.test(code)) {
      Alert.alert('Check your code', 'Enter the code from the email, digits only.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      Alert.alert('Weak password', `Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords don’t match', 'Double-check your password and try again.');
      return;
    }

    setBusy(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type:  'recovery',
      });
      if (verifyError) {
        Alert.alert('Code not accepted', 'That code is wrong or has expired. Request a new one and try again.');
        return;
      }

      // From here the user is signed in and this modal is being unmounted,
      // so nothing below may depend on component state.
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        Alert.alert(
          'You’re signed in, but your password was not changed',
          `${updateError.message} Change it from Settings → Change Password.`,
        );
        return;
      }

      // The reset may be because the old password leaked: end other sessions.
      await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined);
      haptics.success();
      Alert.alert('Password updated', 'Your password has been reset and you’re signed in.');
    } catch (e) {
      Alert.alert('Could not reset your password', (e as Error).message ?? 'Please check your connection and try again.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
      presentationStyle="pageSheet"
    >
      <KeyboardAvoidingView
        style={styles.flexFill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerBtn} />
          <Text style={styles.headerTitle}>Reset Password</Text>
          <TouchableOpacity
            onPress={close}
            disabled={busy}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.headerBtn}
          >
            <Feather name="x" size={22} color={colors.textSub} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'email' ? (
            <>
              <Text style={styles.lede}>
                Enter the email address on your account and we’ll send you a code to
                choose a new password.
              </Text>

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
                returnKeyType="send"
                onSubmitEditing={sendCode}
                editable={!busy}
              />

              <GradientButton
                title="Send code"
                onPress={sendCode}
                loading={busy}
                style={styles.primaryBtn}
              />
            </>
          ) : (
            <>
              <Text style={styles.lede}>
                If an account exists for {email.trim()}, we’ve sent it a code. It can take
                a minute to arrive, so check your spam folder too.
              </Text>

              <Text style={formStyles.label}>Code</Text>
              <TextInput
                style={[formStyles.input, styles.codeInput]}
                value={code}
                onChangeText={t => setCode(t.replace(/\D/g, ''))}
                placeholder="123456"
                placeholderTextColor={colors.textMuted}
                maxLength={10}
                autoCorrect={false}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                editable={!busy}
              />

              <Text style={formStyles.label}>New Password</Text>
              <TextInput
                style={formStyles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password-new"
                editable={!busy}
              />

              <Text style={formStyles.label}>Confirm New Password</Text>
              <TextInput
                style={formStyles.input}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password-new"
                returnKeyType="done"
                onSubmitEditing={submitReset}
                editable={!busy}
              />

              <GradientButton
                title="Reset password"
                onPress={submitReset}
                loading={busy}
                style={styles.primaryBtn}
              />

              <TouchableOpacity
                style={styles.linkBtn}
                onPress={sendCode}
                disabled={busy || cooldown > 0}
                activeOpacity={0.7}
              >
                <Text style={[styles.linkText, (busy || cooldown > 0) && styles.linkTextDisabled]}>
                  {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => { setStep('email'); setCode(''); }}
                disabled={busy}
                activeOpacity={0.7}
              >
                <Text style={styles.linkText}>Use a different email</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: ColorTokens) => StyleSheet.create({
  flexFill: {
    flex:            1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingVertical:   14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerBtn: {
    width:      32,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FONT.semibold,
    fontSize:   17,
    color:      colors.text,
  },
  content: {
    padding:       20,
    paddingBottom: 40,
  },
  lede: {
    fontSize:     15,
    lineHeight:   22,
    color:        colors.textSub,
    marginBottom: 20,
  },
  codeInput: {
    fontFamily:    FONT.semibold,
    fontSize:      20,
    letterSpacing: 6,
  },
  primaryBtn: {
    marginTop: 24,
  },
  linkBtn: {
    marginTop:       16,
    alignItems:      'center',
    paddingVertical: 6,
  },
  linkText: {
    fontSize: 14,
    color:    colors.primary,
  },
  linkTextDisabled: {
    color: colors.textMuted,
  },
});
