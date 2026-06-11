import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/auth.store';

// Backend reason → /login?reason=... param the LoginPage knows how to message.
const REASON_PARAM: Record<string, string> = {
  SUSPENDED: 'suspended',
  EXPIRED: 'expired',
  SESSION_REPLACED: 'session-replaced',
  BLOCKED: '',
};

// Polls /auth/session-status every 30s while the app is open so suspension and
// session eviction (device cap / remote logout) take effect near-real-time
// without WebSockets and without per-request cost. Skipped during
// impersonation — those tokens are short-lived and have no refresh session to
// check. On ok:false it clears the session and bounces to login with a reason.
export function useSessionGuard() {
  const accessToken = useAuthStore(s => s.accessToken);
  const isImpersonating = useAuthStore(s => s.isImpersonating);
  const clearAuth = useAuthStore(s => s.clearAuth);

  const { data } = useQuery({
    queryKey: ['session-status'],
    queryFn: authApi.sessionStatus,
    enabled: Boolean(accessToken) && !isImpersonating,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!data || data.ok) return;
    clearAuth();
    const param = REASON_PARAM[data.reason ?? 'BLOCKED'];
    // replace() so the now-invalid page is dropped from history — pressing
    // "back" won't return to it.
    window.location.replace(param ? `/login?reason=${param}` : '/login');
  }, [data, clearAuth]);

  // Back/forward cache: a forced-logout navigation doesn't re-run route loaders
  // when the user hits "back", so an authenticated page could be restored from
  // bfcache and flash until the next poll. If the session is gone (no refresh
  // token in storage), bounce straight to login instead of showing the panel.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && !localStorage.getItem('refreshToken')) {
        window.location.replace('/login');
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);
}
