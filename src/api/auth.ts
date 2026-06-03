import { apiClient } from './client';

export interface LoginPayload {
  email: string;
  password: string;
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
  };
  clinic: {
    id: string;
    name: string;
    logoUrl?: string;
    isReadonly: boolean;
  };
}

export const authApi = {
  login: (dto: LoginPayload) =>
    apiClient.post<{ data: LoginResponse }>('/auth/login', dto).then(r => r.data.data),

  refresh: (refreshToken: string) =>
    apiClient.post<{ data: LoginResponse }>('/auth/refresh', { refreshToken }).then(r => r.data.data),

  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refreshToken }),

  acceptInvitation: (dto: {
    token: string;
    name: string;
    password: string;
    license?: string;
    specialty?: string;
    agendaColor?: string;
  }) => apiClient.post<{ data: LoginResponse }>('/auth/accept-invitation', dto).then(r => r.data.data),
};
