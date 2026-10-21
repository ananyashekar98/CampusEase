import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import ChipSelector from '../components/ChipSelector';
import { useAuth } from '../context/AuthContext';
import {
  fetchMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  approveBooking,
  rejectBooking,
} from '../api/endpoints';
import { timeAgo } from '../utils/timeAgo';
import useAutoRefresh from '../hooks/useAutoRefresh';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../utils/alert';

const TYPE_ICON = {
  booking: 'calendar-outline',
  'extra-class': 'school-outline',
  timetable: 'time-outline',
  general: 'notifications-outline',
};

// The standalone "Classroom Bookings" screen (a student-only list of
// approved one-off bookings) was removed — everyone already gets a
// notification the moment one of these is approved for their group
// (notifyStudentGroup in bookingController.js, type 'extra-class'), so that
// was a duplicate source for the same information. This filter just lets
// someone find those specific notifications again under a friendlier name
// than "booking", without needing a whole separate screen.
//
// Admin never receives a type:'extra-class' notification — that type only
// ever goes to the student group / faculty whose schedule actually gained a
// class (see bookingController.js's notifyBookingParticipants). An admin's
// own schedule doesn't change when a booking is approved, so the filter
// would just be a dead, always-empty chip for that role. It's left out of
// their filter row entirely.
//
// The circulars feature is gone entirely — no more posting a circular, no
// more "Circulars" filter chip, and type:'circular' notifications are no
// longer created anywhere. An admin is left with just "All" now that its
// only other chip is gone.
const FILTERS_BY_ROLE = {
  admin: [
    { key: 'all', label: 'All' },
  ],
  default: [
    { key: 'all', label: 'All' },
    { key: 'extra-class', label: 'Extra Classes' },
  ],
};

const EMPTY_STATE_TEXT_BY_ROLE = {
  admin: {
    all: "Nothing yet — you'll see booking requests and other updates here.",
  },
  default: {
    all: "Nothing yet — you'll see extra classes and other updates here.",
    'extra-class': 'No extra classes right now.',
  },
};

