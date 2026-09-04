import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { changesApi, type ChangesResponse, type ClinicChanges } from '../api/changes';
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
  // Pacientes va también: la lista trae `nextVisitAt`/`nextCount`, que se
  // calculan desde los turnos. Si no, un turno agendado en otro dispositivo
  // dejaba la columna "Próximo turno" y el buscador mostrando datos viejos.
  appointments: [['appointments'], ['patients']],
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
  const isImpersonating = useAuthStore(s => s.isImpersonating);
  const prev = useRef<ChangesResponse | null>(null);

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

  // Cuenta sin acceso: se cierra la sesión sola.
  //
  // El backend ya lo cortaba, pero recién en el `refresh` — o sea al vencer el
  // access token, hasta 15 minutos después. En el medio el consultorio seguía
  // navegando una cuenta que el backoffice ya muestra "sin acceso". Acá baja a
  // un latido (~10s) y no cuesta una request extra: el nivel ya venía en la
  // respuesta, solo que nadie lo miraba para esto.
  //
  // Es un aviso anticipado, NO el que manda: quien corta de verdad sigue
  // siendo el backend (`refresh` y el interceptor de escrituras). Si esto
  // fallara, lo peor que pasa es que tarde los 15 minutos de antes.
  useEffect(() => {
    // Durante una sesión de soporte no: el operador entra a impersonar
    // justamente para mirar la cuenta bloqueada, y esto lo patearía afuera.
    if (isImpersonating) return;
    if (data?.subscription?.level !== 'blocked') return;
    useAuthStore.getState().clearAuth();
    localStorage.removeItem('refreshToken');
    window.location.replace('/login?reason=expired');
  }, [data, isImpersonating]);

  useEffect(() => {
    if (!data) return;
    const before = prev.current;
    prev.current = data;
    // Primera respuesta: solo guardamos la baseline, no invalidamos nada
    // (los datos de la página ya vienen frescos del load inicial).
    if (!before) return;

    for (const key of Object.keys(data.resources) as (keyof ClinicChanges)[]) {
      // Un recurso nuevo en el backend que el front todavía no conoce no debe
      // romper el bucle: se ignora hasta que se le asignen queryKeys acá.
      const keys = RESOURCE_QUERY_KEYS[key];
      if (!keys) continue;
      if (data.resources[key] > (before.resources[key] ?? 0)) {
        for (const queryKey of keys) qc.invalidateQueries({ queryKey });
      }
    }
  }, [data, qc]);
}
