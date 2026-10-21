import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';

export default function DashboardGridTile({ icon, label, tint, accent, onPress, badge }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <View style={[styles.iconCircle, { backgroundColor: tint || colors.tint1 }]}>
        <Ionicons name={icon} size={26} color={accent || colors.primary} />
        {badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors, shadow) => StyleSheet.create({
  tile: {
    width: 96,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  tilePressed: { opacity: 0.7 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    ...shadow,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 16,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeText: { color: colors.textOnDark, fontSize: 10, fontWeight: '700' },
});
