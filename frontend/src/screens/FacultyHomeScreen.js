import React, { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import UpcomingClassButton from '../components/UpcomingClassButton';
import { fetchUnreadNotificationCount, fetchTimetable } from '../api/endpoints';
import { useTheme } from '../context/ThemeContext';
import useAutoRefresh from '../hooks/useAutoRefresh';

export default function FacultyHomeScreen({ navigation }) {
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

  // The standalone "Circulars" tile/screen is gone — a circular now only
  // ever appears as a notification (filterable there by "Circulars"), same
  // as StudentHomeScreen.js.
  const sections = [
    {
      title: 'Schedule',
      items: [
        { key: 'timetable', icon: 'calendar-outline', label: 'My Timetable', tint: colors.tint1, onPress: () => navigation.navigate('Timetable') },
      ],
    },
    {
      title: 'Bookings',
      items: [
        { key: 'book', icon: 'add-circle-outline', label: 'Book Classroom', tint: colors.tint2, onPress: () => navigation.navigate('BookClassroom') },
        { key: 'mybookings', icon: 'file-tray-full-outline', label: 'My Bookings', tint: colors.tint4, onPress: () => navigation.navigate('MyBookings') },
      ],
    },
    {
      title: 'Campus',
      items: [
        { key: 'classroommap', icon: 'map-outline', label: 'Classroom Map View', tint: colors.tint1, onPress: () => navigation.navigate('ClassroomMap') },
        { key: 'staffroom', icon: 'location-outline', label: 'Staffroom Locations', tint: colors.tint3, onPress: () => navigation.navigate('StaffroomLocations') },
      ],
    },
  ];

  return (
    <DashboardLayout
      title="Faculty Dashboard"
      roleLabel="Faculty"
      accentColor={colors.faculty}
      sections={sections}
      notificationCount={unreadCount}
      onNotificationsPress={() => navigation.navigate('Notifications')}
      extraHeaderIcon={
        <UpcomingClassButton
          entries={timetable}
          accentColor={colors.faculty}
          onViewTimetable={() => navigation.navigate('Timetable')}
        />
      }
    />
  );
}