import type { ReactNode } from 'react';

interface SectionHeaderProps {
  /** Microlabel en mayúsculas sobre el título (ej. AGENDA). */
  kicker?: string;
  /** Título de la página. La palabra clave puede ir en <em> (itálica azul). */
  title: ReactNode;
  sub?: string;
  actions?: ReactNode;
}

// Encabezado de sección estilo Libreta: kicker en mayúsculas + título grande en
// Newsreader, con la palabra clave en itálica azul. Sin ícono ni barra blanca —
// el header respira sobre el papel. Ver handoff-libreta (bloque `.hd`).
export function SectionHeader({ kicker, title, sub, actions }: SectionHeaderProps) {
  return (
    <div
      className="lb-hd"
      style={{
        padding: '22px 32px 14px',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 12,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {kicker && <div className="page-kicker">{kicker}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>}
      </div>
      {actions && <div className="row" style={{ gap: 8 }}>{actions}</div>}
    </div>
  );
}
