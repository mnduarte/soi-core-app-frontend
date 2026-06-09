import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/auth.store';
import { authApi } from '../api/auth';

const IDLE_LIMIT_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
const STORAGE_KEY = 'soi.lastActivityAt';
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;

// Logs the user out after IDLE_LIMIT_MS of no activity. Activity is any
// user-initiated event in ACTIVITY_EVENTS. The timestamp lives in
// localStorage so closing the tab and reopening within the window keeps
// the session, but reopening *after* the window expires logs out — which
// matches what the backend will do anyway (refresh token TTL is 24h).
export function useIdleLogout() {
  const accessToken = useAuthStore(s => s.accessToken);
  const clearAuth = useAuthStore(s => s.clearAuth);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!accessToken) return;

    const stored = Number(localStorage.getItem(STORAGE_KEY));
    const now = Date.now();

    if (stored && now - stored > IDLE_LIMIT_MS) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) authApi.logout(refreshToken).catch(() => {});
      clearAuth();
      window.location.href = '/login?idle=1';
      return;
    }

    lastActivityRef.current = stored || now;
    localStorage.setItem(STORAGE_KEY, String(lastActivityRef.current));

    const touch = () => {
      const ts = Date.now();
      lastActivityRef.current = ts;
      localStorage.setItem(STORAGE_KEY, String(ts));
    };

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, touch, { passive: true });
    }

    const interval = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current > IDLE_LIMIT_MS) {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) authApi.logout(refreshToken).catch(() => {});
        localStorage.removeItem(STORAGE_KEY);
        clearAuth();
        window.location.href = '/login?idle=1';
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, touch);
      }
      window.clearInterval(interval);
    };
  }, [accessToken, clearAuth]);
}
