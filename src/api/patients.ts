import { apiClient } from './client';

export interface Patient {
  _id: string;
  name: string;
  lastName: string;
  dni?: string;
  birthDate?: string;
  age?: number;
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

  restore: (id: string) =>
    apiClient.post<{ data: { ok: boolean } }>(`/patients/${id}/restore`).then(r => r.data.data),

  // Reads a paper record photo (base64, no data: prefix) → extracted fields +
  // possible existing patient match (to avoid double-loading).
  scanFicha: (image: string, mediaType: string) =>
    apiClient
      .post<{ data: ScanFichaResult }>('/patients/scan', { image, mediaType })
      .then(r => r.data.data),
};

export interface ScanFichaResult {
  extracted: {
    name?: string;
    lastName?: string;
    birthDate?: string;
    age?: string;
    dni?: string;
    phone?: string;
    email?: string;
    obraSocial?: string;
    address?: string;
    locality?: string;
    notes?: string;
  };
  existing: { _id: string; name: string; lastName: string; deleted: boolean } | null;
}
