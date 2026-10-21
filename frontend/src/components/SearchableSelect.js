import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';

// A tap-to-open picker: tapping the field opens a full-screen modal with a
// search box + filtered list. Using a Modal (rather than a floating
// position:absolute list) means it always renders above every other field —
// no more overlap with buttons or inputs further down the form.
export default function SearchableSelect({
  options,
  value,
  onSelect,
  placeholder,
  accentColor,
  allowCustom = false,
}) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => createStyles(colors, shadow), [colors, shadow]);
  const normalized = useMemo(
    () => options.map((o) => (typeof o === 'string' ? { key: o, label: o } : o)),
    [options]
  );
  const selectedLabel =
    normalized.find((o) => String(o.key) === String(value))?.label ?? (allowCustom ? value || '' : '');

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalized;
    return normalized.filter((o) => o.label.toLowerCase().includes(q));
  }, [query, normalized]);

  const exactMatch = normalized.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  const openPicker = () => {
    setQuery('');
    setOpen(true);
  };

  const handleSelect = (opt) => {
    onSelect(opt.key);
    setOpen(false);
  };

  const handleUseTyped = () => {
    const trimmed = query.trim();
    if (allowCustom && trimmed) {
      onSelect(trimmed);
      setOpen(false);
    }
  };

  return (
    <>
      <Pressable style={styles.trigger} onPress={openPicker}>
        <Text style={[styles.triggerText, !selectedLabel && styles.placeholderText]} numberOfLines={1}>
          {selectedLabel || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { borderColor: accentColor || colors.primary }]} onPress={() => {}}>
            <TextInput
              autoFocus
              style={styles.searchInput}
              placeholder="Type to search…"
              placeholderTextColor={colors.textSecondary}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleUseTyped}
            />
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
              {allowCustom && query.trim().length > 0 && !exactMatch && (
                <Pressable style={[styles.option, styles.customOption]} onPress={handleUseTyped}>
                  <Ionicons name="add-circle-outline" size={16} color={accentColor || colors.primary} />
                  <Text style={[styles.optionText, { color: accentColor || colors.primary, fontWeight: '700' }]}>
                    {' '}Use "{query.trim()}"
                  </Text>
                </Pressable>
              )}
              {filtered.length === 0 ? (
                <Text style={styles.emptyText}>
                  {allowCustom ? 'No presets match — type your own above' : 'No matches'}
                </Text>
              ) : (
                filtered.map((opt) => (
                  <Pressable key={opt.key} style={styles.option} onPress={() => handleSelect(opt)}>
                    <Text style={styles.optionText}>{opt.label}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
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
    maxWidth: 420,
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.md,
    ...shadow,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  list: { maxHeight: 280 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  customOption: { backgroundColor: colors.background, borderRadius: radius.sm, borderBottomWidth: 0, marginBottom: 4 },
  optionText: { fontSize: 14, color: colors.textPrimary },
  emptyText: { padding: spacing.md, color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  closeButton: { paddingVertical: 12, alignItems: 'center', marginTop: spacing.xs },
  closeButtonText: { ...typography.label, color: colors.textSecondary },
});
