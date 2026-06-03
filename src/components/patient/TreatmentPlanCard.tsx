import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  treatmentPlansApi,
  type TreatmentItem,
  type TreatmentItemStatus,
} from '../../api/treatment-plans';
import { Icon, type IconName } from '../common/Icon';
import { useUIStore } from '../../store/ui.store';
import { AddPlanItemModal } from './AddPlanItemModal';

interface TreatmentPlanCardProps {
  patientId: string;
}

// Status taxonomy mirrors the backend enum. The badge variant + dot color align
// with how the prototype's PLAN_BADGE coded them, so the UI feels familiar to
// the dentist who worked off the printed ficha.
const STATUS_LABEL: Record<TreatmentItemStatus, string> = {
  PROPOSED: 'Propuesto',
  SCHEDULED: 'Programado',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completado',
  RECURRENT: 'Recurrente',
  CANCELLED: 'Cancelado',
};
const STATUS_VARIANT: Record<TreatmentItemStatus, string> = {
  PROPOSED: 'warning',
  SCHEDULED: 'brand',
  IN_PROGRESS: 'info',
  COMPLETED: 'neutral',
  RECURRENT: 'brand',
  CANCELLED: 'danger',
};
const STATUS_DOT: Record<TreatmentItemStatus, string> = {
  PROPOSED: 'var(--warning)',
  SCHEDULED: 'var(--brand-primary)',
  IN_PROGRESS: 'var(--info)',
  COMPLETED: 'var(--text-tertiary)',
  RECURRENT: 'var(--brand-primary)',
  CANCELLED: 'var(--danger)',
};

const TERMINAL_STATUSES: TreatmentItemStatus[] = ['COMPLETED', 'CANCELLED'];

// Each item we display in the flat list carries the planId it belongs to,
// because mutations (update/delete) need both ids to reach the right document.
interface FlatItem extends TreatmentItem {
  planId: string;
}

export function TreatmentPlanCard({ patientId }: TreatmentPlanCardProps) {
  const qc = useQueryClient();
  const openModal = useUIStore(s => s.openModal);
  const showToast = useUIStore(s => s.showToast);
  const [adding, setAdding] = useState(false);

  const { data: plans = [] } = useQuery({
    queryKey: ['treatment-plans', patientId],
    queryFn: () => treatmentPlansApi.findAll(patientId),
  });

  const items: FlatItem[] = plans.flatMap(p =>
    p.items.map(it => ({ ...it, planId: p._id })),
  );
  // Sort: open items first (PROPOSED → SCHEDULED → IN_PROGRESS → RECURRENT),
  // terminal at the bottom; within a bucket, items with estimatedDate sort by
  // that date. This way "qué hay que hacer" is always at the top.
  const ORDER: Record<TreatmentItemStatus, number> = {
    PROPOSED: 0, SCHEDULED: 1, IN_PROGRESS: 2, RECURRENT: 3,
    COMPLETED: 4, CANCELLED: 5,
  };
  const sortedItems = [...items].sort((a, b) => {
    const bucket = ORDER[a.status] - ORDER[b.status];
    if (bucket !== 0) return bucket;
    if (a.estimatedDate && b.estimatedDate) return a.estimatedDate.localeCompare(b.estimatedDate);
    if (a.estimatedDate) return -1;
    if (b.estimatedDate) return 1;
    return 0;
  });

  const pending = items.filter(i => !TERMINAL_STATUSES.includes(i.status)).length;

  const updateItemMutation = useMutation({
    mutationFn: ({ planId, itemId, dto }: { planId: string; itemId: string; dto: Partial<TreatmentItem> }) =>
      treatmentPlansApi.updateItem(patientId, planId, itemId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['treatment-plans', patientId] }),
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ planId, itemId }: { planId: string; itemId: string }) =>
      treatmentPlansApi.removeItem(patientId, planId, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treatment-plans', patientId] });
      showToast('Item eliminado del plan');
    },
  });

  const handleChangeStatus = (item: FlatItem, status: TreatmentItemStatus) => {
    updateItemMutation.mutate({ planId: item.planId, itemId: item._id, dto: { status } });
  };
  const handleSchedule = (item: FlatItem) => {
    // The user can flip the item to SCHEDULED after creating the turno; we
    // pre-fill the patient so the modal opens already pointing at them.
    openModal('newAppointment', { patientId });
    void item;
  };
  const handleRemove = (item: FlatItem) => {
    if (!confirm(`Eliminar "${item.description}" del plan?`)) return;
    removeItemMutation.mutate({ planId: item.planId, itemId: item._id });
  };

  return (
    <div className="card">
      <div className="card__header">
        <div>
          <div className="card__title">Plan de tratamiento</div>
          <div className="card__sub">
            {pending} pendiente{pending !== 1 ? 's' : ''} · {items.length} en total
          </div>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={12} /> Agregar
        </button>
      </div>

      {sortedItems.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 13,
          }}
        >
          Sin prestaciones en el plan. Tocá <b>Agregar</b> para cargar la primera.
        </div>
      ) : (
        <div>
          {sortedItems.map((it, i) => (
            <PlanItemRow
              key={it._id}
              item={it}
              showDivider={i < sortedItems.length - 1}
              onChangeStatus={s => handleChangeStatus(it, s)}
              onSchedule={() => handleSchedule(it)}
              onRemove={() => handleRemove(it)}
            />
          ))}
        </div>
      )}

      <AddPlanItemModal open={adding} onClose={() => setAdding(false)} patientId={patientId} />
    </div>
  );
}

