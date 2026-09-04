/**
 * Filas fantasma para listas de pacientes que están cargando.
 *
 * No es decoración: ocupan el lugar EXACTO de las filas reales, así que el
 * panel abre con su tamaño final y no pega el salto de agrandarse cuando
 * llegan los datos. Animar ese salto habría sido peor —`height` dispara layout
 * en cada frame—; reservando el espacio no hay nada que animar.
 *
 * Vive acá y no dentro de un modal porque lo usan el buscador de turnos y el
 * desplegable de la fila de anotar: los dos listan pacientes y los dos tenían
 * el mismo problema.
 */
export function FilasFantasma({ filas = 5 }: { filas?: number }) {
  return (
    <div aria-hidden className="skel">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="skel__row">
          <div className="skel__av" />
          <div className="skel__txt">
            {/* Anchos distintos: todos iguales se leen como una tabla vacía,
                no como nombres que están por llegar. */}
            <div className="skel__l1" style={{ width: `${58 + ((i * 13) % 30)}%` }} />
            <div className="skel__l2" />
          </div>
        </div>
      ))}
    </div>
  );
}
