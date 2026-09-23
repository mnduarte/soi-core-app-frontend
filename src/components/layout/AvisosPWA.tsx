import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon } from '../common/Icon';
import { useInstalarApp } from '../../hooks/useInstalarApp';

/**
 * Los dos carteles de la app instalable, en un solo lugar y **de a uno**.
 *
 * Están juntos porque compiten: son dos pedidos distintos en la misma esquina
 * de la pantalla, y dos cosas para decidir al mismo tiempo terminan en que no
 * se decide ninguna. Gana el de actualizar: es un toque, se resuelve y se va.
 * El de instalar vuelve solo en la próxima visita.
 *
 * Además `useRegisterSW` tiene que llamarse una sola vez en toda la app —es el
 * que registra el service worker—, así que este componente es también el lugar
 * donde eso pasa.
 */
export function AvisosPWA() {
  const {
    needRefresh: [hayVersionNueva, setHayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW();
  const { modo, instalar, descartar } = useInstalarApp();
  /*
   * ¿Está abierta como app instalada o como pestaña del navegador?
   *
   * Cambia qué se hace con una versión nueva:
   *
   * - **Instalada**: se avisa y decide la persona. Ahí no hay barra de
   *   direcciones ni botón de recargar; si no se lo ofrecemos nosotros, no
   *   tiene forma de actualizar.
   * - **En el navegador**: entra sola en la próxima recarga, sin molestar. No
   *   se recarga en el momento a propósito: cambiaría la pantalla debajo de la
   *   mano de alguien que está cobrando.
   *
   * Y es necesario hacer algo, porque desde que existe la copia local recargar
   * con F5 ya no alcanza: la versión nueva se queda esperando a que se cierren
   * todas las pestañas. Con esto se activa igual, lista para el próximo ingreso.
   */
  const [instalada] = useState(
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
  );
  const yaAplicada = useRef(false);

  useEffect(() => {
    if (!hayVersionNueva || instalada || yaAplicada.current) return;
    yaAplicada.current = true;
    // `false` = no recargar ahora. Solo destraba la versión nueva.
    void updateServiceWorker(false);
  }, [hayVersionNueva, instalada, updateServiceWorker]);

  /*
   * Hay una versión nueva.
   *
   * Solo dentro de la app instalada (ver `instalada` arriba). Avisa y espera:
   * no se actualiza solo porque recargar sin permiso cambiaría la pantalla
   * debajo de la mano de alguien que está cobrando.
   */
  if (hayVersionNueva && instalada) {
    return (
      <div className="pwa-nueva" role="status">
        <div className="pwa-nueva__txt">
          <strong>Hay una versión nueva</strong>
          <span>Trae las últimas mejoras. Se aplica en un segundo.</span>
        </div>
        <div className="pwa-nueva__btns">
          <button className="btn btn--ghost btn--sm" onClick={() => setHayVersionNueva(false)}>
            Después
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => void updateServiceWorker(true)}>
            Actualizar
          </button>
        </div>
      </div>
    );
  }

  /*
   * Instalá SOI en este dispositivo.
   *
   * Existe porque los navegadores dejaron de ofrecerlo solos: en escritorio
   * queda un iconito en la barra de direcciones que nadie mira, en Android está
   * enterrado en el menú, y en iPhone no hay nada. Sin este cartel, la app
   * instalable no se instala nunca.
   */
  if (!modo) return null;

  return (
    <div className="pwa-inst" role="dialog" aria-label="Instalar la aplicación">
      <div className="pwa-inst__ic" aria-hidden="true">
        <Icon name="smartphone" size={18} />
      </div>

      <div className="pwa-inst__txt">
        <strong>Tené SOI a mano</strong>
        {modo === 'boton' ? (
          <span>Se instala en este dispositivo y abre en pantalla completa, sin el navegador.</span>
        ) : (
          /* iPhone: no hay botón posible, solo se puede explicar el camino. Los
             dos pasos van con los nombres exactos que usa iOS, para que se
             puedan buscar con la vista sin traducir nada. */
          <span>
            Tocá <strong>Compartir</strong> abajo y elegí <strong>Agregar a inicio</strong>.
            Queda con ícono propio y abre a pantalla completa.
          </span>
        )}
      </div>

      <div className="pwa-inst__btns">
        <button className="btn btn--ghost btn--sm" onClick={descartar}>
          {modo === 'boton' ? 'Ahora no' : 'Entendido'}
        </button>
        {modo === 'boton' && (
          <button className="btn btn--primary btn--sm" onClick={() => void instalar()}>
            Instalar
          </button>
        )}
      </div>
    </div>
  );
}
