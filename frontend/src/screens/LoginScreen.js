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
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { gatColors, radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../utils/alert';

export default function LoginScreen({ navigation }) {
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const styles = useMemo(
    () => createStyles(colors, windowHeight),
    [colors, windowHeight]
  );
  const { login, authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      showAlert('Missing details', 'Please enter both email and password.');
      return;
    }
    try {
      await login(email.trim(), password);
      // Navigation switches automatically once `user` is set in AuthContext.
    } catch (err) {
      showAlert('Login failed', err.message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Image
            source={require('../../assets/gat-building.jpg')}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <View style={styles.heroScrim} />

          <View style={styles.heroTopRow}>
            <Image
              source={require('../../assets/gat-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.heroCollegeName}>Global Academy of Technology</Text>
          </View>

          <View style={styles.heroTextBlock}>
            <Text style={styles.heroTitle}>CampusEase</Text>
            <Text style={styles.heroSubtitle}>
              Smart unified classroom booking & faculty locator
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Log In</Text>

          <Text style={styles.fieldLabel}>Email</Text>
          <View style={styles.inputRow}>
            <Ionicons
              name="mail-outline"
              size={18}
              color={colors.textSecondary}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="you@gat.edu"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Text style={styles.fieldLabel}>Password</Text>
          <View style={styles.inputRow}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={colors.textSecondary}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={10}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>

          <Pressable
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.forgotRow}
            hitSlop={8}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          <Pressable
            style={[styles.button, authLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={authLoading}
          >
            <Text style={styles.buttonText}>
              {authLoading ? 'Signing in…' : 'Log In'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('Register')}
            style={styles.linkRow}
          >
            <Text style={styles.linkText}>
              New here? <Text style={styles.linkTextBold}>Create an account</Text>
            </Text>
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Rajarajeshwari Nagar, Bengaluru, Karnataka
            </Text>
            <Text style={styles.footerCopyright}>
              © {new Date().getFullYear()} Global Academy of Technology
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors, windowHeight) => StyleSheet.create({
  flex: {
    flex: 1,
    minHeight: windowHeight,
    backgroundColor: gatColors.navy,
  },
  scrollContent: { flexGrow: 1 },
  hero: {
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
    minHeight: 280,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 1.3,
    paddingHorizontal: spacing.lg,
    backgroundColor: gatColors.navy,
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
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoImage: {
    width: 64,
    height: 45,
  },
  heroCollegeName: {
    flex: 1,
    marginLeft: spacing.md,
    fontSize: 28,
    fontWeight: '800',
    color: gatColors.white,
  },
  heroTextBlock: {
    marginTop: spacing.xl * 1.4,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: gatColors.white,
  },
  heroSubtitle: {
    ...typography.body,
    color: 'rgba(255,255,255,0.85)',
    marginTop: spacing.sm,
  },
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
  cardTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  inputIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.textPrimary,
  },
  button: {
    backgroundColor: gatColors.gold,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.lg,
    shadowColor: gatColors.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: gatColors.navyDeep,
    fontWeight: '800',
    fontSize: 16,
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
  },
  forgotText: {
    color: gatColors.goldDark,
    fontWeight: '700',
    fontSize: 13,
  },
  linkRow: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  linkText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  linkTextBold: {
    color: gatColors.goldDark,
    fontWeight: '700',
  },
  footer: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  footerCopyright: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});