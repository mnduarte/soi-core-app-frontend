import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  appointmentsApi,
  type Appointment,
  type AppointmentStatus,
} from '../api/appointments';
import { patientsApi, type Patient } from '../api/patients';
import { useUIStore } from '../store/ui.store';
import { Icon } from '../components/common/Icon';
import { MobileMenuButton } from '../components/common/MobileMenuButton';
import { Avatar } from '../components/common/Avatar';
import { StatusBadge, FichaPendingBadge } from '../components/common/StatusBadge';
import { ResolveMenu } from '../components/common/ResolveMenu';
import { NewClinicalEntryModal } from '../components/patient/NewClinicalEntryModal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { LibretaView } from '../components/agenda/LibretaView';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  hhmm,
  durationMin,
  isFichaPending,
  isTerminal,
  needsResolution,
} from '../lib/appointment';

type View = 'libreta' | 'day' | 'week' | 'month';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8..19
const PX_PER_MIN = 1.4;
const COL_HOUR_W = 60;

// ---------- date helpers ----------
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function endOfWeek(d: Date): Date {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 5);
  e.setHours(23, 59, 59, 999);
  return e;
}
function startOfMonth(d: Date): Date { return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1)); }
function endOfMonth(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  x.setHours(23, 59, 59, 999);
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toastForStatus(name: string, status: AppointmentStatus): string {
  switch (status) {
    case 'COMPLETED':   return `Atendido — ${name}. Ficha pendiente de completar.`;
    case 'NO_SHOW':     return `Marcado como "no asistió" — ${name}.`;
    case 'CANCELLED':   return `Turno cancelado — ${name}.`;
    case 'IN_PROGRESS': return `${name} está en el sillón.`;
    case 'CONFIRMED':   return `Turno reactivado — ${name}.`;
    default:            return `Turno actualizado — ${name}.`;
  }
}

// ===========================================================
// PAGE
// ===========================================================
export default function AgendaPage() {
  const navigate = useNavigate();
  const openModal = useUIStore(s => s.openModal);
  const showToast = useUIStore(s => s.showToast);
  const qc = useQueryClient();
  const isMobile = useIsMobile(900);

  const [view, setView] = useState<View>('libreta');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [searchParams] = useSearchParams();

  // Si llegamos con ?patientId (ej. desde "Guardar y agendar turno"), aseguramos
  // la vista Libreta para que el alta rápida precargue el paciente.
  useEffect(() => {
    if (searchParams.get('patientId')) setView('libreta');
  }, [searchParams]);

  // Turno que se está documentando: abre la entrada de evolución con el turno
  // ya enlazado. Al guardar, el backend apaga su badge "ficha pendiente".
  const [fichaTarget, setFichaTarget] = useState<Appointment | null>(null);

  // Tick "now" every minute so unresolved + Now-line refresh on their own.
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const range = useMemo(() => {
    if (view === 'day' || view === 'libreta') return { from: startOfDay(selectedDate), to: endOfDay(selectedDate) };
    if (view === 'week') return { from: startOfWeek(selectedDate), to: endOfWeek(selectedDate) };
    return { from: startOfMonth(selectedDate), to: endOfMonth(selectedDate) };
  }, [view, selectedDate]);

  const { data: appts = [] } = useQuery({
    queryKey: ['appointments', view, range.from.toISOString()],
    queryFn: () => appointmentsApi.findAll({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    }),
  });

  const { data: patients = [] } = useQuery({
    queryKey: ['patients', 'all'],
    queryFn: () => patientsApi.findAll(),
  });

  const patientMap = useMemo(() => {
    const m = new Map<string, Patient>();
    patients.forEach(p => m.set(p._id, p));
    return m;
  }, [patients]);

  const resolveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      appointmentsApi.updateStatus(id, status),
    onSuccess: updated => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      const p = updated.patientId ? patientMap.get(updated.patientId) : undefined;
      const name = p ? `${p.name} ${p.lastName}` : updated.patientName ?? 'paciente';
      showToast(toastForStatus(name, updated.status));
    },
  });

  const handleResolve = (id: string, status: AppointmentStatus) =>
    resolveMutation.mutate({ id, status });

  const handleReschedule = (appt: Appointment) =>
    openModal('newAppointment', { patientId: appt.patientId });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => appointmentsApi.hardRemove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      showToast('Turno borrado');
    },
    onError: () => showToast('No se pudo borrar el turno', 'error'),
  });
  // Confirmación con diálogo propio (no el confirm nativo del navegador).
  const [confirmDelete, setConfirmDelete] = useState<Appointment | null>(null);
  const handleDelete = (appt: Appointment) => setConfirmDelete(appt);

  // "Cargar evolución de esta visita": documentar el turno desde la agenda.
  const handleOpenFicha = (appt: Appointment) => {
    if (!appt.patientId) {
      showToast('Primero vinculá este turno a una ficha de paciente');
      return;
    }
    setFichaTarget(appt);
  };

  const todayLabel = selectedDate.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const shift = (delta: number) => {
    const next = new Date(selectedDate);
    if (view === 'day' || view === 'libreta') next.setDate(next.getDate() + delta);
    else if (view === 'week') next.setDate(next.getDate() + delta * 7);
    else next.setMonth(next.getMonth() + delta);
    setSelectedDate(next);
  };

  // Stats are scoped to the visible day even in week/month views, so the
  // numbers always describe the date the toolbar shows.
  const dayList = useMemo(
    () =>
      view === 'day' || view === 'libreta'
        ? appts
        : appts.filter(a => sameDay(new Date(a.startsAt), selectedDate)),
    [appts, view, selectedDate],
  );
  const unresolved = useMemo(
    () => dayList.filter(a => needsResolution(a, now)),
    [dayList, now],
  );
  const stats = useMemo(() => {
    const completed = dayList.filter(a => a.status === 'COMPLETED').length;
    const confirmed = dayList.filter(a => a.status === 'CONFIRMED' || a.status === 'SCHEDULED').length;
    const pending = dayList.filter(a => a.status === 'IN_PROGRESS').length;
    return { total: dayList.length, completed, confirmed, pending };
  }, [dayList]);

  const viewSeg = (
    <div className="seg">
      {(['libreta', 'week', 'month'] as const).map(v => (
        <button
          key={v}
          type="button"
          className={`seg__btn ${view === v ? 'is-active' : ''}`}
          onClick={() => setView(v)}
        >
          {{ libreta: 'Libreta diaria', week: 'Semana', month: 'Mes' }[v]}
        </button>
      ))}
    </div>
  );

  return (
    <div className="content" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          padding: isMobile ? '12px 16px' : '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 8 : 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MobileMenuButton />
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'color-mix(in srgb, var(--brand-primary) 13%, transparent)',
              color: 'var(--brand-primary)',
            }}
          >
            <Icon name="calendar" size={20} />
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 600,
              }}
            >
              Agenda
            </div>
            <h1 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 600, margin: '2px 0 0', textTransform: 'capitalize' }}>
              {todayLabel}
            </h1>
          </div>
        </div>

      </div>

      {/* Barra persistente en TODAS las vistas: contador + fecha, y al lado la
          navegación (‹ Hoy ›) y el selector de vista (Libreta/Semana/Mes), que
          así queda fijo al cambiar de vista. */}
      <div
        style={{
          padding: isMobile ? '10px 16px' : '12px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 8 : 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
          <Icon name="calendar" size={15} style={{ color: 'var(--text-tertiary)' }} />
          {view === 'week' ? 'Turnos de la semana' : view === 'month' ? 'Turnos del mes' : 'Turnos del día'} · {appts.length}
        </div>

        {/* Saltar a cualquier día; en semana/mes reposiciona el período. */}
        <input
          type="date"
          className="input"
          value={`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`}
          onChange={e => {
            const v = e.target.value;
            if (v) setSelectedDate(new Date(`${v}T00:00:00`));
          }}
          style={{ height: 34, width: 158 }}
        />

        <div className="row" style={{ gap: 4 }}>
          <button className="btn btn--ghost btn--icon" onClick={() => shift(-1)}>
            <Icon name="chevronLeft" />
          </button>
          <button className="btn btn--secondary btn--sm" onClick={() => setSelectedDate(new Date())}>
            Hoy
          </button>
          <button className="btn btn--ghost btn--icon" onClick={() => shift(1)}>
            <Icon name="chevronRight" />
          </button>
        </div>

        {viewSeg}
      </div>

      {/* Stats — ocultos en la vista Libreta (tiene su propio encabezado). En
          mobile entran en una sola línea (labels abreviados, sin wrap). */}
      {view !== 'libreta' && (
      <div
        style={{
          padding: isMobile ? '10px 14px' : '14px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          display: 'flex',
          gap: isMobile ? 4 : 28,
          flexWrap: isMobile ? 'nowrap' : 'wrap',
          justifyContent: isMobile ? 'space-between' : 'flex-start',
          rowGap: 12,
        }}
      >
        {[
          { l: 'Turnos', s: 'Turnos', v: stats.total, c: 'var(--text-primary)' },
          { l: 'Atendidos', s: 'Atend.', v: stats.completed, c: 'var(--text-tertiary)' },
          { l: 'Confirmados', s: 'Confirm.', v: stats.confirmed, c: 'var(--brand-primary)' },
          { l: 'En curso', s: 'En curso', v: stats.pending, c: 'var(--info)' },
          { l: 'Sin resolver', s: 'Sin res.', v: unresolved.length, c: unresolved.length ? 'var(--danger)' : 'var(--text-tertiary)' },
        ].map(s => (
          <div key={s.l} style={{ textAlign: isMobile ? 'center' : 'left', flex: isMobile ? 1 : undefined, minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? 10 : 11, color: 'var(--text-tertiary)', marginBottom: 2, whiteSpace: 'nowrap' }}>
              {isMobile ? s.s : s.l}
            </div>
            <div
              style={{
                fontSize: isMobile ? 15 : 16,
                fontWeight: 600,
                color: s.c,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {s.v}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Unresolved banner: shown only on day view (other views don't have
          a single "now" reference) */}
      {view === 'day' && unresolved.length > 0 && (
        <UnresolvedBanner
          unresolved={unresolved}
          patientMap={patientMap}
          onResolve={handleResolve}
          onReschedule={handleReschedule}
        />
      )}

      {/* Views */}
      {view === 'libreta' && (
        <LibretaView
          appts={dayList}
          patientMap={patientMap}
          selectedDate={selectedDate}
          now={now}
          isMobile={isMobile}
          onOpenPatient={(id, trabajo) =>
            navigate(`/patients/${id}${trabajo ? `?trabajo=${encodeURIComponent(trabajo)}` : ''}`)
          }
          onResolve={handleResolve}
          onReschedule={handleReschedule}
          onOpenFicha={handleOpenFicha}
          onDelete={handleDelete}
        />
      )}
      {view === 'day' && (
        <DayView
          appts={dayList}
          patientMap={patientMap}
          now={now}
          openModal={openModal}
          onOpenPatient={id => navigate(`/patients/${id}`)}
          onResolve={handleResolve}
          onReschedule={handleReschedule}
          onOpenFicha={handleOpenFicha}
          isMobile={isMobile}
        />
      )}
      {view === 'week' && (
        <WeekView
          appts={appts}
          patientMap={patientMap}
          selectedDate={selectedDate}
          onPickDay={d => { setSelectedDate(d); setView('libreta'); }}
        />
      )}
      {view === 'month' && (
        <MonthView
          appts={appts}
          selectedDate={selectedDate}
          onPickDay={d => { setSelectedDate(d); setView('libreta'); }}
        />
      )}

      {fichaTarget && (
        <NewClinicalEntryModal
          open
          onClose={() => setFichaTarget(null)}
          patientId={fichaTarget.patientId!}
          appointmentId={fichaTarget._id}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="¿Borrar este turno?"
        message="No se puede deshacer. Si te equivocaste, después lo podés volver a crear."
        confirmLabel="Borrar turno"
        danger
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete._id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// ===========================================================
// UNRESOLVED BANNER
// ===========================================================
function UnresolvedBanner({
  unresolved,
  patientMap,
  onResolve,
  onReschedule,
}: {
  unresolved: Appointment[];
  patientMap: Map<string, Patient>;
  onResolve: (id: string, status: AppointmentStatus) => void;
  onReschedule: (appt: Appointment) => void;
}) {
  // Collapsed by default so it never buries the day's agenda below it. The
  // count stays visible in warning color; expanding shows a bounded, scrollable
  // list instead of pushing everything off-screen.
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: '12px 20px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div
        style={{
          border: '1px solid color-mix(in srgb, var(--warning) 35%, var(--border-subtle))',
          background: 'color-mix(in srgb, var(--warning) 7%, var(--bg-surface))',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '10px 14px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            borderBottom: open
              ? '1px solid color-mix(in srgb, var(--warning) 20%, var(--border-subtle))'
              : 'none',
          }}
        >
          <Icon name="alert" size={15} style={{ color: 'var(--warning)' }} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {unresolved.length} turno{unresolved.length !== 1 ? 's' : ''} sin resolver
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', flex: 1 }}>
            · {open ? 'tocá para ocultar' : 'tocá para resolver'}
          </div>
          <Icon
            name="chevronDown"
            size={16}
            style={{
              color: 'var(--text-tertiary)',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          />
        </button>
        {open && (
        <div style={{ maxHeight: 'min(46vh, 420px)', overflowY: 'auto' }}>
          {unresolved.map((appt, i) => {
            const p = appt.patientId ? patientMap.get(appt.patientId) : undefined;
            return (
              <div
                key={appt._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderTop: i > 0
                    ? '1px solid color-mix(in srgb, var(--warning) 14%, var(--border-subtle))'
                    : 'none',
                }}
              >
                <div
                  className="mono"
                  style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 42 }}
                >
                  {hhmm(appt.startsAt)}
                </div>
                {p && <Avatar name={p.name} lastName={p.lastName} id={p._id} size="sm" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p ? `${p.name} ${p.lastName}` : 'Paciente'}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                    {appt.title ?? 'Turno'}
                  </div>
                </div>
                <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn btn--secondary btn--sm"
                    onClick={() => onResolve(appt._id, 'COMPLETED')}
                  >
                    <Icon name="check" size={12} /> Atendido
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => onResolve(appt._id, 'NO_SHOW')}
                  >
                    No asistió
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => onReschedule(appt)}
                  >
                    Reprogramar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================
// DAY VIEW
// ===========================================================
function DayView({
  appts,
  patientMap,
  now,
  openModal,
  onOpenPatient,
  onResolve,
  onReschedule,
  onOpenFicha,
  isMobile,
}: {
  appts: Appointment[];
  patientMap: Map<string, Patient>;
  now: Date;
  openModal: (kind: 'newAppointment') => void;
  onOpenPatient: (id: string) => void;
  onResolve: (id: string, status: AppointmentStatus) => void;
  onReschedule: (appt: Appointment) => void;
  onOpenFicha: (appt: Appointment) => void;
  isMobile: boolean;
}) {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);

  const sortedAppts = useMemo(
    () => [...appts].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [appts],
  );

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '300px 1fr',
        background: 'var(--bg-surface)',
      }}
    >
      {/* List */}
      <div style={{ borderRight: '1px solid var(--border-subtle)', overflow: 'auto' }}>
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Lista del día
          </div>
          <span className="badge badge--neutral">{sortedAppts.length}</span>
        </div>

        {sortedAppts.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            Sin turnos este día.
          </div>
        ) : (
          sortedAppts.map(appt => {
            const p = appt.patientId ? patientMap.get(appt.patientId) : undefined;
            const unresolvedRow = needsResolution(appt, now);
            const fichaPending = isFichaPending(appt);
            return (
              <div
                key={appt._id}
                onClick={() => appt.patientId && onOpenPatient(appt.patientId)}
                style={{
                  padding: '12px 18px',
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  background: unresolvedRow
                    ? 'color-mix(in srgb, var(--warning) 6%, transparent)'
                    : 'transparent',
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseOut={e =>
                  (e.currentTarget.style.background = unresolvedRow
                    ? 'color-mix(in srgb, var(--warning) 6%, transparent)'
                    : 'transparent')
                }
              >
                <div style={{ minWidth: 38 }}>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                    {hhmm(appt.startsAt)}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                    {durationMin(appt)}min
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
                    {p ? `${p.name} ${p.lastName}` : 'Paciente'}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    {appt.title ?? 'Turno'}
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <StatusBadge status={appt.status} />
                    {fichaPending && <FichaPendingBadge onClick={() => onOpenFicha(appt)} />}
                  </div>
                </div>
                <ResolveMenu
                  appt={appt}
                  onResolve={onResolve}
                  onOpenFicha={onOpenFicha}
                  onReschedule={onReschedule}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Grid */}
      {!isMobile && (
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            {HOURS.map(h => (
              <div
                key={h}
                style={{
                  height: 60 * PX_PER_MIN,
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: COL_HOUR_W,
                    textAlign: 'right',
                    paddingRight: 12,
                    paddingTop: 2,
                    fontSize: 11,
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                    borderRight: '1px solid var(--border-subtle)',
                    flexShrink: 0,
                  }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
                <div
                  style={{ flex: 1, position: 'relative' }}
                  onMouseEnter={() => setHoveredSlot(h)}
                  onMouseLeave={() => setHoveredSlot(null)}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 30 * PX_PER_MIN,
                      left: 0,
                      right: 0,
                      height: 1,
                      background: 'var(--border-subtle)',
                      opacity: 0.5,
                    }}
                  />
                  {hoveredSlot === h && (
                    <div
                      onClick={() => openModal('newAppointment')}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 8,
                        right: 8,
                        height: 30 * PX_PER_MIN - 4,
                        borderRadius: 8,
                        background: 'var(--brand-primary-50)',
                        border: '1.5px dashed var(--brand-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--brand-primary-600)',
                        fontSize: 11.5,
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      + {String(h).padStart(2, '0')}:00
                    </div>
                  )}
                </div>
              </div>
            ))}

            <NowLine now={now} />

            {sortedAppts.map(appt => (
              <TimelineCard
                key={appt._id}
                appt={appt}
                patient={appt.patientId ? patientMap.get(appt.patientId) : undefined}
                onClick={() => appt.patientId && onOpenPatient(appt.patientId)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NowLine({ now }: { now: Date }) {
  const h = now.getHours();
  const m = now.getMinutes();
  if (h < 8 || h >= 20) return null;
  const topMin = (h - 8) * 60 + m;
  const top = topMin * PX_PER_MIN;
  return (
    <div
      style={{
        position: 'absolute',
        left: COL_HOUR_W,
        right: 0,
        top,
        zIndex: 4,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -5,
          top: -4,
          width: 10,
          height: 10,
          borderRadius: 50,
          background: 'var(--danger)',
        }}
      />
      <div style={{ height: 1.5, background: 'var(--danger)' }} />
    </div>
  );
}

function TimelineCard({
  appt,
  patient,
  onClick,
}: {
  appt: Appointment;
  patient?: Patient;
  onClick: () => void;
}) {
  const start = new Date(appt.startsAt);
  const topMin = (start.getHours() - 8) * 60 + start.getMinutes();
  if (topMin < 0 || topMin > 60 * 12) return null;

  const top = topMin * PX_PER_MIN;
  const height = durationMin(appt) * PX_PER_MIN - 4;

  // Color encodes lifecycle: green = completed, grey = voided (no-show/cancelled),
  // amber = in-progress (paciente en el sillón), otherwise brand.
  let color: { bg: string; bar: string; text: string };
  if (appt.status === 'COMPLETED') {
    color = { bg: '#F0FDF4', bar: '#16A34A', text: '#15803D' };
  } else if (appt.status === 'IN_PROGRESS') {
    color = { bg: '#ECFEFF', bar: 'var(--info)', text: '#0E7490' };
  } else if (appt.status === 'NO_SHOW' || appt.status === 'CANCELLED') {
    color = { bg: 'var(--bg-muted)', bar: 'var(--text-tertiary)', text: 'var(--text-tertiary)' };
  } else {
    color = { bg: 'var(--brand-primary-50)', bar: 'var(--brand-primary)', text: 'var(--brand-primary-600)' };
  }
  const voided = appt.status === 'NO_SHOW' || appt.status === 'CANCELLED';
  const subtitleOverride = appt.status === 'NO_SHOW'
    ? 'No asistió'
    : appt.status === 'CANCELLED'
    ? 'Cancelado'
    : (appt.title ?? 'Turno');

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        top,
        left: COL_HOUR_W + 8,
        right: 8,
        height,
        background: color.bg,
        borderLeft: `3px solid ${color.bar}`,
        borderRadius: 6,
        padding: '6px 10px',
        cursor: 'pointer',
        overflow: 'hidden',
        opacity: voided ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {patient && <Avatar name={patient.name} lastName={patient.lastName} id={patient._id} size="sm" />}
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: color.text,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textDecoration: voided ? 'line-through' : 'none',
            }}
          >
            {patient ? `${patient.name} ${patient.lastName}` : 'Paciente'}
          </div>
        </div>
        <div className="mono" style={{ fontSize: 11, color: color.text, fontWeight: 500 }}>
          {hhmm(appt.startsAt)}
        </div>
      </div>
      {height > 30 && (
        <div
          style={{
            fontSize: 11.5,
            color: color.text,
            opacity: 0.85,
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {subtitleOverride}
          {isFichaPending(appt) && ' · ficha pendiente'}
        </div>
      )}
    </div>
  );
}

// ===========================================================
// WEEK VIEW (Mon–Sat)
// ===========================================================
const WEEK_DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function WeekView({
  appts,
  patientMap,
  selectedDate,
  onPickDay,
}: {
  appts: Appointment[];
  patientMap: Map<string, Patient>;
  selectedDate: Date;
  onPickDay: (d: Date) => void;
}) {
  const monday = startOfWeek(selectedDate);
  const days = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
  const todayDate = new Date();

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-surface)', padding: 14 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(150px, 1fr))',
          gap: 10,
          minWidth: 920,
        }}
      >
        {days.map((d, i) => {
          const dayAppts = appts
            .filter(a => sameDay(new Date(a.startsAt), d))
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
          const isToday = sameDay(d, todayDate);
          return (
            <div
              key={i}
              onClick={() => onPickDay(d)}
              title="Abrir la libreta de este día"
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                overflow: 'hidden',
                background: isToday ? 'var(--brand-primary-50)' : 'var(--bg-surface)',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: isToday ? 'transparent' : 'var(--bg-muted)',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                    }}
                  >
                    {WEEK_DAY_LABELS[i]}
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: isToday ? 'var(--brand-primary-600)' : 'var(--text-primary)',
                    }}
                  >
                    {d.getDate()}
                  </div>
                </div>
                <span className="badge badge--neutral">{dayAppts.length}</span>
              </div>
              <div
                style={{
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  minHeight: 120,
                }}
              >
                {dayAppts.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', paddingTop: 20 }}>
                    —
                  </div>
                )}
                {dayAppts.map(appt => {
                  const p = appt.patientId ? patientMap.get(appt.patientId) : undefined;
                  const bar = appt.status === 'COMPLETED'
                    ? '#16A34A'
                    : isTerminal(appt)
                    ? 'var(--text-tertiary)'
                    : 'var(--brand-primary)';
                  return (
                    <div
                      key={appt._id}
                      onClick={() => onPickDay(d)}
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderLeft: `3px solid ${bar}`,
                        borderRadius: 6,
                        padding: '6px 8px',
                        cursor: 'pointer',
                      }}
                    >
                      <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: bar }}>
                        {hhmm(appt.startsAt)}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {p ? `${p.name} ${p.lastName}` : (appt.patientName ?? 'Paciente')}
                      </div>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: 'var(--text-tertiary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {appt.title ?? 'Turno'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================
// MONTH VIEW
// ===========================================================
const MONTH_DAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function MonthView({
  appts,
  selectedDate,
  onPickDay,
}: {
  appts: Appointment[];
  selectedDate: Date;
  onPickDay: (d: Date) => void;
}) {
  const today = new Date();
  const monthStart = startOfMonth(selectedDate);
  const daysInMonth = endOfMonth(selectedDate).getDate();
  const firstDay = monthStart.getDay();
  const firstWeekday = firstDay === 0 ? 6 : firstDay - 1;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const countByDay = useMemo(() => {
    const m = new Map<number, number>();
    appts.forEach(a => {
      const d = new Date(a.startsAt);
      if (d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear()) {
        const day = d.getDate();
        m.set(day, (m.get(day) ?? 0) + 1);
      }
    });
    return m;
  }, [appts, selectedDate]);

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-surface)', padding: 14 }}>
      <div style={{ minWidth: 700 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 6,
            marginBottom: 6,
          }}
        >
          {MONTH_DAY_HEADERS.map(h => (
            <div
              key={h}
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                fontWeight: 600,
                textAlign: 'center',
                padding: '4px 0',
              }}
            >
              {h}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {cells.map((d, i) => {
            if (d == null) return <div key={i} style={{ minHeight: 96 }} />;
            const count = countByDay.get(d) ?? 0;
            const cellDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), d);
            const isToday = sameDay(cellDate, today);
            return (
              <div
                key={i}
                onClick={() => onPickDay(cellDate)}
                style={{
                  minHeight: 96,
                  border: '1px solid',
                  borderColor: isToday ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  borderRadius: 8,
                  padding: 8,
                  background: isToday ? 'var(--brand-primary-50)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? 'var(--brand-primary-600)' : 'var(--text-primary)',
                    marginBottom: 6,
                  }}
                >
                  {d}
                </div>
                {count > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {count <= 4 ? (
                      Array.from({ length: count }).map((_, k) => (
                        <div
                          key={k}
                          style={{
                            height: 5,
                            borderRadius: 3,
                            background: 'var(--brand-primary)',
                            opacity: 0.55,
                          }}
                        />
                      ))
                    ) : (
                      <>
                        <div style={{ height: 5, borderRadius: 3, background: 'var(--brand-primary)', opacity: 0.55 }} />
                        <div style={{ height: 5, borderRadius: 3, background: 'var(--brand-primary)', opacity: 0.4 }} />
                        <div
                          style={{
                            fontSize: 10.5,
                            color: 'var(--brand-primary-600)',
                            fontWeight: 600,
                            marginTop: 2,
                          }}
                        >
                          {count} turnos
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
