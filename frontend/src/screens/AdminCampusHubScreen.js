import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import DashboardButton from '../components/DashboardButton';
import { spacing } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';

export default function AdminCampusHubScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accent = colors.admin;

  const items = [
    { key: 'classroommap', icon: 'map-outline', label: 'Classroom Map View', tint: colors.tint1, target: 'ClassroomMap' },
    { key: 'staffroom', icon: 'location-outline', label: 'Staffroom Locations', tint: colors.tint4, target: 'StaffroomLocations' },
  ];

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader title="Campus" onBack={() => navigation.goBack()} accentColor={accent} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.list}>
          {items.map((item) => (
            <DashboardButton
              key={item.key}
              icon={item.icon}
              label={item.label}
              tint={item.tint}
              accent={accent}
              onPress={() => navigation.navigate(item.target)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  list: { marginTop: spacing.sm },
});
