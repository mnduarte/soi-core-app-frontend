import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

/**
 * Pad para firmar con el dedo.
 *
 * Lo usan dos pantallas: el paciente al firmar un consentimiento y el
 * profesional al dejar su firma guardada en el perfil. Es el mismo gesto, así
 * que es el mismo componente — si se arregla el trazo en uno, se arregla en
 * los dos.
 */

export interface FirmaPadHandle {
  /** Data URI del PNG, o null si no hay trazo. */
  toPng: () => string | null;
  borrar: () => void;
}

interface Props {
  ref?: Ref<FirmaPadHandle>;
  /** Firma ya guardada: se dibuja de fondo hasta que empiecen una nueva. */
  inicial?: string;
  onCambio?: (hayTrazo: boolean) => void;
}

/**
 * Grosor del trazo en píxeles de PANTALLA, no del buffer.
 *
 * Antes el canvas tenía un buffer fijo de 760 y se mostraba al ancho que
 * hubiera: en el celular eso lo achicaba a la mitad y la firma salía de un
 * pelo. Ahora el buffer se dimensiona según el tamaño real, así que este
 * número es lo que se ve, igual en el celular del paciente que en la tablet
 * del consultorio.
 */
const GROSOR = 2.4;

export function FirmaPad({ ref, inicial, onCambio }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [trazo, setTrazo] = useState(false);
  /*
   * "Borrar" tiene que dejar el recuadro vacío.
   *
   * Sin esto, al borrar un trazo nuevo volvía a aparecer la firma guardada —que
   * se muestra de fondo— y parecía que el botón no había hecho nada. La guardada
   * no se pierde: si no se dibuja otra, el perfil la conserva igual.
   */
  const [borrado, setBorrado] = useState(false);

  /*
   * El buffer sigue al tamaño mostrado y a la densidad de pantalla.
   *
   * Tocar `canvas.width/height` VACÍA el canvas — siempre, aunque se le asigne
   * el mismo número de otra forma. Y el tamaño cambia por cosas que pasan
   * mientras alguien ya firmó: aparece el botón "Borrar", entra una barra de
   * scroll en el modal, se abre el teclado del celular, se rota el teléfono.
   * Sin reponer el trazo, la firma se borra sola y el guardado manda un PNG en
   * blanco.
   *
   * Así que antes de redimensionar se guarda lo dibujado y después se repone,
   * escalado al tamaño nuevo.
   */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const medir = () => {
      const r = c.getBoundingClientRect();
      if (!r.width || !r.height) return; // fuera de pantalla todavía
      const dpr = Math.min(window.devicePixelRatio || 1, 3); // 3 ya es retina de sobra
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      if (c.width === w && c.height === h) return;

      let previo: HTMLCanvasElement | null = null;
      if (c.width && c.height) {
        previo = document.createElement('canvas');
        previo.width = c.width;
        previo.height = c.height;
        previo.getContext('2d')?.drawImage(c, 0, 0);
      }

      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      if (!g) return;
      // Una unidad del contexto = un píxel de pantalla. A partir de acá se
      // dibuja en coordenadas CSS y el trazo mide lo mismo en todos lados.
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Repuesto en coordenadas CSS: si el recuadro cambió de ancho, la firma
      // lo acompaña en vez de quedar cortada.
      if (previo) g.drawImage(previo, 0, 0, r.width, r.height);
    };

    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  /**
   * Vacía el canvas entero.
   *
   * El contexto está escalado por densidad, así que un clearRect a secas
   * limpiaría en coordenadas de pantalla y no cubriría todo el buffer. Se
   * neutraliza la escala para borrar, y se repone: "Borrar" tiene que dejarlo
   * en blanco siempre, no casi siempre.
   */
  const limpiar = () => {
    const c = canvasRef.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const t = g.getTransform();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(t);
  };

  /**
   * ¿Hay tinta de verdad en el canvas?
   *
   * `trazo` solo dice que alguien APOYÓ el dedo, no que haya quedado algo
   * dibujado. Si el canvas está vacío —se redimensionó, se limpió, el trazo
   * cayó fuera del área— exportarlo igual guarda un PNG transparente, y en un
   * consentimiento eso es una firma en blanco con apariencia de firma.
   * Es la comprobación que faltaba y por la que se llegó a guardar una vacía.
   */
  const hayTinta = () => {
    const c = canvasRef.current;
    const g = c?.getContext('2d');
    if (!c || !g || !c.width || !c.height) return false;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
    return false;
  };

  /**
   * Exporta a un ancho acotado, no al del buffer.
   *
   * El canvas se dimensiona por densidad de pantalla para que el trazo se vea
   * nítido, pero exportar eso tal cual da PNG enormes: medido, una firma densa
   * en pantalla retina pesaba 138 KB. Ese data URI se guarda en la base, viaja
   * en cada carga del perfil y se aplica como `background-image` — y ahí se
   * siente, no al dibujar.
   *
   * 600px de ancho alcanza de sobra: la firma se estampa en un PDF ocupando
   * unos 50mm.
   */
  const ANCHO_EXPORT = 600;

  const exportar = (): string | null => {
    const c = canvasRef.current;
    if (!c) return null;
    if (c.width <= ANCHO_EXPORT) return c.toDataURL('image/png');
    const chico = document.createElement('canvas');
    chico.width = ANCHO_EXPORT;
    chico.height = Math.round((c.height * ANCHO_EXPORT) / c.width);
    const g = chico.getContext('2d');
    if (!g) return c.toDataURL('image/png');
    g.drawImage(c, 0, 0, chico.width, chico.height);
    return chico.toDataURL('image/png');
  };

  useImperativeHandle(ref, () => ({
    // Null si no hay tinta: quien llama entiende "no hay firma nueva" y
    // conserva la anterior, en vez de pisarla con una transparente.
    toPng: () => (trazo && hayTinta() ? exportar() : null),
    borrar: () => {
      limpiar();
      setTrazo(false);
      setBorrado(true);
      onCambio?.(false);
    },
  }));

  const ctx = () => {
    const g = canvasRef.current?.getContext('2d');
    if (!g) return null;
    g.lineWidth = GROSOR;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#2C4A9E';
    return g;
  };

  // El contexto ya está escalado por densidad, así que acá alcanza con la
  // posición relativa al canvas: sin regla de tres y sin desfasaje entre el
  // dedo y el trazo.
  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const g = ctx();
    if (!g) return;
    dibujando.current = true;
    const p = punto(e);
    g.beginPath();
    g.moveTo(p.x, p.y);
  };
  const seguir = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    e.preventDefault();
    const g = ctx();
    if (!g) return;
    const p = punto(e);
    g.lineTo(p.x, p.y);
    g.stroke();
    /*
     * El aviso de "hay firma" sale ACÁ, con la tinta ya puesta, y no al apoyar
     * el dedo.
     *
     * Un toque sin arrastrar no dibuja nada: `moveTo` mueve el lápiz, dibuja
     * `stroke`. Avisando desde `empezar`, un toque suelto habilitaba "Firmar",
     * `toPng` devolvía null —bien, porque `hayTinta` no encuentra nada— y el
     * pedido salía sin firma: el paciente veía "no se pudo guardar", tocaba de
     * nuevo y volvía a pasar. Un callejón sin salida con cara de error del
     * servidor.
     *
     * Ahora lo que habilita el botón es lo mismo que mira `hayTinta`: que haya
     * quedado algo dibujado.
     */
    if (!trazo) { setTrazo(true); onCambio?.(true); }
  };
  const terminar = () => { dibujando.current = false; };

  const borrar = () => {
    limpiar();
    setTrazo(false);
    setBorrado(true);
    onCambio?.(false);
  };

  return (
    <div className="fi-pad">
      <div className="fi-pad__tit">
        Firmá con el dedo
        {(trazo || (inicial && !borrado)) && (
          <button type="button" onClick={borrar}>Borrar</button>
        )}
      </div>
      {/* La firma guardada va de fondo, no adentro del canvas: si entrara al
          canvas, al guardar se volvería a exportar encima de sí misma y el
          trazo se iría engrosando en cada edición. */}
      <div
        className="fi-pad__caja"
        style={
          inicial && !trazo && !borrado
            ? { backgroundImage: `url(${inicial})`, backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundSize: 'contain' }
            : undefined
        }
      >
        {/* Sin width/height fijos: los pone el efecto según el tamaño real y
            la densidad de pantalla. Fijarlos acá era lo que hacía que el trazo
            se viera más fino cuanto más chica la pantalla. */}
        <canvas
          ref={canvasRef}
          onPointerDown={empezar}
          onPointerMove={seguir}
          onPointerUp={terminar}
          onPointerLeave={terminar}
        />
      </div>
      <span className="fi-pad__linea" />
    </div>
  );
}

export default FirmaPad;
