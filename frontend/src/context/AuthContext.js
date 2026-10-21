import React, { createContext, useContext, useEffect, useState } from 'react';
import storage from '../utils/storage';
import api, { setSessionInvalidHandler } from '../api/client';
import { showAlert } from '../utils/alert';

const AuthContext = createContext(null);

const TOKEN_KEY = 'campusease_token';
const USER_KEY = 'campusease_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  // Restore session on app start
  useEffect(() => {
    (async () => {
      try {
        const [token, storedUser] = await Promise.all([
          storage.getItem(TOKEN_KEY),
          storage.getItem(USER_KEY),
        ]);
        if (token && storedUser) {
          setUser(JSON.parse(storedUser));
        }
      } catch (err) {
        console.warn('Failed to restore session:', err.message);
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  // If the server says this session is no longer valid (token expired, or an
  // admin reset the password), sign out right away and say why.
  useEffect(() => {
    let handling = false;
    setSessionInvalidHandler(async (message) => {
      if (handling) return;
      handling = true;
      await storage.multiRemove([TOKEN_KEY, USER_KEY]);
      setUser(null);
      showAlert('Signed out', message || 'Your session has ended — please log in again.');
      setTimeout(() => { handling = false; }, 1500);
    });
    return () => setSessionInvalidHandler(null);
  }, []);

  const persistSession = async (token, userData) => {
    await storage.setItem(TOKEN_KEY, token);
    await storage.setItem(USER_KEY, JSON.stringify(userData));
    setUser(userData);
  };

  const login = async (email, password) => {
    setAuthLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      await persistSession(data.token, data.user);
      return data.user;
    } finally {
      setAuthLoading(false);
    }
  };

  const register = async (payload) => {
    setAuthLoading(true);
    try {
      const { data } = await api.post('/auth/register', payload);
      await persistSession(data.token, data.user);
      return data.user;
    } finally {
      setAuthLoading(false);
    }
  };

  // Merge changes into the signed-in user (e.g. clearing mustChangePassword
  // after they choose a new password) and keep the stored copy in sync.
  const updateUser = async (patch) => {
    const next = { ...user, ...patch };
    await storage.setItem(USER_KEY, JSON.stringify(next));
    setUser(next);
  };

  const logout = async () => {
    await storage.multiRemove([TOKEN_KEY, USER_KEY]);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, initializing, authLoading, login, register, logout, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}