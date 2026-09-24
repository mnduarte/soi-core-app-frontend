import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../common/Icon';
import { useUIStore } from '../../store/ui.store';
import { useVeClinico } from '../../lib/permisos';
import { CuentaSheet } from './CuentaSheet';

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
  const [cuentaAbierta, setCuentaAbierta] = useState(false);

  return (
    <>
      <nav className="lb-bnav">
        {ITEMS.filter(it => clinico || !it.clinico).map(it => {
          const active = it.match.some(m => pathname.startsWith(m));
          return (
            <NavLink key={it.to} to={it.to} className={active ? 'is-active' : ''}>
              <Icon name={it.icon} />
              {it.label}
            </NavLink>
          );
        })}
        {/* En el teléfono el menú lateral no existe, y con él quedaban
            escondidos el consultorio, el tipo de usuario y —sobre todo— el
            botón de salir: no había forma de cerrar sesión desde un celular.
            No es una sección más, así que no navega: abre una hoja. */}
        <button type="button" className="lb-bnav__cuenta" onClick={() => setCuentaAbierta(true)}>
          <Icon name="user" />
          Cuenta
        </button>
      </nav>
      {cuentaAbierta && <CuentaSheet onClose={() => setCuentaAbierta(false)} />}
    </>
  );
}

// Botón flotante: "+ Anotar" en la agenda, "+ Nuevo" en pacientes.
export function MobileFab() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const openModal = useUIStore(s => s.openModal);

  const onAgenda = pathname.startsWith('/agenda');
  // Solo el LISTADO de pacientes, no la ficha de uno. La ficha abierta desde
  // ahí vive en /patients/:id, así que "empieza con /patients" la incluía: el
  // botón flotante se plantaba encima de "Borrar" del último trabajo, y encima
  // ofrecía crear un paciente nuevo mientras se está mirando uno.
  const onPatients = /^\/patients\/?$/.test(pathname);
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
