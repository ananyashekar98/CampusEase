import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// Returns an Expo push token for this device, or null if permission was
// denied, this is the web build, or there's no EAS projectId configured yet
// (run `eas init` in the frontend folder — see app.json's extra.eas.projectId).
export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') return null;

  if (!Device.isDevice) {
    console.warn('Push notifications need a physical device — skipping on simulator/emulator.');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn('Push notification permission was not granted.');
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('No EAS projectId found — run `eas init` in the frontend folder first.');
    return null;
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  return token;
}