/**
 * La hoja del día mientras los turnos vienen del servidor.
 *
 * Antes, en ese rato, la Libreta mostraba "Sin turnos anotados. Cargá el
 * primero arriba ↑" — afirmaba que el día estaba vacío cuando todavía no había
 * llegado nada. Con la agenda llena eso es peor que una pantalla en blanco:
 * dice algo falso justo cuando la persona abre la app a la mañana.
 *
 * Las piezas copian la forma de una fila real —la hora a la izquierda contra la
 * línea del margen, el nombre, el chip del trabajo, los tres botones— así que
 * al llegar los datos el gris se convierte en texto y nada cambia de lugar.
 *
 * `filas` viene de cuántos turnos tuvo la última carga (ver AgendaPage). Con un
 * número fijo el esqueleto mostraba cuatro filas y el día tenía trece: la hoja
 * pegaba un estirón al llegar la respuesta, que es justo lo que este bloque
 * viene a evitar.
 */
export function LibretaEsqueleto({ filas = 5 }: { filas?: number }) {
  // Anchos que no se repiten dos veces seguidas: todos iguales se leen como una
  // tabla vacía, no como nombres que están por llegar.
  const NOMBRES = [148, 116, 170, 132, 158, 124];
  const TRABAJOS = [74, 96, 0, 82, 0, 68];

  return (
    <div aria-hidden>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="lb-row" style={{ borderTop: i ? '1px dashed var(--border-subtle)' : 'none' }}>
          <div className="lb-time">
            <span className="skel-b" style={{ display: 'block', width: 38, height: 12 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="skel-b" style={{ width: NOMBRES[i % NOMBRES.length], maxWidth: '60%', height: 15 }} />
              {TRABAJOS[i % TRABAJOS.length] > 0 && (
                <span
                  className="skel-b"
                  style={{ width: TRABAJOS[i % TRABAJOS.length], height: 18, borderRadius: 999, opacity: 0.6 }}
                />
              )}
            </div>
          </div>
          {/* Las tres acciones: sin esto el bloque de la derecha aparecería de
              golpe y correría el nombre al llegar los datos. */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {[0, 1, 2].map(n => (
              <span key={n} className="skel-b" style={{ width: 32, height: 32, borderRadius: 7, opacity: 0.55 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