function PlanItemRow({
  item,
  showDivider,
  onChangeStatus,
  onSchedule,
  onRemove,
}: {
  item: FlatItem;
  showDivider: boolean;
  onChangeStatus: (s: TreatmentItemStatus) => void;
  onSchedule: () => void;
  onRemove: () => void;
}) {
  const done = item.status === 'COMPLETED';
  const dateLabel = item.estimatedDate
    ? new Date(item.estimatedDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    : '—';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '52px 1fr auto auto auto',
        alignItems: 'center',
        padding: '12px 20px',
        borderBottom: showDivider ? '1px solid var(--border-subtle)' : 'none',
        gap: 16,
        fontSize: 13,
        opacity: done || item.status === 'CANCELLED' ? 0.6 : 1,
      }}
    >
      <div
        className="mono"
        style={{
          fontWeight: 600,
          color: item.toothNumber == null ? 'var(--text-tertiary)' : 'var(--brand-primary)',
        }}
      >
        {item.toothNumber ?? '—'}
      </div>
      <div style={{ fontWeight: 500, textDecoration: done ? 'line-through' : 'none' }}>
        {item.description}
      </div>
      <span
        className={`badge badge--${STATUS_VARIANT[item.status]}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <span className="dot" style={{ background: STATUS_DOT[item.status] }} />
        {STATUS_LABEL[item.status]}
      </span>
      <div className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
        {dateLabel}
      </div>
      <PlanRowMenu
        item={item}
        onChangeStatus={onChangeStatus}
        onSchedule={onSchedule}
        onRemove={onRemove}
      />
    </div>
  );
}

function PlanRowMenu({
  item,
  onChangeStatus,
  onSchedule,
  onRemove,
}: {
  item: FlatItem;
  onChangeStatus: (s: TreatmentItemStatus) => void;
  onSchedule: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // All six statuses, with the current one marked. We surface them flat instead
  // of nesting in a submenu — the popover is short enough to fit them all and
  // it cuts one click per status change.
  const statuses: TreatmentItemStatus[] = [
    'PROPOSED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'RECURRENT', 'CANCELLED',
  ];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
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
            right: 0,
            zIndex: 50,
            minWidth: 200,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-lg)',
            padding: 5,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '6px 10px 4px',
              fontWeight: 600,
            }}
          >
            Cambiar estado
          </div>
          {statuses.map(s => (
            <MenuButton
              key={s}
              onClick={() => { onChangeStatus(s); setOpen(false); }}
              icon={null}
              label={
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <span className="dot" style={{ background: STATUS_DOT[s] }} />
                  <span style={{ fontWeight: item.status === s ? 600 : 400 }}>
                    {STATUS_LABEL[s]}
                  </span>
                </span>
              }
              trailing={
                item.status === s ? (
                  <Icon name="check" size={13} style={{ color: 'var(--brand-primary)' }} />
                ) : null
              }
            />
          ))}
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
          <MenuButton
            icon="calendar"
            label="Agendar turno"
            onClick={() => { onSchedule(); setOpen(false); }}
          />
          <MenuButton
            icon="trash"
            label="Eliminar del plan"
            danger
            onClick={() => { onRemove(); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
}

function MenuButton({
  icon,
  label,
  trailing,
  danger,
  onClick,
}: {
  icon: IconName | null;
  label: React.ReactNode;
  trailing?: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        padding: '7px 10px',
        border: 'none',
        background: 'transparent',
        borderRadius: 7,
        cursor: 'pointer',
        fontSize: 13,
        textAlign: 'left',
        color: danger ? 'var(--danger)' : 'var(--text-primary)',
      }}
      onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
    >
      {icon && <Icon name={icon} size={14} />}
      <span style={{ flex: 1, display: 'flex', alignItems: 'center' }}>{label}</span>
      {trailing}
    </button>
  );
}
