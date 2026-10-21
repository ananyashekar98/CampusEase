import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// On the web, AsyncStorage's own web implementation is just a thin wrapper
// around localStorage — which is shared by every tab/window pointing at the
// same origin (http://localhost:8081). That's why logging in as faculty in
// one tab and then admin in another showed admin in BOTH: they were reading
// and writing the exact same stored token/user.
//
// sessionStorage is scoped to a single tab instead — opening a new tab (even
// to the same URL) starts it with empty sessionStorage, so each tab keeps
// its own independent login. (The one exception is literally duplicating a
// tab, e.g. right-click > Duplicate, which does copy sessionStorage — a
// fresh tab opened normally does not.) So on web this swaps to sessionStorage.
//
// Native (iOS/Android) has no concept of "tabs" at all, so it keeps using
// AsyncStorage's real native storage exactly as before — this only changes
// behavior for the web app.
const webStorage = {
  getItem: async (key) => {
    try {
      return window.sessionStorage.getItem(key);
    } catch (err) {
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (err) {
      // Private-browsing / storage-disabled edge case — fail silently,
      // same as AsyncStorage would on a platform quirk.
    }
  },
  removeItem: async (key) => {
    try {
      window.sessionStorage.removeItem(key);
    } catch (err) {
      // ignore
    }
  },
  multiRemove: async (keys) => {
    try {
      keys.forEach((key) => window.sessionStorage.removeItem(key));
    } catch (err) {
      // ignore
    }
  },
};

const storage = Platform.OS === 'web' ? webStorage : AsyncStorage;

export default storage;