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
    // Auth-flow endpoints (login, lookup, setup-password, refresh, …) return
    // 401 to mean "bad credentials", NOT "token expired". Never run the
    // refresh-retry on those — otherwise a wrong password triggers a spurious
    // refresh + retry and the request hangs. (session-status DOES want the
    // refresh, so it's excluded from this guard.)
    const url: string = original?.url ?? '';
    const isAuthFlow = url.includes('/auth/') && !url.includes('/auth/session-status');
    if (err.response?.status !== 401 || original._retry || isAuthFlow) {
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
      // Backend tells us the session was kicked because the user logged
      // in from another device. Surface it on the login page rather than
      // dropping them into a silent reauth.
      const code = (refreshErr as {
        response?: { data?: { message?: { code?: string } } };
      })?.response?.data?.message?.code;
      window.location.replace(
        code === 'SESSION_REPLACED' ? '/login?reason=session-replaced' : '/login',
      );
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);
