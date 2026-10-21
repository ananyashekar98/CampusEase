import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import DashboardBigTile from './DashboardBigTile';
import { gatColors, radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { showAlert, showConfirm } from '../utils/alert';
import { uploadUserPhoto, getPhotoUrl } from '../api/endpoints';

export default function DashboardLayout({ title, roleLabel, accentColor, items, sections, onNotificationsPress, notificationCount, extraHeaderIcon }) {
  const { colors, scheme, toggleScheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, logout, updateUser } = useAuth();
  const navigation = useNavigation();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const TITLES = ['dr', 'dr.', 'prof', 'prof.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.'];
  const nameParts = user?.name?.split(' ').filter(Boolean) || [];
  const firstNamePart = nameParts.find((part) => !TITLES.includes(part.toLowerCase())) || nameParts[0];
  const greetingName = firstNamePart || roleLabel;
  const fullName = user?.name || greetingName;

  const initials = nameParts
    .filter((part) => !TITLES.includes(part.toLowerCase()))
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || roleLabel?.[0] || '?';

  // Only Admin and Faculty can tap their own avatar to change it — a
  // student's photo can only ever be set by a department admin (Admin
  // Dashboard > Accounts > User Photos & Staff IDs).
  const canSelfUploadPhoto = user?.role === 'admin' || user?.role === 'faculty';

  const idLine = user?.role === 'student' ? user?.usn : user?.staffId;
  const subLine =
    user?.role === 'student'
      ? [user?.department, user?.semester && user?.section ? `Sem ${user.semester} · Sec ${user.section}` : null]
          .filter(Boolean)
          .join(' · ')
      : user?.department || '';

  const handleAvatarPress = async () => {
    if (!canSelfUploadPhoto || uploadingPhoto) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert('Permission needed', 'Allow photo library access to change your photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled) return;

    setUploadingPhoto(true);
    try {
      const updated = await uploadUserPhoto(user._id, result.assets[0]);
      await updateUser({ photoUrl: updated.photoUrl });
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePress = (item) => {
    if (item.comingSoon) {
      showAlert(item.label, "This module is coming soon — it's next on the build list.");
      return;
    }
    item.onPress?.();
  };

  const confirmLogout = () => {
    showConfirm('Log out', 'Are you sure you want to log out?', logout);
  };

  const allItems = sections ? sections.flatMap((section) => section.items) : items || [];
  const photoUri = getPhotoUrl(user?.photoUrl);

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top bar — dark, branded, matches the login screen's navy */}
        <View style={[styles.heroWrap, { borderBottomWidth: 4, borderBottomColor: accentColor }]}>
          {/* Same college photo + dark scrim as the login screen, behind the top bar and profile banner */}
          <Image source={require('../../assets/gat-building.jpg')} style={styles.heroImage} resizeMode="cover" />
          <View style={styles.heroScrim} />
        <View style={styles.topBar}>
          <Image source={require('../../assets/gat-logo.png')} style={styles.topBarLogo} resizeMode="contain" />
          <View style={styles.topBarCollegeBlock}>
            <Text style={styles.topBarCollege} numberOfLines={1}>Global Academy of Technology</Text>
            <Text style={styles.topBarCity}>Bengaluru</Text>
          </View>
          <View style={styles.topBarIcons}>
            <Pressable style={styles.topBarIconButton} onPress={() => navigation.navigate('Settings')} hitSlop={8}>
              <Ionicons name="settings-outline" size={20} color={gatColors.white} />
            </Pressable>
            <Pressable style={styles.topBarIconButton} onPress={toggleScheme} hitSlop={8}>
              <Ionicons name={scheme === 'dark' ? 'sunny-outline' : 'moon-outline'} size={20} color={gatColors.white} />
            </Pressable>
            {extraHeaderIcon}
            {onNotificationsPress && (
              <Pressable style={styles.topBarIconButton} onPress={onNotificationsPress} hitSlop={8}>
                <Ionicons name="notifications-outline" size={20} color={gatColors.white} />
                {notificationCount > 0 && (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
                  </View>
                )}
              </Pressable>
            )}
          </View>
        </View>

        {/* Profile banner — avatar/name on the left, USN/staff-ID + department on the right */}
        <View style={styles.profileBanner}>
          <View style={styles.profileLeft}>
            <Pressable
              style={styles.avatarCircle}
              onPress={handleAvatarPress}
              disabled={!canSelfUploadPhoto || uploadingPhoto}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.avatarPhoto} />
              ) : (
                <Text style={styles.avatarInitials}>{initials}</Text>
              )}
              {canSelfUploadPhoto && (
                <View style={styles.avatarEditBadge}>
                  {uploadingPhoto ? (
                    <ActivityIndicator size="small" color={gatColors.navy} />
                  ) : (
                    <Ionicons name="camera" size={11} color={gatColors.navy} />
                  )}
                </View>
              )}
            </Pressable>
            <View style={styles.profileText}>
              <Text style={styles.profileName} numberOfLines={1}>{fullName}</Text>
              <View style={styles.profileRoleBadge}>
                <Text style={styles.profileRoleBadgeText}>{roleLabel}</Text>
              </View>
            </View>
          </View>

          {(idLine || subLine) && (
            <View style={styles.profileRight}>
              {idLine ? <Text style={styles.profileIdText} numberOfLines={1}>{idLine}</Text> : null}
              {subLine ? <Text style={styles.profileSub} numberOfLines={1}>{subLine}</Text> : null}
            </View>
          )}
        </View>
        </View>

        <View style={styles.container}>
          <Text style={styles.sectionHeading}>{title}</Text>

          <View style={styles.list}>
            {allItems.map((item) => (
              <DashboardBigTile
                key={item.key}
                icon={item.icon}
                label={item.label}
                tint={item.tint}
                accent={accentColor}
                badge={item.badge}
                onPress={() => handlePress(item)}
              />
            ))}
          </View>

          <Pressable style={styles.logoutButton} onPress={confirmLogout}>
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Rajarajeshwari Nagar, Bengaluru, Karnataka</Text>
            <Text style={styles.footerCopyright}>© {new Date().getFullYear()} Global Academy of Technology</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: spacing.xl },

  heroWrap: { backgroundColor: gatColors.navy, overflow: 'hidden' },
  // Compact header: the photo is slid up just enough that the tower crown is visible and the
  // building sits at the bottom of the header (no extra empty space under the profile row).
  heroImage: { position: 'absolute', top: -45, left: 0, width: '100%', height: 400 },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(28,33,38,0.6)' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  topBarLogo: { width: 52, height: 38, marginRight: spacing.sm },
  topBarCollegeBlock: { flex: 1 },
  topBarCollege: { color: gatColors.white, fontWeight: '700', fontSize: 14 },
  topBarCity: { color: gatColors.gold, fontSize: 11, fontWeight: '600', marginTop: 1 },
  topBarIcons: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  topBarIconButton: { padding: 4, position: 'relative' },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: { color: gatColors.white, fontSize: 9, fontWeight: '700' },

  profileBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  profileLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    position: 'relative',
    overflow: 'visible',
  },
  avatarPhoto: { width: '100%', height: '100%', borderRadius: 28 },
  avatarInitials: { color: gatColors.white, fontWeight: '800', fontSize: 20 },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: gatColors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: gatColors.white,
  },
  profileText: { flexShrink: 1 },
  profileName: { color: gatColors.white, fontWeight: '800', fontSize: 18 },
  profileRoleBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  profileRoleBadgeText: { color: gatColors.white, fontWeight: '700', fontSize: 11 },

  profileRight: { alignItems: 'flex-end', marginLeft: spacing.sm },
  profileIdText: { color: gatColors.white, fontWeight: '800', fontSize: 13 },
  profileSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600', marginTop: 2 },

  container: { padding: spacing.lg, paddingTop: spacing.md },
  sectionHeading: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm },
  list: { marginTop: spacing.xs },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  logoutText: { color: colors.danger, fontWeight: '700', fontSize: 15 },

  footer: { alignItems: 'center', marginTop: spacing.lg },
  footerText: { ...typography.caption, color: colors.textSecondary },
  footerCopyright: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});