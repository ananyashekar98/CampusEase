import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import SearchableSelect from '../components/SearchableSelect';
import { useAuth } from '../context/AuthContext';
import {
  fetchStaffrooms,
  createStaffroom,
  updateStaffroom,
  deleteStaffroom,
  fetchFacultyDirectory,
  updateMyStatus,
} from '../api/endpoints';
import { DEPARTMENTS } from '../constants';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { showAlert, showConfirm } from '../utils/alert';

export default function StaffroomLocationsScreen({ navigation }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  const ROLE_ACCENT = { student: colors.student, faculty: colors.faculty, admin: colors.admin };
  const { user, updateUser } = useAuth();
  const accent = ROLE_ACCENT[user?.role] || colors.primary;
  const isAdmin = user?.role === 'admin';
  const isFaculty = user?.role === 'faculty';
  const isStudent = user?.role === 'student';
  const scopeDepartment = user?.department || null;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staffrooms, setStaffrooms] = useState([]);
  const [faculty, setFaculty] = useState([]);

  // --- Admin: add/edit staffroom form ---
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = adding new; set = editing that staffroom
  const [department, setDepartment] = useState(() => scopeDepartment || '');
  const [roomLabel, setRoomLabel] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [saving, setSaving] = useState(false);

  // --- Admin: search staffrooms (same idea as the Faculty Locator search below) ---
  const [staffroomSearch, setStaffroomSearch] = useState('');

  // --- Faculty: my own status ---
  const [myAvailable, setMyAvailable] = useState(true);
  const [myCabin, setMyCabin] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  // --- Directory search (everyone) ---
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const [staffroomsData, facultyData] = await Promise.all([
        fetchStaffrooms(),
        fetchFacultyDirectory(),
      ]);
      setStaffrooms(staffroomsData);
      setFaculty(facultyData);

      if (isFaculty) {
        setMyAvailable(user.isAvailable !== undefined ? user.isAvailable : true);
        setMyCabin(user.cabinLocation || '');
      }
    } catch (err) {
      showAlert('Could not load data', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isFaculty, user]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const resetStaffroomForm = () => {
    setEditingId(null);
    setDepartment(scopeDepartment || '');
    setRoomLabel('');
    setBuilding('');
    setFloor('');
  };

  const handleEditStaffroom = (room) => {
    setEditingId(room._id);
    setDepartment(scopeDepartment || room.department);
    setRoomLabel(room.roomLabel);
    setBuilding(room.building || '');
    setFloor(room.floor || '');
    setFormOpen(true);
  };

  const handleSaveStaffroom = async () => {
    if (!department.trim() || !roomLabel.trim()) {
      showAlert('Missing details', 'Department and room label are required.');
      return;
    }
    setSaving(true);
    const payload = {
      department: department.trim(),
      roomLabel: roomLabel.trim(),
      building: building.trim() || undefined,
      floor: floor.trim() || undefined,
    };
    try {
      if (editingId) {
        await updateStaffroom(editingId, payload);
      } else {
        await createStaffroom(payload);
      }
      resetStaffroomForm();
      setFormOpen(false);
      const data = await fetchStaffrooms();
      setStaffrooms(data);
    } catch (err) {
      showAlert(editingId ? 'Could not update staffroom' : 'Could not add staffroom', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStaffroom = (room) => {
    showConfirm('Delete staffroom', `Remove "${room.roomLabel}"?`, async () => {
      try {
        await deleteStaffroom(room._id);
        setStaffrooms((prev) => prev.filter((r) => r._id !== room._id));
        if (editingId === room._id) {
          resetStaffroomForm();
          setFormOpen(false);
        }
      } catch (err) {
        showAlert('Could not delete', err.message);
      }
    });
  };

  const handleToggleAvailability = async (value) => {
    setMyAvailable(value);
    setSavingStatus(true);
    try {
      await updateMyStatus({ isAvailable: value });
      // Without this, AuthContext's `user.isAvailable` stays at whatever it
      // was when the app loaded — so leaving this screen and coming back
      // re-reads that stale value in `load()` above and the switch visually
      // flips back off/on, even though the backend already has the change.
      await updateUser({ isAvailable: value });
      const data = await fetchFacultyDirectory();
      setFaculty(data);
    } catch (err) {
      setMyAvailable(!value);
      showAlert('Could not update status', err.message);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleSaveCabin = async () => {
    setSavingStatus(true);
    try {
      await updateMyStatus({ cabinLocation: myCabin.trim() });
      // Same staleness issue as handleToggleAvailability above — keep
      // AuthContext's copy of the user in sync so a revisit doesn't show
      // the cabin location reverting to what it was before this save.
      await updateUser({ cabinLocation: myCabin.trim() });
      const data = await fetchFacultyDirectory();
      setFaculty(data);
      showAlert('Saved', 'Your cabin location has been updated.');
    } catch (err) {
      showAlert('Could not save', err.message);
    } finally {
      setSavingStatus(false);
    }
  };

  const staffroomSectionContent = (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Staffrooms</Text>
        {isAdmin && (
          <Pressable
            style={[styles.addButton, { borderColor: accent }]}
            onPress={() => {
              if (formOpen) {
                resetStaffroomForm();
                setFormOpen(false);
              } else {
                setFormOpen(true);
              }
            }}
          >
            <Ionicons name={formOpen ? 'close' : 'add'} size={16} color={accent} />
            <Text style={[styles.addButtonText, { color: accent }]}>{formOpen ? 'Cancel' : 'Add'}</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.helper}>Manage staffroom locations for each department.</Text>

      {isAdmin && formOpen && (
        <View style={styles.formBlock}>
          <Text style={styles.fieldLabel}>Department</Text>
          {scopeDepartment ? (
            <View style={styles.lockedField}>
              <Ionicons name="lock-closed" size={13} color={colors.textSecondary} />
              <Text style={styles.lockedFieldText}>{scopeDepartment}</Text>
            </View>
          ) : (
            <SearchableSelect
              options={DEPARTMENTS}
              value={department}
              onSelect={setDepartment}
              placeholder="Type to search departments…"
              accentColor={accent}
              allowCustom
            />
          )}
          <Text style={styles.fieldLabel}>Room Label</Text>
          <TextInput style={styles.input} placeholder="Staffroom 2" placeholderTextColor={colors.textSecondary} value={roomLabel} onChangeText={setRoomLabel} />
          <Text style={styles.fieldLabel}>Building (optional)</Text>
          <TextInput style={styles.input} placeholder="Block A" placeholderTextColor={colors.textSecondary} value={building} onChangeText={setBuilding} />
          <Text style={styles.fieldLabel}>Floor (optional)</Text>
          <TextInput style={styles.input} placeholder="2nd Floor" placeholderTextColor={colors.textSecondary} value={floor} onChangeText={setFloor} />
          <Pressable
            style={[styles.saveButton, { backgroundColor: accent }, saving && styles.disabled]}
            onPress={handleSaveStaffroom}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? (editingId ? 'Updating…' : 'Adding…') : editingId ? 'Update Staffroom' : 'Add Staffroom'}
            </Text>
          </Pressable>
        </View>
      )}

      {isAdmin && (
        <TextInput
          style={[styles.input, styles.staffroomSearchInput]}
          placeholder="Search staffrooms by room, building, or department…"
          placeholderTextColor={colors.textSecondary}
          value={staffroomSearch}
          onChangeText={setStaffroomSearch}
        />
      )}

      {(() => {
        const q = staffroomSearch.trim().toLowerCase();
        const visibleStaffrooms = isAdmin && q
          ? staffrooms.filter((r) =>
              [r.roomLabel, r.building, r.floor, r.department].some((f) => (f || '').toLowerCase().includes(q))
            )
          : staffrooms;

        if (staffrooms.length === 0) {
          return <Text style={styles.emptyText}>No staffrooms added yet.</Text>;
        }
        if (visibleStaffrooms.length === 0) {
          return <Text style={styles.emptyText}>No staffrooms match "{staffroomSearch}".</Text>;
        }
        return visibleStaffrooms.map((room) => (
          <View key={room._id} style={styles.listRow}>
            <View style={styles.listRowMain}>
              <Text style={styles.listRowTitle}>{room.roomLabel}</Text>
              <Text style={styles.listRowMeta}>
                {room.department} · {room.building}{room.floor ? `, ${room.floor}` : ''}
              </Text>
            </View>
            {isAdmin && (
              <View style={styles.listRowActions}>
                <Pressable onPress={() => handleEditStaffroom(room)} hitSlop={10}>
                  <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                </Pressable>
                <Pressable onPress={() => handleDeleteStaffroom(room)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            )}
          </View>
        ));
      })()}
    </>
  );

  const facultyLocatorContent = (
    <>
      <Text style={styles.sectionTitle}>Faculty Locator</Text>
      <Text style={styles.helper}>Find a faculty member's cabin and see if they're currently available.</Text>

      <TextInput
        style={styles.input}
        placeholder="Search faculty by name…"
        placeholderTextColor={colors.textSecondary}
        value={search}
        onChangeText={setSearch}
      />

      {faculty.length === 0 ? (
        <Text style={styles.emptyText}>No faculty registered yet.</Text>
      ) : (
        (() => {
          const filtered = faculty.filter((f) =>
            f.name.toLowerCase().includes(search.trim().toLowerCase())
          );
          if (filtered.length === 0) {
            return <Text style={styles.emptyText}>No faculty match "{search}".</Text>;
          }
          return filtered.map((f) => {
            const statusMeta = {
              in_class: { label: 'In Class', color: colors.admin },
              available: { label: 'Available', color: colors.success },
              away: { label: 'Away', color: colors.textSecondary },
            }[f.status || (f.isAvailable ? 'available' : 'away')];
            return (
              <View key={f._id} style={styles.listRow}>
                <View style={styles.listRowMain}>
                  <Text style={styles.listRowTitle}>{f.name}</Text>
                  <Text style={styles.listRowMeta}>
                    {f.department}{f.designation ? ` · ${f.designation}` : ''}
                  </Text>
                  <Text style={styles.listRowMeta}>{f.cabinLocation || 'Staffroom not set'}</Text>
                </View>
                <View style={[styles.availabilityBadge, { backgroundColor: statusMeta.color }]}>
                  <Text style={styles.availabilityText}>{statusMeta.label}</Text>
                </View>
              </View>
            );
          });
        })()
      )}
    </>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScreenHeader title="Staffroom Locations" onBack={() => navigation.goBack()} accentColor={accent} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader title="Staffroom Locations" onBack={() => navigation.goBack()} accentColor={accent} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {isFaculty && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Status</Text>
            <Text style={styles.helper}>Let students and colleagues know if you're in your cabin right now.</Text>

            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>{myAvailable ? 'Available in cabin' : 'Away'}</Text>
              <Switch
                value={myAvailable}
                onValueChange={handleToggleAvailability}
                disabled={savingStatus}
                trackColor={{ false: colors.border, true: accent }}
              />
            </View>

            <Text style={styles.fieldLabel}>Staffroom</Text>
            <SearchableSelect
              options={staffrooms
                .filter((r) => r.department === user.department)
                .map((r) => ({ key: r.roomLabel, label: `${r.roomLabel}${r.building ? ` · ${r.building}` : ''}` }))}
              value={myCabin}
              onSelect={setMyCabin}
              placeholder="Pick your staffroom…"
              accentColor={accent}
              allowCustom
            />
            <Pressable
              style={[styles.saveButton, { backgroundColor: accent }, savingStatus && styles.disabled]}
              onPress={handleSaveCabin}
              disabled={savingStatus}
            >
              <Text style={styles.saveButtonText}>{savingStatus ? 'Saving…' : 'Save Cabin Location'}</Text>
            </Pressable>
          </View>
        )}

        {!isStudent ? (
          // Two side-by-side columns: staffrooms on the left, faculty
          // availability on the right — each its own plain one-by-one list,
          // not a card grid.
          <View style={styles.twoColumnRow}>
            <View style={[styles.section, styles.column]}>{staffroomSectionContent}</View>
            <View style={[styles.section, styles.column]}>{facultyLocatorContent}</View>
          </View>
        ) : (
          <View style={styles.section}>{facultyLocatorContent}</View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors, shadow) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadow,
  },
  sectionHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { ...typography.h2, color: colors.textPrimary, flexShrink: 1 },
  helper: { ...typography.caption, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.sm, height: 34, overflow: 'hidden' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexShrink: 0,
  },
  addButtonText: { fontWeight: '700', fontSize: 13 },
  formBlock: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  lockedField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.tint1,
  },
  lockedFieldText: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  saveButton: {
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveButtonText: { color: colors.textOnDark, fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.6 },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  statusLabel: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  twoColumnRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  column: { flex: 1 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listRowMain: { flex: 1, marginRight: spacing.sm },
  listRowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  staffroomSearchInput: { marginBottom: spacing.sm },
  listRowTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  listRowMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  emptyText: { color: colors.textSecondary, fontSize: 13, paddingVertical: spacing.sm },
  availabilityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  availabilityText: { color: colors.textOnDark, fontWeight: '700', fontSize: 11 },
});