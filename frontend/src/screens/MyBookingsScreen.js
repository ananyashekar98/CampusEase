import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import ChipSelector from '../components/ChipSelector';
import StatusBadge from '../components/StatusBadge';
import ErrorBoundary from '../components/ErrorBoundary';
import { fetchMyBookings, cancelBooking } from '../api/endpoints';
import { isOutsideCollegeHours, formatTimeRange12h } from '../constants';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { showAlert, showConfirm } from '../utils/alert';

// Same filter set as the admin's "All Bookings" screen — a faculty member
// has pending requests, approved ones, and rejected ones (shown with the
// reason below, and whether it was auto-expired or someone actually called
// it off). "Rejected" and "Cancelled" used to be two separate statuses —
// they're one "Rejected" status now, however it happened.
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

function MyBookingsScreenInner({ navigation }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  const accent = colors.faculty;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [bookings, setBookings] = useState([]);
  // Which booking is mid-cancel right now — disables just that card's
  // button and swaps its label, so a double-tap can't fire the request twice.
  const [cancellingId, setCancellingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchMyBookings();
      setBookings(data);
    } catch (err) {
      showAlert('Could not load bookings', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleCancel = (booking) => {
    showConfirm('Cancel booking', `Cancel your request for ${booking.classroom?.name} on ${booking.date}?`, async () => {
      setCancellingId(booking._id);
      try {
        const updated = await cancelBooking(booking._id);
        setBookings((prev) => prev.map((b) => (b._id === updated._id ? updated : b)));
      } catch (err) {
        showAlert('Could not cancel', err.message);
      } finally {
        setCancellingId(null);
      }
    });
  };

  // fetchMyBookings() returns everything (pending/approved/rejected/
  // cancelled) in one call, so the filter tabs are applied on the client —
  // no extra request per tab, and switching tabs is instant.
  const visibleBookings = filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader title="My Bookings" onBack={() => navigation.goBack()} accentColor={accent} />
      <View style={styles.filterRow}>
        <ChipSelector options={FILTERS} selectedKey={filter} onSelect={setFilter} accentColor={accent} />
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {visibleBookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="file-tray-outline" size={36} color={colors.textSecondary} />
              <Text style={styles.emptyText}>
                {filter === 'all'
                  ? "You haven't requested any bookings yet."
                  : `No ${filter} bookings.`}
              </Text>
            </View>
          ) : (
            visibleBookings.map((b) => {
              const isCancelling = cancellingId === b._id;
              return (
                <View key={b._id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.roomName}>{b.classroom?.name}</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <StatusBadge status={b.status} />
                      {b.status === 'rejected' && (
                        <Text style={styles.rejectionTypeText}>
                          {b.rejectionType === 'auto' ? 'Auto Rejected' : 'Admin Rejected'}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Text style={styles.meta}>{b.date} · {formatTimeRange12h(b.startTime, b.endTime)}</Text>
                  {isOutsideCollegeHours(b.startTime, b.endTime) && (
                    <View style={styles.afterHoursTag}>
                      <Text style={styles.afterHoursTagText}>After college hours · Extra class</Text>
                    </View>
                  )}
                  {b.forFaculty && String(b.forFaculty._id) !== String(b.requestedBy?._id) && (
                    <Text style={styles.meta}>Booked for you by {b.requestedBy?.name}</Text>
                  )}
                  <Text style={styles.purpose}>{b.purpose}</Text>
                  {b.status === 'rejected' && b.reviewNote ? (
                    <Text style={styles.note}>{b.reviewNote}</Text>
                  ) : null}
                  {(b.status === 'pending' || b.status === 'approved') && (
                    <Pressable
                      style={[styles.cancelButton, isCancelling && styles.disabled]}
                      onPress={() => handleCancel(b)}
                      disabled={isCancelling}
                    >
                      {isCancelling && <ActivityIndicator size="small" color={colors.danger} />}
                      <Text style={styles.cancelButtonText}>{isCancelling ? 'Cancelling…' : 'Cancel'}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors, shadow) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filterRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  container: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  emptyState: { alignItems: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  roomName: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  rejectionTypeText: { ...typography.caption, color: colors.textSecondary, fontSize: 10, marginTop: 3 },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  purpose: { ...typography.body, color: colors.textPrimary, marginTop: spacing.xs },
  note: { ...typography.caption, color: colors.danger, marginTop: spacing.xs, fontStyle: 'italic' },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  cancelButtonText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  disabled: { opacity: 0.6 },
  afterHoursTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.tint4,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 2,
  },
  afterHoursTagText: { color: colors.danger, fontSize: 10, fontWeight: '700' },
});

// Matches the same error-boundary pattern All Bookings already uses — a
// crash rendering one odd booking shows a recoverable card scoped to this
// screen instead of blanking the whole app.
export default function MyBookingsScreen(props) {
  return (
    <ErrorBoundary label="My Bookings">
      <MyBookingsScreenInner {...props} />
    </ErrorBoundary>
  );
}