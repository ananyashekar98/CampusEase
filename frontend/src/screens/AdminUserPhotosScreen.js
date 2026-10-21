
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import ScreenHeader from '../components/ScreenHeader';
import ChipSelector from '../components/ChipSelector';
import {
  searchUsers,
  uploadUserPhoto,
  updateUserStaffId,
  getPhotoUrl,
} from '../api/endpoints';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../utils/alert';

const ROLE_FILTERS = [
  { key: 'student', label: 'Students' },
  { key: 'faculty', label: 'Faculty' },
  { key: 'admin', label: 'Admins' },
];

export default function AdminUserPhotosScreen({ navigation }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);

  const [role, setRole] = useState('student');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [staffIdDraft, setStaffIdDraft] = useState('');
  const [savingStaffId, setSavingStaffId] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      searchUsers({ q: query, role })
        .then(setResults)
        .catch((err) => showAlert('Search failed', err.message))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(t);
  }, [query, role]);

  const patchUser = (updated) => {
    setResults((prev) =>
      prev.map((u) => (u._id === updated._id ? updated : u))
    );
  };

  const pickAndUpload = async (user) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      showAlert(
        'Permission needed',
        'Allow photo library access to upload a picture.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (result.canceled) return;

    setUploadingId(user._id);

    try {
      const updated = await uploadUserPhoto(user._id, result.assets[0]);
      patchUser(updated);
    } catch (err) {
      showAlert('Upload failed', err.message);
    } finally {
      setUploadingId(null);
    }
  };

  const startEditStaffId = (user) => {
    setEditingStaffId(user._id);
    setStaffIdDraft(user.staffId || '');
  };

  const saveStaffId = async (user) => {
    setSavingStaffId(true);

    try {
      const updated = await updateUserStaffId(
        user._id,
        staffIdDraft.trim()
      );
      patchUser(updated);
      setEditingStaffId(null);
    } catch (err) {
      showAlert('Could not save', err.message);
    } finally {
      setSavingStaffId(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader
        title="User Photos & Staff IDs"
        onBack={() => navigation.goBack()}
        accentColor={colors.admin}
      />

      <View style={styles.filterRow}>
        <ChipSelector
          options={ROLE_FILTERS}
          selectedKey={role}
          onSelect={setRole}
          accentColor={colors.admin}
        />
      </View>

      <View style={styles.searchRow}>
        <Ionicons
          name="search-outline"
          size={18}
          color={colors.textSecondary}
          style={{ marginRight: spacing.sm }}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, email or USN"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.admin} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {results.length === 0 && (
            <Text style={styles.emptyText}>
              No {role === 'student'
                ? 'students'
                : role === 'faculty'
                  ? 'faculty'
                  : 'admins'} found.
            </Text>
          )}

          {results.map((user) => {
            const photoUri = getPhotoUrl(user.photoUrl);
            const isUploading = uploadingId === user._id;
            const isEditingThis = editingStaffId === user._id;

            return (
              <View key={user._id} style={styles.card}>
                <View style={styles.cardRow}>
                  <Pressable
                    style={styles.avatarWrap}
                    onPress={() => pickAndUpload(user)}
                    disabled={isUploading}
                  >
                    {photoUri ? (
                      <Image
                        source={{ uri: photoUri }}
                        style={styles.avatarImage}
                      />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Ionicons
                          name="person-outline"
                          size={22}
                          color={colors.textSecondary}
                        />
                      </View>
                    )}

                    <View style={styles.cameraBadge}>
                      {isUploading ? (
                        <ActivityIndicator
                          size="small"
                          color={colors.textOnDark}
                        />
                      ) : (
                        <Ionicons
                          name="camera"
                          size={12}
                          color={colors.textOnDark}
                        />
                      )}
                    </View>
                  </Pressable>

                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{user.name}</Text>
                    <Text style={styles.cardSub}>{user.email}</Text>
                    <Text style={styles.cardSub}>
                      {user.role === 'student'
                        ? `${user.usn || 'No USN'} · Sem ${
                            user.semester || '—'
                          } ${user.section || ''}`
                        : `${user.department || ''}${
                            user.staffId ? ` · ${user.staffId}` : ''
                          }`}
                    </Text>
                  </View>
                </View>

                {user.role !== 'student' &&
                  (isEditingThis ? (
                    <View style={styles.staffIdRow}>
                      <TextInput
                        style={styles.staffIdInput}
                        placeholder="Staff ID"
                        placeholderTextColor={colors.textSecondary}
                        value={staffIdDraft}
                        onChangeText={setStaffIdDraft}
                        autoCapitalize="characters"
                        autoFocus
                      />

                      <Pressable
                        style={styles.staffIdSave}
                        onPress={() => saveStaffId(user)}
                        disabled={savingStaffId}
                      >
                        <Text style={styles.staffIdSaveText}>
                          {savingStaffId ? 'Saving…' : 'Save'}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={styles.staffIdCancel}
                        onPress={() => setEditingStaffId(null)}
                      >
                        <Text style={styles.staffIdCancelText}>Cancel</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.editStaffIdButton}
                      onPress={() => startEditStaffId(user)}
                    >
                      <Ionicons
                        name="create-outline"
                        size={14}
                        color={colors.admin}
                      />
                      <Text style={styles.editStaffIdText}>
                        {user.staffId ? 'Edit Staff ID' : 'Set Staff ID'}
                      </Text>
                    </Pressable>
                  ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors, shadow) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    filterRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.textPrimary,
    },
    list: { padding: spacing.lg, paddingBottom: spacing.xl },
    emptyText: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.xl,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
      ...shadow,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center' },
    avatarWrap: { position: 'relative', marginRight: spacing.md },
    avatarImage: { width: 52, height: 52, borderRadius: 26 },
    avatarFallback: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.tint1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.admin,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.surface,
    },
    cardInfo: { flex: 1 },
    cardName: {
      ...typography.body,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    cardSub: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 1,
    },
    editStaffIdButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
    },
    editStaffIdText: {
      color: colors.admin,
      fontWeight: '700',
      fontSize: 12,
    },
    staffIdRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.sm,
      gap: spacing.sm,
    },
    staffIdInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.textPrimary,
    },
    staffIdSave: { paddingVertical: 8, paddingHorizontal: spacing.sm },
    staffIdSaveText: {
      color: colors.admin,
      fontWeight: '700',
      fontSize: 13,
    },
    staffIdCancel: { paddingVertical: 8, paddingHorizontal: 4 },
    staffIdCancelText: {
      color: colors.textSecondary,
      fontWeight: '600',
      fontSize: 13,
    },
  });
