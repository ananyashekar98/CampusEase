import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import DashboardButton from '../components/DashboardButton';
import { spacing } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';

export default function AdminBookingsHubScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accent = colors.admin;

  const items = [
    { key: 'directbooking', icon: 'business-outline', label: 'Admin Direct Booking', tint: colors.tint4, target: 'BookClassroom' },
    { key: 'requests', icon: 'mail-open-outline', label: 'Booking Requests', tint: colors.tint2, target: 'AdminBookingRequests' },
    { key: 'allbookings', icon: 'reader-outline', label: 'All Bookings', tint: colors.tint3, target: 'AdminAllBookings' },
  ];

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <ScreenHeader title="Bookings" onBack={() => navigation.goBack()} accentColor={accent} />
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
