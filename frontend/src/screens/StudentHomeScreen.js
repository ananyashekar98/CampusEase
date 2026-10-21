import React, { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import UpcomingClassButton from '../components/UpcomingClassButton';
import { fetchUnreadNotificationCount, fetchTimetable } from '../api/endpoints';
import { useTheme } from '../context/ThemeContext';
import useAutoRefresh from '../hooks/useAutoRefresh';

export default function StudentHomeScreen({ navigation }) {
  const { colors } = useTheme();
  const [unreadCount, setUnreadCount] = useState(0);
  const [timetable, setTimetable] = useState([]);

  const refresh = useCallback(() => {
    fetchUnreadNotificationCount().then(setUnreadCount).catch(() => {});
    fetchTimetable().then(setTimetable).catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', refresh);
    return unsubscribe;
  }, [navigation, refresh]);

  // Keep the bell badge and timetable live without leaving the screen.
  useAutoRefresh(refresh, 10000);

  // "View Classroom Bookings" tile removed — approved one-off bookings now
  // show up as "Extra Class Added"/"Extra Class Cancelled" notifications
  // (see NotificationsScreen.js) instead of a separate screen, so the whole
  // "Bookings" section here is gone too.
  // Same for the standalone "Circulars" tile/screen — a circular now only
  // ever appears as a notification (filterable there by "Circulars"), so
  // the whole "Announcements" section here is gone too.
  const sections = [
    {
      title: 'Schedule',
      items: [
        { key: 'timetable', icon: 'calendar-outline', label: 'My Timetable', tint: colors.tint1, onPress: () => navigation.navigate('Timetable') },
      ],
    },
    {
      title: 'Campus',
      items: [
        { key: 'staffroom', icon: 'location-outline', label: 'Staffroom Locations', tint: colors.tint3, onPress: () => navigation.navigate('StaffroomLocations') },
      ],
    },
  ];

  return (
    <DashboardLayout
      title="Student Dashboard"
      roleLabel="Student"
      accentColor={colors.student}
      sections={sections}
      notificationCount={unreadCount}
      onNotificationsPress={() => navigation.navigate('Notifications')}
      extraHeaderIcon={
        <UpcomingClassButton
          entries={timetable}
          accentColor={colors.student}
          onViewTimetable={() => navigation.navigate('Timetable')}
        />
      }
    />
  );
}