import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * Bloque que se abre, se cierra y se adapta contrayendo su alto de verdad.
 *
 * Por qué no las formas más obvias:
 *
 * - **Montar/desmontar el contenido** lo hace desaparecer de un frame mientras
 *   el resto de la lista recién empieza a acomodarse: dos gestos distintos.
 * - **`grid-template-rows: 0fr -> 1fr`** anima, pero es layout y obliga a
 *   recalcular la lista entera en cada frame; en listas largas se traba.
 * - **`transform: scaleY(0)`** es barato pero no libera el espacio: lo de abajo
 *   no sube.
 *
 * Acá el alto se anima con la Web Animations API entre valores en píxeles ya
 * medidos, y el contenido queda SIEMPRE montado (recortado cuando está
 * cerrado), así no hay nada que aparezca o desaparezca de golpe.
 *
 * Un `ResizeObserver` sigue al contenido: si cambia de tamaño con el bloque
 * abierto —el panel de chips que pasa de "trabajos" a "montos", un pago que se
 * agrega— el alto acompaña con la misma animación en vez de saltar.
 *
 * Detalle para las listas con FLIP: esto no dispara renders de React y el hook
 * mide solo cuando React renderiza, así que mientras esto se mueve el FLIP no
 * se entera y no anima lo mismo por segunda vez —que era lo que producía el
 * rebote—.
 */
export function Desplegable({
  abierto,
  ms = 140,
  clave,
  animarAlMontar = false,
  children,
}: {
  abierto: boolean;
  ms?: number;
  /**
   * Cambia cuando cambia el CONTENIDO (por ejemplo el panel que pasa de
   * "trabajos" a "montos"). El `ResizeObserver` también lo detecta, pero avisa
   * después del layout: con esto el alto se recalcula en el mismo momento en
   * que React pinta el contenido nuevo, sin el frame de retraso que se sentía
   * como demora.
   */
  clave?: string | number;
  /**
   * Animar aunque el bloque NAZCA abierto.
   *
   * Por defecto no se anima al montar: un desglose que ya tenía pagos no tiene
   * que desplegarse solo cada vez que se entra a la ficha. Pero cuando el
   * bloque aparece POR una acción —tocar "Editar" crea la fila de edición con
   * su panel ya abierto— sin esto se dibuja de golpe, porque técnicamente es su
   * primer render.
   */
  animarAlMontar?: boolean;
  children: ReactNode;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const interior = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const montado = useRef(false);
  // Lo lee el ResizeObserver, que vive fuera del ciclo de renders. Se
  // sincroniza en el efecto y no durante el render: tocar una ref mientras se
  // renderiza puede dejarla desfasada de lo que React terminó pintando.
  const abiertoRef = useRef(abierto);
  /** Alto al que se está yendo. Lo consulta el ResizeObserver — ver abajo. */
  const destino = useRef<number | null>(null);

  /**
   * Anima el alto entre dos valores en píxeles.
   *
   * Ojo con QUIÉN la llama y CUÁNDO: animar `height` corre en el hilo
   * principal, no en el compositor. Si se dispara en el mismo commit en que
   * React rehace media pantalla, la animación se crea pero no avanza hasta que
   * el hilo se libera. Medido en la ficha: una de 140ms tardó 303. No se ve
   * como una animación lenta —se ve como un tirón y después el resultado
   * puesto—. Ver el comentario de `abrirOtroMonto` en FichaRapidaPage.
   */
  const animarHasta = useCallback((hasta: number) => {
    const el = caja.current;
    if (!el) return;
    // Se MIDE antes de cancelar: una animación con `fill: forwards` pisa el
    // estilo en línea, así que cancelarla primero devuelve el elemento al alto
    // viejo y se animaría desde el punto equivocado.
    const desde = el.getBoundingClientRect().height;
    destino.current = hasta;
    anim.current?.cancel();
    el.style.height = `${desde}px`;
    if (Math.abs(hasta - desde) < 1) {
      el.style.height = `${hasta}px`;
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.height = `${hasta}px`;
      return;
    }
    // Ritmo parejo con una frenada corta al final: las curvas que desaceleran
    // fuerte dejan una cola larga que se lee como rebote en todo lo que este
    // bloque empuja.
    anim.current = el.animate(
      [{ height: `${desde}px` }, { height: `${hasta}px` }],
      { duration: ms, easing: 'cubic-bezier(0.4, 0.4, 0.7, 1)', fill: 'forwards' },
    );
    anim.current.onfinish = () => {
      el.style.height = `${hasta}px`;
      anim.current?.cancel();
      anim.current = null;
    };
    // Estable salvo que cambie la duración: si se recreara en cada render, el
    // ResizeObserver se volvería a suscribir todo el tiempo.
  }, [ms]);

  useLayoutEffect(() => {
    abiertoRef.current = abierto;
    const el = caja.current;
    const dentro = interior.current;
    if (!el || !dentro) return;
    // El primer render no anima: un bloque que arranca abierto no tiene que
    // desplegarse solo al entrar a la pantalla.
    if (!montado.current) {
      montado.current = true;
      if (!(animarAlMontar && abierto)) {
        el.style.height = abierto ? `${dentro.scrollHeight}px` : '0px';
        return;
      }
      // Nace abierto pero por una acción: se arranca en cero y se despliega.
      el.style.height = '0px';
    }
    animarHasta(abierto ? dentro.scrollHeight : 0);
  }, [abierto, ms, clave, animarAlMontar, animarHasta]);

  useEffect(() => {
    const dentro = interior.current;
    if (!dentro) return;
    let primera = true;
    const ro = new ResizeObserver(() => {
      // El observer avisa una vez al empezar a observar: ese aviso no es un
      // cambio y animarlo haría que el bloque se desplegara solo.
      if (primera) { primera = false; return; }
      if (!abiertoRef.current) return;
      const alto = dentro.scrollHeight;
      // Si ya vamos justo a ese alto, este aviso es el ECO del cambio que
      // disparó la animación —el contenido que acaba de montarse—, no un cambio
      // nuevo. Volver a animar acá cancelaba la animación en curso y la
      // reiniciaba desde donde estuviera: el tranco que se veía al abrir un
      // panel que nace vacío. El desplegable de "Editar" no lo tenía porque
      // nace CON su contenido adentro, y ahí el primer aviso se descarta.
      if (destino.current !== null && Math.abs(alto - destino.current) < 1) return;
      animarHasta(alto);
    });
    ro.observe(dentro);
    return () => ro.disconnect();
  }, [animarHasta]);

  return (
    <div ref={caja} style={{ overflow: 'hidden' }}>
      {/* `flow-root` no se ve, pero es lo que hace que la medición sea cierta.
          Sin él, el margen del primer o el último hijo SE ESCAPA de este div
          —los márgenes verticales atraviesan un bloque que no tiene padding ni
          borde— y `scrollHeight` los deja afuera. La caja de arriba sí los
          contiene, porque `overflow: hidden` corta ese escape. Resultado: se
          animaba hacia un alto 6px más chico que el real y al terminar se
          corregía de un tirón — un segundo movimiento cortito, encima del que
          correspondía. `flow-root` contiene los márgenes acá y los dos números
          vuelven a ser el mismo. */}
      {/* `inert` mientras está cerrado: el contenido recortado no se ve, pero
          sin esto el tabulador sigue entrando y el foco se va a un botón
          invisible. */}
      <div ref={interior} style={{ display: 'flow-root' }} inert={!abierto}>{children}</div>
    </div>
  );
}
