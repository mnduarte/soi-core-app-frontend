import { apiClient } from './client';

export interface Patient {
  _id: string;
  name: string;
  lastName: string;
  dni?: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  address?: string;
  locality?: string;
  obraSocial?: string;
  nAfiliado?: string;
  isActive: boolean;
  medicalHistory?: {
    allergies?: string[];
    conditions?: string[];
    medications?: string[];
    notes?: string;
  };
}

export const patientsApi = {
  findAll: (search?: string) =>
    apiClient.get<{ data: Patient[] }>('/patients', { params: { search } }).then(r => r.data.data),

  findById: (id: string) =>
    apiClient.get<{ data: Patient }>(`/patients/${id}`).then(r => r.data.data),

  create: (dto: Partial<Patient>) =>
    apiClient.post<{ data: Patient }>('/patients', dto).then(r => r.data.data),

  update: (id: string, dto: Partial<Patient>) =>
    apiClient.patch<{ data: Patient }>(`/patients/${id}`, dto).then(r => r.data.data),

  remove: (id: string) =>
    apiClient.delete(`/patients/${id}`),
};
