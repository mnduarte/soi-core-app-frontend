import { useEffect, useState } from 'react';

/**
 * Página para mandar por WhatsApp: "entrá acá e instalala".
 *
 * Ningún link puede instalar una app — el navegador exige que el gesto pase
 * adentro de la página y decide él cuándo ofrecerlo. Lo más cerca que se puede
 * estar es esto: una pantalla cuyo único trabajo es instalar, con un botón
 * grande. Un toque en vez de buscar la opción en el menú.
 *
 * Va fuera de la sesión a propósito: se abre sin estar logueado, porque el
 * momento de instalar suele ser antes de entrar.
 *
 * Los cuatro caminos existen porque el mundo está partido:
 *  · Android/escritorio con el aviso listo → un botón y el diálogo nativo.
 *  · iPhone/iPad → no hay API ninguna; solo se puede explicar el menú Compartir.
 *  · Navegador de WhatsApp → NO se puede instalar desde ahí, pase lo que pase.
 *  · Ya instalada → no ofrecer de nuevo algo que ya tiene.
 */

type Evento = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const esIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPad moderno se declara Mac; lo delata que tenga pantalla táctil.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * El navegador de adentro de WhatsApp, Instagram o Facebook.
 *
 * Es el caso MÁS probable acá, justamente porque el link se manda por
 * WhatsApp. Desde ahí no se puede instalar nada: no es el navegador del
 * sistema, así que no tiene dónde poner el ícono. Si no se detecta, la persona
 * toca "Instalar", no pasa nada, y concluye que la app está rota.
 */
const esNavegadorDeApp = () => {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|Line\/|Twitter/i.test(ua)) return true;
  // WebView de Android: WhatsApp abre los links así.
  if (/\bwv\b/.test(ua)) return true;
  // iOS sin Safari en el UA = está adentro de otra app.
  if (esIOS() && !/Safari/i.test(ua)) return true;
  return false;
};

const yaInstalada = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

export default function InstalarPage() {
  // El aviso ya puede estar ahí desde antes de que React monte (lo atrapa el
  // script del index.html), así que se lee al crear el estado y no en un
  // efecto: así no encadena un render de más.
  const [evento, setEvento] = useState<Evento | null>(() => window.__soiInstalar);
  const [estado, setEstado] = useState<'ok' | 'rechazado' | null>(null);
  const [copiado, setCopiado] = useState(false);

  const enApp = esNavegadorDeApp();
  const ios = esIOS();
  const instalada = yaInstalada();

  useEffect(() => {
    // Y también puede llegar después de montar: pasa cuando el service
    // worker todavía no estaba listo al abrir la página.
    const alAvisar = (e: Event) => {
      e.preventDefault();
      setEvento(e as Evento);
    };
    window.addEventListener('beforeinstallprompt', alAvisar);
    const alInstalar = () => {
      setEstado('ok');
      // Misma marca que usa el cartel de adentro de la app, para que no
      // vuelva a ofrecer instalar algo que ya se instaló desde acá.
      try { localStorage.setItem('soi.app-instalada', '1'); } catch { /* sin storage */ }
    };
    window.addEventListener('appinstalled', alInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', alAvisar);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);

  const instalar = async () => {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    setEstado(outcome === 'accepted' ? 'ok' : 'rechazado');
    setEvento(null);
  };

  const copiar = () => {
    void navigator.clipboard?.writeText(window.location.origin).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  };

  return (
    <div className="inst">
      <div className="inst__caja">
        <img src="/icon-192.png" alt="" className="inst__icono" />
        <h1>SOI</h1>
        <p className="inst__sub">La agenda, la ficha y las cuentas de tu consultorio.</p>

        {instalada || estado === 'ok' ? (
          <>
            <p className="inst__ok">✓ Ya la tenés instalada</p>
            <a className="inst__btn" href="/">Abrir SOI</a>
          </>
        ) : enApp ? (
          /* Primero este caso: desde el navegador de WhatsApp no se puede
             instalar, y el link llega justamente por WhatsApp. */
          <>
            <p className="inst__paso">
              Estás viendo esto dentro de WhatsApp, y desde acá no se puede instalar.
            </p>
            <p className="inst__paso">
              Tocá los <b>tres puntitos</b> de arriba y elegí <b>"Abrir en el navegador"</b>.
              Después volvés a esta misma pantalla y aparece el botón.
            </p>
            <button className="inst__btn inst__btn--sec" onClick={copiar}>
              {copiado ? '✓ Link copiado' : 'Copiar el link'}
            </button>
          </>
        ) : ios ? (
          <>
            <p className="inst__paso">En iPhone y iPad se instala desde Safari:</p>
            <ol className="inst__pasos">
              <li>Tocá el botón <b>Compartir</b> (el cuadrado con la flecha para arriba).</li>
              <li>Bajá y elegí <b>"Agregar a pantalla de inicio"</b>.</li>
              <li>Tocá <b>Agregar</b>.</li>
            </ol>
            {/* Se avisa ANTES de que la instale, no después: es la función que
                más gusta y descubrir que dejó de andar justo después de
                instalar se siente como que la app se rompió. */}
            <p className="inst__ojo">
              Ojo: instalada en iPhone o iPad, <b>el dictado por voz no funciona</b> —
              es una limitación de Safari. Para dictar, abrila desde Safari normal.
            </p>
          </>
        ) : evento ? (
          <>
            <button className="inst__btn" onClick={instalar}>Instalar la app</button>
            <p className="inst__paso">Queda con su ícono, como cualquier otra app.</p>
          </>
        ) : (
          <>
            <p className="inst__paso">
              Tocá los <b>tres puntitos</b> de arriba a la derecha y elegí{' '}
              <b>"Instalar aplicación"</b> o <b>"Agregar a pantalla de inicio"</b>.
            </p>
            {estado === 'rechazado' && (
              <p className="inst__paso">Si cambiaste de idea, podés instalarla desde ahí.</p>
            )}
            <a className="inst__btn inst__btn--sec" href="/">Entrar sin instalar</a>
          </>
        )}
      </div>
    </div>
  );
}
