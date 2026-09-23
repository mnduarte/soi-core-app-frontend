import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * "Hay una versión nueva".
 *
 * Cuando la app está instalada guarda una copia de sí misma para abrir rápido,
 * así que lo que subimos a Vercel no aparece hasta que se reabre. Sin este
 * aviso, la trampa clásica es que el consultorio siga días con una versión
 * vieja sin enterarse —y encima sin barra del navegador, no hay ni botón de
 * recargar a mano.
 *
 * Avisa y espera. No se actualiza solo a propósito: recargar sin permiso
 * cambiaría la pantalla debajo de la mano de alguien que está cobrando.
 *
 * Solo aparece en la app instalada; en el navegador normal nunca hay service
 * worker en desarrollo y en producción el aviso es igual de válido.
 */
export function ActualizacionPWA() {
  const {
    needRefresh: [hayVersionNueva, setHayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW();

  if (!hayVersionNueva) return null;

  return (
    <div className="pwa-nueva" role="status">
      <div className="pwa-nueva__txt">
        <strong>Hay una versión nueva</strong>
        <span>Se aplica al actualizar. No perdés nada de lo que estás haciendo.</span>
      </div>
      <div className="pwa-nueva__btns">
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => setHayVersionNueva(false)}
        >
          Después
        </button>
        <button
          className="btn btn--primary btn--sm"
          onClick={() => void updateServiceWorker(true)}
        >
          Actualizar
        </button>
      </div>
    </div>
  );
}
