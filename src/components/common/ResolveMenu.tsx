import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Icon, type IconName } from './Icon';
import type { Appointment, AppointmentStatus } from '../../api/appointments';
import { isTerminal, isFichaPending } from '../../lib/appointment';

interface ResolveMenuProps {
  appt: Appointment;
  onResolve: (id: string, status: AppointmentStatus) => void;
  onOpenFicha?: (appt: Appointment) => void;
  onReschedule?: (appt: Appointment) => void;
  onDelete?: (appt: Appointment) => void;
  onRemind?: (appt: Appointment) => void;
  // En celular las acciones de fila se reducen a "Recordar" y "Más", así que
  // editar paciente / ver ficha tienen que estar también acá dentro.
  onEditPatient?: (appt: Appointment) => void;
  align?: 'left' | 'right';
}

interface Action {
  key: string;
  icon: IconName;
  label: string;
  danger?: boolean;
  accent?: boolean;
}

export function ResolveMenu({
  appt,
  onResolve,
  onOpenFicha,
  onReschedule,
  onDelete,
  onRemind,
  onEditPatient,
  align = 'right',
}: ResolveMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const terminal = isTerminal(appt);
  const actions: Action[] = [];

  if (!terminal) {
    actions.push({ key: 'COMPLETED', icon: 'check', label: 'Marcar atendido' });
    if (appt.status !== 'IN_PROGRESS') {
      actions.push({ key: 'IN_PROGRESS', icon: 'clock', label: 'Está en el sillón' });
    }
    actions.push({ key: 'NO_SHOW', icon: 'x', label: 'No asistió', danger: true });
    actions.push({ key: 'reschedule', icon: 'calendar', label: 'Reprogramar' });
  } else if (appt.status === 'COMPLETED') {
    if (isFichaPending(appt)) {
      actions.push({ key: 'ficha', icon: 'clipboard', label: 'Completar ficha', accent: true });
    }
    actions.push({ key: 'reopen', icon: 'undo', label: 'Reabrir turno' });
  } else {
    // NO_SHOW or CANCELLED
    actions.push({ key: 'reopen', icon: 'undo', label: 'Reactivar turno' });
  }

  // Recordar por WhatsApp (solo si el turno tiene a quién avisar).
  if (onRemind) {
    actions.push({ key: 'remind', icon: 'whatsapp', label: 'Recordar por WhatsApp', accent: true });
  }

  // Ver ficha / Editar paciente: en desktop y tablet están como botones de la
  // fila, pero en celular solo quedan "Recordar" y "Más" — así que acá adentro
  // tienen que estar siempre disponibles.
  if (onOpenFicha && !actions.some(a => a.key === 'ficha')) {
    actions.push({ key: 'ficha', icon: 'clipboard', label: 'Ver ficha clínica' });
  }
  if (onEditPatient) {
    actions.push({ key: 'editPatient', icon: 'user', label: 'Editar paciente' });
  }

  // Borrar turno: disponible siempre. Es un borrado físico (no "cancelar", que
  // dejaba el turno tachado ensuciando la lista) — si fue un error, se rehace.
  if (onDelete) {
    actions.push({ key: 'delete', icon: 'trash', label: 'Borrar turno', danger: true });
  }


  const handle = (key: string, e: MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    if (key === 'ficha') return onOpenFicha?.(appt);
    if (key === 'editPatient') return onEditPatient?.(appt);
    if (key === 'reschedule') return onReschedule?.(appt);
    if (key === 'remind') return onRemind?.(appt);
    if (key === 'delete') return onDelete?.(appt);
    if (key === 'reopen') return onResolve(appt._id, 'CONFIRMED');
    onResolve(appt._id, key as AppointmentStatus);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      {/* Patrón de acción de fila: ícono 32×32 + micro-etiqueta debajo,
          siempre visible (nunca tooltip). Ver handoff-libreta §3. */}
      <button
        className="lb-act"
        title="Más acciones"
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
      >
        <span className="lb-act__ic"><Icon name="more" size={17} /></span>
        <span className="lb-act__lbl">Más</span>
      </button>
      {open && (
        <div
          // Crece desde la esquina donde está el botón que lo abrió, así se lee
          // como "esto salió de acá" y no como un cartel que cayó del cielo.
          className="lb-menupop"
          style={{
            transformOrigin: `top ${align}`,
            position: 'absolute',
            top: 'calc(100% + 4px)',
            [align]: 0,
            zIndex: 50,
            minWidth: 210,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-input)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            padding: 5,
            overflow: 'hidden',
          }}
        >
          {actions.map(a => (
            <button
              key={a.key}
              onClick={e => handle(a.key, e)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 12px',
                minHeight: 40,
                border: 'none',
                background: 'transparent',
                borderRadius: 7,
                cursor: 'pointer',
                fontSize: 13.5,
                fontWeight: 500,
                textAlign: 'left',
                color: a.danger
                  ? 'var(--danger)'
                  : a.accent
                  ? 'var(--brand-primary)'
                  : '#4A4438',
              }}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Icon name={a.icon} size={14} /> {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
