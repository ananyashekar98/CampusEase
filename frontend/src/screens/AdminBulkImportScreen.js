import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { previewBulkImport, commitBulkImport, downloadBulkImportTemplate } from '../api/endpoints';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../utils/alert';

// Main admin only. Pick an Excel/CSV sheet (e.g. a Google Form export),
// see it as a grid with a per-row check, then import the valid rows.

const COLUMNS = [
  { key: 'row', label: '#', width: 44 },
  { key: 'name', label: 'Name', width: 170 },
  { key: 'email', label: 'Email', width: 270 },
  { key: 'role', label: 'Role', width: 80 },
  { key: 'department', label: 'Department', width: 250 },
  { key: 'semester', label: 'Sem', width: 56 },
  { key: 'section', label: 'Sec', width: 52 },
  { key: 'usn', label: 'USN', width: 120 },
  { key: 'passwordSource', label: 'Password', width: 90 },
  { key: 'status', label: 'Status', width: 330 },
];

// Web file picker (no extra package needed). Resolves to { name, base64 } or null.
function pickSpreadsheetWeb() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, base64: String(reader.result).split(',')[1] });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
      return undefined;
    };
    input.click();
  });
}

export default function AdminBulkImportScreen({ navigation }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  const accent = colors.admin;

  const [file, setFile] = useState(null); // { name, base64 }
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null); // { totalRows, readyCount, errorCount }
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(null); // { addedCount, skippedCount }
  const [fileError, setFileError] = useState(''); // shown as a red banner when a file is rejected

  const reset = () => {
    setFile(null);
    setRows([]);
    setSummary(null);
    setImported(null);
  };

  const handlePick = async () => {
    if (Platform.OS !== 'web') {
      showAlert('Open on the web', 'Excel upload works from the web version of CampusEase (open it in a browser).');
      return;
    }
    const picked = await pickSpreadsheetWeb();
    if (!picked) return;
    setBusy(true);
    setImported(null);
    setFileError('');
    try {
      const data = await previewBulkImport({ fileName: picked.name, fileBase64: picked.base64 });
      setFile(picked);
      setRows(data.rows);
      setSummary({ totalRows: data.totalRows, readyCount: data.readyCount, errorCount: data.errorCount });
    } catch (err) {
      reset();
      setFileError(err.message || 'That file could not be used.');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!file || !summary || summary.readyCount === 0) return;
    setBusy(true);
    try {
      const data = await commitBulkImport({ fileName: file.name, fileBase64: file.base64 });
      setRows(data.rows);
      setImported({ addedCount: data.addedCount, skippedCount: data.skippedCount });
    } catch (err) {
      showAlert('Import failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleTemplate = async () => {
    if (Platform.OS !== 'web') {
      showAlert('Open on the web', 'Download the template from the web version of CampusEase.');
      return;
    }
    try {
      await downloadBulkImportTemplate();
    } catch (err) {
      showAlert('Could not download template', err.message);
    }
  };

  const statusText = (r) => {
    if (imported) return r.added ? 'Added' : r.reason || 'Skipped';
    if (r.status === 'ok') return r.reason ? `Ready — ${r.reason}` : 'Ready';
    return r.reason;
  };
  const statusColor = (r) => {
    if (imported) return r.added ? colors.success : colors.danger;
    return r.status === 'ok' ? colors.success : colors.danger;
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader title="Bulk Import Users" subtitle="Upload an Excel sheet to add accounts" onBack={() => navigation.goBack()} accentColor={accent} />
      <ScrollView contentContainerStyle={styles.container}>
        {!file && (
          <View style={styles.card}>
            <Pressable style={[styles.dropZone, { borderColor: accent }]} onPress={handlePick} disabled={busy}>
              {busy ? (
                <ActivityIndicator size="large" color={accent} />
              ) : (
                <>
                  <View style={[styles.plusCircle, { backgroundColor: accent }]}>
                    <Ionicons name="add" size={34} color={colors.textOnDark} />
                  </View>
                  <Text style={styles.dropTitle}>Tap + to choose your Excel file</Text>
                  <Text style={styles.dropSub}>.xlsx, .xls or .csv — e.g. the sheet exported from your Google Form</Text>
                </>
              )}
            </Pressable>

            {!!fileError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={20} color={colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.errorTitle}>File not accepted</Text>
                  <Text style={styles.errorText}>{fileError}</Text>
                </View>
              </View>
            )}

            <Pressable style={styles.linkRow} onPress={handleTemplate}>
              <Ionicons name="download-outline" size={16} color={accent} />
              <Text style={[styles.linkText, { color: accent }]}>Download the Excel template</Text>
            </Pressable>

            <Text style={styles.helperTitle}>Columns (header names are matched loosely)</Text>
            <Text style={styles.helper}>
              name · email · password · role · department · semester · section · usn{'\n'}
              Students need department, semester and section. Leave email blank for a student with a USN and it
              becomes name.usn@campusease.edu. Leave password blank to use the default for the role. Role blank means student.
            </Text>
          </View>
        )}

        {file && summary && (
          <View style={styles.card}>
            <View style={styles.fileRow}>
              <Ionicons name="document-text-outline" size={20} color={accent} />
              <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
              <Pressable onPress={reset} hitSlop={8} disabled={busy}>
                <Text style={[styles.linkText, { color: colors.danger }]}>Remove</Text>
              </Pressable>
            </View>

            {imported ? (
              <View style={[styles.banner, { backgroundColor: colors.tint2 }]}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.bannerText}>
                  {imported.addedCount} new user{imported.addedCount === 1 ? '' : 's'} added
                  {imported.skippedCount > 0 ? ` · ${imported.skippedCount} skipped (see the Status column)` : ''}
                </Text>
              </View>
            ) : (
              <View style={styles.pillRow}>
                <View style={[styles.pill, { backgroundColor: colors.success }]}>
                  <Text style={styles.pillText}>{summary.readyCount} ready</Text>
                </View>
                {summary.errorCount > 0 && (
                  <View style={[styles.pill, { backgroundColor: colors.danger }]}>
                    <Text style={styles.pillText}>{summary.errorCount} with problems</Text>
                  </View>
                )}
                <Text style={styles.pillTotal}>of {summary.totalRows} rows</Text>
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.gridScroll}>
              <View>
                <View style={styles.gridRow}>
                  {COLUMNS.map((c) => (
                    <View key={c.key} style={[styles.cell, styles.headCell, { width: c.width }]}>
                      <Text style={styles.headText}>{c.label}</Text>
                    </View>
                  ))}
                </View>
                {rows.map((r, idx) => (
                  <View key={r.row} style={[styles.gridRow, idx % 2 === 1 && styles.altRow]}>
                    {COLUMNS.map((c) => (
                      <View key={c.key} style={[styles.cell, { width: c.width }]}>
                        {c.key === 'status' ? (
                          <Text style={[styles.cellText, { color: statusColor(r), fontWeight: '700' }]} numberOfLines={2}>
                            {statusText(r)}
                          </Text>
                        ) : (
                          <Text style={styles.cellText} numberOfLines={1}>{String(r[c.key] ?? '')}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>

            {!imported && (
              <Pressable
                style={[styles.importButton, { backgroundColor: accent }, (busy || summary.readyCount === 0) && styles.disabled]}
                onPress={handleImport}
                disabled={busy || summary.readyCount === 0}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.textOnDark} />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={16} color={colors.textOnDark} />
                    <Text style={styles.importButtonText}>
                      Import {summary.readyCount} user{summary.readyCount === 1 ? '' : 's'}
                    </Text>
                  </>
                )}
              </Pressable>
            )}

            <Pressable style={styles.linkRow} onPress={imported ? reset : handlePick} disabled={busy}>
              <Ionicons name="add-circle-outline" size={16} color={accent} />
              <Text style={[styles.linkText, { color: accent }]}>{imported ? 'Import another file' : 'Choose a different file'}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors, shadow) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    paddingVertical: 40,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 200,
  },
  plusCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  dropTitle: { ...typography.h2, color: colors.textPrimary, textAlign: 'center' },
  dropSub: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  linkText: { fontWeight: '700', fontSize: 13 },
  helperTitle: { ...typography.label, color: colors.textSecondary, marginTop: spacing.lg },
  helper: { ...typography.caption, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  fileName: { flex: 1, fontWeight: '700', color: colors.textPrimary },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.sm },
  bannerText: { flex: 1, fontWeight: '700', color: colors.textPrimary },
  pillRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { color: colors.textOnDark, fontWeight: '700', fontSize: 12 },
  pillTotal: { ...typography.caption, color: colors.textSecondary },
  gridScroll: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, maxHeight: 460 },
  gridRow: { flexDirection: 'row' },
  altRow: { backgroundColor: colors.background },
  cell: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  headCell: { backgroundColor: colors.tint3, paddingVertical: 10 },
  headText: { fontWeight: '800', fontSize: 12, color: colors.textPrimary },
  cellText: { fontSize: 12, color: colors.textPrimary },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.sm,
    paddingVertical: 13,
    marginTop: spacing.md,
  },
  importButtonText: { color: colors.textOnDark, fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.5 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.tint4,
  },
  errorTitle: { fontWeight: '800', color: colors.danger, fontSize: 14 },
  errorText: { color: colors.textPrimary, fontSize: 13, marginTop: 2, lineHeight: 18 },
});