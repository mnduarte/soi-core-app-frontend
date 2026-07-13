import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface PageHeaderProps {
  title: string;
  sub?: string;
  actions?: ReactNode;
  // Ícono de sección + color de acento (ancla visual para orientarse).
  icon?: IconName;
  accent?: string;
}

export function PageHeader({ title, sub, actions, icon, accent }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="row" style={{ gap: 12 }}>
        {icon && (
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
        )}
        <div>
          <h1 className="page-title">{title}</h1>
          {sub && <div className="page-sub">{sub}</div>}
        </div>
      </div>
      {actions && <div className="row" style={{ gap: 8 }}>{actions}</div>}
    </div>
  );
}
