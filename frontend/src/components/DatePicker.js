import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function toDateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseISO(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function formatDisplay(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// Tap-to-open calendar, matching SearchableSelect's modal pattern. Dates
// before `minDate` (default: today) are shown but disabled — this is a
// booking form, so picking a day that's already passed is never valid.
// Every Sunday is disabled too, for the same reason: the college doesn't
// run classes or allow room bookings on Sundays at all.
export default function DatePicker({ value, onChange, placeholder = 'Select a date…', accentColor, minDate }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);

  const today = useMemo(() => toDateOnly(new Date()), []);
  const earliest = minDate ? toDateOnly(minDate) : today;

  const selectedDate = parseISO(value);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selectedDate || earliest);

  const openPicker = () => {
    setViewDate(selectedDate || earliest);
    setOpen(true);
  };

  const changeMonth = (delta) => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const handlePick = (day) => {
    onChange(toISO(day));
    setOpen(false);
  };

  const weeks = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startWeekday; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewDate]);

  return (
    <>
      <Pressable style={styles.trigger} onPress={openPicker}>
        <Text style={[styles.triggerText, !value && styles.placeholderText]} numberOfLines={1}>
          {value ? formatDisplay(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { borderColor: accentColor || colors.primary }]} onPress={() => {}}>
            <View style={styles.header}>
              <Pressable onPress={() => changeMonth(-1)} hitSlop={10}>
                <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
              </Pressable>
              <Text style={styles.headerText}>{MONTH_LABELS[viewDate.getMonth()]} {viewDate.getFullYear()}</Text>
              <Pressable onPress={() => changeMonth(1)} hitSlop={10}>
                <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAY_LABELS.map((w) => (
                <Text key={w} style={styles.weekdayLabel}>{w}</Text>
              ))}
            </View>

            {weeks.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.weekRow}>
                {row.map((day, colIdx) => {
                  if (!day) return <View key={colIdx} style={styles.dayCell} />;
                  const iso = toISO(day);
                  const isPast = day < earliest;
                  // The college doesn't run any classes or bookings on
                  // Sunday at all (0 = Sunday in JS's getDay()) — blocked
                  // here the same way a past date is blocked, not just
                  // left to the backend to reject after the fact.
                  const isSunday = day.getDay() === 0;
                  const isDisabled = isPast || isSunday;
                  const isSelected = value === iso;
                  const isToday = day.getTime() === today.getTime();
                  return (
                    <Pressable
                      key={colIdx}
                      style={[
                        styles.dayCell,
                        isSelected && { backgroundColor: accentColor || colors.primary, borderRadius: radius.pill },
                      ]}
                      disabled={isDisabled}
                      onPress={() => handlePick(day)}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          isDisabled && styles.dayTextDisabled,
                          isSelected && styles.dayTextSelected,
                          isToday && !isSelected && { color: accentColor || colors.primary, fontWeight: '700' },
                        ]}
                      >
                        {day.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <Pressable style={styles.closeButton} onPress={() => setOpen(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const createStyles = (colors, shadow) => StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  triggerText: { fontSize: 14, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
  placeholderText: { color: colors.textSecondary },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(27,31,46,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.md,
    ...shadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerText: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  weekRow: { flexDirection: 'row' },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    paddingVertical: 6,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontSize: 14, color: colors.textPrimary },
  dayTextDisabled: { color: colors.border },
  dayTextSelected: { color: colors.textOnDark, fontWeight: '700' },
  closeButton: { paddingVertical: 12, alignItems: 'center', marginTop: spacing.xs },
  closeButtonText: { ...typography.label, color: colors.textSecondary },
});