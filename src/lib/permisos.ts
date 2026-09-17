import { useAuthStore } from '../store/auth.store';

/**
 * Quién ve lo clínico: el titular y los profesionales. El Asistente (miembro
 * no clínico) atiende la recepción: agenda y datos de contacto, nada más.
 *
 * Es el espejo EXACTO de `veClinico` en el backend
 * (core-app-backend/src/common/guards/clinical.guard.ts). Acá solo decide qué
 * se muestra; lo que protege de verdad es el servidor, que rechaza los pedidos
 * aunque alguien escriba la dirección a mano.
 */
export function veClinico(user?: { role?: string; isClinical?: boolean } | null): boolean {
  return user?.role === 'OWNER' || user?.isClinical === true;
}

export function useVeClinico(): boolean {
  return useAuthStore(s => veClinico(s.user));
}
