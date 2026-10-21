import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import ChipSelector from '../components/ChipSelector';
import StatusBadge from '../components/StatusBadge';
import ErrorBoundary from '../components/ErrorBoundary';
import { fetchAllBookings, cancelBooking, approveBooking, rejectBooking } from '../api/endpoints';
import { isOutsideCollegeHours, formatTimeRange12h } from '../constants';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { showAlert, showConfirm } from '../utils/alert';

// "Cancelled" and "Rejected" used to be two separate statuses/filters —
// they're merged into one "Rejected" status now (a booking is either still
// pending a decision, approved, or it's been called off — however that
// happened). rejectionType on the booking ("auto" vs "manual") is what
// tells apart the system's own auto-expiry sweep from an admin/requester
// actually calling it off, shown as a sub-label on the card below.
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

function AdminAllBookingsScreenInner({ navigation }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  const { user } = useAuth();
  const accent = colors.admin;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [bookings, setBookings] = useState([]);
  // Which booking is mid-cancel right now — disables just that card's
  // button and swaps its label, so a double-tap can't fire the request twice.
  const [cancellingId, setCancellingId] = useState(null);
  // A pending booking here gets the same Approve/Reject actions as the
  // dedicated Booking Requests screen, not a plain Cancel — this is still
  // an unreviewed request, so the decision is approve-or-reject, not just
  // "call it off". Cancel stays for bookings that are already approved.
  const [approvingId, setApprovingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  // --- Voice input for the reject reason — same Web Speech API pattern as
  // the Booking Requests screen. Web (Chrome/Edge) only.
  const [voiceListening, setVoiceListening] = useState(false);
  const recognitionRef = useRef(null);
  const voiceSupported = useMemo(
    () => Platform.OS === 'web' && typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    []
  );

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const handleToggleVoice = () => {
    if (!voiceSupported) {
      showAlert(
        'Voice input not available',
        'Voice input works in Chrome or Edge on the web app. On this device, just type the reason instead.'
      );
      return;
    }
    if (voiceListening) {
      recognitionRef.current?.stop();
      setVoiceListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      setRejectNote(transcript);
    };
    recognition.onerror = (event) => {
      setVoiceListening(false);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        showAlert('Voice input error', `Couldn't catch that (${event.error}). Try again or type it instead.`);
      }
    };
    recognition.onend = () => setVoiceListening(false);

    recognitionRef.current = recognition;
    setRejectNote('');
    setVoiceListening(true);
    recognition.start();
  };

  const load = useCallback(async (status) => {
    try {
      const data = await fetchAllBookings(status === 'all' ? undefined : status);
      setBookings(data);
    } catch (err) {
      showAlert('Could not load bookings', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(filter);
  }, [filter, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(filter);
  };

  const handleCancel = (booking) => {
    showConfirm('Cancel booking', `Cancel ${booking.classroom?.name} on ${booking.date} (${booking.startTime}-${booking.endTime})?`, async () => {
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

  const handleApprove = (booking) => {
    showConfirm('Approve booking', `Approve ${booking.classroom?.name} for ${booking.date}?`, async () => {
      setApprovingId(booking._id);
      try {
        const updated = await approveBooking(booking._id);
        setBookings((prev) => prev.map((b) => (b._id === updated._id ? updated : b)));
      } catch (err) {
        showAlert('Could not approve', err.message);
      } finally {
        setApprovingId(null);
      }
    });
  };

  // Same two-step reject as Booking Requests: tapping "Reject" just opens a
  // reason box on the card, nothing is sent until "Confirm Reject".
  const handleRejectPress = (booking) => {
    setRejectingId(booking._id);
    setRejectNote('');
  };

  const handleCancelReject = () => {
    recognitionRef.current?.stop();
    setVoiceListening(false);
    setRejectingId(null);
    setRejectNote('');
  };

  const handleConfirmReject = async (booking) => {
    recognitionRef.current?.stop();
    setVoiceListening(false);
    setSubmittingReject(true);
    try {
      const updated = await rejectBooking(booking._id, rejectNote.trim() || undefined);
      setBookings((prev) => prev.map((b) => (b._id === updated._id ? updated : b)));
      setRejectingId(null);
      setRejectNote('');
    } catch (err) {
      showAlert('Could not reject', err.message);
    } finally {
      setSubmittingReject(false);
    }
  };

  const query = search.trim().toLowerCase();
  const visibleBookings = query
    ? bookings.filter((b) => {
        const haystack = [b.classroom?.name, b.requestedBy?.name, b.purpose, b.date]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
    : bookings;

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader title="All Bookings" onBack={() => navigation.goBack()} accentColor={accent} />
      <View style={styles.filterRow}>
        <TextInput
          style={styles.search}
          placeholder="Search room, person, purpose, date…"
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
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
              <Ionicons name="reader-outline" size={36} color={colors.textSecondary} />
              <Text style={styles.emptyText}>
                {query
                  ? `No bookings match "${search}".`
                  : user?.department
                  ? `No ${filter === 'all' ? '' : filter + ' '}bookings for ${user.department}'s rooms yet. You're scoped to this department — bookings made under other departments won't appear here.`
                  : 'No bookings match this filter.'}
              </Text>
            </View>
          ) : (
            visibleBookings.map((b) => {
              const isCancelling = cancellingId === b._id;
              const isApproving = approvingId === b._id;
              const isRejecting = rejectingId === b._id;
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
                  <Text style={styles.meta}>By {b.requestedBy?.name} ({b.requestedBy?.role})</Text>
                  {b.forFaculty && (
                    <Text style={styles.meta}>For {b.forFaculty.name}</Text>
                  )}
                  {b.department && b.semester && b.section && (
                    <Text style={styles.meta}>Notified: {b.department} · Sem {b.semester} · {b.section}</Text>
                  )}
                  <Text style={styles.purpose}>{b.purpose}</Text>
                  {b.status === 'rejected' && b.reviewNote ? (
                    <Text style={styles.note}>{b.reviewNote}</Text>
                  ) : null}

                  {b.status === 'pending' && (
                    isRejecting ? (
                      <View style={styles.rejectBox}>
                        <Text style={styles.rejectLabel}>Reason for rejecting (the requester will see this):</Text>
                        <View style={styles.rejectInputRow}>
                          <TextInput
                            style={[styles.rejectInput, styles.rejectInputFlex]}
                            placeholder="e.g. Room already reserved for a lab that day"
                            placeholderTextColor={colors.textSecondary}
                            value={rejectNote}
                            onChangeText={setRejectNote}
                            multiline
                            autoFocus
                          />
                          <Pressable
                            style={[
                              styles.micButton,
                              { borderColor: colors.danger },
                              voiceListening && { backgroundColor: colors.danger },
                            ]}
                            onPress={handleToggleVoice}
                          >
                            <Ionicons name={voiceListening ? 'mic' : 'mic-outline'} size={20} color={voiceListening ? colors.textOnDark : colors.danger} />
                          </Pressable>
                        </View>
                        {voiceListening && (
                          <View style={styles.listeningRow}>
                            <ActivityIndicator size="small" color={colors.danger} />
                            <Text style={styles.listeningText}>Listening… speak the reason, then tap the mic again to stop.</Text>
                          </View>
                        )}
                        <View style={styles.actions}>
                          <Pressable
                            style={[styles.actionButton, styles.rejectButton, submittingReject && styles.disabled]}
                            onPress={() => handleConfirmReject(b)}
                            disabled={submittingReject}
                          >
                            <Ionicons name="close" size={16} color={colors.danger} />
                            <Text style={[styles.actionButtonText, { color: colors.danger }]}>
                              {submittingReject ? 'Rejecting…' : 'Confirm Reject'}
                            </Text>
                          </Pressable>
                          <Pressable style={styles.plainCancelButton} onPress={handleCancelReject} disabled={submittingReject}>
                            <Text style={styles.plainCancelButtonText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.actions}>
                        <Pressable
                          style={[styles.actionButton, styles.approveButton, isApproving && styles.disabled]}
                          onPress={() => handleApprove(b)}
                          disabled={isApproving}
                        >
                          {isApproving ? (
                            <ActivityIndicator size="small" color={colors.textOnDark} />
                          ) : (
                            <Ionicons name="checkmark" size={16} color={colors.textOnDark} />
                          )}
                          <Text style={styles.actionButtonText}>{isApproving ? 'Approving…' : 'Approve'}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.actionButton, styles.rejectButton, isApproving && styles.disabled]}
                          onPress={() => handleRejectPress(b)}
                          disabled={isApproving}
                        >
                          <Ionicons name="close" size={16} color={colors.danger} />
                          <Text style={[styles.actionButtonText, { color: colors.danger }]}>Reject</Text>
                        </Pressable>
                      </View>
                    )
                  )}

                  {b.status === 'approved' && (
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
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
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
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
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
  // --- Approve/Reject (pending bookings) — same look as Booking Requests ---
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  approveButton: { backgroundColor: colors.success },
  rejectButton: { borderWidth: 1, borderColor: colors.danger },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  actionButtonText: { color: colors.textOnDark, fontWeight: '700', fontSize: 13 },
  rejectBox: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rejectLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  rejectInputRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  rejectInputFlex: { flex: 1 },
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
  micButton: {
    width: 44,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listeningRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  listeningText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  plainCancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  plainCancelButtonText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
});

// A crash while rendering this screen (bad data shape, unexpected status
// value, etc.) used to blank the entire app — there was no error boundary
// anywhere, so React just unmounted everything. Wrapping the export means a
// bug here shows a recoverable "Try again" card scoped to this screen instead.
export default function AdminAllBookingsScreen(props) {
  return (
    <ErrorBoundary label="All Bookings">
      <AdminAllBookingsScreenInner {...props} />
    </ErrorBoundary>
  );
}