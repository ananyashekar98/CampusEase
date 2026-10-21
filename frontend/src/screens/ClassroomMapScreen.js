import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { fetchClassroomOccupancy } from '../api/endpoints';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { showAlert } from '../utils/alert';

const TYPE_ICON = { lecture: 'easel-outline', lab: 'flask-outline', seminar: 'people-outline' };

// How often to silently re-pull occupancy in the background while this
// screen is open, so "right now" stays right without the person having to
// remember to pull-to-refresh.
const AUTO_REFRESH_MS = 60000;

// Backend sends 24h "HH:MM" — show it the way the rest of the app does
// (12-hour with AM/PM) instead of raw military time.
function formatTime12h(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function ClassroomMapScreen({ navigation }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  const { user } = useAuth();
  const accent = { student: colors.student, faculty: colors.faculty, admin: colors.admin }[user?.role] || colors.primary;
  // Only faculty/admin can actually create a booking (BookClassroom is only
  // registered in the navigator for those two roles) — students only have a
  // read-only "Classroom Bookings" view, so tapping a free room for them
  // wouldn't go anywhere useful.
  const canBook = user?.role === 'faculty' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchClassroomOccupancy();
      setRooms(data);
    } catch (err) {
      showAlert('Could not load classroom map', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // A quiet background refetch — no spinner, no alert on failure. Keeps
  // "occupied now" / "free until" accurate without interrupting whoever's
  // looking at the screen.
  const silentRefresh = useCallback(async () => {
    try {
      const data = await fetchClassroomOccupancy();
      setRooms(data);
    } catch (err) {
      // Deliberately silent — a background refresh failing isn't worth an alert.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(silentRefresh, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [silentRefresh]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // Admin-only room search — by name, building, or type (e.g. "lab", "A Block").
  // A global admin can be looking at rooms across every department, so this
  // is the quickest way to jump straight to one instead of scrolling every
  // building block.
  const query = search.trim().toLowerCase();
  const searchedRooms = query
    ? rooms.filter((r) => [r.name, r.building, r.type].filter(Boolean).join(' ').toLowerCase().includes(query))
    : rooms;

  // Group rooms by building for a clearer "map" layout.
  const groups = searchedRooms.reduce((acc, room) => {
    const key = room.building || 'Main Block';
    if (!acc[key]) acc[key] = [];
    acc[key].push(room);
    return acc;
  }, {});

  const freeCount = searchedRooms.filter((r) => !r.occupied).length;

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader title="Classroom Map View" onBack={() => navigation.goBack()} accentColor={accent} />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : rooms.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="business-outline" size={36} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No classrooms added yet — run the backend seed scripts to add some.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {isAdmin && (
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={16} color={colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search room, building or type…"
                placeholderTextColor={colors.textSecondary}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={10}>
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
          )}

          <View style={styles.summaryBar}>
            <Text style={styles.summaryText}>
              {freeCount} of {searchedRooms.length} rooms free right now
            </Text>
            <Text style={styles.summaryHint}>Updates automatically</Text>
          </View>

          {searchedRooms.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={36} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No rooms match "{search}".</Text>
            </View>
          )}

          {Object.entries(groups).map(([building, buildingRooms]) => (
            <View key={building} style={styles.buildingBlock}>
              <Text style={styles.buildingTitle}>{building}</Text>
              <View style={styles.grid}>
                {buildingRooms.map((room) => {
                  const bookable = canBook && !room.occupied;
                  const isOneOffBooking = room.occupied && room.currentClass?.source === 'booking';
                  const tile = (
                    <View
                      style={[
                        styles.tile,
                        { borderColor: room.occupied ? colors.danger : colors.success },
                      ]}
                    >
                      <View style={styles.tileHeader}>
                        <Ionicons
                          name={TYPE_ICON[room.type] || 'business-outline'}
                          size={18}
                          color={room.occupied ? colors.danger : colors.success}
                        />
                        <Text style={styles.tileName}>{room.name}</Text>
                      </View>
                      <Text style={styles.tileMeta}>
                        {room.type}{room.capacity ? ` · ${room.capacity} seats` : ''}
                      </Text>
                      <View
                        style={[
                          styles.statusPill,
                          { backgroundColor: room.occupied ? colors.danger : colors.success },
                        ]}
                      >
                        <Text style={styles.statusPillText}>
                          {room.occupied ? (isOneOffBooking ? 'Booked' : 'In Use') : 'Free'}
                        </Text>
                      </View>
                      {room.occupied && room.currentClass && (
                        <View style={styles.classInfo}>
                          <Text style={styles.classSubject} numberOfLines={1}>{room.currentClass.subject}</Text>
                          <Text style={styles.classMeta} numberOfLines={1}>
                            {isOneOffBooking
                              ? (room.currentClass.faculty ? `Booked for ${room.currentClass.faculty}` : 'One-off booking')
                              : `${room.currentClass.faculty || ''}${room.currentClass.semester ? ` · Sem ${room.currentClass.semester} ${room.currentClass.section || ''}` : ''}`}
                          </Text>
                          <Text style={styles.classMeta}>until {formatTime12h(room.currentClass.until)}</Text>
                        </View>
                      )}
                      {!room.occupied && (
                        <Text style={styles.freeUntilText}>
                          {room.freeUntil ? `Free until ${formatTime12h(room.freeUntil)}` : 'Free rest of today'}
                        </Text>
                      )}
                      {bookable && (
                        <View style={styles.tapToBookRow}>
                          <Ionicons name="add-circle-outline" size={13} color={accent} />
                          <Text style={[styles.tapToBookText, { color: accent }]}>Tap to book</Text>
                        </View>
                      )}
                    </View>
                  );

                  if (!bookable) return <View key={room._id}>{tile}</View>;

                  return (
                    <Pressable
                      key={room._id}
                      onPress={() => navigation.navigate('BookClassroom', { presetClassroomId: room._id, presetClassroomName: room.name })}
                    >
                      {tile}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors, shadow) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.textPrimary },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  summaryText: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  summaryHint: { ...typography.caption, color: colors.textSecondary },
  buildingBlock: { marginBottom: spacing.lg },
  buildingTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: 160,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    padding: spacing.sm,
    ...shadow,
  },
  tileHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileName: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  tileMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusPillText: { color: colors.textOnDark, fontSize: 11, fontWeight: '700' },
  classInfo: { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs },
  classSubject: { ...typography.caption, fontWeight: '700', color: colors.textPrimary },
  classMeta: { ...typography.caption, color: colors.textSecondary, fontSize: 10 },
  freeUntilText: { ...typography.caption, color: colors.success, fontSize: 10, marginTop: spacing.xs },
  tapToBookRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: spacing.xs },
  tapToBookText: { fontSize: 11, fontWeight: '700' },
});