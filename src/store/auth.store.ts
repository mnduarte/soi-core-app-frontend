import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isClinical: boolean;
  // Honorific shown before the name (Dr./Dra.). Null/NONE = assistant, no prefix.
  title?: 'DR' | 'DRA' | 'NONE' | null;
}

interface ClinicInfo {
  id: string;
  name: string;
  logoUrl?: string;
  isReadonly: boolean;
  // ISO string of when the paid subscription expires (null while in trial).
  // Used by the in-app subscription banner to warn the dentist of upcoming
  // renewals or grace-period overruns.
  subscriptionEndsAt?: string | null;
  // ISO string of when the free trial expires (null after first payment).
  // The banner falls back to this when status is TRIAL.
  trialEndsAt?: string | null;
  brandColor?: string;
  status?: 'TRIAL' | 'ACTIVE' | 'SUSPENDED';
}

interface AuthStore {
  user: AuthUser | null;
  clinic: ClinicInfo | null;
  accessToken: string | null;
  // True when the current session was started from the backoffice via the
  // ?imp=TOKEN flow. Used to render the persistent support banner and to
  // skip persisting the refresh token (impersonation tokens are short-lived
  // and shouldn't survive a tab close).
  isImpersonating: boolean;
  setAuth: (payload: {
    user: AuthUser;
    clinic: ClinicInfo;
    accessToken: string;
    refreshToken: string;
  }) => void;
  setImpersonation: (payload: {
    user: AuthUser;
    clinic: ClinicInfo;
    accessToken: string;
  }) => void;
  clearAuth: () => void;
}

// We persist user/clinic/accessToken so a page refresh keeps the session.
// The accessToken may be expired by the time the user reloads — that's
// fine, the next API call 401s and the axios interceptor swaps in a fresh
// one using the refresh token (still in localStorage). Impersonation
// sessions are *not* persisted (see setImpersonation).
export const useAuthStore = create<AuthStore>()(
  persist(
    set => ({
      user: null,
      clinic: null,
      accessToken: null,
      isImpersonating: false,
      setAuth: ({ user, clinic, accessToken, refreshToken }) => {
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('soi.lastActivityAt', String(Date.now()));
        set({ user, clinic, accessToken, isImpersonating: false });
      },
      setImpersonation: ({ user, clinic, accessToken }) => {
        // Impersonation tokens are deliberately not persisted — closing the tab
        // ends the session. The refresh interceptor would also blow up because
        // there's no refresh token for this user.
        localStorage.removeItem('refreshToken');
        set({ user, clinic, accessToken, isImpersonating: true });
      },
      clearAuth: () => {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('soi.lastActivityAt');
        set({ user: null, clinic: null, accessToken: null, isImpersonating: false });
      },
    }),
    {
      name: 'soi.auth',
      storage: createJSONStorage(() => localStorage),
      partialize: state =>
        state.isImpersonating
          ? { user: null, clinic: null, accessToken: null, isImpersonating: false }
          : {
              user: state.user,
              clinic: state.clinic,
              accessToken: state.accessToken,
              isImpersonating: false,
            },
    },
  ),
);
