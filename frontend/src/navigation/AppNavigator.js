import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { navigationRef } from './navigationRef';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import SettingsScreen from '../screens/SettingsScreen';
import StudentHomeScreen from '../screens/StudentHomeScreen';
import FacultyHomeScreen from '../screens/FacultyHomeScreen';
import AdminHomeScreen from '../screens/AdminHomeScreen';
import TimetableScreen from '../screens/TimetableScreen';
import AdminTimetableScreen from '../screens/AdminTimetableScreen';
import BookClassroomScreen from '../screens/BookClassroomScreen';
import MyBookingsScreen from '../screens/MyBookingsScreen';
import AdminAllBookingsScreen from '../screens/AdminAllBookingsScreen';
import AdminAutoAllocatorScreen from '../screens/AdminAutoAllocatorScreen';
import AdminBulkImportScreen from '../screens/AdminBulkImportScreen';
import AdminUserPhotosScreen from '../screens/AdminUserPhotosScreen';

import StaffroomLocationsScreen from '../screens/StaffroomLocationsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ClassroomMapScreen from '../screens/ClassroomMapScreen';
// Circulars feature removed entirely — AdminPostCircularScreen (and the
// already-unregistered CircularsScreen) are gone. Delete both screen files
// from the project; nothing else imports them.

const Stack = createNativeStackNavigator();

const HOME_SCREEN_BY_ROLE = {
  student: StudentHomeScreen,
  faculty: FacultyHomeScreen,
  admin: AdminHomeScreen,
};

export default function AppNavigator() {
  const { colors } = useTheme();
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user && user.mustChangePassword ? (
          // An admin issued this user a temporary password — nothing else is
          // reachable until they choose their own.
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
        ) : user ? (
          <>
            <Stack.Screen
              name="Home"
              component={HOME_SCREEN_BY_ROLE[user.role] || StudentHomeScreen}
            />
            <Stack.Screen name="Timetable" component={TimetableScreen} />
            {user.role === 'admin' && (
              <Stack.Screen name="AdminTimetable" component={AdminTimetableScreen} />
            )}
            {(user.role === 'faculty' || user.role === 'admin') && (
              <Stack.Screen name="BookClassroom" component={BookClassroomScreen} />
            )}
            {user.role === 'faculty' && (
              <Stack.Screen name="MyBookings" component={MyBookingsScreen} />
            )}
            {user.role === 'admin' && (
              <Stack.Screen name="AdminBookingRequests" component={AdminAllBookingsScreen} />
            )}
            {/* "StudentBookings" removed — approved one-off bookings now show up
                as "Extra Class Added"/"Extra Class Cancelled" notifications
                instead of a separate screen (see NotificationsScreen.js). */}
            {user.role === 'admin' && (
              <Stack.Screen name="AdminAutoAllocator" component={AdminAutoAllocatorScreen} />
            )}
            {user.role === 'admin' && !user.department && (
              <Stack.Screen name="AdminUserPhotos" component={AdminUserPhotosScreen} />
            )}
            {/* Bulk import: main admin only (an admin with no department). */}
            {user.role === 'admin' && !user.department && (
              <Stack.Screen name="AdminBulkImport" component={AdminBulkImportScreen} />
            )}
            <Stack.Screen name="StaffroomLocations" component={StaffroomLocationsScreen} />
            {/* AdminPostCircular is gone — the circulars feature was removed
                everywhere: no posting screen, no standalone list screen, and
                no "Circulars" filter on Notifications. */}
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            {/* "AdminResetPassword" is gone — admin could reset anyone's
                password, and that's no longer allowed for anyone. Every
                role (including admin) can only ever change their OWN
                password now, via ChangePassword/Settings above. */}
            <Stack.Screen name="ClassroomMap" component={ClassroomMapScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}