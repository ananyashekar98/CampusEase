import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import MatrixGrid from '../components/MatrixGrid';
import { useAuth } from '../context/AuthContext';
import { fetchTimetable, downloadTimetablePdf } from '../api/endpoints';
import { DAYS } from '../constants';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../utils/alert';

// Backend times are stored as 24-hour "HH:MM" strings (e.g. "15:00") — this
// turns that into a 12-hour label ("3:00 PM") for display only.
function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export default function TimetableScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const accentColor = user?.role === 'faculty' ? colors.faculty : colors.student;
  const headerSubtitle = user?.role === 'student' && user?.semester && user?.section
    ? `Semester ${user.semester} · Section ${user.section}`
    : user?.role === 'faculty'
    ? 'Each class shows its room and group below the subject'
    : undefined;

  const load = useCallback(async () => {
    try {
      const data = await fetchTimetable();
      setEntries(data);
    } catch (err) {
      showAlert('Could not load timetable', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const handleVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
    };
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const blob = await downloadTimetablePdf();
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'timetable.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        showAlert('Download', 'PDF download is available on the web version of the app for now.');
      }
    } catch (err) {
      showAlert('Could not download PDF', err.message);
    } finally {
      setDownloading(false);
    }
  };

  const TIME_ROWS = [
    { key: '08:30', label: '8:30–9:30', type: 'class' },
    { key: '09:30', label: '9:30–10:30', type: 'class' },
    { key: '10:30', label: '10:30–11:00', type: 'break', breakLabel: '☕ Tea Break' },
    { key: '11:00', label: '11:00–12:00', type: 'class' },
    { key: '12:00', label: '12:00–1:00', type: 'class' },
    { key: '13:00', label: '1:00–2:00', type: 'break', breakLabel: '🍱 Lunch' },
    { key: '14:00', label: '2:00–3:00', type: 'class' },
    { key: '15:00', label: '3:00–4:00', type: 'class' },
  ];

  const fixedKeys = new Set(TIME_ROWS.map((r) => r.key));
  const extraKeys = [...new Set(entries.map((e) => e.startTime).filter((t) => !fixedKeys.has(t)))];
  const rows = [...TIME_ROWS, ...extraKeys.map((key) => {
    const sample = entries.find((e) => e.startTime === key);
    const label = sample ? `${formatTime12h(sample.startTime)}–${formatTime12h(sample.endTime)}` : formatTime12h(key);
    return { key, label, type: 'class' };
  })].sort((a, b) => toMinutes(a.key) - toMinutes(b.key));

  const columns = DAYS.map((d) => ({ key: d, label: d.slice(0, 3) }));
  const cellFor = (rowKey, colKey) => entries.find((e) => e.day === colKey && e.startTime === rowKey);

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader title="My Timetable" subtitle={headerSubtitle} onBack={() => navigation.goBack()} accentColor={accentColor} />

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.downloadButton, { borderColor: accentColor }, downloading && styles.disabled]}
          onPress={handleDownloadPdf}
          disabled={downloading}
        >
          {downloading ? (
            <ActivityIndicator size="small" color={accentColor} />
          ) : (
            <Ionicons name="download-outline" size={16} color={accentColor} />
          )}
          <Text style={[styles.downloadButtonText, { color: accentColor }]}>
            {downloading ? 'Preparing…' : 'Download PDF'}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={36} color={colors.textSecondary} />
          <Text style={styles.emptyText}>
            {user?.role === 'student'
              ? "No classes scheduled yet for your section, or your profile doesn't have a department/semester/section set."
              : 'No classes assigned to you yet.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <MatrixGrid
            columns={columns}
            rows={rows}
            cellFor={cellFor}
            accentColor={accentColor}
            renderCell={(entry, row) => (
              row?.type === 'break' ? (
                <View style={styles.breakCell}><Text style={styles.breakText}>{row.breakLabel}</Text></View>
              ) : !entry ? (
                <View style={styles.freeCell}><Text style={styles.freeText}>Free</Text></View>
              ) : (
              <View style={styles.cellContent}>
                <Text style={styles.cellSubject} numberOfLines={2}>{entry.subject}</Text>
                <Text style={styles.cellMeta} numberOfLines={1}>{entry.classroom?.name}</Text>
                {user?.role !== 'faculty' && (
                  <Text style={styles.cellMeta} numberOfLines={1}>{entry.faculty?.name}</Text>
                )}
                <Text style={styles.cellGroup} numberOfLines={1}>
                  Sem {entry.semester} · {entry.section}
                </Text>
              </View>
              )
            )}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, paddingTop: spacing.sm },
  actionRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, alignItems: 'flex-end' },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  disabled: { opacity: 0.6 },
  downloadButtonText: { fontWeight: '700', fontSize: 13 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  cellContent: { alignItems: 'center' },
  breakCell: { alignItems: 'center', justifyContent: 'center', minHeight: 36 },
  breakText: { ...typography.caption, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' },
  freeCell: { alignItems: 'center', justifyContent: 'center', minHeight: 36 },
  freeText: { ...typography.caption, color: colors.textSecondary, fontSize: 10, textAlign: 'center' },
  cellSubject: { ...typography.caption, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  cellMeta: { ...typography.caption, color: colors.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 1 },
  cellGroup: { ...typography.caption, color: colors.primary, fontSize: 9, fontWeight: '700', textAlign: 'center', marginTop: 2 },
});