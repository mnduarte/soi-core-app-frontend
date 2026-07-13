import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { useIsMobile } from '../../hooks/useIsMobile';

interface SectionHeaderProps {
  icon: IconName;
  title: string;
  sub?: string;
  accent?: string;
  actions?: ReactNode;
}

// Encabezado de sección en barra blanca full-width con borde inferior — mismo
// molde que la Agenda, para que Pacientes / Ficha clínica queden alineados.
// El body de la página va debajo, dentro de un contenedor con padding propio.
export function SectionHeader({ icon, title, sub, accent, actions }: SectionHeaderProps) {
  const isMobile = useIsMobile(720);
  return (
    <div
      style={{
        padding: isMobile ? '12px 16px' : '16px 20px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `color-mix(in srgb, ${accent ?? 'var(--brand-primary)'} 13%, transparent)`,
            color: accent ?? 'var(--brand-primary)',
          }}
        >
          <Icon name={icon} size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 600, letterSpacing: '-0.015em', margin: 0 }}>
            {title}
          </h1>
          {sub && <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
      {actions && <div className="row" style={{ gap: 8 }}>{actions}</div>}
    </div>
  );
}
