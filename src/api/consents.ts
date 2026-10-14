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
  /** PNG de la firma del paciente, en data URI. Solo si está firmado. */
  signaturePng?: string;
  /** Identidad y firma del profesional, congeladas al firmar. */
  professionalName?: string;
  professionalLicense?: string;
  professionalDni?: string;
  professionalSignaturePng?: string;
  /** SHA-256 que calcula el servidor al firmar. */
  hash?: string;
  /**
   * Anulado: sigue estando y se sigue pudiendo descargar, pero ya no vale.
   * Lo firmado no se toca — texto, firmas y hash quedan verificables.
   */
  annulledAt?: string;
  annulledBy?: string;
  annulledReason?: string;
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

  /** Genera el link de un solo uso. El token viene en claro UNA vez. */
  crearLink: (patientId: string, id: string) =>
    apiClient
      .post<{ data: { token: string; expiresAt: string } }>(
        `/patients/${patientId}/consents/${id}/link`,
      )
      .then(r => r.data.data),

  remove: (patientId: string, id: string) =>
    apiClient.delete(`/patients/${patientId}/consents/${id}`),

  /**
   * Da de baja un firmado sin borrarlo. Un pendiente usa `remove`.
   *
   * La contraseña viaja en el mismo pedido y la verifica el servidor: pedirla
   * antes, por separado, dejaría un "ya verifiqué" del lado del cliente que
   * no prueba nada.
   */
  anular: (patientId: string, id: string, password: string, reason?: string) =>
    apiClient
      .post<{ data: Consent }>(`/patients/${patientId}/consents/${id}/annul`, {
        password,
        reason,
      })
      .then(r => r.data.data),

  /** Ids de trabajos con consentimiento firmado, para el sello en la hoja
   *  de Trabajos y pagos. */
  signedWorks: (patientId: string) =>
    apiClient
      .get<{ data: string[] }>(`/patients/${patientId}/consents/signed-works`)
      .then(r => r.data.data),
};
