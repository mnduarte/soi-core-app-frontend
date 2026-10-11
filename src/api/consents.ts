import { apiClient } from './client';

export type ConsentStatus = 'PENDING' | 'SIGNED';
export type ConsentOrigin = 'OFFICE' | 'LINK' | 'PAPER';

export interface Consent {
  _id: string;
  patientId: string;
  templateId?: string;
  templateVersionId?: string;
  templateVersionN?: number;
  templateName: string;
  workId?: string;
  /** Texto congelado con las variables ya reemplazadas. Inmutable. */
  finalText: string;
  dni?: string;
  status: ConsentStatus;
  origin: ConsentOrigin;
  professionalId?: string;
  signedAt?: string;
  /** PNG de la firma en data URI. Solo viene si está firmado. */
  signaturePng?: string;
  /** SHA-256 que calcula el servidor al firmar. */
  hash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConsentDto {
  templateId?: string;
  templateVersionId?: string;
  templateVersionN?: number;
  templateName: string;
  finalText: string;
  workId?: string;
  dni?: string;
}

export const consentsApi = {
  findAll: (patientId: string) =>
    apiClient
      .get<{ data: Consent[] }>(`/patients/${patientId}/consents`)
      .then(r => r.data.data),

  create: (patientId: string, dto: CreateConsentDto) =>
    apiClient
      .post<{ data: Consent }>(`/patients/${patientId}/consents`, dto)
      .then(r => r.data.data),

  sign: (patientId: string, id: string, dto: { signaturePng: string; dni?: string }) =>
    apiClient
      .post<{ data: Consent }>(`/patients/${patientId}/consents/${id}/sign`, dto)
      .then(r => r.data.data),

  remove: (patientId: string, id: string) =>
    apiClient.delete(`/patients/${patientId}/consents/${id}`),

  /** Ids de trabajos con consentimiento firmado, para el sello en la hoja
   *  de Trabajos y pagos. */
  signedWorks: (patientId: string) =>
    apiClient
      .get<{ data: string[] }>(`/patients/${patientId}/consents/signed-works`)
      .then(r => r.data.data),
};
