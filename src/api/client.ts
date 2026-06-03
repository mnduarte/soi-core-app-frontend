import axios from 'axios';
import { useAuthStore } from '../store/auth.store';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const apiClient = axios.create({ baseURL: API_URL, withCredentials: true });

let isRefreshing = false;
let failedQueue: { resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
}

apiClient.interceptors.request.use(config => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;
    if (err.response?.status !== 401 || original._retry) {
      return Promise.reject(err);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(token => {
        original.headers.Authorization = `Bearer ${token}`;
        return apiClient(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      useAuthStore.getState().clearAuth();
      return Promise.reject(err);
    }

    try {
      const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
      const newToken = data.data?.accessToken ?? data.accessToken;
      useAuthStore.getState().setAuth({ ...data.data, accessToken: newToken });
      localStorage.setItem('refreshToken', data.data?.refreshToken ?? data.refreshToken);
      processQueue(null, newToken);
      original.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(original);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      useAuthStore.getState().clearAuth();
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);
