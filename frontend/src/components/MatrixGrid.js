import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';

const CELL_WIDTH = 130;
const TIME_COL_WIDTH = 64;

// A generic weekly/date grid: rows = time slots, columns = days or dates.
// `cellFor(rowKey, colKey)` returns the matching entry (or null/undefined for
// a free slot, rendered as the emptyLabel dash).
export default function MatrixGrid({ columns, rows, cellFor, renderCell, accentColor, emptyLabel = '—' }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (rows.length === 0) {
    return <Text style={styles.emptyText}>Nothing to show yet.</Text>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {/* Header row */}
        <View style={styles.row}>
          <View style={[styles.cell, styles.cornerCell, { width: TIME_COL_WIDTH }]} />
          {columns.map((col) => (
            <View key={col.key} style={[styles.cell, styles.headerCell, { width: CELL_WIDTH, backgroundColor: accentColor || colors.primary }]}>
              <Text style={styles.headerText} numberOfLines={2}>{col.label}</Text>
            </View>
          ))}
        </View>

        {/* Time rows */}
        {rows.map((row) => (
          <View key={row.key} style={styles.row}>
            <View style={[styles.cell, styles.timeCell, { width: TIME_COL_WIDTH }]}>
              <Text style={styles.timeText}>{row.label}</Text>
            </View>
            {columns.map((col) => {
              const entry = cellFor(row.key, col.key);
              return (
                <View key={col.key} style={[styles.cell, styles.dataCell, { width: CELL_WIDTH }]}>
                  {renderCell ? renderCell(entry, row, col) : (entry ? <Text>{String(entry)}</Text> : <Text style={styles.dash}>{emptyLabel}</Text>)}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  row: { flexDirection: 'row' },
  cell: {
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  cornerCell: { backgroundColor: colors.background },
  headerCell: { borderColor: colors.border },
  headerText: { color: colors.textOnDark, fontWeight: '700', fontSize: 12, textAlign: 'center' },
  timeCell: { backgroundColor: colors.background },
  timeText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700', textAlign: 'center' },
  dataCell: { backgroundColor: colors.surface },
  dash: { color: colors.border, fontSize: 16, fontWeight: '700' },
  emptyText: { color: colors.textSecondary, fontSize: 13, paddingVertical: spacing.sm },
});
