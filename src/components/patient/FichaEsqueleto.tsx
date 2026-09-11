/**
 * La ficha mientras se está trayendo del servidor.
 *
 * Entre tocar un paciente en el buscador y ver sus trabajos pasan unas décimas
 * en las que antes no ocurría nada: el buscador seguía ahí, vacío, y de golpe
 * aparecía todo. Se leía como que el toque no había registrado.
 *
 * No es decoración: las piezas ocupan el lugar y el tamaño de las reales
 * (avatar de 44, sello de estado, formulario, filas), así que cuando llegan los
 * datos no hay salto de layout y no queda nada que animar salvo el fundido.
 */
export function FichaEsqueleto({ isMobile }: { isMobile: boolean }) {
  return (
    <div aria-hidden style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>
      {/* Encabezado del paciente */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: isMobile ? '14px 16px' : '16px 20px' }}>
          <div className="skel-b" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div className="skel-b" style={{ width: 190, maxWidth: '70%', height: 17 }} />
            <div className="skel-b" style={{ width: 130, maxWidth: '50%', height: 11, opacity: 0.65 }} />
          </div>
          {!isMobile && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {[86, 90, 118].map(w => (
                <div key={w} className="skel-b" style={{ width: w, height: 32, borderRadius: 8 }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sello de "falta cobrar": mismo alto que el real, sin color — el color
          dice si debe o está al día, y todavía no se sabe. */}
      <div className="skel-b" style={{ height: 50, borderRadius: 'var(--radius-lg)', opacity: 0.7 }} />

      {/* Trabajos y pagos */}
      <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="card__header" style={{ alignItems: 'center' }}>
          <div className="skel-b" style={{ width: 132, height: 14 }} />
          <div className="skel-b" style={{ width: 104, height: 26, borderRadius: 999 }} />
        </div>
        <div className="lb-addrow">
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingRight: isMobile ? 0 : 128 }}>
            <div className="skel-b" style={{ flex: '1 1 110px', height: 38, borderRadius: 8 }} />
            <div className="skel-b" style={{ width: isMobile ? 104 : 140, height: 38, borderRadius: 8, flexShrink: 0 }} />
            <div className="skel-b" style={{ width: 108, height: 38, borderRadius: 8, flexShrink: 0 }} />
          </div>
        </div>
        <div style={{ padding: '4px 2px', overflow: 'hidden' }}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="skel-b" style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0 }} />
              {/* Anchos distintos: todos iguales se leen como una tabla vacía,
                  no como trabajos que están por llegar. */}
              <div className="skel-b" style={{ flex: 1, maxWidth: `${34 + ((i * 17) % 34)}%`, height: 12 }} />
              <div className="skel-b" style={{ width: 66, height: 12, flexShrink: 0 }} />
              <div className="skel-b" style={{ width: 96, height: 30, borderRadius: 8, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
