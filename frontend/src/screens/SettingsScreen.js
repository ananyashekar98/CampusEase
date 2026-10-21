import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { updateMyProfile } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../utils/alert';

export default function SettingsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, updateUser } = useAuth();
  const accent = { student: colors.student, faculty: colors.faculty, admin: colors.admin }[user?.role] || colors.primary;

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const emailChanged = email.trim().toLowerCase() !== (user?.email || '').toLowerCase();

  const handleSave = async () => {
    const payload = {};
    if (name.trim() !== (user?.name || '')) {
      if (!name.trim()) {
        showAlert('Name required', "Name can't be empty.");
        return;
      }
      payload.name = name.trim();
    }
    if (emailChanged) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        showAlert('Invalid email', 'Enter a valid email address.');
        return;
      }
      if (!currentPassword) {
        showAlert('Password required', 'Enter your current password to change your email.');
        return;
      }
      payload.email = email.trim();
      payload.currentPassword = currentPassword;
    }
    if (phone.trim() !== (user?.phone || '')) {
      payload.phone = phone.trim();
    }
    if (Object.keys(payload).length === 0) {
      showAlert('Nothing to save', "You haven't changed anything yet.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMyProfile(payload);
      await updateUser(updated);
      setCurrentPassword('');
      showAlert('Saved', 'Your details have been updated.');
    } catch (err) {
      showAlert('Could not save', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader title="Settings" onBack={() => navigation.goBack()} accentColor={accent} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your details</Text>
          <Text style={styles.helper}>Update your name, email, or phone number.</Text>

          <Text style={styles.fieldLabel}>Name</Text>
          <View style={styles.inputRow}>
            <Ionicons name="person-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={colors.textSecondary} value={name} onChangeText={setName} />
          </View>

          <Text style={styles.fieldLabel}>Email</Text>
          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="you@college.edu"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {emailChanged && (
            <>
              <Text style={styles.fieldLabel}>Current password</Text>
              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Needed to change your email"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                />
              </View>
            </>
          )}

          <Text style={styles.fieldLabel}>Phone (optional)</Text>
          <View style={styles.inputRow}>
            <Ionicons name="call-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="+91 98765 43210"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>

          <Pressable style={[styles.saveButton, { backgroundColor: accent }, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.passwordRow} onPress={() => navigation.navigate('ChangePassword')}>
          <View style={styles.passwordRowLeft}>
            <Ionicons name="key-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.passwordRowText}>Change Password</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Pressable>
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
  sectionTitle: { ...typography.h2, color: colors.textPrimary },
  helper: { ...typography.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.sm },
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
  saveButton: { borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  saveButtonText: { color: colors.textOnDark, fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.6 },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  passwordRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  passwordRowText: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
});
