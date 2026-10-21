import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import ChipSelector from '../components/ChipSelector';
import SearchableSelect from '../components/SearchableSelect';
import DatePicker from '../components/DatePicker';
import {
  fetchAllocatorOptions,
  previewRoomAllocation,
  validateRoomChange,
  saveRoomAllocationDraft,
  fetchRoomAllocationDrafts,
  fetchRoomAllocationDraft,
  deleteRoomAllocationDraft,
  publishRoomAllocation,
} from '../api/endpoints';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { showAlert, showConfirm } from '../utils/alert';

const SCOPES = [
  { key: 'weekly', label: 'Full Weekly Timetable' },
  { key: 'day', label: 'Single Day' },
  { key: 'range', label: 'Custom Date Range' },
];
const ROOM_KINDS = [
  { key: 'both', label: 'Classrooms + Labs' },
  { key: 'lecture', label: 'Classrooms only' },
  { key: 'lab', label: 'Labs only' },
];
const EXISTING = [
  { key: 'preserve', label: 'Preserve valid allocations' },
  { key: 'recalculate', label: 'Recalculate selected' },
];
const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'preserved', label: 'Kept' },
  { key: 'changed', label: 'Changed' },
  { key: 'unallocated', label: 'Unallocated' },
  { key: 'conflict', label: 'Conflicts' },
];
const PAGE = 100;

const statusOf = (it) => (it.conflict ? 'conflict' : it.proposedRoom ? (it.proposedRoom === it.currentRoom ? 'preserved' : 'changed') : 'unallocated');
const statusLabel = { preserved: 'Kept', changed: 'Changed', unallocated: 'Unallocated', conflict: 'Conflict' };

