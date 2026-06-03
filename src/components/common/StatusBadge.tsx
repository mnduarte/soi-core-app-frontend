import type { MouseEvent } from 'react';
import type { AppointmentStatus } from '../../api/appointments';
import { Icon } from './Icon';

const MAP: Record<AppointmentStatus, { label: string; variant: string; dot: string }> = {
  COMPLETED:   { label: 'Atendido',      variant: 'neutral', dot: 'var(--text-tertiary)' },
  IN_PROGRESS: { label: 'En curso',      variant: 'info',    dot: 'var(--info)' },
  CONFIRMED:   { label: 'Confirmado',    variant: 'brand',   dot: 'var(--brand-primary)' },
  SCHEDULED:   { label: 'Agendado',      variant: 'brand',   dot: 'var(--brand-primary)' },
  CANCELLED:   { label: 'Cancelado',     variant: 'danger',  dot: 'var(--danger)' },
  NO_SHOW:     { label: 'No asistió',    variant: 'danger',  dot: 'var(--danger)' },
};

// Some callers pass arbitrary strings (e.g. PENDING from older mocks). Keep the
// fallback so we never crash, but the real source of truth is AppointmentStatus.
export function StatusBadge({ status }: { status: string }) {
  const s = (MAP as Record<string, { label: string; variant: string; dot: string }>)[status]
    ?? MAP.SCHEDULED;
  return (
    <span className={`badge badge--${s.variant}`}>
      <span className="dot" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

interface FichaPendingBadgeProps {
  onClick?: (e: MouseEvent) => void;
}

// Independent of the turno status — marks "atendido but ficha not saved yet".
// Clickable so the user can jump straight into the ficha to finish documenting.
export function FichaPendingBadge({ onClick }: FichaPendingBadgeProps) {
  return (
    <span
      className="badge badge--warning"
      onClick={onClick
        ? e => { e.stopPropagation(); onClick(e); }
        : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      title="El paciente fue atendido pero la ficha todavía no se completó"
    >
      <Icon name="clipboard" size={10} /> Ficha pendiente
    </span>
  );
}
