import { apiClient } from './client';

export interface ClinicSettings {
  timezone?: string;
  appointmentDurationDefault?: number;
  allowOverlappingAppointments?: boolean;
  workingHours?: { day: number; start: string; end: string }[];
  reminderTemplates?: string[];
  quickAmounts?: number[];
  quickTreatments?: string[];
  slotTimes?: string[];
  photoCategories?: string[];
  logoUrl?: string;
}

export const clinicsApi = {
  getMe: () =>
    apiClient.get<{ data: unknown }>('/clinics/me').then(r => r.data.data),

  updateMe: (dto: { name?: string; brandColor?: string }) =>
    apiClient.patch<{ data: unknown }>('/clinics/me', dto).then(r => r.data.data),

  getSettings: () =>
    apiClient.get<{ data: ClinicSettings }>('/clinics/me/settings').then(r => r.data.data),

  updateSettings: (dto: Partial<ClinicSettings>) =>
    apiClient.patch<{ data: ClinicSettings }>('/clinics/me/settings', dto).then(r => r.data.data),
};