export default function NotificationsScreen({ navigation }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  const { user } = useAuth();
  const accent = { student: colors.student, faculty: colors.faculty, admin: colors.admin }[user?.role] || colors.primary;
  const isAdmin = user?.role === 'admin';
  const FILTERS = isAdmin ? FILTERS_BY_ROLE.admin : FILTERS_BY_ROLE.default;
  const EMPTY_STATE_TEXT = isAdmin ? EMPTY_STATE_TEXT_BY_ROLE.admin : EMPTY_STATE_TEXT_BY_ROLE.default;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');

  // --- Inline Approve/Reject, admin only, on "new booking request"
  // notifications — lets an admin act straight from the notification
  // instead of having to go open the Booking Requests screen first.
  const [actingId, setActingId] = useState(null); // notification currently approving/rejecting
  const [rejectingId, setRejectingId] = useState(null); // notification whose reason box is open
  const [rejectNote, setRejectNote] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchMyNotifications();
      setNotifications(data);
    } catch (err) {
      showAlert('Could not load notifications', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Pull new notifications in every 10s while this screen is open, and
  // also whenever the screen regains focus. Paused while an admin is
  // mid-Approve/Reject so the list doesn't shift under their finger.
  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', load);
    return unsubscribe;
  }, [navigation, load]);
  useAutoRefresh(() => {
    if (!actingId && !rejectingId) return load();
    return undefined;
  }, 10000);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handlePress = async (notification) => {
    if (notification.read) return;
    // Optimistic update — flip it locally right away, sync in the background.
    setNotifications((prev) =>
      prev.map((n) => (n._id === notification._id ? { ...n, read: true } : n))
    );
    try {
      await markNotificationRead(notification._id);
    } catch (err) {
      // Revert on failure
      setNotifications((prev) =>
        prev.map((n) => (n._id === notification._id ? { ...n, read: false } : n))
      );
      showAlert('Could not update', err.message);
    }
  };

  const handleMarkAllRead = async () => {
    const previous = notifications;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await markAllNotificationsRead();
    } catch (err) {
      setNotifications(previous);
      showAlert('Could not update', err.message);
    }
  };

  // Patches just the one notification's relatedBooking.status in place —
  // the booking itself was already updated server-side, this just makes
  // the card reflect it without a full reload.
  const patchBookingStatus = (notificationId, status) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n._id === notificationId
          ? { ...n, read: true, relatedBooking: { ...n.relatedBooking, status } }
          : n
      )
    );
  };

  const handleApprove = (notification) => {
    const bookingId = notification.relatedBooking?._id;
    if (!bookingId) return;
    setActingId(notification._id);
    approveBooking(bookingId)
      .then(() => patchBookingStatus(notification._id, 'approved'))
      .catch((err) => showAlert('Could not approve', err.message))
      .finally(() => setActingId(null));
  };

  const handleRejectPress = (notification) => {
    setRejectingId(notification._id);
    setRejectNote('');
  };

  const handleCancelReject = () => {
    setRejectingId(null);
    setRejectNote('');
  };

  const handleConfirmReject = (notification) => {
    const bookingId = notification.relatedBooking?._id;
    if (!bookingId) return;
    setActingId(notification._id);
    rejectBooking(bookingId, rejectNote.trim() || undefined)
      .then(() => {
        patchBookingStatus(notification._id, 'rejected');
        setRejectingId(null);
        setRejectNote('');
      })
      .catch((err) => showAlert('Could not reject', err.message))
      .finally(() => setActingId(null));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const visibleNotifications = filter === 'all' ? notifications : notifications.filter((n) => (
    n.type === filter
    // Notifications saved before faculty "booked for you" alerts became
    // 'extra-class' keep their old type; match them by title so they show too.
    || (filter === 'extra-class' && n.type === 'booking' && /^A class was booked for you$/.test(n.title || ''))
  ));

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader title="Notifications" onBack={() => navigation.goBack()} accentColor={accent} />
      <View style={styles.filterRow}>
        <View style={styles.filterChips}>
          <ChipSelector options={FILTERS} selectedKey={filter} onSelect={setFilter} accentColor={accent} />
        </View>
        {/* "Mark all as read" lives on the same line as the filter chips, at the right edge */}
        {unreadCount > 0 && (
          <Pressable style={[styles.markAllButton, { borderColor: accent }]} onPress={handleMarkAllRead}>
            <Text style={[styles.markAllText, { color: accent }]}>Mark all {unreadCount} as read</Text>
          </Pressable>
        )}
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
          <View style={styles.column}>
          {visibleNotifications.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={36} color={colors.textSecondary} />
              <Text style={styles.emptyText}>
                {EMPTY_STATE_TEXT[filter] || 'Nothing to show for this filter.'}
              </Text>
            </View>
          ) : (
            visibleNotifications.map((n) => {
              // Only a "new booking request" notification carries a
              // relatedBooking, and only an admin can act on it, and only
              // while it's still actually pending (not already approved/
              // rejected by this admin or another one in the meantime).
              const isActionable = isAdmin && n.type === 'booking' && n.relatedBooking && n.relatedBooking.status === 'pending';
              const isDecided = n.type === 'booking' && n.relatedBooking && n.relatedBooking.status !== 'pending';
              const isRejecting = rejectingId === n._id;
              const isActing = actingId === n._id;

              return (
                <Pressable
                  key={n._id}
                  style={[styles.card, !n.read && { borderColor: accent, borderWidth: 1.5 }]}
                  onPress={() => handlePress(n)}
                >
                  <View style={[styles.iconWrap, { backgroundColor: n.read ? colors.background : accent + '22' }]}>
                    <Ionicons name={TYPE_ICON[n.type] || 'notifications-outline'} size={18} color={accent} />
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardTitle}>{n.title}</Text>
                      {!n.read && <View style={[styles.dot, { backgroundColor: accent }]} />}
                    </View>
                    <Text style={styles.cardMessage}>{n.message}</Text>
                    <Text style={styles.cardTime}>{timeAgo(n.createdAt)}</Text>

                    {isDecided && (
                      <View style={styles.decidedTag}>
                        <Ionicons
                          name={n.relatedBooking.status === 'approved' ? 'checkmark-circle' : 'close-circle'}
                          size={13}
                          color={n.relatedBooking.status === 'approved' ? colors.success : colors.danger}
                        />
                        <Text
                          style={[
                            styles.decidedTagText,
                            { color: n.relatedBooking.status === 'approved' ? colors.success : colors.danger },
                          ]}
                        >
                          {n.relatedBooking.status === 'approved' ? 'Approved' : 'Rejected'}
                        </Text>
                      </View>
                    )}

                    {isActionable && !isRejecting && (
                      <View style={styles.actions}>
                        <Pressable
                          style={[styles.actionButton, styles.approveButton, isActing && styles.disabled]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleApprove(n);
                          }}
                          disabled={isActing}
                        >
                          <Ionicons name="checkmark" size={15} color={colors.textOnDark} />
                          <Text style={styles.actionButtonText}>{isActing ? 'Approving…' : 'Approve'}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.actionButton, styles.rejectButton]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleRejectPress(n);
                          }}
                          disabled={isActing}
                        >
                          <Ionicons name="close" size={15} color={colors.danger} />
                          <Text style={[styles.actionButtonText, { color: colors.danger }]}>Reject</Text>
                        </Pressable>
                      </View>
                    )}

                    {isActionable && isRejecting && (
                      <View style={styles.rejectBox} onStartShouldSetResponder={() => true}>
                        <Text style={styles.rejectLabel}>Reason for rejecting (the requester will see this):</Text>
                        <TextInput
                          style={styles.rejectInput}
                          placeholder="e.g. Room already reserved for a lab that day"
                          placeholderTextColor={colors.textSecondary}
                          value={rejectNote}
                          onChangeText={setRejectNote}
                          multiline
                          autoFocus
                        />
                        <View style={styles.actions}>
                          <Pressable
                            style={[styles.actionButton, styles.rejectButton, isActing && styles.disabled]}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              handleConfirmReject(n);
                            }}
                            disabled={isActing}
                          >
                            <Ionicons name="close" size={15} color={colors.danger} />
                            <Text style={[styles.actionButtonText, { color: colors.danger }]}>
                              {isActing ? 'Rejecting…' : 'Confirm Reject'}
                            </Text>
                          </Pressable>
                          <Pressable
                            style={styles.cancelButton}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              handleCancelReject();
                            }}
                            disabled={isActing}
                          >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors, shadow) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  // One full-width column shared by the filter chips, "Mark all" and every card, so they all
  // start and end on the same left/right edges as the screen header.
  column: { width: '100%' },
  // Was referenced in the JSX but never actually defined here — an
  // undefined style means zero padding, so the filter chip row sat flush
  // against the true left edge of the screen while everything else below it
  // (cards, "Mark all as read") had normal padding. That mismatch is what
  // made "All" look shoved into the margin.
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  filterChips: { flexShrink: 1 },
  markAllButton: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginLeft: 'auto',
  },
  markAllText: { fontSize: 13, fontWeight: '700' },
  emptyState: { alignItems: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
    ...shadow,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  cardMessage: { ...typography.caption, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
  cardTime: { ...typography.caption, color: colors.textSecondary, marginTop: 4, opacity: 0.7 },
  decidedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  decidedTagText: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  approveButton: { backgroundColor: colors.success },
  rejectButton: { borderWidth: 1, borderColor: colors.danger },
  actionButtonText: { color: colors.textOnDark, fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.6 },
  rejectBox: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rejectLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  rejectInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    minHeight: 60,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    textAlignVertical: 'top',
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  cancelButtonText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
});