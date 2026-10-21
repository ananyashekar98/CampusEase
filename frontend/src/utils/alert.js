import { Alert, Platform } from 'react-native';

// React Native's Alert.alert() silently no-ops on web in most react-native-web
// versions — no popup, no error, nothing. This wrapper falls back to the
// browser's own alert/confirm so buttons actually respond on web, while still
// using the native Alert UI on Android/iOS.

export function showAlert(title, message) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function showConfirm(title, message, onConfirm) {
  if (Platform.OS === 'web') {
    const confirmed = window.confirm(message ? `${title}\n\n${message}` : title);
    if (confirmed) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'OK', style: 'destructive', onPress: onConfirm },
  ]);
}
