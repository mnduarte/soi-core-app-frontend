import { apiClient } from './client';

export type ClinicalEntryType = 'TREATMENT' | 'CONTROL' | 'PHOTO' | 'NOTE';

export interface ClinicalEntry {
  _id: string;
  patientId: string;
  appointmentId?: string;
  type: ClinicalEntryType;
  professionalId?: string;
  content: string;
  toothNumber?: number;
  procedure?: string;
  isCorrection: boolean;
  correctedEntryId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClinicalEntryDto {
  content: string;
  type?: ClinicalEntryType;
  // Si se documenta un turno, el backend lo enlaza y apaga su badge "ficha pendiente".
  appointmentId?: string;
  toothNumber?: number;
  procedure?: string;
}

export const clinicalEntriesApi = {
  findAll: (patientId: string) =>
    apiClient
      .get<{ data: ClinicalEntry[] }>(`/patients/${patientId}/clinical-entries`)
      .then(r => r.data.data),

  create: (patientId: string, dto: CreateClinicalEntryDto) =>
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
