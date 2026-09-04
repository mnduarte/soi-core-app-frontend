import { apiClient } from './client';

// Mapa { recurso: updatedAtMs } que devuelve GET /changes. Las keys coinciden
// con las del backend (changes.service.ts COLLECTIONS). Un valor mayor que el
// visto antes = alguien tocó ese recurso (desde este u otro dispositivo).
export interface ClinicChanges {
  appointments: number;
  dayNotes: number;
  patients: number;
  works: number;
  transactions: number;
  gallery: number;
  odontograms: number;
  clinicalEntries: number;
}

/** Escalera de mora. La calcula el backend, en el mismo lugar donde corta el
 *  acceso: así el cartel no puede prometer algo distinto de lo que pasa. */
export type SubscriptionLevel = 'ok' | 'soft' | 'firm' | 'readonly' | 'blocked';

export interface SubscriptionState {
  level: SubscriptionLevel;
  /** true = la fecha de corte es el fin de la prueba, no un vencimiento de pago. */
  trial: boolean;
  daysOverdue: number;
  dueAt: string | null;
  readonlyAt: string | null;
  blockedAt: string | null;
}

export interface ChangesResponse {
  resources: ClinicChanges;
  subscription: SubscriptionState;
}

export const changesApi = {
  get: () => apiClient.get('/changes').then(r => r.data.data as ChangesResponse),
};
