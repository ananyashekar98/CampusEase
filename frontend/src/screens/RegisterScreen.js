import React, { useState, useMemo } from 'react';
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
import { useAuth } from '../context/AuthContext';
import { gatColors, radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../utils/alert';
import SearchableSelect from '../components/SearchableSelect';
import { DEPARTMENTS, SEMESTERS, SECTIONS } from '../constants';

// Admin was removed from here — self-service signup must never be able to
// grant admin access (every department, every permission). The backend
// (authController.js's register) now rejects role: "admin" outright; this
// just keeps the UI from offering a choice that would only ever 400.
// Admin accounts are provisioned separately (seeded, or created by an
// existing admin via Bulk Import / similar).
const ROLES = [
  { key: 'student', label: 'Student', icon: 'school-outline' },
  { key: 'faculty', label: 'Faculty', icon: 'briefcase-outline' },
];

export default function RegisterScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { register, authLoading } = useAuth();
  const [role, setRole] = useState('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Role-specific fields
  const [usn, setUsn] = useState('');
  const [department, setDepartment] = useState('');
  const [semester, setSemester] = useState('');
  const [section, setSection] = useState('');
  const [cabinLocation, setCabinLocation] = useState('');
  const [staffId, setStaffId] = useState('');

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      showAlert('Missing details', 'Name, email and password are required.');
      return;
    }
    if (password.length < 6) {
      showAlert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    if (role === 'student' && (!usn.trim() || !department.trim() || !semester.trim() || !section.trim())) {
      showAlert('Missing details', 'USN, department, semester and section are all required for students.');
      return;
    }
    if (role === 'faculty' && !department.trim()) {
      showAlert('Missing department', 'Please enter your department.');
      return;
    }

    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        usn: role === 'student' ? usn.trim() : undefined,
        department: role === 'student' || role === 'faculty' ? department.trim() : undefined,
        semester: role === 'student' ? Number(semester) : undefined,
        section: role === 'student' ? section.trim().toUpperCase() : undefined,
        cabinLocation: role === 'faculty' ? cabinLocation.trim() : undefined,
        staffId: role === 'faculty' ? staffId.trim() : undefined,
      });
    } catch (err) {
      showAlert('Registration failed', err.message);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Image
          source={require('../../assets/gat-building.jpg')}
          style={styles.headerImage}
          resizeMode="cover"
        />
        <View style={styles.headerScrim} />

        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.textOnDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Create your account</Text>
        <Text style={styles.headerSubtitle}>Join CampusEase as a student or faculty member</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>I am a</Text>
          <View style={styles.roleRow}>
            {ROLES.map((r) => {
              const active = role === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setRole(r.key)}
                  style={[styles.roleChip, active && styles.roleChipActive]}
                >
                  <Ionicons name={r.icon} size={16} color={active ? colors.textOnDark : colors.textSecondary} />
                  <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your full name"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@college.edu"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {role === 'student' && (
            <>
              <Text style={styles.fieldLabel}>USN</Text>
              <TextInput
                style={styles.input}
                placeholder="1GA*****"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="characters"
                value={usn}
                onChangeText={setUsn}
              />

              <Text style={styles.fieldLabel}>Department</Text>
              <SearchableSelect
                options={DEPARTMENTS}
                value={department}
                onSelect={setDepartment}
                placeholder="Type to search departments…"
                allowCustom
              />

              <View style={styles.twoCol}>
                <View style={styles.twoColItem}>
                  <Text style={styles.fieldLabel}>Semester</Text>
                  <SearchableSelect
                    options={SEMESTERS.map((s) => ({ key: String(s), label: `Semester ${s}` }))}
                    value={semester}
                    onSelect={setSemester}
                    placeholder="Pick semester…"
                  />
                </View>
                <View style={styles.twoColItem}>
                  <Text style={styles.fieldLabel}>Section</Text>
                  <SearchableSelect
                    options={SECTIONS}
                    value={section}
                    onSelect={setSection}
                    placeholder="Pick section…"
                    allowCustom
                  />
                </View>
              </View>
            </>
          )}

          {role === 'faculty' && (
            <>
              <Text style={styles.fieldLabel}>Department</Text>
              <SearchableSelect
                options={DEPARTMENTS}
                value={department}
                onSelect={setDepartment}
                placeholder="Type to search departments…"
                allowCustom
              />
              <Text style={styles.fieldLabel}>Cabin Location</Text>
              <TextInput
                style={styles.input}
                placeholder="Block A, Room 204"
                placeholderTextColor={colors.textSecondary}
                value={cabinLocation}
                onChangeText={setCabinLocation}
              />

              <Text style={styles.fieldLabel}>Staff ID Card Number</Text>
              <TextInput
                style={styles.input}
                placeholder="•••••"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                maxLength={5}
                value={staffId}
                onChangeText={setStaffId}
              />
            </>
          )}

          <Pressable
            style={[styles.button, authLoading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={authLoading}
          >
            <Text style={styles.buttonText}>{authLoading ? 'Creating account…' : 'Create Account'}</Text>
          </Pressable>

          <Pressable onPress={() => navigation.navigate('Login')} style={styles.linkRow}>
            <Text style={styles.linkText}>
              Already have an account? <Text style={styles.linkTextBold}>Log in</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: gatColors.navy },
  header: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 220,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  headerImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '140%',
  },
  headerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,33,38,0.62)',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.textOnDark },
  headerSubtitle: {
    ...typography.body,
    color: 'rgba(255,255,255,0.85)',
    marginTop: spacing.xs,
  },
  container: { flexGrow: 1 },
  card: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  roleChipActive: {
    backgroundColor: gatColors.navy,
    borderColor: gatColors.navy,
  },
  roleChipText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  roleChipTextActive: { color: colors.textOnDark },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  twoCol: { flexDirection: 'row', gap: spacing.sm },
  twoColItem: { flex: 1 },
  button: {
    backgroundColor: gatColors.navy,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.xl,
    shadowColor: gatColors.navy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.textOnDark, fontWeight: '800', fontSize: 16 },
  linkRow: { marginTop: spacing.lg, alignItems: 'center' },
  linkText: { color: colors.textSecondary, fontSize: 14 },
  linkTextBold: { color: gatColors.navy, fontWeight: '700' },
});