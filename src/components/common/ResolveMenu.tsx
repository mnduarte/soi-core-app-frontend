import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Icon, type IconName } from './Icon';
import type { Appointment, AppointmentStatus } from '../../api/appointments';
import { isTerminal, isFichaPending } from '../../lib/appointment';

interface ResolveMenuProps {
  appt: Appointment;
  onResolve: (id: string, status: AppointmentStatus) => void;
  onOpenFicha?: (appt: Appointment) => void;
  onReschedule?: (appt: Appointment) => void;
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
    actions.push({ key: 'CANCELLED', icon: 'trash', label: 'Cancelar turno', danger: true });
  } else if (appt.status === 'COMPLETED') {
    if (isFichaPending(appt)) {
      actions.push({ key: 'ficha', icon: 'clipboard', label: 'Completar ficha', accent: true });
    }
    actions.push({ key: 'reopen', icon: 'undo', label: 'Reabrir turno' });
  } else {
    // NO_SHOW or CANCELLED
    actions.push({ key: 'reopen', icon: 'undo', label: 'Reactivar turno' });
  }

  const handle = (key: string, e: MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    if (key === 'ficha') return onOpenFicha?.(appt);
    if (key === 'reschedule') return onReschedule?.(appt);
    if (key === 'reopen') return onResolve(appt._id, 'CONFIRMED');
    onResolve(appt._id, key as AppointmentStatus);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        className="btn btn--ghost btn--icon"
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            [align]: 0,
            zIndex: 50,
            minWidth: 188,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-lg)',
            padding: 5,
          }}
        >
          {actions.map(a => (
            <button
              key={a.key}
              onClick={e => handle(a.key, e)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                width: '100%',
                padding: '8px 10px',
                border: 'none',
                background: 'transparent',
                borderRadius: 7,
                cursor: 'pointer',
                fontSize: 13,
                textAlign: 'left',
                color: a.danger
                  ? 'var(--danger)'
                  : a.accent
                  ? 'var(--brand-primary-600)'
                  : 'var(--text-primary)',
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
