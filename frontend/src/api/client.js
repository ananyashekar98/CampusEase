import axios from 'axios';
import storage from '../utils/storage';

// In a deployed build this comes from the EXPO_PUBLIC_API_URL setting (see the deployment steps);
// on your own laptop it falls back to your computer's address.
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.68.21:5000/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 70000,
});

let onSessionInvalid = null;
export const setSessionInvalidHandler = (fn) => {
  onSessionInvalid = fn;
};

api.interceptors.request.use(async (config) => {
  const token = await storage.getItem('campusease_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data?.code === 'SESSION_INVALID' && onSessionInvalid) {
      onSessionInvalid(error.response.data.message);
    }
    const message =
      error.response?.data?.message ||
      error.message ||
      'Something went wrong. Please try again.';
    return Promise.reject(new Error(message));
  }
);

export default api;