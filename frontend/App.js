import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { navigate } from './src/navigation/navigationRef';
import { registerForPushNotificationsAsync } from './src/utils/pushNotifications';
import { updateMyPushToken } from './src/api/endpoints';
import ErrorBoundary from './src/components/ErrorBoundary';

// Foreground behavior — show the banner/sound/badge even while the app is
// already open, instead of only updating the in-app Notifications list.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function AppContent() {
  const { scheme } = useTheme();
  const { user } = useAuth();
  // Register once per logged-in user per app launch — not on every re-render
  // AuthContext happens to cause.
  const registeredFor = useRef(null);

  useEffect(() => {
    if (!user) {
      registeredFor.current = null;
      return;
    }
    if (registeredFor.current === user._id) return;
    registeredFor.current = user._id;

    registerForPushNotificationsAsync()
      .then((token) => {
        if (token) return updateMyPushToken(token);
      })
      .catch((err) => console.warn('Push registration failed:', err.message));
  }, [user]);

  useEffect(() => {
    // Tapping a push notification (app backgrounded or killed) opens straight
    // to the Notifications screen instead of landing on whatever was on
    // screen when the app was last closed.
    const subscription = Notifications.addNotificationResponseReceivedListener(() => {
      navigate('Notifications');
    });
    return () => subscription.remove();
  }, []);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AppNavigator />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ErrorBoundary label="CampusEase">
            <AppContent />
          </ErrorBoundary>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}