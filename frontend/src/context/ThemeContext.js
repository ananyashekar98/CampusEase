import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, lightShadow, darkShadow } from '../theme/theme';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'campusease_theme_scheme';

export function ThemeProvider({ children }) {
  const [scheme, setScheme] = useState('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') {
          setScheme(stored);
        }
      } catch (err) {
        console.warn('Failed to restore theme preference:', err.message);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const toggleScheme = async () => {
    const next = scheme === 'light' ? 'dark' : 'light';
    setScheme(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch (err) {
      console.warn('Failed to persist theme preference:', err.message);
    }
  };

  const colors = scheme === 'dark' ? darkColors : lightColors;
  const shadow = scheme === 'dark' ? darkShadow : lightShadow;

  // Wait for the stored preference to load before rendering, so the app
  // doesn't flash light-then-dark on startup for a user who chose dark.
  if (!ready) return null;

  return (
    <ThemeContext.Provider value={{ scheme, colors, shadow, toggleScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider');
  return ctx;
}
