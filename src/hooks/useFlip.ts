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
export function useFlip(
  containerRef: RefObject<HTMLElement | null>,
  opts?: {
    /**
     * Anima también las ALTAS: las filas de abajo se corren para abrir el
     * hueco y la nueva aparece adentro. Sirve cuando algo puede entrar EN EL
     * MEDIO de la lista (un sobreturno entre dos turnos), donde el salto seco
     * es lo más notorio. Sin esto, un alta no anima nada.
     */
    insert?: boolean;
  },
) {
  const prev = useRef(new Map<string, number>());
  const activos = useRef<HTMLElement[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "Ya medí alguna vez", que NO es lo mismo que "tengo filas guardadas": un
  // día vacío también mide, y con cero filas. Confundir las dos cosas dejaba
  // al primer turno del día sin ningún efecto.
  const medido = useRef(false);
  // Qué nodo medimos la última vez. Al cambiar de día la lista se REMONTA: es
  // un contenedor nuevo y lo guardado no describe nada de lo que hay ahora.
  const ultimoEl = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Devolver a cero lo que haya quedado a medio animar. Es lo que evita el
    // bug de las filas encimadas: si un re-render caía entre el invert y el
    // play, la fila se quedaba con el transform puesto para siempre.
    if (timer.current) clearTimeout(timer.current);
    for (const n of activos.current) {
      n.style.transition = ''; n.style.transform = ''; n.style.zIndex = '';
      n.style.opacity = '';
      n.classList.remove('lb-flip');
    }
    activos.current = [];

    // Contenedor sin layout (la pestaña que no está activa se oculta con
    // display:none, no se desmonta). Ahí todo mide 0, y si guardáramos esos
    // ceros, al volver a mostrarse cada fila creería que venía de la posición
    // 0 de la página y entraría volando desde arriba de todo, fuera de su
    // tarjeta. Se olvida lo medido: al reaparecer cuenta como primera vez.
    if (!el.offsetHeight) { prev.current = new Map(); return; }

    // Contenedor distinto al de la vuelta anterior: se arranca de cero. Sin
    // esto, las posiciones del día viejo se comparaban contra las del nuevo y
    // el primer toque disparaba un movimiento fantasma.
    if (ultimoEl.current !== el) {
      ultimoEl.current = el;
      prev.current = new Map();
      for (const n of el.querySelectorAll<HTMLElement>('[data-flip]')) {
        prev.current.set(n.dataset.flip as string, n.offsetTop);
      }
      return;
    }

    const nodes = Array.from(el.querySelectorAll<HTMLElement>('[data-flip]'));
    const next = new Map<string, number>();
    const movidas: { n: HTMLElement; d: number }[] = [];
    const nuevas: HTMLElement[] = [];

    for (const n of nodes) {
      const id = n.dataset.flip as string;
      const top = n.offsetTop;
      next.set(id, top);
      const old = prev.current.get(id);
      if (old === undefined) nuevas.push(n);
      else if (old !== top) movidas.push({ n, d: old - top });
    }
    const hayNuevas = nuevas.length > 0;
    const prevSize = prev.current.size;
    const eraElPrimerRender = !medido.current;
    medido.current = true;
    prev.current = next;

    // Primer render: las filas que ya estaban no tienen que entrar volando.
    if (eraElPrimerRender) return;

    // Un alta es UNA fila que se suma a las que ya estaban. Si no sobrevivió
    // ninguna y aparecieron varias, no se agregó nada: cambió el día entero.
    // Ahí animar sería mentir (y quince filas destellando a la vez, un caos).
    const sobrevivio = nodes.length - nuevas.length > 0;
    const esAlta = sobrevivio || (prevSize === 0 && nuevas.length === 1);
    // Un alta al final (o el primer turno del día) no mueve a NADIE: sin esto
    // el hook cortaba acá y esa fila aparecía de la nada, sin efecto, justo
    // después de que la de al lado sí lo tuviera.
    if (!movidas.length && !(opts?.insert && hayNuevas && esAlta)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // ALTA sin modo `insert`: no se invierte nada. Devolver las de abajo a su
    // lugar viejo las dibujaría ENCIMA de la recién agregada durante toda la
    // animación (justo lo contrario de "empujar hacia abajo"). La nueva entra
    // con su propio fade y las de abajo acompañan de una.
    if (hayNuevas && (!opts?.insert || !esAlta)) return;

    // Si TODAS se corrieron lo mismo Y no cambió la cantidad, la lista no se
    // reordenó: se movió entera porque cambió algo arriba (un panel que se
    // abre, un aviso que aparece). Ahí no hay nada que explicar.
    // El "no cambió la cantidad" es imprescindible: al borrar la PRIMERA fila
    // todas las de abajo también suben lo mismo, y sin esa condición el borrado
    // más común se quedaba sin animación.
    const todasIgual = movidas.length === nodes.length
      && nodes.length === prevSize
      && movidas.every(m => m.d === movidas[0].d);
    if (todasIgual) return;

    // Hay dos formas de nacer y cada una pide lo suyo:
    //   · EN EL MEDIO — otras se corren para abrirle lugar. Arranca invisible
    //     y aparece en la segunda mitad, cuando el hueco ya está: si no, se la
    //     ve debajo de las filas que todavía le pasan por encima.
    //   · AL FINAL — no se corre nadie, el lugar ya estaba libre. Ahí baja
    //     desde un poco más arriba, como el renglón que sigue en un cuaderno.
    const conHueco = movidas.length > 0;
    for (const n of nuevas) {
      n.style.transition = 'none';
      n.style.opacity = '0';
      if (!conHueco) n.style.transform = 'translateY(-10px)';
      n.classList.add('lb-flipnew');
    }

    // El que más se desplaza es el que cambió de grupo: va arriba de todo para
    // que se lea entero mientras cruza a los demás.
    const maxD = Math.max(...movidas.map(m => Math.abs(m.d)));
    for (const { n, d } of movidas) {
      n.classList.add('lb-flip');
      n.style.zIndex = Math.abs(d) === maxD ? '2' : '1';
      n.style.transition = 'none';
      n.style.transform = `translateY(${d}px)`;
    }
    activos.current = [...movidas.map(m => m.n), ...nuevas];

    void el.offsetHeight; // fuerza el reflow: sin esto el navegador junta invert y play en un solo paso y no se ve nada

    // Sin cancelAnimationFrame en el cleanup a propósito: si se cancelaba, las
    // filas quedaban invertidas y encimadas. Soltarlas siempre es lo seguro.
    requestAnimationFrame(() => {
      for (const { n } of movidas) {
        n.style.transition = `transform ${DUR}ms ${EASE}`;
        n.style.transform = '';
      }
      for (const n of nuevas) {
        n.style.transition = conHueco
          ? `opacity ${DUR * 0.55}ms ease-out ${DUR * 0.45}ms`
          : `opacity ${DUR}ms ${EASE}, transform ${DUR}ms ${EASE}`;
        n.style.opacity = '';
        n.style.transform = '';
      }
    });

    timer.current = setTimeout(() => {
      for (const n of activos.current) {
        n.style.transition = ''; n.style.transform = ''; n.style.zIndex = '';
        n.style.opacity = '';
        n.classList.remove('lb-flip');
      }
      activos.current = [];
    }, DUR + 60);

    if (nuevas.length) {
      if (glowTimer.current) clearTimeout(glowTimer.current);
      glowTimer.current = setTimeout(() => {
        for (const n of nuevas) n.classList.remove('lb-flipnew');
      }, 1100);
    }
  });
}
