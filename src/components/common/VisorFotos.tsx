import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export interface FotoVisor {
  url: string;
  category?: string;
  title?: string;
  description?: string;
}

/**
 * Visor de fotos a pantalla completa, con pase entre las fotos del grupo.
 *
 * Vive acá y no dentro de una pantalla porque lo usan la ficha (las fotos de un
 * trabajo o de un pago) y la galería. Antes había dos: uno en la ficha y otro
 * adentro de cada miniatura de la galería —ese, por estar en la miniatura, solo
 * podía mostrar su propia foto, así que para ver la siguiente había que cerrar
 * y volver a abrir—.
 *
 * El pase es en DOS TIEMPOS sobre el mismo elemento: la foto se va para un
 * lado, y recién ahí se cambia por la siguiente, que entra desde el otro. Se
 * probó con las dos imágenes montadas a la vez y se veían las dos: la que salía
 * se posicionaba respecto del fondo, no de la otra foto, así que nunca quedaban
 * superpuestas.
 *
 * El epígrafe va DEBAJO de la imagen, no encima. Con degradado se ve mejor,
 * pero acá se miran radiografías y tapar el borde inferior puede esconder justo
 * lo que se está buscando.
 */
export function VisorFotos({
  fotos,
  indice,
  onCerrar,
  etiquetaCategoria,
  compacto = false,
}: {
  fotos: FotoVisor[];
  indice: number;
  onCerrar: () => void;
  /** Cómo mostrar la categoría (cada pantalla tiene su diccionario). */
  etiquetaCategoria?: (c: string) => string;
  compacto?: boolean;
}) {
  const [i, setI] = useState(indice);
  // 0 = recién abierto: aparece sin deslizarse, no viene de ninguna otra foto.
  const [dir, setDir] = useState<0 | 1 | -1>(0);
  const [saliendo, setSaliendo] = useState<0 | 1 | -1>(0);

  const ir = useCallback(
    (delta: 1 | -1) => {
      if (fotos.length < 2 || saliendo !== 0) return;
      setSaliendo(delta);
      const n = (i + delta + fotos.length) % fotos.length;
      setTimeout(() => {
        setSaliendo(0);
        setDir(delta);
        setI(n);
      }, 120);
    },
    [fotos.length, i, saliendo],
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') ir(1);
      if (e.key === 'ArrowLeft') ir(-1);
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [ir, onCerrar]);

  const foto = fotos[i];
  if (!foto) return null;
  const hayEpigrafe = !!(foto.category || foto.title || foto.description);

  // Por portal a <body>: se abre desde adentro de una tabla y de una grilla con
  // scroll, y cualquier ancestro con `transform` —una animación de entrada
  // alcanza— haría que `position: fixed` deje de ser relativo a la pantalla.
  return createPortal(
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', zIndex: 1200, padding: compacto ? 16 : 32,
        cursor: 'zoom-out', animation: 'overlayFade 0.12s ease-out',
      }}
    >
      <button onClick={onCerrar} title="Cerrar" className="zoom-cerrar">
        <Icon name="x" size={20} />
      </button>

      {/* `key` por índice: remonta y dispara la animación de entrada. */}
      <figure
        key={i}
        className={
          saliendo !== 0
            ? `zoom-fig zoom-img--sale-${saliendo === 1 ? 'izq' : 'der'}`
            : `zoom-fig ${dir === 0 ? 'zoom-img--abre' : dir === 1 ? 'zoom-img--der' : 'zoom-img--izq'}`
        }
        onClick={e => e.stopPropagation()}
      >
        <img className="zoom-fig__img" src={foto.url} alt={foto.title ?? ''} />
        {hayEpigrafe && (
          <figcaption className="zoom-cap">
            {foto.category && (
              <span className="zoom-cap__tag">
                <Icon name="image" size={12} />{' '}
                {etiquetaCategoria ? etiquetaCategoria(foto.category) : foto.category}
              </span>
            )}
            {foto.title && <span className="zoom-cap__t">{foto.title}</span>}
            {foto.description && <span className="zoom-cap__d">{foto.description}</span>}
          </figcaption>
        )}
      </figure>

      {/* Flechas solo si hay más de una: un botón que no lleva a ningún lado es
          peor que no tenerlo. */}
      {fotos.length > 1 && (
        <>
          <button className="zoom-nav zoom-nav--izq" title="Anterior"
            onClick={e => { e.stopPropagation(); ir(-1); }}>
            <Icon name="chevronLeft" size={22} />
          </button>
          <button className="zoom-nav zoom-nav--der" title="Siguiente"
            onClick={e => { e.stopPropagation(); ir(1); }}>
            <Icon name="chevronRight" size={22} />
          </button>
          <span className="zoom-cuenta" onClick={e => e.stopPropagation()}>
            {i + 1} de {fotos.length}
          </span>
        </>
      )}
    </div>,
    document.body,
  );
}
