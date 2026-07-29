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

export const changesApi = {
  get: () => apiClient.get('/changes').then(r => r.data.data as ClinicChanges),
};
