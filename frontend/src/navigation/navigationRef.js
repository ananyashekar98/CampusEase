import { createNavigationContainerRef } from '@react-navigation/native';

// Lets code outside the navigation tree (App.js's push-notification tap
// handler, specifically) trigger a navigation without needing a `navigation`
// prop passed down to it.
export const navigationRef = createNavigationContainerRef();

export function navigate(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}