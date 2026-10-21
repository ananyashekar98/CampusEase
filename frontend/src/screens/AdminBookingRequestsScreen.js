import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import ErrorBoundary from '../components/ErrorBoundary';
import { fetchAllBookings, approveBooking, rejectBooking } from '../api/endpoints';
import { isOutsideCollegeHours, formatTimeRange12h } from '../constants';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { showAlert, showConfirm } from '../utils/alert';

function AdminBookingRequestsScreenInner({ navigation }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  const accent = colors.admin;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookings, setBookings] = useState([]);
  // Which booking is mid-approve right now — disables its own Approve
  // button and swaps the label, so a double-tap can't fire two requests
  // for the same booking while the first is still in flight.
  const [approvingId, setApprovingId] = useState(null);
  // Which booking's card currently has the "why are you rejecting this"
  // reason box open, and what's been typed into it so far. Only one card
  // shows its reason box at a time, so one shared mic/recognition instance
  // below is enough — it's always "for" whichever card is open.
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  // --- Voice input for the reject reason, reject only — same Web Speech
  // API pattern as the "Book with AI" mic on the booking screen. Web
  // (Chrome/Edge) only; there's no native speech-to-text module here.
  const [voiceListening, setVoiceListening] = useState(false);
  const recognitionRef = useRef(null);
  const voiceSupported = useMemo(
    () => Platform.OS === 'web' && typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    []
  );

  useEffect(() => {
    // Stop the mic if the admin navigates away mid-recording.
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

  const load = useCallback(async () => {
    try {
      const data = await fetchAllBookings('pending');
      setBookings(data);
    } catch (err) {
      showAlert('Could not load requests', err.message);
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

  const handleApprove = (booking) => {
    showConfirm('Approve booking', `Approve ${booking.classroom?.name} for ${booking.date}?`, async () => {
      setApprovingId(booking._id);
      try {
        await approveBooking(booking._id);
        setBookings((prev) => prev.filter((b) => b._id !== booking._id));
      } catch (err) {
        showAlert('Could not approve', err.message);
      } finally {
        setApprovingId(null);
      }
    });
  };

  // Reject is now two steps: tapping "Reject" just opens a reason box on
  // that card (nothing is sent yet) — "Confirm Reject" below actually
  // submits it. The reason is optional (blank is still a valid rejection),
  // but giving the requester a "why" is the whole point of this screen.
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
      await rejectBooking(booking._id, rejectNote.trim() || undefined);
      setBookings((prev) => prev.filter((b) => b._id !== booking._id));
      setRejectingId(null);
      setRejectNote('');
    } catch (err) {
      showAlert('Could not reject', err.message);
    } finally {
      setSubmittingReject(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader title="Booking Requests" onBack={() => navigation.goBack()} accentColor={accent} />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {bookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-done-outline" size={36} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No pending requests — you're all caught up.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.countText}>
                {bookings.length} pending request{bookings.length === 1 ? '' : 's'}
              </Text>
              {bookings.map((b) => {
                const isRejecting = rejectingId === b._id;
                const isApproving = approvingId === b._id;
                return (
                  <View key={b._id} style={styles.card}>
                    <Text style={styles.roomName}>{b.classroom?.name}</Text>
                    <Text style={styles.meta}>{b.date} · {formatTimeRange12h(b.startTime, b.endTime)}</Text>
                    {isOutsideCollegeHours(b.startTime, b.endTime) && (
                      <View style={styles.afterHoursTag}>
                        <Text style={styles.afterHoursTagText}>After college hours · Extra class</Text>
                      </View>
                    )}
                    <Text style={styles.meta}>Requested by {b.requestedBy?.name} ({b.requestedBy?.department || b.requestedBy?.role})</Text>
                    {b.forFaculty && String(b.forFaculty._id) !== String(b.requestedBy?._id) && (
                      <Text style={styles.meta}>For {b.forFaculty.name}</Text>
                    )}
                    {b.department && b.semester && b.section && (
                      <Text style={styles.meta}>Will notify: {b.department} · Sem {b.semester} · {b.section}</Text>
                    )}
                    <Text style={styles.purpose}>{b.purpose}</Text>

                    {isRejecting ? (
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
                          <Pressable style={styles.cancelButton} onPress={handleCancelReject} disabled={submittingReject}>
                            <Text style={styles.cancelButtonText}>Cancel</Text>
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
                    )}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors, shadow) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  countText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.sm },
  emptyState: { alignItems: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow,
  },
  roomName: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  purpose: { ...typography.body, color: colors.textPrimary, marginTop: spacing.xs },
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
  disabled: { opacity: 0.6 },
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
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  cancelButtonText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
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

// A crash while rendering this screen (bad data shape, unexpected status
// value, etc.) used to blank the entire app. Wrapping the export matches the
// same pattern All Bookings already uses — a bug here shows a recoverable
// "Try again" card scoped to this screen instead.
export default function AdminBookingRequestsScreen(props) {
  return (
    <ErrorBoundary label="Booking Requests">
      <AdminBookingRequestsScreenInner {...props} />
    </ErrorBoundary>
  );
}