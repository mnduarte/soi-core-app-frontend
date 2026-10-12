import { apiClient } from './client';

export interface ClinicalProfile {
  /** Matrícula profesional. Es el identificador que corresponde en un
   *  consentimiento informado, más que el DNI. */
  license?: string;
  /** Documento del profesional. */
  dni?: string;
  /** Firma dibujada una sola vez, en data URI. */
  signaturePng?: string;
  specialty?: string;
  agendaColor?: string;
}

export interface Me {
  _id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'MEMBER';
  isClinical: boolean;
  title?: 'DR' | 'DRA' | 'NONE' | null;
  clinicalProfile?: ClinicalProfile;
}

export interface UpdateMeDto {
  name?: string;
  title?: 'DR' | 'DRA' | 'NONE';
  clinicalProfile?: ClinicalProfile;
}

export const usersApi = {
  me: () => apiClient.get<{ data: Me }>('/users/me').then(r => r.data.data),

  /** Cada uno puede editar lo suyo: el backend solo reserva rol y permisos
   *  para el dueño. */
  updateMe: (id: string, dto: UpdateMeDto) =>
    apiClient.patch<{ data: Me }>(`/users/${id}`, dto).then(r => r.data.data),
};
