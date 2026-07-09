import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { authApi } from '../../api/auth';
import { withTitle } from '../../lib/format';
import { Icon, type IconName } from '../common/Icon';
import { BrandLogo } from '../common/BrandLogo';
import { Avatar } from '../common/Avatar';

interface NavGroup {
  group: string;
  items: { to: string; label: string; icon: IconName; end?: boolean; kbd?: string }[];
}

// Nota: Dashboard, Galería, Pagos, Pacientes viejos y Ayuda quedan OCULTOS del
// menú por ahora (las rutas siguen activas). Para volver a mostrarlos, descomentar.
const NAV: NavGroup[] = [
  {
    group: 'Principal',
    items: [
      // { to: '/', label: 'Dashboard', icon: 'home', end: true, kbd: 'G' },
      { to: '/agenda', label: 'Agenda', icon: 'calendar', kbd: 'A' },
      { to: '/patients', label: 'Pacientes', icon: 'users', kbd: 'P' },
      { to: '/ficha-rapida', label: 'Ficha rápida', icon: 'clipboard', kbd: 'F' },
    ],
  },
  // {
  //   group: 'Clínico',
  //   items: [
  //     { to: '/gallery', label: 'Galería', icon: 'image' },
  //     { to: '/payments', label: 'Pagos', icon: 'receipt' },
  //     { to: '/pacientes-viejos', label: 'Pacientes viejos', icon: 'history' },
  //   ],
  // },
  // {
  //   group: 'Soporte',
  //   items: [
  //     { to: '/ayuda', label: 'Ayuda', icon: 'help' },
  //   ],
  // },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, clinic, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) await authApi.logout(refreshToken).catch(() => null);
    clearAuth();
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${isOpen ? 'is-open' : ''}`}>
      <div className="sidebar__brand">
        <BrandLogo />
        <div>
          <div className="sidebar__brand-name">{clinic?.name ?? 'SOI'}</div>
          <div className="sidebar__brand-sub">{withTitle(user?.name, user?.title)}</div>
        </div>
      </div>

      <div className="search" style={{ width: 'auto', marginBottom: 4 }}>
        <Icon name="search" size={14} style={{ color: 'var(--text-tertiary)' }} />
        <span style={{ flex: 1, fontSize: 13 }}>Buscar paciente…</span>
        <span className="search__kbd">⌘K</span>
      </div>

      {NAV.map(group => (
        <div key={group.group}>
          <div className="sidebar__group-label">{group.group}</div>
          {group.items.map(it => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              onClick={onClose}
              className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
            >
              <Icon name={it.icon} />
              <span>{it.label}</span>
              {it.kbd && <span className="nav-item__kbd">{it.kbd}</span>}
            </NavLink>
          ))}
        </div>
      ))}

      <div className="sidebar__user">
        <Avatar name={user?.name ?? '?'} id={user?.id} size="md" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {withTitle(user?.name, user?.title)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{user?.role}</div>
        </div>
        <button className="btn btn--ghost btn--icon" onClick={handleLogout} title="Salir">
          <Icon name="x" />
        </button>
      </div>
    </aside>
  );
}
