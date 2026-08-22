import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

/**
 * Ancla un panel flotante al elemento que lo abre, con `position: fixed`.
 *
 * Por qué fixed y no absolute: varios de estos campos viven adentro de listas
 * con scroll propio (los pagos, los trabajos). Un panel `absolute` se recorta
 * contra el borde de esa lista por más z-index que tenga — `overflow` recorta
 * antes de apilar. Con `fixed` el panel sale del flujo y no lo recorta nadie.
 *
 * El precio de fixed es que no acompaña el scroll, así que cerramos el panel
 * cuando algo scrollea. Es lo que hacen casi todos los selectores nativos y
 * evita el peor resultado: el panel quedándose flotando lejos de su campo.
 */
export function useAnchored(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  opts?: { width?: number; align?: 'left' | 'right' },
): CSSProperties {
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open) return;
    const el = anchorRef.current;
    if (!el) return;

    const ubicar = () => {
      const r = el.getBoundingClientRect();
      const ancho = opts?.width ?? Math.max(r.width, 200);
      const margen = 8;
      // Si no entra para abajo, se abre para arriba. Un panel que se sale de la
      // pantalla es peor que uno que aparece del otro lado.
      const espacioAbajo = window.innerHeight - r.bottom;
      const arriba = espacioAbajo < 260 && r.top > espacioAbajo;
      let left = opts?.align === 'right' ? r.right - ancho : r.left;
      left = Math.min(Math.max(margen, left), window.innerWidth - ancho - margen);

      setPos({
        position: 'fixed',
        left,
        width: ancho,
        maxHeight: arriba ? r.top - margen * 2 : window.innerHeight - r.bottom - margen * 2,
        ...(arriba
          ? { bottom: window.innerHeight - r.top + 4 }
          : { top: r.bottom + 4 }),
      });
    };

    ubicar();
    // `true` para capturar el scroll de cualquier contenedor, no solo el de la
    // ventana: acá los que scrollean son las listas de adentro.
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [open, anchorRef, onClose, opts?.width, opts?.align]);

  return pos;
}
