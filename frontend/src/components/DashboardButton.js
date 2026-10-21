import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';

export default function DashboardButton({ icon, label, tint, accent, onPress, badge }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={[styles.iconWrap, { backgroundColor: tint || colors.tint1 }]}>
        <Ionicons name={icon} size={22} color={accent || colors.primary} />
      </View>
      <Text style={styles.label}>{label}</Text>
      {badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

const createStyles = (colors, shadow) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    ...shadow,
  },
  cardPressed: {
    opacity: 0.75,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  label: {
    flex: 1,
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  badge: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  badgeText: {
    color: colors.textOnDark,
    fontSize: 11,
    fontWeight: '700',
  },
});