// Dropdown (same look as Department) that adds to a list; picked items show as removable
// tags below it. An empty list means "all".
function MultiPick({ options, selected, onToggle, onAll, styles, accent, allLabel, placeholder }) {
  const remaining = options.filter((o) => !selected.includes(o.key));
  const labelOf = (k) => (options.find((o) => o.key === k) || { label: String(k) }).label;
  return (
    <View>
      <SearchableSelect
        options={[{ key: '__all__', label: allLabel }, ...remaining.map((o) => ({ key: String(o.key), label: o.label }))]}
        value={null}
        onSelect={(k) => {
          if (k === '__all__') onAll();
          else onToggle(options.find((o) => String(o.key) === k).key);
        }}
        placeholder={selected.length === 0 ? `${allLabel} — tap to choose specific ones` : placeholder}
        accentColor={accent}
      />
      <View style={[styles.chipWrap, { marginTop: spacing.sm }]}>
        <Pressable
          onPress={onAll}
          accessibilityRole="button"
          accessibilityLabel={allLabel}
          style={[styles.tag, { borderColor: accent }, selected.length === 0 && { backgroundColor: accent }]}
        >
          <Text style={[styles.tagText, { color: selected.length === 0 ? '#fff' : accent }]}>
            {selected.length === 0 ? '✓ ' : ''}{allLabel}
          </Text>
        </Pressable>
        {selected.map((k) => (
          <Pressable
            key={String(k)}
            onPress={() => onToggle(k)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${labelOf(k)}`}
            style={[styles.tag, { borderColor: accent, backgroundColor: accent }]}
          >
            <Text style={[styles.tagText, { color: '#fff' }]}>{labelOf(k)}  ✕</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ToggleRow({ label, hint, value, onChange, styles, accent }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: spacing.sm }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.helperSmall}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: accent }} accessibilityLabel={label} />
    </View>
  );
}

export default function AdminAutoAllocatorScreen({ navigation }) {
  const { colors, shadow } = useTheme();
  // On a phone-sized screen the 11-column table is too cramped, so each class is shown as a card.
  const { width: screenWidth } = useWindowDimensions();
  const isNarrow = screenWidth < 700;
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  const accent = colors.admin;
  const warn = colors.warning || '#B7791F';
  const { user } = useAuth();
  const scopeDepartment = user?.department || null;

  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState({ departments: [], days: [], rooms: [], limits: {} });

  // ---- selection ----
  const [department, setDepartment] = useState(scopeDepartment || '');
  const [semesters, setSemesters] = useState([]);
  const [sections, setSections] = useState([]);
  const [scope, setScope] = useState('weekly');
  const [day, setDay] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [roomKind, setRoomKind] = useState('both');
  const [minCapacity, setMinCapacity] = useState('');
  const [existing, setExisting] = useState('preserve');
  const [keepSameRoom, setKeepSameRoom] = useState(true);
  const [capacityMatch, setCapacityMatch] = useState(true);
  const [balanceUtilization, setBalanceUtilization] = useState(false);

  // ---- results ----
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null); // { items, summary, meta }
  const [showMore, setShowMore] = useState(false);
  const [filters, setFilters] = useState({ status: 'all', department: 'all', section: 'all', day: 'all', room: 'all' });
  const [visible, setVisible] = useState(PAGE);
  const [editingKey, setEditingKey] = useState(null);
  const [showBusyKey, setShowBusyKey] = useState(null);
  const scrollRef = useRef(null);
  const resultsY = useRef(0);
  const publishY = useRef(0);
  const scrollToY = (y) => setTimeout(() => { try { scrollRef.current && scrollRef.current.scrollTo({ y: Math.max(0, y - 12), animated: true }); } catch (e) { /* ignore */ } }, 150);
  const [changeBusy, setChangeBusy] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftId, setDraftId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [banner, setBanner] = useState(null); // { kind: 'success'|'error', text }

  // ---- drafts ----
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchAllocatorOptions();
        setOptions(data);
        if (data.scopedDepartment) setDepartment(data.scopedDepartment);
      } catch (err) {
        showAlert('Could not load allocator options', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---------------- derived selection data ----------------
  const deptNames = useMemo(
    () => (department === 'ALL' ? options.departments.map((d) => d.name) : department ? [department] : []),
    [department, options.departments]
  );
  const semesterOptions = useMemo(() => {
    const set = new Set();
    options.departments.filter((d) => deptNames.includes(d.name)).forEach((d) => d.semesters.forEach((s) => set.add(s.semester)));
    return [...set].sort((a, b) => a - b).map((s) => ({ key: s, label: `Sem ${s}` }));
  }, [options.departments, deptNames]);
  const sectionStats = useMemo(() => {
    const map = new Map();
    options.departments.filter((d) => deptNames.includes(d.name)).forEach((d) => {
      d.semesters
        .filter((s) => semesters.length === 0 || semesters.includes(s.semester))
        .forEach((s) => s.sections.forEach((sec) => {
          const cur = map.get(sec.section) || { sessions: 0, students: 0 };
          map.set(sec.section, { sessions: cur.sessions + sec.sessions, students: cur.students + sec.students });
        }));
    });
    return map;
  }, [options.departments, deptNames, semesters]);
  const sectionOptions = useMemo(
    () => [...sectionStats.keys()].sort().map((s) => ({ key: s, label: `Sec ${s}` })),
    [sectionStats]
  );
  const estimatedSessions = useMemo(() => {
    let total = 0;
    sectionStats.forEach((v, k) => { if (sections.length === 0 || sections.includes(k)) total += v.sessions; });
    return total;
  }, [sectionStats, sections]);

  const departmentOptions = useMemo(
    () => [{ key: 'ALL', label: 'All departments' }, ...options.departments.map((d) => ({ key: d.name, label: d.name }))],
    [options.departments]
  );

  const toggle = (arr, setArr) => (k) => setArr(arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
  const handleDepartment = (val) => {
    setDepartment(val);
    setSemesters([]);
    setSections([]);
  };

  const dateProblem = useMemo(() => {
    if (scope !== 'range') return null;
    if (!startDate || !endDate) return 'Pick a start and end date.';
    if (endDate < startDate) return 'End date cannot be before the start date.';
    return null;
  }, [scope, startDate, endDate]);
  const dayProblem = scope === 'day' && !day ? 'Pick a day.' : null;
  const canRun = !!department && !dateProblem && !dayProblem && !running;

  const buildConfig = () => ({
    department,
    semesters,
    sections,
    scope,
    day: scope === 'day' ? day : undefined,
    startDate: scope === 'range' ? startDate : undefined,
    endDate: scope === 'range' ? endDate : undefined,
    roomKind,
    minCapacity: Number(minCapacity) || 0,
    existing,
    keepSameRoom,
    capacityMatch,
    balanceUtilization,
  });

  const scopeSummary = useMemo(() => {
    const dept = department === 'ALL' ? 'All departments' : department || 'No department';
    const sem = semesters.length ? `Sem ${[...semesters].sort((a, b) => a - b).join(', ')}` : 'all semesters';
    const sec = sections.length ? `Sections ${[...sections].sort().join(', ')}` : 'all sections';
    let when = 'the full recurring weekly timetable';
    if (scope === 'day') when = day ? `every ${day}` : 'a single day (pick one)';
    if (scope === 'range') when = startDate && endDate ? `${startDate} to ${endDate}` : 'a date range (pick dates)';
    return `${dept} · ${sem} · ${sec} · ${when} · ~${estimatedSessions} weekly sessions in the timetable`;
  }, [department, semesters, sections, scope, day, startDate, endDate, estimatedSessions]);

  // ---------------- run / re-run ----------------
  const assignmentsOf = (items) => {
    const o = {};
    items.forEach((i) => { o[i.key] = i.proposedRoom || null; });
    return o;
  };

  const doRun = async (fixedItems) => {
    setRunning(true);
    setBanner(null);
    setEditingKey(null);
    try {
      const payload = { config: buildConfig() };
      if (fixedItems) {
        const fixed = {};
        fixedItems.filter((i) => i.proposedRoom && !i.conflict).forEach((i) => { fixed[i.key] = i.proposedRoom; });
        payload.fixed = fixed;
      }
      const data = await previewRoomAllocation(payload);
      setResult(data);
      setVisible(PAGE);
      setFilters({ status: data.summary && data.summary.changed > 0 ? 'changed' : 'all', department: 'all', section: 'all', day: 'all', room: 'all' });
      if (!fixedItems) setDraftId(null);
      scrollToY(resultsY.current);
    } catch (err) {
      showAlert('Allocation failed', err.message);
    } finally {
      setRunning(false);
    }
  };

  const handleRun = () => {
    if (!canRun) return;
    if (existing === 'recalculate') {
      showConfirm(
        'Recalculate existing allocations',
        'Existing room assignments in this selection will be re-evaluated and some may be proposed for change. Nothing is saved until you review the preview and press Confirm & Publish. Continue?',
        () => doRun(null)
      );
      return;
    }
    doRun(null);
  };

  const handleRerunUnallocated = () => {
    if (!result) return;
    doRun(result.items);
  };

  // ---------------- manual change ----------------
  const handlePickRoom = async (item, room) => {
    if (room._id === item.proposedRoom) {
      setEditingKey(null);
      return;
    }
    setChangeBusy(true);
    try {
      const data = await validateRoomChange({
        config: result.meta.config,
        assignments: assignmentsOf(result.items),
        key: item.key,
        roomId: room._id,
      });
      if (!data.ok) {
        showAlert('Cannot use that room', data.reason);
      } else {
        setResult({ ...result, items: data.items, summary: data.summary });
        setEditingKey(null);
      }
    } catch (err) {
      showAlert('Could not check that room', err.message);
    } finally {
      setChangeBusy(false);
    }
  };

  // ---------------- save / publish / export ----------------
  const handleSaveDraft = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const d = await saveRoomAllocationDraft({
        name: draftName.trim(),
        config: result.meta.config,
        assignments: assignmentsOf(result.items),
      });
      setDraftId(d._id);
      setBanner({ kind: 'success', text: `Draft "${d.name}" saved. Nothing has been published yet.` });
      if (draftsOpen) loadDrafts();
    } catch (err) {
      showAlert('Could not save draft', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = () => {
    if (!result) return;
    const s = result.summary;
    if (s.conflicts > 0) {
      showAlert('Fix conflicts first', `${s.conflicts} session(s) have a conflict. Change their rooms or re-run the allocation.`);
      return;
    }
    const isRange = result.meta.scope === 'range';
    const msg = [
      `${s.changed} session(s) will get a new room${isRange ? ' on the selected dates only' : ''}.`,
      `${s.preserved} session(s) keep their current room.`,
      s.unallocated > 0 ? `${s.unallocated} unallocated session(s) will be left exactly as they are.` : null,
      isRange ? 'The recurring weekly timetable is not modified.' : 'Faculty and students of the changed classes will be notified.',
      'Continue?',
    ].filter(Boolean).join('\n');
    showConfirm('Confirm and publish', msg, async () => {
      setPublishing(true);
      try {
        const data = await publishRoomAllocation({
          config: result.meta.config,
          assignments: assignmentsOf(result.items),
          draftId,
          confirmChanges: true,
        });
        setBanner({
          kind: 'success',
          text: `${data.message} ${data.changed} room change(s) saved, ${data.skippedUnallocated} session(s) left unallocated.`,
        });
        setResult(null);
        setDraftId(null);
        if (draftsOpen) loadDrafts();
      } catch (err) {
        showAlert('Could not publish', err.message);
      } finally {
        setPublishing(false);
      }
    });
  };

  const handleExport = () => {
    if (!result) return;
    if (Platform.OS !== 'web') {
      showAlert('Export', 'Exporting results is available in the web version of CampusEase.');
      return;
    }
    const head = ['Date', 'Day', 'Start', 'End', 'Department', 'Semester', 'Section', 'Subject', 'Faculty', 'Current room', 'Assigned room', 'Capacity', 'Students', 'Status', 'Note'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = result.items.map((i) => [
      i.date || '', i.day, i.startTime, i.endTime, i.department, i.semester, i.section, i.subject, i.facultyName,
      i.currentRoomName, i.proposedRoomName || '', i.proposedCapacity || '', i.strength || '', statusLabel[statusOf(i)], i.reason || '',
    ]);
    const csv = [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'room-allocation.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // ---------------- drafts ----------------
  const loadDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      setDrafts(await fetchRoomAllocationDrafts());
    } catch (err) {
      showAlert('Could not load drafts', err.message);
    } finally {
      setDraftsLoading(false);
    }
  }, []);
  const toggleDrafts = () => {
    const next = !draftsOpen;
    setDraftsOpen(next);
    if (next) loadDrafts();
  };
  const openDraft = async (d) => {
    setRunning(true);
    try {
      const data = await fetchRoomAllocationDraft(d._id);
      setResult(data);
      setDraftId(d._id);
      setBanner(null);
      setVisible(PAGE);
      const c = data.meta.config;
      setDepartment(c.department);
      setSemesters(c.semesters || []);
      setSections(c.sections || []);
      setScope(c.scope);
      setDay(c.day || '');
      setStartDate(c.startDate || '');
      setEndDate(c.endDate || '');
      setRoomKind(c.roomKind);
      setMinCapacity(c.minCapacity ? String(c.minCapacity) : '');
      setExisting(c.existing);
      setKeepSameRoom(c.keepSameRoom);
      setCapacityMatch(c.capacityMatch);
      setBalanceUtilization(c.balanceUtilization);
    } catch (err) {
      showAlert('Could not open draft', err.message);
    } finally {
      setRunning(false);
    }
  };
  const removeDraft = (d) => {
    showConfirm('Delete draft', `Delete "${d.name}"? This cannot be undone.`, async () => {
      try {
        await deleteRoomAllocationDraft(d._id);
        setDrafts((prev) => prev.filter((x) => x._id !== d._id));
        if (draftId === d._id) setDraftId(null);
      } catch (err) {
        showAlert('Could not delete', err.message);
      }
    });
  };

  // ---------------- filtering ----------------
  const items = result ? result.items : [];
  const filterOptions = useMemo(() => {
    const uniq = (f) => [...new Set(items.map(f))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    const mk = (arr, fmt = (x) => x) => [{ key: 'all', label: 'All' }, ...arr.map((x) => ({ key: String(x), label: fmt(x) }))];
    return {
      department: mk(uniq((i) => i.department)),
      section: mk(uniq((i) => i.section), (x) => `Sec ${x}`),
      day: mk(uniq((i) => i.day)),
      room: [{ key: 'all', label: 'All rooms' }, ...uniq((i) => i.proposedRoomName || '').filter(Boolean).map((r) => ({ key: r, label: r }))],
    };
  }, [items]);
  const filtered = useMemo(
    () =>
      items.filter((i) => {
        const st = statusOf(i);
        if (filters.status !== 'all' && st !== filters.status) return false;
        if (filters.department !== 'all' && i.department !== filters.department) return false;
        if (filters.section !== 'all' && i.section !== filters.section) return false;
        if (filters.day !== 'all' && i.day !== filters.day) return false;
        if (filters.room !== 'all' && i.proposedRoomName !== filters.room) return false;
        return true;
      }),
    [items, filters]
  );
  const setFilter = (k) => (v) => { setFilters((f) => ({ ...f, [k]: v })); setVisible(PAGE); };

  const statusColor = (st) => (st === 'preserved' ? colors.success : st === 'changed' ? warn : colors.danger);

  if (loading) {
    return (
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScreenHeader title="Auto Allocator" onBack={() => navigation.goBack()} accentColor={accent} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      </SafeAreaView>
    );
  }

  const noData = options.departments.length === 0;

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader title="Auto Allocator" onBack={() => navigation.goBack()} accentColor={accent} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {banner && (
          <View style={[styles.banner, { borderColor: banner.kind === 'success' ? colors.success : colors.danger }]}>
            <Ionicons name={banner.kind === 'success' ? 'checkmark-circle' : 'alert-circle'} size={18} color={banner.kind === 'success' ? colors.success : colors.danger} />
            <Text style={styles.bannerText}>{banner.text}</Text>
          </View>
        )}

        {/* ---------- Selection ---------- */}
        <View style={styles.section}>
          <Text style={[styles.stepTag, { color: accent }]}>STEP 1 OF 3</Text>
          <Text style={styles.sectionTitle}>Choose what to allocate</Text>
          <Text style={styles.helper}>
            Assigns rooms to your existing timetable. It never changes subjects, timings or the number of classes —
            only which room each class uses. Nothing is saved until you review the preview and publish.
          </Text>

          {noData ? (
            <Text style={styles.emptyText}>No timetable entries found yet. Create or import a timetable first.</Text>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Department</Text>
              {scopeDepartment ? (
                <View style={styles.lockedField}>
                  <Ionicons name="lock-closed" size={13} color={colors.textSecondary} />
                  <Text style={styles.lockedFieldText}>{scopeDepartment}</Text>
                </View>
              ) : (
                <SearchableSelect
                  options={departmentOptions}
                  value={department}
                  onSelect={handleDepartment}
                  placeholder="Pick a department or All departments…"
                  accentColor={accent}
                />
              )}

              <Text style={styles.fieldLabel}>Semester</Text>
              {!department ? (
                <Text style={styles.hint}>Pick a department first</Text>
              ) : (
                <MultiPick
                  options={semesterOptions}
                  selected={semesters}
                  onToggle={toggle(semesters, setSemesters)}
                  onAll={() => { setSemesters([]); setSections([]); }}
                  styles={styles}
                  accent={accent}
                  allLabel="All semesters"
                  placeholder="Add another semester…"
                />
              )}

              <Text style={styles.fieldLabel}>Sections</Text>
              {!department ? (
                <Text style={styles.hint}>Pick a department first</Text>
              ) : (
                <MultiPick
                  options={sectionOptions}
                  selected={sections}
                  onToggle={toggle(sections, setSections)}
                  onAll={() => setSections([])}
                  styles={styles}
                  accent={accent}
                  allLabel="All sections"
                  placeholder="Add another section…"
                />
              )}

              <Text style={styles.fieldLabel}>Allocation scope</Text>
              <SearchableSelect options={SCOPES} value={scope} onSelect={setScope} placeholder="Pick allocation scope…" accentColor={accent} />
              {scope === 'weekly' && (
                <Text style={styles.helperSmall}>Uses the complete recurring week (all days) — not just the next seven days.</Text>
              )}
              {scope === 'day' && (
                <>
                  <SearchableSelect
                    options={(options.days.length ? options.days : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']).map((d) => ({ key: d, label: d }))}
                    value={day}
                    onSelect={setDay}
                    placeholder="Pick a day…"
                    accentColor={accent}
                  />
                  {dayProblem && <Text style={styles.errorText}>{dayProblem}</Text>}
                </>
              )}
              {scope === 'range' && (
                <>
                  <View style={styles.twoCol}>
                    <View style={styles.twoColItem}>
                      <Text style={styles.fieldLabel}>Start date</Text>
                      <DatePicker value={startDate} onChange={setStartDate} accentColor={accent} />
                    </View>
                    <View style={styles.twoColItem}>
                      <Text style={styles.fieldLabel}>End date</Text>
                      <DatePicker value={endDate} onChange={setEndDate} accentColor={accent} />
                    </View>
                  </View>
                  {dateProblem && <Text style={styles.errorText}>{dateProblem}</Text>}
                  <Text style={styles.helperSmall}>
                    Weekly classes are expanded into the actual dates (Mon–Fri) in this range and checked against approved
                    bookings on those dates. This app has no holiday calendar, so mark non-teaching days by leaving them out of the range.
                    Results are saved as date-specific rooms; the weekly timetable is not modified.
                  </Text>
                </>
              )}

              <Text style={styles.fieldLabel}>Room type</Text>
              <SearchableSelect options={ROOM_KINDS} value={roomKind} onSelect={setRoomKind} placeholder="Pick room type…" accentColor={accent} />

              <Pressable
                onPress={() => setShowMore((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Toggle more options"
                style={[styles.moreBtn, { borderColor: accent }]}
              >
                <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={16} color={accent} />
                <Text style={[styles.moreBtnText, { color: accent }]}>{showMore ? 'Hide more options' : 'More options (capacity, preferences)'}</Text>
              </Pressable>
              {showMore && (
              <View>
              <Text style={styles.fieldLabel}>Minimum room capacity (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Auto — uses each section's student strength"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={minCapacity}
                onChangeText={(t) => setMinCapacity(t.replace(/[^0-9]/g, ''))}
                accessibilityLabel="Minimum room capacity"
              />

              <Text style={styles.fieldLabel}>Existing allocations</Text>
              <SearchableSelect options={EXISTING} value={existing} onSelect={setExisting} placeholder="Existing allocations…" accentColor={accent} />

              <ToggleRow label="Keep a section in the same room" hint="Preference — never overrides availability, capacity or room type." value={keepSameRoom} onChange={setKeepSameRoom} styles={styles} accent={accent} />
              <ToggleRow label="Match room size to class size" hint="Prefers the smallest room that fits." value={capacityMatch} onChange={setCapacityMatch} styles={styles} accent={accent} />
              <ToggleRow label="Balance room utilization" hint="Spreads classes across rooms." value={balanceUtilization} onChange={setBalanceUtilization} styles={styles} accent={accent} />
              </View>
              )}

              <View style={styles.scopeBox}>
                <Text style={styles.scopeBoxTitle}>You are about to allocate</Text>
                <Text style={styles.scopeBoxText}>{scopeSummary}</Text>
              </View>

              <Pressable
                style={[styles.runButton, { backgroundColor: accent }, !canRun && styles.disabled]}
                onPress={handleRun}
                disabled={!canRun}
                accessibilityRole="button"
                accessibilityLabel="Run allocation"
              >
                {running ? <ActivityIndicator color={colors.textOnDark} /> : <Ionicons name="flash" size={18} color={colors.textOnDark} />}
                <Text style={styles.runButtonText}>{running ? 'Allocating rooms…' : 'Run Allocation'}</Text>
              </Pressable>
              {running && <Text style={styles.helperSmall}>Checking the timetable, bookings and every room — this can take a few seconds.</Text>}
            </>
          )}
        </View>

        {/* ---------- Results ---------- */}
        {result && (
          <View style={styles.section} onLayout={(e) => { resultsY.current = e.nativeEvent.layout.y; }}>
            <Text style={[styles.stepTag, { color: accent }]}>STEP 2 OF 3</Text>
            <Text style={styles.sectionTitle}>Review the preview</Text>
            <View style={[styles.plainBox, { borderColor: (result.summary.unallocated || result.summary.conflicts || result.summary.manualIntervention) ? colors.danger : colors.success }]}>
              <Text style={styles.plainText}>
                {result.summary.changed === 0 && !(result.summary.unallocated || result.summary.conflicts || result.summary.manualIntervention)
                  ? `All ${result.summary.totalSessions} classes already have a good room. Nothing needs to change.`
                  : `${result.summary.changed} class(es) will move to a different room.`}
                {(result.summary.unallocated || result.summary.conflicts || result.summary.manualIntervention)
                  ? ` ${result.summary.unallocated + result.summary.conflicts + result.summary.manualIntervention} class(es) still need your attention.`
                  : ''}
              </Text>
              <View style={styles.chipWrap}>
                <Pressable onPress={() => setFilter('status')('changed')} style={[styles.smallBtn, { borderColor: accent }]} accessibilityRole="button">
                  <Text style={[styles.smallBtnText, { color: accent }]}>Show changed</Text>
                </Pressable>
                {(result.summary.unallocated > 0 || result.summary.conflicts > 0) && (
                  <Pressable onPress={() => setFilter('status')(result.summary.conflicts > 0 ? 'conflict' : 'unallocated')} style={[styles.smallBtn, { borderColor: colors.danger }]} accessibilityRole="button">
                    <Text style={[styles.smallBtnText, { color: colors.danger }]}>Show problems</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setFilter('status')('all')} style={[styles.smallBtn, { borderColor: colors.border }]} accessibilityRole="button">
                  <Text style={[styles.smallBtnText, { color: colors.textSecondary }]}>Show all</Text>
                </Pressable>
                {result.summary.changed > 0 && (
                  <Pressable onPress={() => scrollToY(resultsY.current + publishY.current)} style={[styles.smallBtn, { borderColor: accent, backgroundColor: accent }]} accessibilityRole="button">
                    <Text style={[styles.smallBtnText, { color: '#fff' }]}>Go to Publish ↓</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => { setResult(null); setEditingKey(null); setBanner(null); scrollToY(0); }} style={[styles.smallBtn, { borderColor: colors.border }]} accessibilityRole="button">
                  <Text style={[styles.smallBtnText, { color: colors.textSecondary }]}>Start over</Text>
                </Pressable>
              </View>
              <Text style={styles.helperSmall}>Tip: press “Change” on any row to pick a different room. Green rooms are free.</Text>
            </View>
            <Text style={styles.helper}>
              {result.meta.scope === 'range'
                ? `${result.meta.startDate} → ${result.meta.endDate}`
                : result.meta.scope === 'day'
                ? `Every ${result.meta.day}`
                : 'Full weekly timetable'}
              {' · approved bookings checked through '}{result.meta.bookingsCheckedThrough}
              {'. This is a preview — nothing has been saved.'}
            </Text>

            <View style={styles.cards}>
              <SummaryCard styles={styles} label="Eligible sessions" value={result.summary.totalSessions} color={colors.textPrimary} />
              <SummaryCard styles={styles} label="Allocated" value={result.summary.allocated} color={colors.success} />
              <SummaryCard styles={styles} label="Existing kept" value={result.summary.preserved} color={colors.success} />
              <SummaryCard styles={styles} label="Need manual action" value={result.summary.manualIntervention} color={result.summary.manualIntervention ? colors.danger : colors.textPrimary} />
              <SummaryCard styles={styles} label="Unallocated" value={result.summary.unallocated} color={result.summary.unallocated ? colors.danger : colors.textPrimary} />
              <SummaryCard styles={styles} label="Conflicts" value={result.summary.conflicts} sub={result.summary.existingIssues ? `${result.summary.existingIssues} existing clash(es) found` : null} color={result.summary.conflicts ? colors.danger : colors.textPrimary} />
            </View>
            <Text style={styles.helperSmall}>
              {result.summary.changed} session(s) will change room.
            </Text>

            <Text style={styles.fieldLabel}>Filter</Text>
            <ChipSelector options={STATUS_FILTERS} selectedKey={filters.status} onSelect={setFilter('status')} accentColor={accent} />
            {filterOptions.department.length > 2 && (
              <ChipSelector options={filterOptions.department} selectedKey={filters.department} onSelect={setFilter('department')} accentColor={accent} />
            )}
            <ChipSelector options={filterOptions.section} selectedKey={filters.section} onSelect={setFilter('section')} accentColor={accent} />
            <ChipSelector options={filterOptions.day} selectedKey={filters.day} onSelect={setFilter('day')} accentColor={accent} />
            <View style={{ marginTop: spacing.xs }}>
              <SearchableSelect
                options={filterOptions.room}
                value={filters.room}
                onSelect={setFilter('room')}
                placeholder="Filter by room…"
                accentColor={accent}
              />
            </View>

            <Text style={styles.helperSmall}>Showing {Math.min(visible, filtered.length)} of {filtered.length} session(s)</Text>

            {filtered.length === 0 ? (
              <Text style={styles.emptyText}>No sessions match these filters.</Text>
            ) : (
              <View style={{ width: '100%' }}>
                <View>
                  {!isNarrow && (
                    <View style={[styles.tr, styles.thRow]}>
                      {COLS.map((c) => (
                        <Text key={c.key} style={[styles.th, { flex: c.w, minWidth: 0 }]}>{c.label}</Text>
                      ))}
                    </View>
                  )}
                  {filtered.slice(0, visible).map((it) => {
                    const st = statusOf(it);
                    const candidates = editingKey === it.key
                      ? options.rooms.filter((r) => r.department === it.department && (r.type === 'lab') === (it.requiredType === 'lab'))
                      : [];
                    return (
                      <View key={it.key}>
                        {isNarrow ? (
                          <View style={[styles.mCard, st === 'unallocated' || st === 'conflict' ? styles.rowBad : st === 'changed' ? styles.rowChanged : null]}>
                            <View style={styles.mTop}>
                              <Text style={[styles.mSubject, { flex: 1 }]}>{it.subject}</Text>
                              <View style={[styles.pill, { borderColor: statusColor(st) }]}>
                                <Text style={[styles.pillText, { color: statusColor(st) }]}>{statusLabel[st]}</Text>
                              </View>
                            </View>
                            <Text style={styles.mLine}>
                              {it.date ? `${it.date} (${it.day.slice(0, 3)})` : it.day} · {it.startTime}–{it.endTime} · Sem {it.semester} {it.section}
                            </Text>
                            <Text style={styles.tdSmall}>{it.department}</Text>
                            <Text style={styles.mLine}>
                              Room:{' '}
                              <Text style={[styles.tdBold, { color: it.proposedRoom ? colors.textPrimary : colors.danger }]}>{it.proposedRoomName || '— none —'}</Text>
                              {st === 'changed' ? <Text style={styles.tdSmall}>{`  (was ${it.currentRoomName})`}</Text> : null}
                              {`   ·   Seats ${it.proposedCapacity || '—'}${it.strength ? ` / ${it.strength} students` : ''}`}
                            </Text>
                            {it.reason ? <Text style={styles.tdSmall}>{it.reason}</Text> : null}
                            <View style={styles.mActions}>
                              <Pressable
                                onPress={() => setEditingKey(editingKey === it.key ? null : it.key)}
                                accessibilityRole="button"
                                accessibilityLabel={`Change classroom for ${it.subject} Section ${it.section}`}
                                style={[styles.smallBtn, { borderColor: accent }]}
                              >
                                <Text style={[styles.smallBtnText, { color: accent }]}>{editingKey === it.key ? 'Close' : 'Change'}</Text>
                              </Pressable>
                              {st === 'changed' && it.currentRoom ? (
                                <Pressable onPress={() => handlePickRoom(it, { _id: it.currentRoom, name: it.currentRoomName })} disabled={changeBusy} accessibilityRole="button" accessibilityLabel="Undo this change">
                                  <Text style={[styles.tdSmall, { color: accent, textDecorationLine: 'underline' }]}>Undo</Text>
                                </Pressable>
                              ) : null}
                            </View>
                          </View>
                        ) : (
                        <View style={[styles.tr, st === 'unallocated' || st === 'conflict' ? styles.rowBad : st === 'changed' ? styles.rowChanged : null]}>
                          <Text style={[styles.td, { flex: COLS[0].w, minWidth: 0 }]}>{it.date ? `${it.date} (${it.day.slice(0, 3)})` : it.day}</Text>
                          <Text style={[styles.td, { flex: COLS[1].w, minWidth: 0 }]}>{it.startTime}–{it.endTime}</Text>
                          <Text style={[styles.td, { flex: COLS[2].w, minWidth: 0 }]} numberOfLines={2}>{it.department}</Text>
                          <Text style={[styles.td, { flex: COLS[3].w, minWidth: 0 }]}>{it.semester}</Text>
                          <Text style={[styles.td, { flex: COLS[4].w, minWidth: 0 }]}>{it.section}</Text>
                          <Text style={[styles.td, styles.tdBold, { flex: COLS[5].w, minWidth: 0 }]} numberOfLines={2}>{it.subject}</Text>
                          <View style={{ flex: COLS[6].w, minWidth: 0, paddingHorizontal: 6 }}>
                            <Text style={[styles.tdBold, { color: it.proposedRoom ? colors.textPrimary : colors.danger }]}>{it.proposedRoomName || '— none —'}</Text>
                            {st === 'changed' && <Text style={styles.tdSmall}>was {it.currentRoomName}</Text>}
                          </View>
                          <Text style={[styles.td, { flex: COLS[7].w, minWidth: 0 }]}>{it.proposedCapacity || '—'}{it.strength ? ` / ${it.strength}` : ''}</Text>
                          <View style={{ flex: COLS[8].w, minWidth: 0, paddingHorizontal: 6 }}>
                            <View style={[styles.pill, { borderColor: statusColor(st) }]}>
                              <Text style={[styles.pillText, { color: statusColor(st) }]}>{statusLabel[st]}</Text>
                            </View>
                            {st === 'changed' && it.currentRoom ? (
                              <Pressable onPress={() => handlePickRoom(it, { _id: it.currentRoom, name: it.currentRoomName })} disabled={changeBusy} accessibilityRole="button" accessibilityLabel="Undo this change">
                                <Text style={[styles.tdSmall, { color: accent, textDecorationLine: 'underline', marginTop: 3 }]}>Undo</Text>
                              </Pressable>
                            ) : null}
                          </View>
                          <View style={{ flex: COLS[9].w, minWidth: 0, paddingHorizontal: 6 }}>
                            <Pressable
                              onPress={() => setEditingKey(editingKey === it.key ? null : it.key)}
                              accessibilityRole="button"
                              accessibilityLabel={`Change classroom for ${it.subject} Section ${it.section}`}
                              style={[styles.smallBtn, { borderColor: accent }]}
                            >
                              <Text style={[styles.smallBtnText, { color: accent }]}>{editingKey === it.key ? 'Close' : 'Change'}</Text>
                            </Pressable>
                          </View>
                          <Text style={[styles.td, styles.tdSmall, { flex: COLS[10].w, minWidth: 0 }]} numberOfLines={6}>{it.reason || ''}</Text>
                        </View>
                        )}
                        {editingKey === it.key && (
                          <View style={styles.pickerPanel}>
                            <Text style={styles.pickerTitle}>Choose a room for {it.subject} (Sem {it.semester} {it.section}) · {it.day} {it.startTime}–{it.endTime}</Text>
                            {candidates.length === 0 ? (
                              <Text style={styles.helperSmall}>No rooms of the required type exist in {it.department}.</Text>
                            ) : (
                              <>
                                {it.freeRooms && it.freeRooms.filter((id) => id !== it.proposedRoom).length === 0 && (
                                  <Text style={[styles.errorText, { marginBottom: spacing.sm }]}>
                                    Every suitable room in {it.department} is in use at this time — there is no free room to switch to. Try a session at a quieter time slot.
                                  </Text>
                                )}
                                <View style={styles.chipWrap}>
                                  {[...candidates]
                                    .filter((r) => !Array.isArray(it.freeRooms) || showBusyKey === it.key || r._id === it.proposedRoom || it.freeRooms.includes(r._id))
                                    .sort((a, b) => (b._id === it.proposedRoom) - (a._id === it.proposedRoom))
                                    .map((r) => {
                                    const isCurrent = r._id === it.proposedRoom;
                                    const known = Array.isArray(it.freeRooms);
                                    const isFree = known && it.freeRooms.includes(r._id);
                                    const busy = known && !isFree && !isCurrent;
                                    return (
                                      <Pressable
                                        key={r._id}
                                        disabled={changeBusy}
                                        onPress={() => handlePickRoom(it, r)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Use room ${r.name}${busy ? ' (busy)' : isFree ? ' (free)' : ''}`}
                                        style={[
                                          styles.chip,
                                          isCurrent && { backgroundColor: accent, borderColor: accent },
                                          isFree && !isCurrent && { borderColor: colors.success, borderWidth: 2 },
                                          busy && { opacity: 0.45 },
                                          changeBusy && styles.disabled,
                                        ]}
                                      >
                                        <Text style={[styles.chipText, isCurrent && styles.chipTextActive]}>
                                          {r.name}{r.capacity ? ` · ${r.capacity}` : ''}{isCurrent ? ' · current' : busy ? ' · busy' : isFree ? ' · free' : ''}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                                {Array.isArray(it.freeRooms) && (
                                  <Pressable onPress={() => setShowBusyKey(showBusyKey === it.key ? null : it.key)} accessibilityRole="button" style={{ marginTop: spacing.sm }}>
                                    <Text style={[styles.smallBtnText, { color: accent }]}>{showBusyKey === it.key ? 'Hide busy rooms' : 'Show busy rooms too'}</Text>
                                  </Pressable>
                                )}
                              </>
                            )}
                            <Text style={styles.helperSmall}>Each choice is checked against the timetable, bookings, capacity and room type before it is accepted.</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
            {filtered.length > visible && (
              <Pressable style={[styles.moreBtn, { borderColor: accent, alignSelf: 'center' }]} onPress={() => setVisible(visible + PAGE)}>
                <Text style={[styles.smallBtnText, { color: accent }]}>Show {Math.min(PAGE, filtered.length - visible)} more</Text>
              </Pressable>
            )}

            <View onLayout={(e) => { publishY.current = e.nativeEvent.layout.y; }}>
            <Text style={[styles.stepTag, { color: accent, marginTop: spacing.lg }]}>STEP 3 OF 3</Text>
            <Text style={styles.sectionTitle}>Save or publish</Text>
            <Text style={styles.fieldLabel}>Draft name (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. CSE Sem 3 rooms – Oct"
              placeholderTextColor={colors.textSecondary}
              value={draftName}
              onChangeText={setDraftName}
              accessibilityLabel="Draft name"
            />
            <View style={styles.actionRow}>
              <ActionBtn styles={styles} accent={accent} outline icon="refresh" label="Re-run Unallocated" onPress={handleRerunUnallocated} disabled={running || result.summary.unallocated === 0} />
              <ActionBtn styles={styles} accent={accent} outline icon="save-outline" label={saving ? 'Saving…' : 'Save Draft'} onPress={handleSaveDraft} disabled={saving} />
              <ActionBtn styles={styles} accent={accent} outline icon="download-outline" label="Export CSV" onPress={handleExport} />
            </View>
            <Pressable
              style={[styles.runButton, { backgroundColor: accent, marginTop: spacing.sm }, (publishing || result.summary.conflicts > 0 || result.summary.changed === 0) && styles.disabled]}
              onPress={handlePublish}
              disabled={publishing || result.summary.conflicts > 0 || result.summary.changed === 0}
              accessibilityRole="button"
              accessibilityLabel="Confirm and publish"
            >
              {publishing ? <ActivityIndicator color={colors.textOnDark} /> : <Ionicons name="checkmark-done" size={18} color={colors.textOnDark} />}
              <Text style={styles.runButtonText}>{publishing ? 'Publishing…' : result.summary.changed === 0 ? 'Nothing to publish' : `Confirm & Publish (${result.summary.changed} change${result.summary.changed === 1 ? '' : 's'})`}</Text>
            </Pressable>
            {result.summary.changed > 0 && <Text style={styles.helperSmall}>Publishing saves {result.summary.changed} room change(s) and notifies the affected students and faculty.</Text>}
            </View>
          </View>
        )}

        {/* ---------- Drafts ---------- */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Saved drafts</Text>
            <Pressable style={[styles.addButton, { borderColor: accent }]} onPress={toggleDrafts} accessibilityRole="button">
              <Ionicons name={draftsOpen ? 'chevron-up' : 'folder-outline'} size={16} color={accent} />
              <Text style={[styles.addButtonText, { color: accent }]}>{draftsOpen ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          {draftsOpen && (
            draftsLoading ? (
              <ActivityIndicator size="small" color={accent} style={{ marginTop: spacing.md }} />
            ) : drafts.length === 0 ? (
              <Text style={styles.emptyText}>No saved drafts yet.</Text>
            ) : (
              drafts.map((d) => (
                <View key={d._id} style={styles.draftCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listRowTitle}>{d.name}</Text>
                    <Text style={styles.helperSmall}>
                      {d.status === 'published' ? 'Published' : 'Draft'} · {new Date(d.createdAt).toLocaleString()}
                      {d.summary ? ` · ${d.summary.totalSessions} sessions, ${d.summary.unallocated} unallocated` : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => openDraft(d)} style={[styles.smallBtn, { borderColor: accent }]} accessibilityRole="button">
                    <Text style={[styles.smallBtnText, { color: accent }]}>Open</Text>
                  </Pressable>
                  <Pressable onPress={() => removeDraft(d)} hitSlop={8} style={{ marginLeft: spacing.sm }} accessibilityLabel={`Delete draft ${d.name}`}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              ))
            )
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// widths are relative weights (flex) so the table always fits the screen - no sideways scrolling
const COLS = [
  { key: 'when', label: 'Day', w: 9 },
  { key: 'time', label: 'Time', w: 10 },
  { key: 'dept', label: 'Dept', w: 13 },
  { key: 'sem', label: 'Sem', w: 4 },
  { key: 'sec', label: 'Sec', w: 4 },
  { key: 'subject', label: 'Subject', w: 17 },
  { key: 'room', label: 'Room', w: 10 },
  { key: 'cap', label: 'Cap / Stu', w: 8 },
  { key: 'status', label: 'Status', w: 10 },
  { key: 'act', label: '', w: 9 },
  { key: 'note', label: 'Explanation', w: 18 },
];

function SummaryCard({ label, value, sub, color, styles }) {
  return (
    <View style={styles.card} accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.cardValue, { color }]}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
      {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
    </View>
  );
}

function ActionBtn({ icon, label, onPress, disabled, styles, accent }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.actionBtn, { borderColor: accent }, disabled && styles.disabled]}
    >
      <Ionicons name={icon} size={16} color={accent} />
      <Text style={[styles.actionBtnText, { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors, shadow) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg, ...shadow },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { ...typography.h2, color: colors.textPrimary },
  helper: { ...typography.caption, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.sm },
  helperSmall: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  hint: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' },
  stepTag: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 2 },
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, marginTop: spacing.md, alignSelf: 'flex-start' },
  moreBtnText: { fontSize: 13, fontWeight: '700' },
  plainBox: { borderWidth: 1.5, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, marginBottom: spacing.sm, backgroundColor: colors.background, gap: spacing.sm },
  plainText: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 4 },
  emptyText: { color: colors.textSecondary, fontSize: 13, paddingVertical: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md,
    paddingVertical: 10, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.surface,
  },
  lockedField: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: colors.tint1,
  },
  lockedFieldText: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  tag: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1 },
  tagText: { fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: colors.textOnDark },
  twoCol: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  twoColItem: { flex: 1, minWidth: 180 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  toggleLabel: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
  scopeBox: { marginTop: spacing.lg, backgroundColor: colors.tint1, borderRadius: radius.md, padding: spacing.md },
  scopeBoxTitle: { ...typography.label, color: colors.textSecondary },
  scopeBoxText: { ...typography.body, color: colors.textPrimary, marginTop: 2, fontWeight: '600' },
  runButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.sm, paddingVertical: 14, marginTop: spacing.md },
  runButtonText: { color: colors.textOnDark, fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, backgroundColor: colors.surface },
  bannerText: { flex: 1, ...typography.body, color: colors.textPrimary },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  card: { flexGrow: 1, flexBasis: 140, minWidth: 130, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md },
  cardValue: { fontSize: 24, fontWeight: '800' },
  cardLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  cardSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  thRow: { backgroundColor: colors.tint1 },
  th: { paddingHorizontal: 6, fontSize: 11, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase' },
  td: { paddingHorizontal: 6, fontSize: 12, color: colors.textPrimary },
  tdBold: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  tdSmall: { fontSize: 11, color: colors.textSecondary },
  mCard: { paddingVertical: 10, paddingHorizontal: 8, gap: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  mTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  mSubject: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  mLine: { fontSize: 13, color: colors.textPrimary },
  mActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  rowBad: { backgroundColor: 'rgba(220, 38, 38, 0.08)' },
  rowChanged: { backgroundColor: 'rgba(183, 121, 31, 0.10)' },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: '800' },
  smallBtn: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 10, alignItems: 'center' },
  smallBtnText: { fontSize: 12, fontWeight: '700' },
  moreBtn: { alignSelf: 'center', marginTop: spacing.sm, padding: spacing.sm },
  pickerPanel: { backgroundColor: colors.background, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 14 },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1 },
  addButtonText: { fontWeight: '700', fontSize: 13 },
  draftCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  listRowTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
});