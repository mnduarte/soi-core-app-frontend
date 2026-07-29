import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { changesApi, type ClinicChanges } from '../api/changes';
import { useAuthStore } from '../store/auth.store';

// Sync cross-device (Opción 2 — heartbeat de versiones).
//
// Se monta una sola vez en AppLayout. Pollea GET /changes cada ~12s (una
// request liviana: 1 doc por colección) y compara contra el mapa anterior.
// Cuando el updatedAt de un recurso sube, invalida SOLO las queryKeys de ese
// recurso → react-query refetchea las que estén activas en la página actual.
//
// Así no pollemos cada lista por separado: una request general decide qué
// refrescar. Reemplaza los refetchInterval:15s que tenían Agenda y Pacientes.
//
// Mapa recurso → queryKeys a invalidar. Las keys son prefijos: invalidar
// ['patient'] alcanza a ['patient', id], ['works'] a ['works', id, ...], etc.
const RESOURCE_QUERY_KEYS: Record<keyof ClinicChanges, string[][]> = {
  appointments: [['appointments']],
  dayNotes: [['day-notes']],
  patients: [['patients'], ['patient']],
  works: [['works']],
  transactions: [['transactions']],
  gallery: [['gallery-sessions']],
  odontograms: [['odontogram']],
  clinicalEntries: [['clinical-entries']],
};

const POLL_MS = 10_000;

export function useClinicChanges() {
  const qc = useQueryClient();
  const accessToken = useAuthStore(s => s.accessToken);
  const prev = useRef<ClinicChanges | null>(null);

  const { data } = useQuery({
    queryKey: ['clinic-changes'],
    queryFn: changesApi.get,
    enabled: !!accessToken,
    refetchInterval: POLL_MS,
    // No seguir pollando si la pestaña está en background: cuando el usuario
    // vuelve, refetchOnWindowFocus (default) trae el estado fresco igual.
    refetchIntervalInBackground: false,
    // Este heartbeat no tiene UI: nunca queremos mostrar su error ni reintentar
    // agresivo. Si falla una vuelta, la próxima lo resuelve.
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!data) return;
    const before = prev.current;
    prev.current = data;
    // Primera respuesta: solo guardamos la baseline, no invalidamos nada
    // (los datos de la página ya vienen frescos del load inicial).
    if (!before) return;

    for (const key of Object.keys(data) as (keyof ClinicChanges)[]) {
      if (data[key] > (before[key] ?? 0)) {
        for (const queryKey of RESOURCE_QUERY_KEYS[key]) {
          qc.invalidateQueries({ queryKey });
        }
      }
    }
  }, [data, qc]);
}
