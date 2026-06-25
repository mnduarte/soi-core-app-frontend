import { apiClient } from './client';

export interface LoginPayload {
  identifier?: string;
  email?: string;
  password: string;
}

export interface LookupResponse {
  exists: boolean;
  displayName?: string;
  title?: 'DR' | 'DRA' | 'NONE' | null;
  mustChangePassword?: boolean;
  clinic?: {
    name: string;
    brandColor: string;
    logoStyle: 'tooth' | 'mono';
  } | null;
}

export interface SetupPasswordPayload {
  identifier: string;
  currentPassword: string;
  newPassword: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    isClinical: boolean;
    title?: 'DR' | 'DRA' | 'NONE' | null;
  };
  clinic: {
    id: string;
    name: string;
    logoUrl?: string;
    isReadonly: boolean;
    subscriptionEndsAt?: string | null;
    trialEndsAt?: string | null;
    brandColor?: string;
    status?: 'TRIAL' | 'ACTIVE' | 'SUSPENDED';
  };
}

export const authApi = {
  login: (dto: LoginPayload) =>
    apiClient.post<{ data: LoginResponse }>('/auth/login', dto).then(r => r.data.data),

  lookup: (identifier: string) =>
    apiClient
      .post<{ data: LookupResponse }>('/auth/lookup', { identifier })
      .then(r => r.data.data),

  setupPassword: (dto: SetupPasswordPayload) =>
    apiClient
      .post<{ data: LoginResponse }>('/auth/setup-password', dto)
      .then(r => r.data.data),

  requestPasswordReset: (dto: { identifier: string; note?: string }) =>
    apiClient
      .post<{ data: { ok: boolean } }>('/auth/request-password-reset', dto)
      .then(r => r.data.data),

  refresh: (refreshToken: string) =>
    apiClient.post<{ data: LoginResponse }>('/auth/refresh', { refreshToken }).then(r => r.data.data),

  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refreshToken }),

  // Polled every ~30s while the app is open to enforce suspension / session
  // eviction near-real-time. reason maps to a /login?reason=... message.
  sessionStatus: () =>
    apiClient
      .get<{ data: { ok: boolean; reason?: 'SUSPENDED' | 'EXPIRED' | 'SESSION_REPLACED' | 'BLOCKED' } }>(
        '/auth/session-status',
      )
      .then(r => r.data.data),

  acceptInvitation: (dto: {
    token: string;
    name: string;
    password: string;
    license?: string;
    specialty?: string;
    agendaColor?: string;
  }) => apiClient.post<{ data: LoginResponse }>('/auth/accept-invitation', dto).then(r => r.data.data),
};
