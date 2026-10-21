import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';

// "cancelled" is gone as its own status — a called-off booking, whether by
// auto-expiry or a manual cancel/reject, is just "rejected" now (see
// rejectionType for which flavor). Kept here only so a badge never crashes
// if it's ever handed an old stale "cancelled" value from somewhere.
const getStatusStyle = (colors) => ({
  pending: { bg: '#FDF0E3', fg: '#B5690C' },
  approved: { bg: '#E7F8F4', fg: colors.success },
  rejected: { bg: '#FCEAEA', fg: colors.danger },
  cancelled: { bg: '#FCEAEA', fg: colors.danger },
});

export default function StatusBadge({ status }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const statusStyle = useMemo(() => getStatusStyle(colors), [colors]);
  const safeStatus = status || 'pending';
  const style = statusStyle[safeStatus] || statusStyle.pending;
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.text, { color: style.fg }]}>{safeStatus.toUpperCase()}</Text>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
});