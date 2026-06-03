import type { ReactNode } from 'react';
import { Icon } from '../common/Icon';

interface TopbarProps {
  crumbs?: string[];
  title?: string;
  right?: ReactNode;
  onMenuClick: () => void;
}

export function Topbar({ crumbs, title, right, onMenuClick }: TopbarProps) {
  return (
    <header className="topbar">
      <button className="topbar__menu" onClick={onMenuClick} title="Menú">
        <Icon name="menu" size={18} />
      </button>
      {crumbs ? (
        <div className="topbar__crumbs">
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <Icon name="chevronRight" size={12} className="topbar__crumb-sep" />}
              <span
                style={{
                  color: i === crumbs.length - 1 ? 'var(--text-primary)' : 'inherit',
                  fontWeight: i === crumbs.length - 1 ? 600 : 400,
                }}
              >
                {c}
              </span>
            </span>
          ))}
        </div>
      ) : (
        <div className="topbar__title">{title}</div>
      )}

      <div className="search" style={{ marginLeft: 'auto' }}>
        <Icon name="search" size={14} style={{ color: 'var(--text-tertiary)' }} />
        <input placeholder="Buscar pacientes, turnos, tratamientos…" />
        <span className="search__kbd">⌘K</span>
      </div>

      {right}
    </header>
  );
}
