import { apiClient } from './client';

// Ciclo de vida de un trabajo (espeja el enum del backend). Los no-terminales
// (PROPOSED → SCHEDULED → IN_PROGRESS → RECURRENT) son el "plan de tratamiento"
// (por hacer); COMPLETED es un hecho (suma a cobrar, queda en el historial);
// CANCELLED se descarta.
export type WorkStatus =
  | 'PROPOSED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'RECURRENT'
  | 'CANCELLED';

// Documento plano (colección propia `works`). Reemplaza a los ítems embebidos
// en TreatmentPlan.items: el historial de hechos escala a miles por paciente y
// se busca/pagina server-side. El `_id` es el mismo que vincula las fotos
// (`GalleryPhoto.treatmentItemId`).
export interface Work {
  _id: string;
  patientId: string;
  description: string;
  toothNumber?: string;
  surface?: string;
  price: number;
  status: WorkStatus;
  // Fecha en que se marcó hecho (la sella el backend). Solo si COMPLETED.
  completedAt?: string;
  estimatedDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Resumen agregado para la barra "Falta cobrar" (Σ precio de hechos, contadores).
export interface WorkSummary {
  realizado: number;
  hechosCount: number;
  pendienteTotal: number;
  pendienteCount: number;
}

export interface CreateWorkInput {
  patientId: string;
  description: string;
  toothNumber?: string;
  surface?: string;
  status?: WorkStatus;
  price?: number;
  estimatedDate?: string;
  notes?: string;
}

export const worksApi = {
  // status: 'pending' (plan) | 'done' (historial, ordenado por fecha de hecho) |
  // un estado puntual; q busca texto/monto; limit pagina el historial; from/to
  // (YYYY-MM-DD) acotan por fecha (completedAt en 'done', createdAt en el resto).
  findAll: (
    patientId: string,
    opts: { status?: string; q?: string; limit?: number; from?: string; to?: string } = {},
  ) =>
    apiClient
      .get<{ data: Work[] }>('/works', { params: { patientId, ...opts } })
      .then(r => r.data.data),

  summary: (patientId: string) =>
    apiClient
      .get<{ data: WorkSummary }>(`/works/summary/${patientId}`)
      .then(r => r.data.data),

  create: (dto: CreateWorkInput) =>
    apiClient.post<{ data: Work }>('/works', dto).then(r => r.data.data),

  update: (workId: string, dto: Partial<CreateWorkInput>) =>
    apiClient
      .patch<{ data: Work }>(`/works/${workId}`, dto)
      .then(r => r.data.data),

  remove: (workId: string) => apiClient.delete(`/works/${workId}`),
};
