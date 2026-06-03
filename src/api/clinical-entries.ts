import { apiClient } from './client';

export interface ClinicalEntry {
  _id: string;
  patientId: string;
  professionalId?: string;
  content: string;
  toothNumber?: number;
  procedure?: string;
  isCorrection: boolean;
  correctedEntryId?: string;
  createdAt: string;
  updatedAt: string;
}

export const clinicalEntriesApi = {
  findAll: (patientId: string) =>
    apiClient
      .get<{ data: ClinicalEntry[] }>(`/patients/${patientId}/clinical-entries`)
      .then(r => r.data.data),

  create: (
    patientId: string,
    dto: { content: string; toothNumber?: number; procedure?: string },
  ) =>
    apiClient
      .post<{ data: ClinicalEntry }>(`/patients/${patientId}/clinical-entries`, dto)
      .then(r => r.data.data),

  update: (patientId: string, id: string, content: string) =>
    apiClient
      .patch<{ data: ClinicalEntry }>(`/patients/${patientId}/clinical-entries/${id}`, { content })
      .then(r => r.data.data),

  remove: (patientId: string, id: string) =>
    apiClient.delete(`/patients/${patientId}/clinical-entries/${id}`),
};
