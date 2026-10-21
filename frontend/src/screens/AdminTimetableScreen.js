
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import SearchableSelect from '../components/SearchableSelect';
import MatrixGrid from '../components/MatrixGrid';
import {
  fetchTimetable,
  fetchUsersByRole,
  downloadTimetablePdf,
} from '../api/endpoints';
import { DAYS, SEMESTERS, SECTIONS, DEPARTMENTS } from '../constants';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { showAlert } from '../utils/alert';

// Backend times are stored as 24-hour "HH:MM" strings (e.g. "15:00") — this
// turns that into a 12-hour label ("3:00 PM") for display only.
function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

// This screen is lookup-only — browse any section's or faculty member's
// weekly schedule. Adding/removing classrooms and timetable entries by hand
// used to live here too, but that data comes from the backend seed scripts
// instead, so those forms were removed to keep this screen to what it's
// actually for.
export default function AdminTimetableScreen({ navigation }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  const accent = colors.admin;
  const { user } = useAuth();

  // A department-scoped admin (admin.cse@, admin.ise@, etc.) only ever
  // works within their own department — the department picker below is
  // locked to it instead of offering a false choice the backend would
  // just reject or silently override anyway.
  const scopeDepartment = user?.department || null;

  const [loading, setLoading] = useState(true);
  const [faculties, setFaculties] = useState([]);

  // --- Browse Timetable (View Student / Faculty matrix) ---
  const [viewMode, setViewMode] = useState('student');
  const [viewDepartment, setViewDepartment] = useState(
    () => scopeDepartment || ''
  );
  const [viewSemester, setViewSemester] = useState('');
  const [viewSection, setViewSection] = useState('');

  // A separate department field for Faculty mode — picking it just narrows
  // which names show up below, it isn't sent to the backend (viewFaculty's
  // own id is what the lookup actually uses).
  const [facultyDepartment, setFacultyDepartment] = useState(
    () => scopeDepartment || ''
  );
  const [viewFaculty, setViewFaculty] = useState(null);
  const [viewEntries, setViewEntries] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [lastParams, setLastParams] = useState(null);

  // Narrows the faculty picker to just the chosen department — before this,
  // Faculty mode had no department field at all and listed every faculty
  // member in the college in one flat, unfiltered list.
  const facultiesInDepartment = facultyDepartment
    ? faculties.filter((f) => f.department === facultyDepartment)
    : [];

  const loadAll = useCallback(async () => {
    try {
      const facultyData = await fetchUsersByRole('faculty');
      setFaculties(facultyData);
    } catch (err) {
      showAlert('Could not load data', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleViewTimetable = async () => {
    if (viewMode === 'student') {
      if (
        !viewDepartment.trim() ||
        !viewSemester.trim() ||
        !viewSection.trim()
      ) {
        showAlert(
          'Missing selection',
          'Pick a department, semester and section first.'
        );
        return;
      }
    } else if (!facultyDepartment.trim() || !viewFaculty) {
      showAlert(
        'Missing selection',
        'Pick a department and a faculty member first.'
      );
      return;
    }

    setViewLoading(true);

    try {
      const params =
        viewMode === 'student'
          ? {
              department: viewDepartment,
              semester: viewSemester,
              section: viewSection,
            }
          : { faculty: viewFaculty };

      const data = await fetchTimetable(params);
      setViewEntries(data);

      // Remembered so "Download PDF" can reuse the exact same selection
      // without the admin having to re-pick department/semester/section.
      setLastParams(params);
    } catch (err) {
      showAlert('Could not load timetable', err.message);
    } finally {
      setViewLoading(false);
    }
  };

  // This screen was lookup-only — no way to get the browsed timetable out as
  // a PDF, even though the same "/timetable/pdf" endpoint that "My
  // Timetable" already uses works fine for any department/semester/section
  // or faculty selection an admin can make here too.
  const handleDownloadPdf = async () => {
    if (!lastParams) return;

    setDownloadingPdf(true);

    try {
      const blob = await downloadTimetablePdf(lastParams);

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
        showAlert(
          'Download',
          'PDF download is available on the web version of the app for now.'
        );
      }
    } catch (err) {
      showAlert('Could not download PDF', err.message);
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScreenHeader
          title="Timetable Matrix View"
          onBack={() => navigation.goBack()}
          accentColor={accent}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader
        title="Timetable Matrix View"
        onBack={() => navigation.goBack()}
        accentColor={accent}
      />

      <ScrollView contentContainerStyle={styles.container}>
        {/* --- View Timetable (Student / Faculty matrix browser) --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>View Timetable</Text>
          <Text style={styles.helper}>
            Look up any section's or any faculty member's weekly schedule.
          </Text>

          <View style={styles.viewModeRow}>
            <Pressable
              style={[
                styles.viewModeBtn,
                viewMode === 'student' && {
                  backgroundColor: accent,
                  borderColor: accent,
                },
              ]}
              onPress={() => {
                setViewMode('student');
                setViewEntries(null);
              }}
            >
              <Text
                style={[
                  styles.viewModeText,
                  viewMode === 'student' && styles.viewModeTextActive,
                ]}
              >
                Student
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.viewModeBtn,
                viewMode === 'faculty' && {
                  backgroundColor: accent,
                  borderColor: accent,
                },
              ]}
              onPress={() => {
                setViewMode('faculty');
                setViewEntries(null);
              }}
            >
              <Text
                style={[
                  styles.viewModeText,
                  viewMode === 'faculty' && styles.viewModeTextActive,
                ]}
              >
                Faculty
              </Text>
            </Pressable>
          </View>

          {viewMode === 'student' ? (
            <>
              <FieldLabel styles={styles}>Department</FieldLabel>

              {scopeDepartment ? (
                <View style={styles.lockedField}>
                  <Ionicons
                    name="lock-closed"
                    size={13}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.lockedFieldText}>
                    {scopeDepartment}
                  </Text>
                </View>
              ) : (
                <SearchableSelect
                  options={DEPARTMENTS}
                  value={viewDepartment}
                  onSelect={setViewDepartment}
                  placeholder="Type to search departments…"
                  accentColor={accent}
                  allowCustom
                />
              )}

              <View style={styles.twoCol}>
                <View style={styles.twoColItem}>
                  <FieldLabel styles={styles}>Semester</FieldLabel>
                  <SearchableSelect
                    options={SEMESTERS.map((s) => ({
                      key: String(s),
                      label: `Semester ${s}`,
                    }))}
                    value={viewSemester}
                    onSelect={setViewSemester}
                    placeholder="Pick semester…"
                    accentColor={accent}
                  />
                </View>

                <View style={styles.twoColItem}>
                  <FieldLabel styles={styles}>Section</FieldLabel>
                  <SearchableSelect
                    options={SECTIONS}
                    value={viewSection}
                    onSelect={setViewSection}
                    placeholder="Pick section…"
                    accentColor={accent}
                    allowCustom
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              <FieldLabel styles={styles}>Department</FieldLabel>

              {scopeDepartment ? (
                <View style={styles.lockedField}>
                  <Ionicons
                    name="lock-closed"
                    size={13}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.lockedFieldText}>
                    {scopeDepartment}
                  </Text>
                </View>
              ) : (
                <SearchableSelect
                  options={DEPARTMENTS}
                  value={facultyDepartment}
                  onSelect={(val) => {
                    setFacultyDepartment(val);
                    setViewFaculty(null);
                  }}
                  placeholder="Type to search departments…"
                  accentColor={accent}
                  allowCustom
                />
              )}

              <FieldLabel styles={styles}>Faculty</FieldLabel>

              {!facultyDepartment ? (
                <View style={styles.lockedField}>
                  <Ionicons
                    name="arrow-up-circle-outline"
                    size={13}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.lockedFieldText}>
                    Pick a department first
                  </Text>
                </View>
              ) : (
                <SearchableSelect
                  options={facultiesInDepartment.map((f) => ({
                    key: f._id,
                    label: f.name,
                  }))}
                  value={viewFaculty}
                  onSelect={setViewFaculty}
                  placeholder="Type a faculty name…"
                  accentColor={accent}
                />
              )}
            </>
          )}

          <Pressable
            style={[
              styles.saveButton,
              { backgroundColor: accent },
              viewLoading && styles.disabled,
            ]}
            onPress={handleViewTimetable}
            disabled={viewLoading}
          >
            <Text style={styles.saveButtonText}>
              {viewLoading ? 'Loading…' : 'Show Timetable'}
            </Text>
          </Pressable>

          {viewEntries !== null && viewEntries.length > 0 && (
            <Pressable
              style={[
                styles.downloadButton,
                { borderColor: accent },
                downloadingPdf && styles.disabled,
              ]}
              onPress={handleDownloadPdf}
              disabled={downloadingPdf}
            >
              {downloadingPdf ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <Ionicons
                  name="download-outline"
                  size={16}
                  color={accent}
                />
              )}

              <Text
                style={[styles.downloadButtonText, { color: accent }]}
              >
                {downloadingPdf ? 'Preparing…' : 'Download PDF'}
              </Text>
            </Pressable>
          )}

          {viewEntries !== null && (
            <View style={styles.viewResultBox}>
              {viewEntries.length === 0 ? (
                <Text style={styles.emptyText}>
                  No classes found for this selection.
                </Text>
              ) : (
                <MatrixGrid
                  accentColor={accent}
                  columns={DAYS.map((d) => ({
                    key: d,
                    label: d.slice(0, 3),
                  }))}
                  rows={[
                    ...new Set(viewEntries.map((e) => e.startTime)),
                  ]
                    .sort()
                    .map((t) => ({
                      key: t,
                      label: formatTime12h(t),
                    }))}
                  cellFor={(rowKey, colKey) =>
                    viewEntries.find(
                      (e) => e.day === colKey && e.startTime === rowKey
                    )
                  }
                  renderCell={(entry) =>
                    entry ? (
                      <View style={{ alignItems: 'center' }}>
                        <Text
                          style={styles.matrixCellSubject}
                          numberOfLines={2}
                        >
                          {entry.subject}
                        </Text>

                        <Text
                          style={styles.matrixCellMeta}
                          numberOfLines={1}
                        >
                          {entry.classroom?.name}
                          {viewMode === 'faculty'
                            ? ` · Sem ${entry.semester}${entry.section}`
                            : ''}
                        </Text>

                        {viewMode === 'student' && (
                          <Text
                            style={styles.matrixCellMeta}
                            numberOfLines={1}
                          >
                            {entry.faculty?.name}
                          </Text>
                        )}
                      </View>
                    ) : (
                      <Text style={styles.matrixCellMeta}>—</Text>
                    )
                  }
                />
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FieldLabel({ children, styles }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const createStyles = (colors, shadow) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    container: {
      padding: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
    },
    section: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
      ...shadow,
    },
    viewModeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    viewModeBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    viewModeText: {
      fontWeight: '700',
      fontSize: 13,
      color: colors.textSecondary,
    },
    viewModeTextActive: { color: colors.textOnDark },
    viewResultBox: { marginTop: spacing.md },
    matrixCellSubject: {
      ...typography.caption,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    matrixCellMeta: {
      ...typography.caption,
      color: colors.textSecondary,
      fontSize: 10,
      textAlign: 'center',
      marginTop: 1,
    },
    sectionTitle: {
      ...typography.h2,
      color: colors.textPrimary,
    },
    helper: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 4,
      marginBottom: spacing.sm,
    },
    fieldLabel: {
      ...typography.label,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
      marginTop: spacing.sm,
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
    lockedFieldText: {
      fontSize: 14,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    twoCol: { flexDirection: 'row', gap: spacing.sm },
    twoColItem: { flex: 1 },
    saveButton: {
      borderRadius: radius.sm,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    saveButtonText: {
      color: colors.textOnDark,
      fontWeight: '700',
      fontSize: 14,
    },
    downloadButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: radius.sm,
      borderWidth: 1,
      marginTop: spacing.sm,
    },
    downloadButtonText: { fontWeight: '700', fontSize: 13 },
    disabled: { opacity: 0.6 },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 13,
      paddingVertical: spacing.sm,
    },
  });
