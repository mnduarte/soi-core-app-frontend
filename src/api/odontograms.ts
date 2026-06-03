import { apiClient } from './client';

// Two-color convention from the printed ficha de papel:
//   EXISTING → red  · what's already there (existing fillings, crowns, ausentes)
//   REQUIRED → blue · plan items / diagnostic findings to act on
// "En curso" is a state of the *plan item*, not the tooth — it's not here.
export type ToothConditionStatus = 'EXISTING' | 'REQUIRED';

// Surfaces follow the FDI codes used in dental notation.
//   M = mesial · D = distal · V = vestibular/bucal · L = lingual/palatino
//   O = oclusal/incisal · all = whole tooth (extracción, ausente, corona, …)
export type ToothSurface = 'M' | 'D' | 'V' | 'L' | 'O' | 'all';

export interface ToothCondition {
  surface: ToothSurface | string;
  condition: string;
  status: ToothConditionStatus;
  notes?: string;
}

export interface ToothState {
  toothNumber: number;
  conditions: ToothCondition[];
  status?: string;
  notes?: string;
}

export interface Odontogram {
  _id: string;
  patientId: string;
  teeth: ToothState[];
  version: number;
}

export type OdontogramOp =
  | { type: 'set_condition'; toothNumber: number; condition: ToothCondition }
  | { type: 'remove_condition'; toothNumber: number; surface: string }
  | { type: 'set_status'; toothNumber: number; status: string }
  | { type: 'set_notes'; toothNumber: number; notes: string };

export const odontogramsApi = {
  get: (patientId: string) =>
    apiClient
      .get<{ data: Odontogram }>(`/patients/${patientId}/odontogram`)
      .then(r => r.data.data),

  applyOps: (patientId: string, ops: OdontogramOp[], saveSnapshot = false) =>
    apiClient
      .patch<{ data: Odontogram }>(`/patients/${patientId}/odontogram`, { ops, saveSnapshot })
      .then(r => r.data.data),
};
