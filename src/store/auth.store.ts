import { create } from 'zustand';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isClinical: boolean;
}

interface ClinicInfo {
  id: string;
  name: string;
  logoUrl?: string;
  isReadonly: boolean;
}

interface AuthStore {
  user: AuthUser | null;
  clinic: ClinicInfo | null;
  accessToken: string | null;
  setAuth: (payload: { user: AuthUser; clinic: ClinicInfo; accessToken: string; refreshToken: string }) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>(set => ({
  user: null,
  clinic: null,
  accessToken: null,
  setAuth: ({ user, clinic, accessToken, refreshToken }) => {
    localStorage.setItem('refreshToken', refreshToken);
    set({ user, clinic, accessToken });
  },
  clearAuth: () => {
    localStorage.removeItem('refreshToken');
    set({ user: null, clinic: null, accessToken: null });
  },
}));
