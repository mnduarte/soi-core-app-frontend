import { useLayoutEffect, useRef, type RefObject } from 'react';

const DUR = 260;
const EASE = 'cubic-bezier(.22,.61,.36,1)'; // desacelera al final, como algo con peso real

/**
 * FLIP (First-Last-Invert-Play) para una lista.
 *
 * El problema que resuelve: animar la fila que entra o sale es la mitad fácil;
 * lo que se siente "pesado" es que las OTRAS filas saltan de golpe a su lugar
 * nuevo. Ese salto dura un frame y el ojo lo lee como tirón.
 *
 * Cómo: medimos dónde estaba cada fila antes del cambio, la devolvemos a esa
 * posición con un `transform` (invert) y la soltamos (play). El navegador anima
 * SOLO transform, que corre en el compositor — sin layout, sin repaint.
 *
 * Se mide con `offsetTop` y no con getBoundingClientRect porque el contenedor
 * scrollea: offsetTop no depende del scroll ni de los transforms en curso, así
 * que un re-render en el medio no corta la animación.
 */
export function useFlip(containerRef: RefObject<HTMLElement | null>) {
  const prev = useRef(new Map<string, number>());
  const activos = useRef<HTMLElement[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Devolver a cero lo que haya quedado a medio animar. Es lo que evita el
    // bug de las filas encimadas: si un re-render caía entre el invert y el
    // play, la fila se quedaba con el transform puesto para siempre.
    if (timer.current) clearTimeout(timer.current);
    for (const n of activos.current) {
      n.style.transition = ''; n.style.transform = ''; n.style.zIndex = '';
      n.classList.remove('lb-flip');
    }
    activos.current = [];

    const nodes = Array.from(el.querySelectorAll<HTMLElement>('[data-flip]'));
    const next = new Map<string, number>();
    const movidas: { n: HTMLElement; d: number }[] = [];
    let hayNuevas = false;

    for (const n of nodes) {
      const id = n.dataset.flip as string;
      const top = n.offsetTop;
      next.set(id, top);
      const old = prev.current.get(id);
      if (old === undefined) hayNuevas = true;
      else if (old !== top) movidas.push({ n, d: old - top });
    }
    const primeraVez = prev.current.size === 0;
    prev.current = next;

    if (primeraVez || !movidas.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // ALTA: no se invierte nada. Devolver las de abajo a su lugar viejo las
    // dibujaría ENCIMA de la recién agregada durante toda la animación (que es
    // justo lo contrario de "empujar hacia abajo"). La nueva entra con su
    // propio fade y las de abajo acompañan de una.
    if (hayNuevas) return;

    // El que más se desplaza es el que cambió de grupo: va arriba de todo para
    // que se lea entero mientras cruza a los demás.
    const maxD = Math.max(...movidas.map(m => Math.abs(m.d)));
    for (const { n, d } of movidas) {
      n.classList.add('lb-flip');
      n.style.zIndex = Math.abs(d) === maxD ? '2' : '1';
      n.style.transition = 'none';
      n.style.transform = `translateY(${d}px)`;
    }
    activos.current = movidas.map(m => m.n);

    void el.offsetHeight; // fuerza el reflow: sin esto el navegador junta invert y play en un solo paso y no se ve nada

    // Sin cancelAnimationFrame en el cleanup a propósito: si se cancelaba, las
    // filas quedaban invertidas y encimadas. Soltarlas siempre es lo seguro.
    requestAnimationFrame(() => {
      for (const { n } of movidas) {
        n.style.transition = `transform ${DUR}ms ${EASE}`;
        n.style.transform = '';
      }
    });

    timer.current = setTimeout(() => {
      for (const { n } of movidas) {
        n.style.transition = ''; n.style.transform = ''; n.style.zIndex = '';
        n.classList.remove('lb-flip');
      }
      activos.current = [];
    }, DUR + 60);
  });
}
