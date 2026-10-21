import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { changePassword } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../utils/alert';

export default function ChangePasswordScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, logout, updateUser } = useAuth();
  // An admin issued a temporary password: this is the only screen reachable
  // until the user picks their own, so no back button and no skipping.
  const forced = !!user?.mustChangePassword;
  const accent = { student: colors.student, faculty: colors.faculty, admin: colors.admin }[user?.role] || colors.primary;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Each of the three fields shows/hides independently now — toggling one
  // (e.g. to check the new password you just typed) no longer reveals the
  // other two as well, which a single shared toggle used to do.
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showAlert('Missing details', 'Fill in all three fields.');
      return;
    }
    if (newPassword.length < 6) {
      showAlert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert('Passwords don\'t match', 'The new password and its confirmation are different.');
      return;
    }
    if (newPassword === currentPassword) {
      showAlert('Same password', 'Choose a new password that\'s different from the current one.');
      return;
    }
    setSaving(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (forced) {
        // Clearing the flag makes the navigator switch to the normal app.
        await updateUser({ mustChangePassword: false });
        showAlert('Password set', 'You\'re all set — welcome in.');
      } else {
        showAlert('Password changed', 'Use your new password next time you log in.');
        navigation.goBack();
      }
    } catch (err) {
      showAlert('Could not change password', err.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (label, value, onChange, placeholder, visible, onToggleVisible) => (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          secureTextEntry={!visible}
          autoCapitalize="none"
          value={value}
          onChangeText={onChange}
        />
        <Pressable onPress={onToggleVisible} hitSlop={8} style={styles.eyeButton}>
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader title={forced ? 'Set a New Password' : 'Change Password'} onBack={forced ? undefined : () => navigation.goBack()} accentColor={accent} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {forced && (
            <View style={styles.forcedBanner}>
              <Ionicons name="shield-checkmark-outline" size={18} color={accent} />
              <Text style={styles.forcedBannerText}>
                An admin reset your password. Enter the temporary password they gave you, then choose your own to continue.
              </Text>
            </View>
          )}
          <Text style={styles.helper}>
            {forced ? 'Choose a new password of at least 6 characters.' : 'Enter your current password, then choose a new one (at least 6 characters).'}
          </Text>

          {field(
            forced ? 'Temporary password' : 'Current password',
            currentPassword,
            setCurrentPassword,
            forced ? 'The one your admin gave you' : 'Your current password',
            showCurrent,
            () => setShowCurrent((v) => !v)
          )}
          {field('New password', newPassword, setNewPassword, 'At least 6 characters', showNew, () => setShowNew((v) => !v))}
          {field('Confirm new password', confirmPassword, setConfirmPassword, 'Type it again', showConfirm, () => setShowConfirm((v) => !v))}

          <Pressable
            style={[styles.saveButton, { backgroundColor: accent }, saving && styles.disabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>{saving ? 'Saving…' : forced ? 'Set Password' : 'Change Password'}</Text>
          </Pressable>

          {forced && (
            <Pressable style={styles.logoutLink} onPress={logout}>
              <Text style={styles.logoutLinkText}>Log out instead</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  helper: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  inputIcon: { marginRight: spacing.sm },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.textPrimary },
  eyeButton: { paddingLeft: spacing.sm, paddingVertical: 4 },
  saveButton: { borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  saveButtonText: { color: colors.textOnDark, fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.6 },
  forcedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  forcedBannerText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  logoutLink: { alignItems: 'center', marginTop: spacing.md },
  logoutLinkText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
});