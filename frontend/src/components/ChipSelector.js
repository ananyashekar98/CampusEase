import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';

export default function ChipSelector({ options, selectedKey, onSelect, accentColor }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!options || options.length === 0) {
    return <Text style={styles.emptyText}>Nothing to select yet.</Text>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.row}>
        {options.map((opt) => {
          const active = opt.key === selectedKey;
          return (
            <Pressable
              key={opt.key}
              onPress={() => onSelect(opt.key)}
              style={[
                styles.chip,
                active && { backgroundColor: accentColor || colors.primary, borderColor: accentColor || colors.primary },
              ]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: colors.textOnDark },
  emptyText: { color: colors.textSecondary, fontSize: 13, paddingVertical: spacing.xs },
});
