import React, { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { fetchUnreadNotificationCount } from '../api/endpoints';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import BulkImportHeaderIcon from '../components/BulkImportHeaderIcon';

export default function AdminHomeScreen({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  // Department admins (an admin with a department) do not get Profile Photos & IDs.
  const isMainAdmin = !user?.department;
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(() => {
    fetchUnreadNotificationCount().then(setUnreadCount).catch(() => {});
  }, []);

  // Refresh the bell badge whenever this screen regains focus...
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', refresh);
    return unsubscribe;
  }, [navigation, refresh]);

  // ...and every 10 seconds while it is open, so new booking requests show up.
  useEffect(() => {
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  const sections = [
    {
      title: 'Scheduling',
      items: [
        { key: 'allocator', icon: 'flash-outline', label: 'Run Auto Allocator', tint: colors.tint1, onPress: () => navigation.navigate('AdminAutoAllocator') },
        { key: 'matrix', icon: 'grid-outline', label: 'Timetable Matrix View', tint: colors.tint3, onPress: () => navigation.navigate('AdminTimetable') },
      ],
    },
    {
      title: 'Bookings',
      items: [
        { key: 'directbooking', icon: 'business-outline', label: 'Admin Direct Booking', tint: colors.tint4, onPress: () => navigation.navigate('BookClassroom') },
        { key: 'requests', icon: 'mail-open-outline', label: 'Booking Requests', tint: colors.tint2, onPress: () => navigation.navigate('AdminBookingRequests') },
      ],
    },
    ...(isMainAdmin ? [{
      title: 'People',
      items: [
        { key: 'photos', icon: 'people-outline', label: 'Profile Photos & IDs', tint: colors.tint2, onPress: () => navigation.navigate('AdminUserPhotos') },
      ],
    }] : []),
    // "Announcements" section (Post Circular) is gone — the circulars
    // feature was removed everywhere: no posting screen, no list screen, no
    // "Circulars" filter on Notifications, and no route for any of it.
    {
      title: 'Campus',
      items: [
        { key: 'classroommap', icon: 'map-outline', label: 'Classroom Map View', tint: colors.tint1, onPress: () => navigation.navigate('ClassroomMap') },
        { key: 'staffroom', icon: 'location-outline', label: 'Staffroom Locations', tint: colors.tint4, onPress: () => navigation.navigate('StaffroomLocations') },
      ],
    },
    // The "Accounts" section (admin resetting someone ELSE's password) is
    // gone entirely — every role, admin included, can now only ever change
    // their OWN password (Settings > Change Password). See ChangePassword
    // flow for that; there is no more "reset another user's password" path
    // anywhere in the app.
  ];

  return (
    <DashboardLayout
      title="Admin Dashboard"
      roleLabel="Admin"
      accentColor={colors.admin}
      sections={sections}
      notificationCount={unreadCount}
      extraHeaderIcon={<BulkImportHeaderIcon />}
      onNotificationsPress={() => navigation.navigate('Notifications')}
    />
  );
}