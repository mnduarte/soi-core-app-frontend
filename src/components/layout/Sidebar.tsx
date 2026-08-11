import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { authApi } from '../../api/auth';
import { withTitle } from '../../lib/format';
import { Icon, type IconName } from '../common/Icon';
import { BrandLogo } from '../common/BrandLogo';
import { Avatar } from '../common/Avatar';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  kbd?: string;
}

// Tres secciones y nada más. Sin rótulos de grupo: con esta cantidad de ítems
// un encabezado ("Principal") era puro ruido.
// Nota: Dashboard, Galería, Pagos, Ayuda y Pacientes viejos quedan OCULTOS del
// menú (sus rutas siguen activas por si queda algún link guardado).
const NAV: NavItem[] = [
  // { to: '/', label: 'Dashboard', icon: 'home', end: true, kbd: 'G' },
  { to: '/agenda', label: 'Agenda', icon: 'calendar', kbd: 'A' },
  { to: '/patients', label: 'Pacientes', icon: 'users', kbd: 'P' },
  { to: '/ficha-rapida', label: 'Ficha clínica', icon: 'clipboard', kbd: 'F' },
  // { to: '/pacientes-viejos', label: 'Pacientes viejos', icon: 'history' },
  // { to: '/gallery', label: 'Galería', icon: 'image' },
  // { to: '/payments', label: 'Pagos', icon: 'receipt' },
  // { to: '/ayuda', label: 'Ayuda', icon: 'help' },
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

      {/* Sin buscador acá: cada sección ya tiene el suyo (Pacientes y Ficha),
          y el que había era decorativo — no tenía input ni el atajo ⌘K que
          anunciaba. */}
      {NAV.map(it => (
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
