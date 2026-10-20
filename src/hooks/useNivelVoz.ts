import { useEffect, type RefObject } from 'react';

/**
 * Hace que un elemento reaccione al volumen de la voz.
 *
 * Escribe un número de 0 a 1 en la variable CSS `--nivel` del elemento; el
 * estilo decide qué hacer con él. Mientras dictás, el micrófono respira con lo
 * que estás diciendo, y eso contesta sin palabras la pregunta de "¿me está
 * escuchando?" — que es justo la que aparece cuando el reconocimiento tarda en
 * mostrar la primera palabra.
 *
 * ── Por qué no es estado de React ──
 * Esto cambia 60 veces por segundo. Un `setState` a esa frecuencia re-renderiza
 * el modal entero sesenta veces por segundo para mover un círculo: se escribe
 * directo en el DOM, que es exactamente para lo que existen las variables CSS.
 *
 * ── Por qué puede no andar, y está bien ──
 * Abre su propio micrófono, además del que ya tiene el reconocimiento de voz.
 * Casi todos los navegadores lo permiten; si alguno no, no pasa nada: el
 * elemento se queda quieto y el dictado sigue funcionando igual. Es decoración
 * informativa, no una pieza del mecanismo.
 */
export function useNivelVoz(activo: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    // Copiado acá y no leído en la limpieza: para cuando esta corre, el ref
    // puede apuntar a otro nodo (o a ninguno) y dejaríamos el valor viejo
    // escrito en un elemento que ya no existe.
    const el = ref.current;
    if (!activo) {
      el?.style.setProperty('--nivel', '0');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) return;

    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let vivo = true;

    const arrancar = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!vivo) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        ctx = new AudioContext();
        const fuente = ctx.createMediaStreamSource(stream);
        const analizador = ctx.createAnalyser();
        // Chico: no se analiza el sonido, solo se mide cuánto hay.
        analizador.fftSize = 256;
        fuente.connect(analizador);
        const datos = new Uint8Array(analizador.frequencyBinCount);

        let suave = 0;
        const medir = () => {
          analizador.getByteTimeDomainData(datos);
          // Energía respecto del silencio (128 es el cero de la onda).
          let suma = 0;
          for (const v of datos) suma += (v - 128) * (v - 128);
          const rms = Math.sqrt(suma / datos.length) / 128;
          // Se amplifica porque una voz normal a 30cm da valores bajos, y se
          // suaviza para que el círculo no tiemble con cada sílaba.
          const nivel = Math.min(1, rms * 4);
          suave += (nivel - suave) * (nivel > suave ? 0.5 : 0.12);
          el?.style.setProperty('--nivel', suave.toFixed(3));
          raf = requestAnimationFrame(medir);
        };
        medir();
      } catch {
        /* sin micrófono extra: el botón se queda quieto y el dictado sigue */
      }
    };
    void arrancar();

    return () => {
      vivo = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
      void ctx?.close();
      el?.style.setProperty('--nivel', '0');
    };
  }, [activo, ref]);
}
