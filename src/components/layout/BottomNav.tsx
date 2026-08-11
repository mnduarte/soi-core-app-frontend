import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../common/Icon';
import { useUIStore } from '../../store/ui.store';

// Navegación de celular (<768px): reemplaza al sidebar. Mismas secciones que el
// sidebar, ícono + texto, el activo en azul tinta. Ver handoff-libreta §4.
const ITEMS: { to: string; label: string; icon: IconName; match: string[] }[] = [
  { to: '/agenda', label: 'Agenda', icon: 'calendar', match: ['/agenda'] },
  { to: '/patients', label: 'Pacientes', icon: 'users', match: ['/patients'] },
  { to: '/ficha-rapida', label: 'Ficha', icon: 'clipboard', match: ['/ficha-rapida'] },
];

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="lb-bnav">
      {ITEMS.map(it => {
        const active = it.match.some(m => pathname.startsWith(m));
        return (
          <NavLink key={it.to} to={it.to} className={active ? 'is-active' : ''}>
            <Icon name={it.icon} />
            {it.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

// Botón flotante: "+ Anotar" en la agenda, "+ Nuevo" en pacientes.
export function MobileFab() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const openModal = useUIStore(s => s.openModal);

  const onAgenda = pathname.startsWith('/agenda');
  const onPatients = pathname.startsWith('/patients');
  if (!onAgenda && !onPatients) return null;

  const handle = () => {
    if (onAgenda) {
      // La Libreta ya tiene su barra de carga rápida arriba: la enfocamos en
      // vez de abrir otro modal, así el flujo de "anotar" es uno solo.
      const input = document.querySelector<HTMLInputElement>('[data-quick-add-patient]');
      if (input) {
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input.focus();
        return;
      }
      openModal('newAppointment');
      return;
    }
    navigate('/patients');
    openModal('newPatient');
  };

  return (
    <button className="lb-fab" onClick={handle} title={onAgenda ? 'Anotar turno' : 'Nuevo paciente'}>
      <Icon name="plus" />
    </button>
  );
}
