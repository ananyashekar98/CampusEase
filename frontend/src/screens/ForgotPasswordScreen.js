import React, { useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { requestPasswordReset, resetPassword } from '../api/endpoints';
import { gatColors, radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../utils/alert';

// Two steps on one screen:
//   1. Enter your email -> the backend generates a 6-digit code (valid 15 min).
//   2. Enter that code + a new password -> password is reset, back to Login.
export default function ForgotPasswordScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  // Only present when the backend isn't in production — see authController.
  const [devInfo, setDevInfo] = useState(null);

  const handleSendCode = async () => {
    if (!email.trim()) {
      showAlert('Missing email', 'Enter the email address of your account.');
      return;
    }
    setBusy(true);
    try {
      const result = await requestPasswordReset(email.trim());
      setDevInfo(result.devCode ? { code: result.devCode, previewUrl: result.devPreviewUrl } : null);
      setStep(2);
    } catch (err) {
      showAlert('Could not send code', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      showAlert('Invalid code', 'The reset code is 6 digits.');
      return;
    }
    if (newPassword.length < 6) {
      showAlert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert('Passwords don\'t match', 'The two passwords you typed are different.');
      return;
    }
    setBusy(true);
    try {
      await resetPassword({ email: email.trim(), code: code.trim(), newPassword });
      showAlert('Password reset', 'You can now log in with your new password.');
      navigation.navigate('Login');
    } catch (err) {
      showAlert('Could not reset password', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Image
            source={require('../../assets/gat-building.jpg')}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <View style={styles.heroScrim} />

          <Pressable style={styles.backRow} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={colors.textOnDark} />
            <Text style={styles.backText}>Back to login</Text>
          </Pressable>
          <Text style={styles.heroTitle}>Reset password</Text>
          <Text style={styles.heroSubtitle}>
            {step === 1 ? "We'll generate a 6-digit code for your account." : 'Enter the code and choose a new password.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Email</Text>
          <View style={[styles.inputRow, step === 2 && styles.inputRowDisabled]}>
            <Ionicons name="mail-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="you@college.edu"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={step === 1}
            />
          </View>

          {step === 1 ? (
            <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={handleSendCode} disabled={busy}>
              <Text style={styles.buttonText}>{busy ? 'Sending…' : 'Send reset code'}</Text>
            </Pressable>
          ) : (
            <>
              {devInfo && (
                <View style={styles.devBox}>
                  <Text style={styles.devTitle}>Dev mode — no real email was delivered</Text>
                  <Text style={styles.devCode}>{devInfo.code}</Text>
                  <Text style={styles.devHint}>
                    Your project's mail setup is a test sandbox, so the code is shown here instead. This box never appears
                    when the backend runs with NODE_ENV=production.
                    {devInfo.previewUrl ? ` Email preview: ${devInfo.previewUrl}` : ''}
                  </Text>
                </View>
              )}

              <Text style={styles.fieldLabel}>6-digit code</Text>
              <View style={styles.inputRow}>
                <Ionicons name="key-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="123456"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={code}
                  onChangeText={setCode}
                />
              </View>

              <Text style={styles.fieldLabel}>New password</Text>
              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="At least 6 characters"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              <Text style={styles.fieldLabel}>Confirm new password</Text>
              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Type it again"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
              </View>

              <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={handleReset} disabled={busy}>
                <Text style={styles.buttonText}>{busy ? 'Resetting…' : 'Reset password'}</Text>
              </Pressable>

              <Pressable
                style={styles.linkRow}
                onPress={() => {
                  setStep(1);
                  setCode('');
                  setDevInfo(null);
                }}
              >
                <Text style={styles.linkText}>
                  Wrong email or code expired? <Text style={styles.linkTextBold}>Start over</Text>
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: gatColors.navy },
  scrollContent: { flexGrow: 1 },
  hero: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 220,
    paddingTop: spacing.xl * 1.2,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '140%',
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,33,38,0.62)',
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.lg },
  backText: { color: colors.textOnDark, fontWeight: '600' },
  heroTitle: { fontSize: 26, fontWeight: '800', color: colors.textOnDark },
  heroSubtitle: { ...typography.body, color: 'rgba(255,255,255,0.85)', marginTop: spacing.xs },
  card: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    minHeight: 420,
  },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  inputRowDisabled: { opacity: 0.6 },
  inputIcon: { marginRight: spacing.sm },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: colors.textPrimary },
  button: {
    backgroundColor: gatColors.navy,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.textOnDark, fontWeight: '700', fontSize: 16 },
  linkRow: { marginTop: spacing.lg, alignItems: 'center' },
  linkText: { color: colors.textSecondary, fontSize: 14 },
  linkTextBold: { color: gatColors.navy, fontWeight: '700' },
  devBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  devTitle: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },
  devCode: { fontSize: 28, fontWeight: '800', letterSpacing: 6, color: colors.textPrimary, marginVertical: spacing.xs },
  devHint: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
});