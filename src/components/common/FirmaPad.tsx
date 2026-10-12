import { useImperativeHandle, useRef, useState, type Ref } from 'react';

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

export function FirmaPad({ ref, inicial, onCambio }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [trazo, setTrazo] = useState(false);

  useImperativeHandle(ref, () => ({
    toPng: () => (trazo ? (canvasRef.current?.toDataURL('image/png') ?? null) : null),
    borrar: () => {
      const c = canvasRef.current;
      const g = c?.getContext('2d');
      if (c && g) g.clearRect(0, 0, c.width, c.height);
      setTrazo(false);
      onCambio?.(false);
    },
  }));

  const ctx = () => {
    const g = canvasRef.current?.getContext('2d');
    if (!g) return null;
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#2C4A9E';
    return g;
  };

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (c.width / r.width),
      y: (e.clientY - r.top) * (c.height / r.height),
    };
  };

  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const g = ctx();
    if (!g) return;
    dibujando.current = true;
    const p = punto(e);
    g.beginPath();
    g.moveTo(p.x, p.y);
    if (!trazo) { setTrazo(true); onCambio?.(true); }
  };
  const seguir = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    e.preventDefault();
    const g = ctx();
    if (!g) return;
    const p = punto(e);
    g.lineTo(p.x, p.y);
    g.stroke();
  };
  const terminar = () => { dibujando.current = false; };

  const borrar = () => {
    const c = canvasRef.current;
    const g = c?.getContext('2d');
    if (c && g) g.clearRect(0, 0, c.width, c.height);
    setTrazo(false);
    onCambio?.(false);
  };

  return (
    <div className="fi-pad">
      <div className="fi-pad__tit">
        Firmá con el dedo
        {(trazo || inicial) && (
          <button type="button" onClick={borrar}>Borrar</button>
        )}
      </div>
      {/* La firma guardada va de fondo, no adentro del canvas: si entrara al
          canvas, al guardar se volvería a exportar encima de sí misma y el
          trazo se iría engrosando en cada edición. */}
      <div
        className="fi-pad__caja"
        style={
          inicial && !trazo
            ? { backgroundImage: `url(${inicial})`, backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundSize: 'contain' }
            : undefined
        }
      >
        <canvas
          ref={canvasRef}
          width={760}
          height={240}
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
