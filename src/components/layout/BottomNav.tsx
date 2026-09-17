import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../common/Icon';
import { useUIStore } from '../../store/ui.store';
import { useVeClinico } from '../../lib/permisos';

// Navegación de celular (<768px): reemplaza al sidebar. Mismas secciones que el
// sidebar, ícono + texto, el activo en azul tinta. Ver handoff-libreta §4.
const ITEMS: { to: string; label: string; icon: IconName; match: string[]; clinico?: boolean }[] = [
  { to: '/agenda', label: 'Agenda', icon: 'calendar', match: ['/agenda'] },
  { to: '/patients', label: 'Pacientes', icon: 'users', match: ['/patients'], clinico: true },
  { to: '/ficha-rapida', label: 'Ficha', icon: 'clipboard', match: ['/ficha-rapida'], clinico: true },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const clinico = useVeClinico();
  // El Asistente tiene una sola sección: una barra con un único botón no
  // navega a ningún lado, solo ocupa pantalla.
  if (!clinico) return null;

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
  const clinico = useVeClinico();

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
    <button className={clinico ? 'lb-fab' : 'lb-fab lb-fab--sin-bnav'} onClick={handle} title={onAgenda ? 'Anotar turno' : 'Nuevo paciente'}>
      <Icon name="plus" />
    </button>
  );
}
