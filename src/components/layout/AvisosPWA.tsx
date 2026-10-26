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
    needRefresh: [hayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW({
    /*
     * Cuándo se pregunta si hay versión nueva.
     *
     * Por defecto el navegador consulta UNA vez, al registrar el service
     * worker, y después cuando se le canta. Eso era la demora de diez segundos
     * al abrir, y peor: una sesión larga podía pasar el día entero con la
     * versión vieja sin enterarse.
     *
     * Acá se pregunta en los tres momentos que importan: al arrancar, cada vez
     * que la app vuelve al frente —que es cuando alguien la retoma— y cada
     * minuto mientras está abierta. Es un pedido chico por un archivo que el
     * servidor contesta con 304 si no cambió; al lado del heartbeat de datos
     * que ya corre cada diez segundos, no se nota.
     */
    onRegisteredSW(_url, r) {
      if (!r) return;
      void r.update();
      setInterval(() => void r.update(), 60_000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void r.update();
      });
    },
  });
  const { modo, instalar, descartar, marcarComoInstalada } = useInstalarApp();
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

  /**
   * ¿Ya hizo algo en esta sesión?
   *
   * Es lo que separa un momento seguro de uno peligroso. Recargar cuando
   * recién abrió la app no le saca nada a nadie; recargar mientras está
   * cobrando le cambia la pantalla debajo de la mano.
   */
  const interactuo = useRef(false);

  /**
   * Freno contra el bucle de recargas.
   *
   * Recargar solo es cómodo hasta que algo impide que la versión nueva se
   * active: ahí la app vuelve a abrir, vuelve a encontrar la actualización
   * pendiente y vuelve a recargar, para siempre, sin que nadie pueda usarla.
   *
   * Si ya se recargó sola hace menos de un minuto, no se insiste: queda el
   * cartel, que al menos es algo que se puede tocar o ignorar.
   */
  const puedeRecargarSola = () => {
    try {
      const ultima = Number(sessionStorage.getItem('soi.pwa-recarga') ?? 0);
      if (Date.now() - ultima < 60_000) return false;
      sessionStorage.setItem('soi.pwa-recarga', String(Date.now()));
    } catch { /* sin storage: que siga, es el camino bueno */ }
    return true;
  };
  useEffect(() => {
    const marcar = () => { interactuo.current = true; };
    document.addEventListener('pointerdown', marcar, { once: true });
    document.addEventListener('keydown', marcar, { once: true });
    return () => {
      document.removeEventListener('pointerdown', marcar);
      document.removeEventListener('keydown', marcar);
    };
  }, []);

  /**
   * Aplicar la versión nueva, sola, en los momentos en que no molesta.
   *
   * En el navegador (no instalada) se destraba en silencio y entra al
   * recargar, como antes.
   *
   * Instalada hay dos momentos seguros, y en los dos se recarga sin preguntar:
   *  · Recién abrió y todavía no tocó nada.
   *  · Volvió a la app después de tenerla atrás — retomarla ES el corte.
   *
   * Si aparece en pleno uso no se toca nada: queda el cartel, que ahora no se
   * puede posponer. Y aunque lo ignore, la próxima vez que salga y vuelva se
   * actualiza sola. Esa es la garantía de que nadie se queda con una versión
   * vieja sin haber decidido quedarse.
   */
  useEffect(() => {
    if (!hayVersionNueva || yaAplicada.current) return;

    if (!instalada) {
      yaAplicada.current = true;
      // `false` = no recargar ahora. Solo destraba la versión nueva.
      void updateServiceWorker(false);
      return;
    }

    if (!interactuo.current && puedeRecargarSola()) {
      yaAplicada.current = true;
      void updateServiceWorker(true);
      return;
    }

    const alVolver = () => {
      if (document.visibilityState !== 'visible' || yaAplicada.current) return;
      if (!puedeRecargarSola()) return;
      yaAplicada.current = true;
      void updateServiceWorker(true);
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [hayVersionNueva, instalada, updateServiceWorker]);

  /*
   * Hay una versión nueva y apareció en pleno uso.
   *
   * Solo dentro de la app instalada (ver `instalada` arriba) y solo si ya
   * estaba trabajando: si acababa de abrir, el efecto de arriba ya recargó y
   * acá no se llega nunca.
   *
   * No tiene "Después". Posponer era quedarse con la versión vieja sin fecha
   * de vencimiento, y lo que se arrastra suele ser justo un arreglo. Si no lo
   * toca, igual se actualiza sola la próxima vez que salga y vuelva a la app.
   */
  if (hayVersionNueva && instalada) {
    return (
      <div className="pwa-nueva" role="status">
        <div className="pwa-nueva__txt">
          <strong>Hay una versión nueva</strong>
          <span>Se aplica en un segundo, o sola cuando vuelvas a la app.</span>
        </div>
        <div className="pwa-nueva__btns">
          <button
            className="btn btn--primary btn--sm"
            onClick={() => { yaAplicada.current = true; void updateServiceWorker(true); }}
          >
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

  /*
   * Quedó instalada.
   *
   * El navegador no dice nada cuando termina: agrega el ícono y sigue. Sin
   * este cartel queda la duda de si pasó algo, y sobre todo de dónde quedó.
   *
   * No se puede abrir la app instalada desde acá: ningún sistema lo permite
   * —sería una puerta para que cualquier página te saque de donde estás—, así
   * que lo único honesto es decir dónde está el ícono.
   */
  if (modo === 'listo') {
    return (
      <div className="pwa-inst" role="status">
        <div className="pwa-inst__ic pwa-inst__ic--ok" aria-hidden="true">
          <Icon name="check" size={18} />
        </div>
        <div className="pwa-inst__txt">
          <strong>SOI quedó instalada</strong>
          <span>
            Buscá el ícono en tu pantalla de inicio: desde ahí entra directo, sin
            pasar por el navegador.
          </span>
        </div>
        <div className="pwa-inst__btns">
          <button className="btn btn--primary btn--sm" onClick={descartar}>
            Listo
          </button>
        </div>
      </div>
    );
  }

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
            Queda con ícono propio y abre a pantalla completa. La primera vez
            puede pedirte tu usuario de nuevo.
          </span>
        )}
      </div>

      <div className="pwa-inst__btns">
        <button className="btn btn--ghost btn--sm" onClick={descartar}>
          Ahora no
        </button>
        {modo === 'boton' ? (
          <button className="btn btn--primary btn--sm" onClick={() => void instalar()}>
            Instalar
          </button>
        ) : (
          /* En iPhone el navegador no avisa nunca si la agregaron, ni antes ni
             después. La única forma de no volver a molestar a quien ya la tiene
             es que lo diga: esto no la instala, apaga el ofrecimiento. */
          <button className="btn btn--secondary btn--sm" onClick={marcarComoInstalada}>
            Ya la instalé
          </button>
        )}
      </div>
    </div>
  );
}
