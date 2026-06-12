import { apiClient } from './client';

// Treatment item lifecycle. Mirrors the printed practice workflow:
//   PROPOSED    → diagnosed / propuesto, no turno yet
//   SCHEDULED   → tiene turno agendado
//   IN_PROGRESS → multi-session, started but not finished
//   COMPLETED   → done (this is what flips the matching tooth from REQUIRED
//                 azul to EXISTING rojo in the odontograma)
//   RECURRENT   → ongoing controls (brackets, etc.) — no terminal state
//   CANCELLED   → dropped
export type TreatmentItemStatus =
  | 'PROPOSED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'RECURRENT'
  | 'CANCELLED';

export interface TreatmentItem {
  _id: string;
  description: string;
  toothNumber?: string;
  surface?: string;
  price: number;
  status: TreatmentItemStatus;
  estimatedDate?: string;
  notes?: string;
}

export interface TreatmentPlan {
  _id: string;
  patientId: string;
  title: string;
  notes?: string;
  items: TreatmentItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AddTreatmentItemInput {
  description: string;
  toothNumber?: string;
  surface?: string;
  status?: TreatmentItemStatus;
  estimatedDate?: string;
  price?: number;
  notes?: string;
}

export const treatmentPlansApi = {
  findAll: (patientId: string) =>
    apiClient
      .get<{ data: TreatmentPlan[] }>(`/patients/${patientId}/treatment-plans`)
      .then(r => r.data.data),

  create: (
    patientId: string,
    dto: { title: string; notes?: string; items?: Partial<TreatmentItem>[] },
  ) =>
    apiClient
      .post<{ data: TreatmentPlan }>(`/patients/${patientId}/treatment-plans`, dto)
      .then(r => r.data.data),

  update: (patientId: string, planId: string, dto: { title?: string; notes?: string }) =>
    apiClient
      .patch<{ data: TreatmentPlan }>(`/patients/${patientId}/treatment-plans/${planId}`, dto)
      .then(r => r.data.data),

  updateItem: (
    patientId: string,
    planId: string,
    itemId: string,
    dto: Partial<TreatmentItem>,
  ) =>
    apiClient
      .patch<{ data: TreatmentPlan }>(
        `/patients/${patientId}/treatment-plans/${planId}/items/${itemId}`,
        dto,
      )
      .then(r => r.data.data),

  // Appends a single item to the patient's plan; the backend auto-creates the
  // plan document if none exists.
  addItem: (patientId: string, dto: AddTreatmentItemInput) =>
    apiClient
      .post<{ data: TreatmentPlan }>(`/patients/${patientId}/treatment-plans/items`, dto)
      .then(r => r.data.data),

  removeItem: (patientId: string, planId: string, itemId: string) =>
    apiClient.delete(`/patients/${patientId}/treatment-plans/${planId}/items/${itemId}`),
};
