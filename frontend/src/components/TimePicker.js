import React, { useEffect, useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';

const pad = (n) => String(n).padStart(2, '0');
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const wrap = (n, max) => ((n % max) + max) % max; // keeps result in [0, max)
const wrap12 = (n) => ((((n - 1) % 12) + 12) % 12) + 1; // keeps result in [1, 12]

// Converts a 12-hour hour + AM/PM into the 24-hour hour the rest of the app
// (backend, conflict checks, college-hours checks) stores and compares as
// plain "HH:MM" strings — so this component is the only place that has to
// think in 12-hour terms at all.
function to24Hour(hour12, period) {
  const h = hour12 % 12; // 12 -> 0
  return period === 'PM' ? h + 12 : h;
}
function to12Hour(hour24) {
  const period = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, period };
}

// 12-hour time entry with an AM/PM toggle: type digits directly into HH / MM,
// use the up/down buttons to step through values, or tap AM/PM to switch.
// Typing "2" + PM means 2:00 PM, not 2:00 AM — this used to be a 24-hour-only
// picker, which meant typing "2" silently meant 2 AM and got flagged as
// outside college hours when the person actually meant the afternoon. The
// value/onChange contract is unchanged: still a 24-hour "HH:MM" string, so
// every other screen and the backend need no changes at all.
export default function TimePicker({ value, onChange, accentColor }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [hourText, setHourText] = useState('09');
  const [minuteText, setMinuteText] = useState('00');
  const [period, setPeriod] = useState('AM');

  useEffect(() => {
    if (value && /^\d{2}:\d{2}$/.test(value)) {
      const [h24, m] = value.split(':').map(Number);
      const { hour12, period: p } = to12Hour(h24);
      setHourText(pad(hour12));
      setMinuteText(pad(m));
      setPeriod(p);
    }
  }, [value]);

  const commit = (h12, m, p) => onChange(`${pad(to24Hour(h12, p))}:${pad(m)}`);

  const currentHour12 = () => clamp(parseInt(hourText, 10) || 12, 1, 12);
  const currentMinute = () => clamp(parseInt(minuteText, 10) || 0, 0, 59);

  const stepHour = (delta) => {
    const h = wrap12(currentHour12() + delta);
    setHourText(pad(h));
    commit(h, currentMinute(), period);
  };

  const stepMinute = (delta) => {
    const m = wrap(currentMinute() + delta, 60);
    setMinuteText(pad(m));
    commit(currentHour12(), m, period);
  };

  // These used to only update the text shown in the box, and wait for
  // onBlur (clicking/tapping away) before actually committing the new
  // time — so typing "2" and tapping Submit right after, or typing a
  // digit and never explicitly clicking elsewhere, could submit the OLD
  // value. Now every keystroke commits immediately, so the time (and the
  // "outside college hours" banner) is always in sync with what's on screen.
  const handleHourChange = (text) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 2);
    setHourText(digits);
    if (digits !== '') {
      commit(clamp(parseInt(digits, 10) || 1, 1, 12), currentMinute(), period);
    }
  };

  const handleMinuteChange = (text) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 2);
    setMinuteText(digits);
    if (digits !== '') {
      commit(currentHour12(), clamp(parseInt(digits, 10) || 0, 0, 59), period);
    }
  };

  const handleHourBlur = () => {
    const h = currentHour12();
    setHourText(pad(h));
    commit(h, currentMinute(), period);
  };

  const handleMinuteBlur = () => {
    const m = currentMinute();
    setMinuteText(pad(m));
    commit(currentHour12(), m, period);
  };

  const selectPeriod = (next) => {
    if (next === period) return;
    setPeriod(next);
    commit(currentHour12(), currentMinute(), next);
  };

  const accent = accentColor || colors.primary;

  return (
    <View style={styles.row}>
      <View style={styles.unitBlock}>
        <TextInput
          style={styles.unitInput}
          value={hourText}
          onChangeText={handleHourChange}
          onBlur={handleHourBlur}
          keyboardType="number-pad"
          maxLength={2}
        />
        <Text style={styles.unitLabel}>HH</Text>
      </View>

      <View style={styles.stepperCol}>
        <Pressable style={[styles.stepBtn, { borderColor: accent }]} onPress={() => stepHour(1)} hitSlop={4}>
          <Ionicons name="chevron-up" size={13} color={accent} />
        </Pressable>
        <Pressable style={[styles.stepBtn, { borderColor: accent }]} onPress={() => stepHour(-1)} hitSlop={4}>
          <Ionicons name="chevron-down" size={13} color={accent} />
        </Pressable>
      </View>

      <Text style={styles.colon}>:</Text>

      <View style={styles.unitBlock}>
        <TextInput
          style={styles.unitInput}
          value={minuteText}
          onChangeText={handleMinuteChange}
          onBlur={handleMinuteBlur}
          keyboardType="number-pad"
          maxLength={2}
        />
        <Text style={styles.unitLabel}>MM</Text>
      </View>

      <View style={styles.stepperCol}>
        <Pressable style={[styles.stepBtn, { borderColor: accent }]} onPress={() => stepMinute(5)} hitSlop={4}>
          <Ionicons name="chevron-up" size={13} color={accent} />
        </Pressable>
        <Pressable style={[styles.stepBtn, { borderColor: accent }]} onPress={() => stepMinute(-5)} hitSlop={4}>
          <Ionicons name="chevron-down" size={13} color={accent} />
        </Pressable>
      </View>

      {/* Both AM and PM are always visible, side by side, with the active
          one filled in — a single button that just showed "AM" or "PM"
          made it too easy to not notice it still needed a tap. */}
      <View style={styles.periodGroup}>
        <Pressable
          style={[
            styles.periodButton,
            styles.periodButtonTop,
            { borderColor: accent },
            period === 'AM' && { backgroundColor: accent },
          ]}
          onPress={() => selectPeriod('AM')}
          hitSlop={4}
        >
          <Text style={[styles.periodButtonText, { color: period === 'AM' ? '#fff' : accent }]}>AM</Text>
        </Pressable>
        <Pressable
          style={[
            styles.periodButton,
            styles.periodButtonBottom,
            { borderColor: accent },
            period === 'PM' && { backgroundColor: accent },
          ]}
          onPress={() => selectPeriod('PM')}
          hitSlop={4}
        >
          <Text style={[styles.periodButtonText, { color: period === 'PM' ? '#fff' : accent }]}>PM</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unitBlock: { alignItems: 'center' },
  unitInput: {
    width: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    textAlign: 'center',
  },
  unitLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 2, letterSpacing: 0.5 },
  colon: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 14 },
  stepperCol: { gap: 2 },
  stepBtn: {
    width: 22,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodGroup: { marginLeft: 2, marginBottom: 14 },
  periodButton: {
    width: 40,
    height: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodButtonTop: { borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
  periodButtonBottom: { borderBottomLeftRadius: radius.sm, borderBottomRightRadius: radius.sm, borderTopWidth: 0 },
  periodButtonText: { fontWeight: '700', fontSize: 11 },
});