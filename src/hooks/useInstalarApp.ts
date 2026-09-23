import { useEffect, useRef, useState } from 'react';

/**
 * ¿Se puede ofrecer instalar la app, y cómo?
 *
 * Hay dos mundos distintos:
 *
 * - **Android y escritorio**: el navegador avisa con `beforeinstallprompt` que
 *   la app cumple los requisitos. Se lo intercepta (si no, en escritorio queda
 *   escondido en un iconito de la barra de direcciones y en Android adentro del
 *   menú) y se guarda para dispararlo cuando la persona toque nuestro botón.
 * - **iPhone**: no existe ninguna API. Lo único que se puede hacer es explicar
 *   los dos pasos del menú Compartir. Por eso son dos modos y no uno.
 *
 * Nunca se ofrece si ya está instalada: `display-mode: standalone` lo dice en
 * todos lados, y `navigator.standalone` es el equivalente viejo de iOS.
 */
type EventoInstalacion = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
  interface Window {
    /** Lo deja el script del index.html, que escucha antes que React. */
    __soiInstalar: EventoInstalacion | null;
  }
}

const CLAVE = 'soi.instalar-descartado';
/**
 * "Esta app ya está instalada en este equipo". Se escribe para siempre.
 *
 * `display-mode: standalone` solo dice si estás DENTRO de la app instalada; no
 * sirve cuando la misma persona abre el sitio en el navegador. En Android y en
 * escritorio eso alcanza igual, porque el navegador deja de ofrecer la
 * instalación por su cuenta. El problema es el iPhone: no avisa nunca, ni antes
 * ni después, así que sin esta marca volveríamos a explicarle cómo instalar
 * algo que ya tiene.
 */
const CLAVE_INSTALADA = 'soi.app-instalada';
/** Cuánto se calla después de un "ahora no". Dos semanas: lo suficiente para no
 *  ser el cartel que aparece siempre, poco para que no se olvide del todo. */
const DIAS_DE_SILENCIO = 14;
/** No aparece apenas entra: primero que use la app y vea que le sirve. */
const ESPERA_MS = 30_000;

function marcarInstalada(): void {
  try { localStorage.setItem(CLAVE_INSTALADA, '1'); } catch { /* sin storage */ }
}

function constaInstalada(): boolean {
  try { return localStorage.getItem(CLAVE_INSTALADA) === '1'; } catch { return false; }
}

function yaInstalada(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function esIOS(): boolean {
  const ua = navigator.userAgent;
  // El iPad moderno se presenta como Mac: se lo reconoce porque el Mac de
  // verdad no tiene pantalla táctil.
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function descartadaHacePoco(): boolean {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (!guardado) return false;
    const dias = (Date.now() - Number(guardado)) / 86_400_000;
    return dias < DIAS_DE_SILENCIO;
  } catch {
    return false;
  }
}

/**
 * - `boton`: el navegador puede instalarla y mostramos el botón.
 * - `ios`: no hay API, se explican los dos pasos a mano.
 * - `listo`: recién terminó de instalarse. Nadie avisa que la instalación
 *   salió bien —el navegador la agrega y punto—, así que si no lo decimos
 *   nosotros queda la duda de si pasó algo.
 */
export type ModoInstalacion = 'boton' | 'ios' | 'listo';

export function useInstalarApp() {
  const [modo, setModo] = useState<ModoInstalacion | null>(null);
  // Se lee al crear el estado, no dentro del efecto: el aviso ya está ahí desde
  // antes de que React monte, y cambiar estado dentro de un efecto encadena un
  // render de más.
  const [evento, setEvento] = useState<EventoInstalacion | null>(() => window.__soiInstalar);
  const habiaAviso = useRef(Boolean(window.__soiInstalar));

  // El aviso de "quedó instalada" se escucha SIEMPRE, incluso si el ofrecimiento
  // estaba silenciado: puede instalarla desde el menú del navegador por su
  // cuenta, y el momento de confirmarlo es ese.
  useEffect(() => {
    const alInstalarse = () => {
      setModo('listo');
      marcarInstalada();
    };
    window.addEventListener('appinstalled', alInstalarse);
    // Abrirla desde el ícono también lo confirma. En Android y escritorio la
    // app instalada comparte el almacenamiento con el navegador, así que la
    // marca queda puesta para las dos. En iPhone no se comparte: ahí lo
    // resuelve el botón "Ya la instalé".
    if (yaInstalada()) marcarInstalada();
    return () => window.removeEventListener('appinstalled', alInstalarse);
  }, []);

  useEffect(() => {
    // `?instalar=1` lo muestra ya mismo y saltea el silencio: sirve para
    // probarlo sin esperar medio minuto ni limpiar el navegador.
    const forzar = new URLSearchParams(window.location.search).get('instalar') === '1';
    if (!forzar && (yaInstalada() || constaInstalada() || descartadaHacePoco())) return;
    const demora = forzar ? 0 : ESPERA_MS;

    let espera = 0;
    let visible = false;
    const mostrar = (m: ModoInstalacion) => {
      if (visible) return;
      visible = true;
      setModo(m);
    };

    const alPoder = (e: Event) => {
      // Sin esto, Chrome decide solo cuándo y cómo ofrecerlo.
      e.preventDefault();
      setEvento(e as EventoInstalacion);
      espera = window.setTimeout(() => mostrar('boton'), demora);
    };

    window.addEventListener('beforeinstallprompt', alPoder);

    // Lo más común: el aviso ya llegó mientras cargaba la página y quedó
    // guardado por el script del index.html. Sin esto el cartel no aparecía
    // nunca en escritorio ni en Android — el evento ya había pasado.
    if (habiaAviso.current) espera = window.setTimeout(() => mostrar('boton'), demora);
    // En iPhone el evento no llega nunca, así que la espera se arma acá.
    // El modo iPhone es también el respaldo: si el navegador no avisó que puede
    // instalar, explicar el camino a mano es lo único que queda. En la prueba
    // forzada espera un momento, para darle tiempo al aviso del navegador y no
    // mostrar las instrucciones de iOS en una computadora.
    if (esIOS() || forzar) {
      espera = window.setTimeout(() => mostrar('ios'), forzar && !esIOS() ? 1200 : demora);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', alPoder);
      window.clearTimeout(espera);
    };
  }, []);

  const instalar = async () => {
    if (!evento) return;
    await evento.prompt();
    // Se haya aceptado o no, el evento sirve una sola vez. Si aceptó, el
    // cartel de "quedó instalada" lo levanta el otro efecto.
    window.__soiInstalar = null;
    setEvento(null);
    setModo(null);
  };

  /** "Ahora no": vuelve a ofrecerse en dos semanas. */
  const descartar = () => {
    setModo(null);
    try { localStorage.setItem(CLAVE, String(Date.now())); } catch { /* sin storage */ }
  };

  /** "Ya la instalé": no se ofrece nunca más en este navegador. */
  const marcarComoInstalada = () => {
    setModo(null);
    marcarInstalada();
  };

  return { modo, instalar, descartar, marcarComoInstalada };
}
