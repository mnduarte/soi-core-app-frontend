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
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

// El rol dice qué PUEDE hacer la persona, no a qué se dedica (el Dr./Dra. ya
// va con el nombre). "OWNER" en inglés no le decía nada a nadie.
function rolLabel(role?: string, isClinical?: boolean) {
  if (role === 'OWNER') return 'Titular';
  return isClinical ? 'Profesional' : 'Asistente';
}

export function Sidebar({ isOpen, onClose, collapsed, onToggleCollapsed }: SidebarProps) {
  const { user, clinic, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) await authApi.logout(refreshToken).catch(() => null);
    clearAuth();
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${isOpen ? 'is-open' : ''} ${collapsed ? 'sidebar--rail' : ''}`}>
      <div className="sidebar__brand">
        <BrandLogo />
        <div className="sidebar__brand-txt">
          <div className="sidebar__brand-name">{clinic?.name ?? 'SOI'}</div>
          <div className="sidebar__brand-sub">{withTitle(user?.name, user?.title)}</div>
        </div>
      </div>

      {/* Tirador sobre el borde mismo, a media altura: queda en el mismo punto
          esté ancho o angosto, porque está pegado al borde y no al contenido.
          Solo escritorio — en celular el sidebar es un panel que se abre entero
          y angostarlo no significa nada. */}
      <button
        type="button"
        className="sidebar__rail-btn"
        onClick={onToggleCollapsed}
        title={collapsed ? 'Expandir menú' : 'Contraer menú'}
        aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
      >
        <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
      </button>

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
          title={collapsed ? it.label : undefined}
        >
          <Icon name={it.icon} />
          <span className="nav-item__lbl">{it.label}</span>
          {it.kbd && <span className="nav-item__kbd">{it.kbd}</span>}
        </NavLink>
      ))}

      <div className="sidebar__user">
        <Avatar name={user?.name ?? '?'} id={user?.id} size="md" />
        <div className="sidebar__user-txt" style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {withTitle(user?.name, user?.title)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{rolLabel(user?.role, user?.isClinical)}</div>
        </div>
        <button className="btn btn--ghost btn--icon" onClick={handleLogout} title="Salir">
          <Icon name="x" />
        </button>
      </div>
    </aside>
  );
}
