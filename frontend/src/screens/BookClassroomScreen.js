import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import SearchableSelect from '../components/SearchableSelect';
import TimePicker from '../components/TimePicker';
import DatePicker from '../components/DatePicker';
import { useAuth } from '../context/AuthContext';
import {
  fetchClassrooms,
  fetchAvailableClassrooms,
  createBooking,
  parseBookingRequest,
  fetchFacultyDirectory,
  checkFacultyAvailability,
} from '../api/endpoints';
import { DEPARTMENTS, SEMESTERS, SECTIONS, abbreviateDepartment, isOutsideCollegeHours, COLLEGE_START_TIME, COLLEGE_END_TIME, formatTime12h } from '../constants';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../utils/alert';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

// The college is in India, but whoever's running this on the web might not
// be — so "is this slot already in the past" has to be computed in IST
// explicitly, the same way bookingController.js's isInPast does it on the
// backend, not just by comparing against whatever timezone the browser/device
// happens to be in.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function getNowIST() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`,
    time: `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`,
  };
}
function isPastDateTime(date, startTime) {
  const now = getNowIST();
  if (date < now.date) return true;
  if (date === now.date && startTime <= now.time) return true;
  return false;
}

export default function BookClassroomScreen({ navigation, route }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const accent = isAdmin ? colors.admin : colors.faculty;
  // Faculty always act within their own department; a department-scoped
  // admin (admin.cse@, admin.ise@, etc.) does too. Only a global admin
  // (no department on their own account) gets a free choice of department.
  const scopeDepartment = user?.department || null;

  const [loading, setLoading] = useState(true);
  // Full list — only used to validate/name a preset classroom coming in from
  // the map. The actual picker below is sourced from availableClassrooms.
  const [classrooms, setClassrooms] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // --- Arriving here from "tap to book" on the Classroom Map View ---
  const presetClassroomId = route?.params?.presetClassroomId || null;
  const presetClassroomName = route?.params?.presetClassroomName || null;

  // --- Admin-only extras: who this class is actually for, so THEY get
  // notified too (booking it doesn't just silently reserve a room). ---
  const [forFaculty, setForFaculty] = useState(null);
  // Single department value now drives three things at once: for an admin,
  // which classrooms and which faculty even show up as options below
  // (filtered client-side, see departmentFilteredClassrooms/Faculty); and —
  // same as before, for everyone — who gets notified once semester+section
  // are filled in too. A department-scoped admin (or any faculty account)
  // never sees a picker for this at all; it's locked to their own department.
  const [department, setDepartment] = useState(() => scopeDepartment || null);
  const [notifySemester, setNotifySemester] = useState(null);
  const [notifySection, setNotifySection] = useState(null);

  // --- AI assistant (admin only) — pre-fills the form fields above, doesn't book directly ---
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [aiParsing, setAiParsing] = useState(false);
  const [aiNote, setAiNote] = useState(null);

  // --- Voice input for the AI assistant box — works for any admin account,
  // global or department-scoped, since both share this same screen (isAdmin
  // above doesn't distinguish between them). Uses the browser's built-in Web
  // Speech API, so it only works on the web app (Chrome/Edge), not the
  // native app — there's no native speech-to-text module in this project.
  const [aiListening, setAiListening] = useState(false);
  const aiRecognitionRef = useRef(null);
  const voiceSupported = useMemo(
    () => Platform.OS === 'web' && typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    []
  );

  useEffect(() => {
    // Stop the mic if the admin navigates away mid-recording.
    return () => {
      aiRecognitionRef.current?.stop();
    };
  }, []);

  const handleToggleAiVoice = () => {
    if (!voiceSupported) {
      showAlert(
        'Voice input not available',
        'Voice input works in Chrome or Edge on the web app. On this device, just type the booking instead.'
      );
      return;
    }
    if (aiListening) {
      aiRecognitionRef.current?.stop();
      setAiListening(false);
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
      setAiMessage(transcript);
    };
    recognition.onerror = (event) => {
      setAiListening(false);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        showAlert('Voice input error', `Couldn't catch that (${event.error}). Try again or type it instead.`);
      }
    };
    recognition.onend = () => setAiListening(false);

    aiRecognitionRef.current = recognition;
    setAiMessage('');
    setAiListening(true);
    recognition.start();
  };

  const outsideHours = isOutsideCollegeHours(startTime, endTime);

  // --- Date + Time gate ---
  // Everything else on this form (which classroom, purpose, who it's for,
  // who to notify) only makes sense once a date and a valid, still-upcoming
  // time range are locked in — the classroom list itself depends entirely
  // on that slot, and checking availability for a slot that's already gone
  // is meaningless (every room would look "available" since nothing can
  // actually be booked there anymore). So the rest of the form stays hidden
  // until this is true, and Date/Time are the first fields on the screen,
  // in that order.
  const formatValid =
    DATE_PATTERN.test(date) && TIME_PATTERN.test(startTime) && TIME_PATTERN.test(endTime) && startTime < endTime;
  const isPastSlot = formatValid && isPastDateTime(date, startTime);
  const dateTimeValid = formatValid && !isPastSlot;

  // --- Classroom availability for the chosen date/time ---
  // Replaces "every classroom, find out about a clash after submitting"
  // with "only the rooms actually free for this exact slot".
  const [availableClassrooms, setAvailableClassrooms] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  useEffect(() => {
    if (!dateTimeValid) {
      setAvailableClassrooms([]);
      setSelectedClassroom(null);
      return undefined;
    }
    let cancelled = false;
    setLoadingAvailable(true);
    // Debounced — this re-fires on every keystroke-ish change to date/time,
    // no reason to hit the API before the person's actually paused.
    const timer = setTimeout(async () => {
      try {
        const data = await fetchAvailableClassrooms({ date, startTime, endTime });
        if (cancelled) return;
        setAvailableClassrooms(data);
        // Keep the current selection only if it's still actually free for
        // the (possibly just-changed) slot — otherwise it's stale.
        setSelectedClassroom((prev) => (prev && data.some((c) => c._id === prev) ? prev : null));
      } catch (err) {
        if (!cancelled) {
          setAvailableClassrooms([]);
          showAlert('Could not check availability', err.message);
        }
      } finally {
        if (!cancelled) setLoadingAvailable(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dateTimeValid, date, startTime, endTime]);

  // --- Faculty double-booking warning ---
  // The faculty member this slot is actually "for": a faculty account
  // booking for themselves, or whoever an admin picked in "For faculty"
  // below. If an admin hasn't picked anyone, there's no specific person to
  // check yet. This never blocks submission — it's a heads-up only, shown
  // to whichever of them is on this screen (faculty themselves, or admin
  // booking on their behalf).
  const facultyIdToCheck = isAdmin ? forFaculty : user?._id;
  const [facultyConflict, setFacultyConflict] = useState(null);
  const [checkingFacultyConflict, setCheckingFacultyConflict] = useState(false);

  useEffect(() => {
    if (!facultyIdToCheck || !dateTimeValid) {
      setFacultyConflict(null);
      return undefined;
    }
    let cancelled = false;
    setCheckingFacultyConflict(true);
    const timer = setTimeout(async () => {
      try {
        const conflict = await checkFacultyAvailability({ facultyId: facultyIdToCheck, date, startTime, endTime });
        if (!cancelled) setFacultyConflict(conflict);
      } catch (err) {
        if (!cancelled) setFacultyConflict(null);
      } finally {
        if (!cancelled) setCheckingFacultyConflict(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [facultyIdToCheck, dateTimeValid, date, startTime, endTime]);

  const load = useCallback(async () => {
    try {
      const [classroomData, facultyData] = await Promise.all([
        fetchClassrooms(),
        isAdmin ? fetchFacultyDirectory() : Promise.resolve([]),
      ]);
      setClassrooms(classroomData);
      setFacultyList(facultyData);
      if (presetClassroomId && classroomData.some((c) => c._id === presetClassroomId)) {
        setSelectedClassroom(presetClassroomId);
        // They tapped a room that's free right now — default to booking it
        // today; they can still change the date if they meant a future day.
        // The availability check above still runs against the default
        // 9–10 time window, so if it's not actually free then, it'll be
        // dropped from the list and they'll need to pick another.
        // Must be today in IST specifically — new Date().toISOString() gives
        // the UTC date, which is still "yesterday" for any time between
        // midnight and 5:30 AM IST. Using that raw would silently preset
        // yesterday's date, which the past-time gate below then (correctly,
        // but confusingly) rejects as already gone.
        setDate(getNowIST().date);
      }
    } catch (err) {
      showAlert('Could not load classrooms', err.message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, presetClassroomId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAskAi = async () => {
    if (!aiMessage.trim()) {
      showAlert('Nothing to parse', 'Describe the booking you want, e.g. "Book 201 for Prof. Sharma\'s DS class tomorrow at 2pm".');
      return;
    }
    setAiParsing(true);
    setAiNote(null);
    try {
      const { parsed, matchedClassroomId, matchedClassroomName, matchedFacultyId } = await parseBookingRequest(aiMessage.trim());

      if (parsed.date) setDate(parsed.date);
      if (parsed.startTime) setStartTime(parsed.startTime);
      if (parsed.endTime) setEndTime(parsed.endTime);
      if (parsed.purpose || parsed.subject) setPurpose(parsed.purpose || parsed.subject);
      if (matchedFacultyId) {
        setForFaculty(matchedFacultyId);
      }
      // The classroom it matched can only be applied once the availability
      // list for the parsed date/time has loaded — otherwise it isn't in
      // availableClassrooms yet and the reconciliation effect above would
      // immediately clear it back out. Stash it and let a separate effect
      // apply it once that list catches up.
      if (matchedClassroomId) {
        setPendingAiClassroomId(matchedClassroomId);
      }

      const notes = [];
      if (!matchedClassroomId && parsed.classroomName) {
        notes.push(`Couldn't find a classroom matching "${parsed.classroomName}" — add it in Timetable Matrix View, or pick one below manually.`);
      }
      if (parsed.facultyName && !matchedFacultyId) {
        notes.push(`Couldn't match "${parsed.facultyName}" to a faculty account — pick them below manually if you want them notified.`);
      } else if (matchedFacultyId) {
        notes.push(`Matched faculty — they'll be notified once this is booked.`);
      }
      if (parsed.notes) notes.push(parsed.notes);
      setAiNote(notes.length > 0 ? notes.join(' ') : `Filled in from: "${matchedClassroomName || parsed.classroomName || '—'}"`);
    } catch (err) {
      showAlert('Assistant error', err.message);
    } finally {
      setAiParsing(false);
    }
  };

  // See the comment in handleAskAi above — applies a classroom the AI
  // matched once it actually shows up in the freshly-fetched available list
  // for whatever date/time the AI also set.
  const [pendingAiClassroomId, setPendingAiClassroomId] = useState(null);
  useEffect(() => {
    if (!pendingAiClassroomId) return;
    if (availableClassrooms.some((c) => c._id === pendingAiClassroomId)) {
      setSelectedClassroom(pendingAiClassroomId);
      setPendingAiClassroomId(null);
    }
  }, [pendingAiClassroomId, availableClassrooms]);

  // --- Department-filtered classroom/faculty options (admin only) ---
  // Classroom docs already carry their own department (see Classroom.js),
  // and availableClassrooms already has the full doc, so this is a plain
  // client-side filter — no extra request needed. A department-scoped
  // admin's availableClassrooms/facultyList are already narrowed to their
  // own department server-side, so this filter is a no-op for them either
  // way; it only actually does something for a global admin.
  const departmentFilteredClassrooms = useMemo(
    () => (department ? availableClassrooms.filter((c) => c.department === department) : []),
    [availableClassrooms, department]
  );
  const departmentFilteredFaculty = useMemo(
    () => (department ? facultyList.filter((f) => f.department === department) : []),
    [facultyList, department]
  );
  const classroomOptions = isAdmin ? departmentFilteredClassrooms : availableClassrooms;
  const facultyOptions = isAdmin ? departmentFilteredFaculty : facultyList;

  // Switching department mid-form can orphan a selection made under the
  // previous one — drop it rather than silently submit a mismatched room
  // or faculty member.
  useEffect(() => {
    setSelectedClassroom((prev) => (prev && classroomOptions.some((c) => c._id === prev) ? prev : null));
  }, [department, classroomOptions]);
  useEffect(() => {
    setForFaculty((prev) => (prev && facultyOptions.some((f) => f._id === prev) ? prev : null));
  }, [department, facultyOptions]);

  const handleSubmit = async () => {
    if (!dateTimeValid) {
      showAlert('Pick a date and time', 'Choose a date and a valid start/end time first.');
      return;
    }
    if (!selectedClassroom) {
      showAlert('Missing classroom', 'Please select a classroom.');
      return;
    }
    // Catch a past date/time here for instant feedback — the backend checks
    // this too (that's the one that actually matters), but this saves a
    // round trip for the common case of picking yesterday or an already-gone
    // time today. "+05:30" is explicit so this is always evaluated as IST,
    // regardless of what timezone the browser/device itself is set to.
    const slotStart = new Date(`${date}T${startTime}:00+05:30`);
    if (Number.isNaN(slotStart.getTime()) || slotStart.getTime() <= Date.now()) {
      showAlert('That time has already passed', 'Pick a date and time that are still ahead of now.');
      return;
    }
    if (!purpose.trim()) {
      showAlert('Missing purpose', 'Please describe why you need the room.');
      return;
    }

    setSubmitting(true);
    try {
      const notifyGroupComplete = department && notifySemester && notifySection;
      const booking = await createBooking({
        classroom: selectedClassroom,
        date,
        startTime,
        endTime,
        purpose: purpose.trim(),
        forFaculty: isAdmin && forFaculty ? forFaculty : undefined,
        department: notifyGroupComplete ? department : undefined,
        semester: notifyGroupComplete ? Number(notifySemester) : undefined,
        section: notifyGroupComplete ? notifySection : undefined,
      });
      showAlert(
        isAdmin ? 'Room booked' : 'Request sent',
        isAdmin
          ? 'The classroom has been booked and marked approved.'
          : "Your request was sent to the admin for approval. You'll see its status under My Bookings."
      );
      setSelectedClassroom(null);
      setDate('');
      setStartTime('');
      setEndTime('');
      setPurpose('');
      setForFaculty(null);
      setDepartment(scopeDepartment || null);
      setNotifySemester(null);
      setNotifySection(null);
      setAiMessage('');
      setAiNote(null);
      setAiOpen(false);
      if (!isAdmin) {
        navigation.navigate('MyBookings');
      }
    } catch (err) {
      showAlert('Could not book classroom', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader
        title={isAdmin ? 'Admin Direct Booking' : 'Book Classroom'}
        onBack={() => navigation.goBack()}
        accentColor={accent}
      />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.card}>
            <Text style={styles.helper}>
              {isAdmin
                ? 'Bookings you create here are approved immediately — use it to reserve a room directly.'
                : 'Your request goes to the admin for approval. Conflicts with existing classes or approved bookings are blocked automatically. If you fill in "Notify students" below, they\'ll be notified once it\'s approved.'}
            </Text>

            <Pressable style={styles.mapLinkRow} onPress={() => navigation.navigate('ClassroomMap')}>
              <Ionicons name="map-outline" size={14} color={accent} />
              <Text style={[styles.mapLinkText, { color: accent }]}>Check which rooms are free right now</Text>
            </Pressable>

            {presetClassroomId && (
              <View style={styles.presetBanner}>
                <Ionicons name="checkmark-circle" size={16} color={accent} />
                <Text style={styles.presetBannerText}>
                  {presetClassroomName || 'This room'} was free when you tapped it on the map — pre-filled below for today. Change the date/time if you meant a different slot.
                </Text>
              </View>
            )}

            {isAdmin && (
              <View style={styles.aiBlock}>
                <Pressable style={styles.aiToggle} onPress={() => setAiOpen((v) => !v)}>
                  <Ionicons name="sparkles" size={16} color={accent} />
                  <Text style={[styles.aiToggleText, { color: accent }]}>
                    {aiOpen ? 'Hide AI assistant' : 'Let AI fill this in'}
                  </Text>
                  <Ionicons name={aiOpen ? 'chevron-up' : 'chevron-down'} size={16} color={accent} />
                </Pressable>

                {aiOpen && (
                  <View style={styles.aiPanel}>
                    <Text style={styles.aiHelper}>
                      Describe the booking in plain English — it'll fill in the fields below for you to review before submitting.
                    </Text>
                    <View style={styles.aiInputRow}>
                      <TextInput
                        style={[styles.input, styles.multiline, styles.aiInput, styles.aiInputFlex]}
                        placeholder="Book 201 for Prof. Sharma's DS class tomorrow at 2pm"
                        placeholderTextColor={colors.textSecondary}
                        value={aiMessage}
                        onChangeText={setAiMessage}
                        multiline
                      />
                      <Pressable
                        style={[
                          styles.aiMicButton,
                          { borderColor: accent },
                          aiListening && { backgroundColor: accent },
                        ]}
                        onPress={handleToggleAiVoice}
                      >
                        <Ionicons name={aiListening ? 'mic' : 'mic-outline'} size={20} color={aiListening ? colors.textOnDark : accent} />
                      </Pressable>
                    </View>
                    {aiListening && (
                      <View style={styles.aiListeningRow}>
                        <ActivityIndicator size="small" color={accent} />
                        <Text style={styles.aiListeningText}>Listening… speak the booking, then tap the mic again to stop.</Text>
                      </View>
                    )}
                    <Pressable
                      style={[styles.aiAskButton, { backgroundColor: accent }, aiParsing && styles.disabled]}
                      onPress={handleAskAi}
                      disabled={aiParsing}
                    >
                      {aiParsing ? (
                        <ActivityIndicator size="small" color={colors.textOnDark} />
                      ) : (
                        <>
                          <Ionicons name="send" size={14} color={colors.textOnDark} />
                          <Text style={styles.aiAskButtonText}>Fill in fields below</Text>
                        </>
                      )}
                    </Pressable>
                    {aiNote && (
                      <View style={styles.aiNoteBox}>
                        <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
                        <Text style={styles.aiNoteText}>{aiNote}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* --- Date + Time come first: nothing below is useful until these
                are set, since the classroom list depends entirely on them. --- */}
            <FieldLabel styles={styles}>Date</FieldLabel>
            <DatePicker value={date} onChange={setDate} accentColor={accent} />

            {/* On a phone the two time pickers do not fit side by side, so they wrap onto separate lines. */}
            <View style={styles.timeRow}>
              <View style={styles.timeItem}>
                <FieldLabel styles={styles}>Start</FieldLabel>
                <TimePicker value={startTime} onChange={setStartTime} accentColor={accent} />
              </View>
              <View style={styles.timeItem}>
                <FieldLabel styles={styles}>End</FieldLabel>
                <TimePicker value={endTime} onChange={setEndTime} accentColor={accent} />
              </View>
            </View>

            {outsideHours && (
              isAdmin ? (
                <View style={styles.afterHoursBanner}>
                  <Ionicons name="warning" size={16} color={colors.danger} />
                  <Text style={styles.afterHoursBannerText}>
                    After college hours ({formatTime12h(COLLEGE_START_TIME)}–{formatTime12h(COLLEGE_END_TIME)}) — this will be booked as an extra class.
                  </Text>
                </View>
              ) : (
                <View style={styles.afterHoursBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={styles.afterHoursBannerText}>
                    Outside college hours ({formatTime12h(COLLEGE_START_TIME)}–{formatTime12h(COLLEGE_END_TIME)}). Faculty can't book after-hours or extra classes — ask an admin to book this one directly.
                  </Text>
                </View>
              )
            )}

            {!dateTimeValid ? (
              <View style={[styles.gateHint, isPastSlot && styles.gateHintDanger]}>
                <Ionicons
                  name={isPastSlot ? 'time-outline' : 'arrow-up-circle-outline'}
                  size={16}
                  color={isPastSlot ? colors.danger : colors.textSecondary}
                />
                <Text style={[styles.gateHintText, isPastSlot && styles.gateHintTextDanger]}>
                  {isPastSlot
                    ? "That date and time have already passed — pick a date and time that are still ahead of now."
                    : 'Pick a date and a valid start/end time above to see which classrooms are free for that slot.'}
                </Text>
              </View>
            ) : (
              <>
                {/* --- Department comes right after date/time, admin only —
                    everything below (classroom, faculty) is filtered down to
                    whichever department is picked here. A department-scoped
                    admin never sees the picker; it's locked to their own. --- */}
                {isAdmin && (
                  <>
                    <FieldLabel styles={styles}>Department</FieldLabel>
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
                        placeholder="Department…"
                        accentColor={accent}
                      />
                    )}
                  </>
                )}

                {isAdmin && !department ? (
                  <View style={styles.gateHint}>
                    <Ionicons name="arrow-up-circle-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.gateHintText}>
                      Pick a department above to see its classrooms and faculty.
                    </Text>
                  </View>
                ) : (
                  <>
                    <FieldLabel styles={styles}>Classroom</FieldLabel>
                    {!loadingAvailable && (
                      <Text style={styles.freeCountHint}>
                        {`${classroomOptions.length} room${classroomOptions.length === 1 ? '' : 's'} free on ${new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long' })}, ${startTime}–${endTime}`}
                        {[0, 6].includes(new Date(`${date}T00:00:00`).getDay())
                          ? ' — no regular classes run on weekends, so only approved bookings can block a room.'
                          : ''}
                      </Text>
                    )}
                    {loadingAvailable ? (
                      <View style={styles.availLoadingRow}>
                        <ActivityIndicator size="small" color={accent} />
                        <Text style={styles.availLoadingText}>Checking which rooms are free for this slot…</Text>
                      </View>
                    ) : (
                      <SearchableSelect
                        options={classroomOptions.map((c) => ({ key: c._id, label: c.name }))}
                        value={selectedClassroom}
                        onSelect={setSelectedClassroom}
                        placeholder={
                          classroomOptions.length === 0
                            ? isAdmin && department
                              ? 'No rooms free in this department'
                              : 'No rooms free for this slot'
                            : 'Type to search classrooms…'
                        }
                        accentColor={accent}
                      />
                    )}
                    {!loadingAvailable && classroomOptions.length === 0 && (
                      <Text style={styles.noRoomsHint}>
                        {isAdmin && department
                          ? `No ${department} classrooms are free for this date and time — try a different slot or department.`
                          : 'Every classroom is already in use for this date and time — try a different slot.'}
                      </Text>
                    )}

                    <FieldLabel styles={styles}>Purpose</FieldLabel>
                    <TextInput
                      style={[styles.input, styles.multiline]}
                      placeholder="Guest lecture, extra class, club meeting…"
                      placeholderTextColor={colors.textSecondary}
                      value={purpose}
                      onChangeText={setPurpose}
                      multiline
                    />

                    {isAdmin && (
                      <>
                        <FieldLabel styles={styles}>For faculty (optional — they'll be notified)</FieldLabel>
                        <SearchableSelect
                          options={facultyOptions.map((f) => ({ key: f._id, label: `${f.name} — ${abbreviateDepartment(f.department)}` }))}
                          value={forFaculty}
                          onSelect={setForFaculty}
                          placeholder={facultyOptions.length === 0 ? 'No faculty in this department' : 'Type to search faculty…'}
                          accentColor={accent}
                        />
                      </>
                    )}

                    {isAdmin ? (
                      <>
                        {/* Department was already picked above — this group
                            just needs semester + section to actually notify
                            that group once the booking is approved. */}
                        <FieldLabel styles={styles}>Notify students (optional — semester + section needed to notify)</FieldLabel>
                        <View style={styles.twoCol}>
                          <View style={styles.twoColItem}>
                            <SearchableSelect
                              options={SEMESTERS.map((s) => ({ key: String(s), label: `Semester ${s}` }))}
                              value={notifySemester}
                              onSelect={setNotifySemester}
                              placeholder="Semester…"
                              accentColor={accent}
                            />
                          </View>
                          <View style={styles.twoColItem}>
                            <SearchableSelect
                              options={SECTIONS}
                              value={notifySection}
                              onSelect={setNotifySection}
                              placeholder="Section…"
                              accentColor={accent}
                            />
                          </View>
                        </View>
                      </>
                    ) : (
                      <>
                        <FieldLabel styles={styles}>Notify students (optional — all three needed to notify)</FieldLabel>
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
                            placeholder="Department…"
                            accentColor={accent}
                          />
                        )}
                        <View style={styles.twoCol}>
                          <View style={styles.twoColItem}>
                            <SearchableSelect
                              options={SEMESTERS.map((s) => ({ key: String(s), label: `Semester ${s}` }))}
                              value={notifySemester}
                              onSelect={setNotifySemester}
                              placeholder="Semester…"
                              accentColor={accent}
                            />
                          </View>
                          <View style={styles.twoColItem}>
                            <SearchableSelect
                              options={SECTIONS}
                              value={notifySection}
                              onSelect={setNotifySection}
                              placeholder="Section…"
                              accentColor={accent}
                            />
                          </View>
                        </View>
                      </>
                    )}

                    {checkingFacultyConflict && (
                      <View style={styles.conflictCheckingRow}>
                        <ActivityIndicator size="small" color={colors.textSecondary} />
                        <Text style={styles.conflictCheckingText}>Checking faculty's timetable…</Text>
                      </View>
                    )}

                    {facultyConflict && (
                      <View style={styles.facultyConflictBanner}>
                        <Ionicons name="warning" size={16} color={colors.danger} />
                        <Text style={styles.facultyConflictText}>
                          {facultyConflict.facultyName} already has {facultyConflict.subject || 'a class'}
                          {facultyConflict.classroomName ? ` in ${facultyConflict.classroomName}` : ''} at {facultyConflict.time}
                          {facultyConflict.semester ? ` (Sem ${facultyConflict.semester}${facultyConflict.section ? ` ${facultyConflict.section}` : ''})` : ''}
                          {' '}— {facultyConflict.source === 'timetable' ? 'a regular class' : 'another approved booking'} on {facultyConflict.day}s. You can still book this room, but {facultyConflict.facultyName} would be double-booked.
                        </Text>
                      </View>
                    )}

                    <Pressable style={[styles.submitButton, { backgroundColor: accent }, submitting && styles.disabled]} onPress={handleSubmit} disabled={submitting}>
                      <Text style={styles.submitButtonText}>
                        {submitting ? 'Submitting…' : isAdmin ? 'Book Room' : 'Send Request'}
                      </Text>
                    </Pressable>
                  </>
                )}
              </>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function FieldLabel({ children, styles }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const createStyles = (colors, shadow) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow,
  },
  helper: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
  mapLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  mapLinkText: { fontSize: 12, fontWeight: '700' },
  presetBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  presetBannerText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  aiBlock: { marginBottom: spacing.md },
  aiToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  aiToggleText: { fontWeight: '700', fontSize: 13 },
  aiPanel: {
    marginTop: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  aiHelper: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  aiInput: { backgroundColor: colors.surface, minHeight: 60 },
  aiInputRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  aiInputFlex: { flex: 1 },
  aiMicButton: {
    width: 44,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiListeningRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  aiListeningText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  aiAskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.sm,
    paddingVertical: 10,
    marginTop: spacing.sm,
  },
  aiAskButtonText: { color: colors.textOnDark, fontWeight: '700', fontSize: 13 },
  aiNoteBox: { flexDirection: 'row', gap: 6, marginTop: spacing.sm },
  aiNoteText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
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
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  twoCol: { flexDirection: 'row', gap: spacing.sm },
  twoColItem: { flex: 1 },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeItem: { flexGrow: 1, flexBasis: 230 },
  submitButton: {
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  submitButtonText: { color: colors.textOnDark, fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.6 },
  afterHoursBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.tint4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  afterHoursBannerText: { ...typography.caption, color: colors.danger, flex: 1, fontWeight: '600' },
  gateHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  gateHintText: { ...typography.caption, color: colors.textSecondary, flex: 1, fontStyle: 'italic' },
  gateHintDanger: { backgroundColor: colors.tint4, borderColor: colors.danger, borderStyle: 'solid' },
  gateHintTextDanger: { color: colors.danger, fontStyle: 'normal', fontWeight: '600' },
  availLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm },
  availLoadingText: { ...typography.caption, color: colors.textSecondary },
  noRoomsHint: { ...typography.caption, color: colors.danger, marginTop: 4 },
  freeCountHint: { ...typography.caption, color: colors.textSecondary, marginBottom: 6 },
  conflictCheckingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md },
  conflictCheckingText: { ...typography.caption, color: colors.textSecondary },
  facultyConflictBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.tint4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  facultyConflictText: { ...typography.caption, color: colors.danger, flex: 1, fontWeight: '600' },
});