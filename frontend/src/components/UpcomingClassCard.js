import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { DAYS } from '../constants';

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Works out what to show: a class happening right now, the next one later
// today, or the next one on a future day — wrapping the week correctly even
// if today is Sunday (which isn't a working day in the timetable).
function getNextClass(entries) {
  if (!entries || entries.length === 0) return null;

  const now = new Date();
  const todayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayIndex = DAYS.indexOf(todayName); // -1 if today is Sunday

  if (todayIndex !== -1) {
    const current = entries.find(
      (e) => e.day === todayName && toMinutes(e.startTime) <= nowMinutes && nowMinutes < toMinutes(e.endTime)
    );
    if (current) return { ...current, when: 'now' };

    const laterToday = entries
      .filter((e) => e.day === todayName && toMinutes(e.startTime) > nowMinutes)
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    if (laterToday.length > 0) return { ...laterToday[0], when: 'today' };
  }

  for (let offset = 1; offset <= DAYS.length; offset += 1) {
    const dayIndex = todayIndex === -1 ? offset - 1 : (todayIndex + offset) % DAYS.length;
    const dayName = DAYS[dayIndex];
    const dayEntries = entries
      .filter((e) => e.day === dayName)
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    if (dayEntries.length > 0) return { ...dayEntries[0], when: 'later' };
  }
  return null;
}

export default function UpcomingClassCard({ entries, accentColor, onPress }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  const next = getNextClass(entries);

  if (!next) {
    return (
      <Pressable style={[styles.card, styles.emptyCard]} onPress={onPress}>
        <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
        <Text style={styles.emptyText}>No classes scheduled — check My Timetable</Text>
      </Pressable>
    );
  }

  const isNow = next.when === 'now';
  const label =
    next.when === 'now'
      ? `Until ${next.endTime}`
      : next.when === 'today'
      ? `Today at ${next.startTime}`
      : `${next.day} at ${next.startTime}`;

  return (
    <Pressable
      style={[
        styles.card,
        { backgroundColor: isNow ? accentColor : colors.surface, borderColor: accentColor },
      ]}
      onPress={onPress}
    >
      <Ionicons
        name={isNow ? 'radio-button-on' : 'time-outline'}
        size={18}
        color={isNow ? colors.textOnDark : accentColor}
        style={styles.icon}
      />
      <View style={styles.textWrap}>
        <Text style={[styles.eyebrow, { color: isNow ? colors.textOnDark : accentColor }]}>
          {isNow ? 'IN CLASS NOW' : 'UP NEXT'}
        </Text>
        <Text style={[styles.subject, isNow && styles.onAccent]} numberOfLines={1}>
          {next.subject}
        </Text>
        <Text style={[styles.meta, isNow && styles.metaOnAccent]} numberOfLines={1}>
          {next.classroom?.name} · {label}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={isNow ? colors.textOnDark : colors.textSecondary} />
    </Pressable>
  );
}

const createStyles = (colors, shadow) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadow,
  },
  emptyCard: { backgroundColor: colors.surface, borderColor: colors.border, gap: spacing.sm },
  emptyText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  icon: { marginRight: spacing.sm },
  textWrap: { flex: 1, marginRight: spacing.sm },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 2 },
  subject: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  onAccent: { color: colors.textOnDark },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  metaOnAccent: { color: 'rgba(255,255,255,0.85)' },
});
