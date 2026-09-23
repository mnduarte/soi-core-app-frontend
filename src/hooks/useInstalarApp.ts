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
/** Cuánto se calla después de un "ahora no". Dos semanas: lo suficiente para no
 *  ser el cartel que aparece siempre, poco para que no se olvide del todo. */
const DIAS_DE_SILENCIO = 14;
/** No aparece apenas entra: primero que use la app y vea que le sirve. */
const ESPERA_MS = 30_000;

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

export type ModoInstalacion = 'boton' | 'ios';

export function useInstalarApp() {
  const [modo, setModo] = useState<ModoInstalacion | null>(null);
  // Se lee al crear el estado, no dentro del efecto: el aviso ya está ahí desde
  // antes de que React monte, y cambiar estado dentro de un efecto encadena un
  // render de más.
  const [evento, setEvento] = useState<EventoInstalacion | null>(() => window.__soiInstalar);
  const habiaAviso = useRef(Boolean(window.__soiInstalar));

  useEffect(() => {
    // `?instalar=1` lo muestra ya mismo y saltea el silencio: sirve para
    // probarlo sin esperar medio minuto ni limpiar el navegador.
    const forzar = new URLSearchParams(window.location.search).get('instalar') === '1';
    if (!forzar && (yaInstalada() || descartadaHacePoco())) return;
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
    const alInstalar = () => {
      setModo(null);
      try { localStorage.setItem(CLAVE, String(Date.now())); } catch { /* sin storage */ }
    };

    window.addEventListener('beforeinstallprompt', alPoder);
    window.addEventListener('appinstalled', alInstalar);

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
      window.removeEventListener('appinstalled', alInstalar);
      window.clearTimeout(espera);
    };
  }, []);

  const instalar = async () => {
    if (!evento) return;
    await evento.prompt();
    // Se haya aceptado o no, el evento sirve una sola vez.
    window.__soiInstalar = null;
    setEvento(null);
    setModo(null);
  };

  const descartar = () => {
    setModo(null);
    try { localStorage.setItem(CLAVE, String(Date.now())); } catch { /* sin storage */ }
  };

  return { modo, instalar, descartar };
}
