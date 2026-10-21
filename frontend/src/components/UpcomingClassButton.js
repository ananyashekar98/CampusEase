
import React, { useState, useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { gatColors, radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import { DAYS } from '../constants';

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Same "what's next" logic as before, just packaged behind an icon+popup
// instead of a full-width always-visible card.
function getNextClass(entries) {
  if (!entries || entries.length === 0) return null;

  const now = new Date();
  const todayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayIndex = DAYS.indexOf(todayName);

  if (todayIndex !== -1) {
    const current = entries.find(
      (e) =>
        e.day === todayName &&
        toMinutes(e.startTime) <= nowMinutes &&
        nowMinutes < toMinutes(e.endTime)
    );

    if (current) return { ...current, when: 'now' };

    const laterToday = entries
      .filter(
        (e) =>
          e.day === todayName &&
          toMinutes(e.startTime) > nowMinutes
      )
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

    if (laterToday.length > 0) {
      return { ...laterToday[0], when: 'today' };
    }
  }

  for (let offset = 1; offset <= DAYS.length; offset += 1) {
    const dayIndex =
      todayIndex === -1
        ? offset - 1
        : (todayIndex + offset) % DAYS.length;

    const dayName = DAYS[dayIndex];

    const dayEntries = entries
      .filter((e) => e.day === dayName)
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

    if (dayEntries.length > 0) {
      return { ...dayEntries[0], when: 'later' };
    }
  }

  return null;
}

export default function UpcomingClassButton({
  entries,
  accentColor,
  onViewTimetable,
}) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  const [open, setOpen] = useState(false);
  const next = getNextClass(entries);
  const isNow = next?.when === 'now';

  const label = !next
    ? null
    : next.when === 'now'
      ? `Until ${next.endTime}`
      : next.when === 'today'
        ? `Today at ${next.startTime}`
        : `${next.day} at ${next.startTime}`;

  return (
    <>
      <Pressable
        style={styles.iconButton}
        onPress={() => setOpen(true)}
        hitSlop={8}
      >
        <Ionicons
          name="time-outline"
          size={22}
          color={gatColors.white}
        />
        {isNow && (
          <View
            style={[
              styles.dot,
              {
                backgroundColor: gatColors.gold,
                borderColor: gatColors.navy,
              },
            ]}
          />
        )}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={[styles.sheet, { borderColor: accentColor }]}
            onPress={() => {}}
          >
            <Text style={styles.sheetTitle}>Your Schedule</Text>

            {!next ? (
              <Text style={styles.emptyText}>
                No classes scheduled yet — check My Timetable.
              </Text>
            ) : (
              <View style={styles.infoBlock}>
                <Text style={[styles.eyebrow, { color: accentColor }]}>
                  {isNow ? 'IN CLASS NOW' : 'UP NEXT'}
                </Text>
                <Text style={styles.subject}>{next.subject}</Text>
                <Text style={styles.meta}>
                  {next.classroom?.name} · {label}
                </Text>
              </View>
            )}

            <Pressable
              style={[
                styles.viewButton,
                { backgroundColor: accentColor },
              ]}
              onPress={() => {
                setOpen(false);
                onViewTimetable?.();
              }}
            >
              <Text style={styles.viewButtonText}>
                View Full Timetable
              </Text>
            </Pressable>

            <Pressable
              style={styles.closeButton}
              onPress={() => setOpen(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const createStyles = (colors, shadow) =>
  StyleSheet.create({
    iconButton: { position: 'relative', padding: 4 },
    dot: {
      position: 'absolute',
      top: 3,
      right: 3,
      width: 9,
      height: 9,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.background,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(27,31,46,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    sheet: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 2,
      padding: spacing.lg,
      ...shadow,
    },
    sheetTitle: {
      ...typography.h2,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    emptyText: {
      ...typography.body,
      color: colors.textSecondary,
    },
    infoBlock: { marginBottom: spacing.sm },
    eyebrow: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    subject: {
      ...typography.h2,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    meta: {
      ...typography.body,
      color: colors.textSecondary,
    },
    viewButton: {
      borderRadius: radius.sm,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    viewButtonText: {
      color: colors.textOnDark,
      fontWeight: '700',
      fontSize: 14,
    },
    closeButton: {
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    closeButtonText: {
      ...typography.label,
      color: colors.textSecondary,
    },
  });
