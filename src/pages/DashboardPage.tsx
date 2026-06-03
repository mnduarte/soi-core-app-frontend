import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  appointmentsApi,
  type Appointment,
  type AppointmentStatus,
} from '../api/appointments';
import { patientsApi, type Patient } from '../api/patients';
import { useAuthStore } from '../store/auth.store';
import { useUIStore } from '../store/ui.store';
import { PageHeader } from '../components/common/PageHeader';
import { Icon, type IconName } from '../components/common/Icon';
import { Avatar } from '../components/common/Avatar';
import { StatusBadge, FichaPendingBadge } from '../components/common/StatusBadge';
import { ResolveMenu } from '../components/common/ResolveMenu';
import { hhmm, isFichaPending, isTerminal } from '../lib/appointment';

function startOfDayISO(d = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}
function endOfDayISO(d = new Date()): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
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

export default function DashboardPage() {
  const { user, clinic } = useAuthStore();
  const openModal = useUIStore(s => s.openModal);
  const showToast = useUIStore(s => s.showToast);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const today = new Date();

  const dayName = today.toLocaleDateString('es-AR', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

  const { data: appts = [] } = useQuery({
    queryKey: ['appointments', 'today'],
    queryFn: () => appointmentsApi.findAll({ from: startOfDayISO(), to: endOfDayISO() }),
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

  const sortedAppts = useMemo(
    () => [...appts].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [appts],
  );

  // Live derivations
  const completed = appts.filter(a => a.status === 'COMPLETED').length;
  const remaining = appts.length - completed;
  const fichasPend = appts.filter(isFichaPending);
  const nextAppt = useMemo(() => {
    const now = today.getTime();
    return [...appts]
      .filter(a => !isTerminal(a) && new Date(a.startsAt).getTime() >= now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  }, [appts, today]);
  const nextPatient = nextAppt ? patientMap.get(nextAppt.patientId) : undefined;

  // Status mutation — refetches today's appointments + balance + patient cards.
  const resolveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      appointmentsApi.updateStatus(id, status),
    onSuccess: updated => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      const p = patientMap.get(updated.patientId);
      const name = p ? `${p.name} ${p.lastName}` : 'paciente';
      showToast(toastForStatus(name, updated.status));
    },
  });

  const handleResolve = (id: string, status: AppointmentStatus) =>
    resolveMutation.mutate({ id, status });

  return (
    <div className="content fade-in">
      <PageHeader
        title={`Buen día, ${user?.name ?? ''} 👋`}
        sub={`${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${dateStr} · ${appts.length} turnos hoy`}
        actions={
          <>
            <button className="btn btn--secondary" onClick={() => navigate('/agenda')}>
              <Icon name="calendar" /> Ver agenda completa
            </button>
            <button className="btn btn--primary" onClick={() => openModal('newPatient')}>
              <Icon name="plus" /> Nuevo paciente
            </button>
          </>
        }
      />

      {/* Metrics */}
      <div className="r-metrics" style={{ marginBottom: 22 }}>
        <Metric
          label="Turnos hoy"
          value={appts.length}
          sub={`${completed} atendidos · ${remaining} pendientes`}
          icon="calendar"
        />
        <Metric
          label="Próximo turno"
          value={nextAppt ? hhmm(nextAppt.startsAt) : '—'}
          sub={
            nextAppt && nextPatient
              ? `${nextPatient.name} ${nextPatient.lastName} · ${nextAppt.title ?? 'Turno'}`
              : 'Sin turnos por delante'
          }
          icon="clock"
          iconColor="var(--info)"
        />
        <Metric
          label="Fichas pendientes"
          value={fichasPend.length}
          sub={fichasPend.length ? 'Atendidos sin documentar' : 'Todo al día'}
          icon="clipboard"
          iconColor={fichasPend.length ? 'var(--warning)' : 'var(--success)'}
        />
        <Metric
          label="Pagos pendientes"
          value="—"
          sub="Próximamente"
          icon="cash"
          iconColor="var(--warning)"
        />
      </div>

      {/* 2-col */}
      <div className="r-2col">
        {/* Agenda del día */}
        <div className="card">
          <div className="card__header">
            <div>
              <div className="card__title">Agenda de hoy</div>
              <div className="card__sub">Click en un turno para abrir la ficha</div>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => navigate('/agenda')}>
              Ver todo <Icon name="arrowRight" size={12} />
            </button>
          </div>
          <div>
            {sortedAppts.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                No hay turnos agendados para hoy.
              </div>
            ) : (
              sortedAppts.slice(0, 6).map(appt => (
                <DashboardAppointmentRow
                  key={appt._id}
                  appt={appt}
                  patient={patientMap.get(appt.patientId)}
                  onOpenPatient={id => navigate(`/patients/${id}`)}
                  onResolve={handleResolve}
                  onReschedule={() => openModal('newAppointment', { patientId: appt.patientId })}
                />
              ))
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Quick actions */}
          <div className="card">
            <div className="card__header">
              <div className="card__title">Acciones rápidas</div>
            </div>
            <div className="card__body" style={{ padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <QuickAction icon="plus" label="Nuevo turno" onClick={() => openModal('newAppointment')} />
                <QuickAction icon="user" label="Nuevo paciente" onClick={() => openModal('newPatient')} />
                <QuickAction icon="camera" label="Subir fotos" onClick={() => alert('Próximamente — necesita integración Cloudinary')} />
                <QuickAction icon="receipt" label="Cobrar pago" onClick={() => openModal('registerPayment')} />
              </div>
            </div>
          </div>

          {/* Pacientes recientes */}
          <div className="card">
            <div className="card__header">
              <div>
                <div className="card__title">Pacientes recientes</div>
                <div className="card__sub">{patients.length} fichas activas · {clinic?.name ?? ''}</div>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={() => navigate('/patients')}>
                Ver todo <Icon name="arrowRight" size={12} />
              </button>
            </div>
            <div>
              {patients.slice(0, 4).map((p, i) => (
                <div
                  key={p._id}
                  onClick={() => navigate(`/patients/${p._id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 20px',
                    borderBottom: i < 3 ? '1px solid var(--border-subtle)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <div className="row" style={{ gap: 10 }}>
                    <Avatar name={p.name} lastName={p.lastName} id={p._id} size="sm" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name} {p.lastName}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                        {p.phone ?? '—'}
                      </div>
                    </div>
                  </div>
                  <Icon name="chevronRight" size={14} style={{ color: 'var(--text-tertiary)' }} />
                </div>
              ))}
              {patients.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12.5 }}>
                  Aún no hay pacientes cargados.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardAppointmentRow({
  appt,
  patient,
  onOpenPatient,
  onResolve,
  onReschedule,
}: {
  appt: Appointment;
  patient?: Patient;
  onOpenPatient: (id: string) => void;
  onResolve: (id: string, status: AppointmentStatus) => void;
  onReschedule: (appt: Appointment) => void;
}) {
  const done = appt.status === 'COMPLETED';
  const voided = appt.status === 'NO_SHOW' || appt.status === 'CANCELLED';
  const muted = done || voided;
  const fichaPending = isFichaPending(appt);

  return (
    <div className="dash-appt-row" onClick={() => onOpenPatient(appt.patientId)}>
      <div
        className="dash-appt-row__time mono"
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: muted ? 'var(--text-tertiary)' : 'var(--text-primary)',
        }}
      >
        {hhmm(appt.startsAt)}
      </div>
      <div className="dash-appt-row__patient">
        {patient && <Avatar name={patient.name} lastName={patient.lastName} id={patient._id} size="md" />}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 500,
              textDecoration: muted ? 'line-through' : 'none',
              opacity: muted ? 0.6 : 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {patient ? `${patient.name} ${patient.lastName}` : 'Paciente'}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--text-tertiary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {appt.title ?? 'Turno'}
          </div>
        </div>
      </div>
      <div className="dash-appt-row__badges">
        <StatusBadge status={appt.status} />
        {fichaPending && <FichaPendingBadge onClick={() => onOpenPatient(appt.patientId)} />}
      </div>
      <div className="dash-appt-row__menu">
        <ResolveMenu
          appt={appt}
          onResolve={onResolve}
          onOpenFicha={() => onOpenPatient(appt.patientId)}
          onReschedule={onReschedule}
        />
      </div>
    </div>
  );
}

interface MetricProps {
  label: string;
  value: number | string;
  sub?: string;
  icon?: IconName;
  iconColor?: string;
}

function Metric({ label, value, sub, icon, iconColor }: MetricProps) {
  return (
    <div className="metric">
      <div className="row row--between" style={{ alignItems: 'flex-start' }}>
        <div className="metric__label">{label}</div>
        {icon && (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--bg-muted)',
              color: iconColor ?? 'var(--brand-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={icon} size={14} />
          </div>
        )}
      </div>
      <div className="metric__value">{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        background: 'var(--bg-surface)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'var(--brand-primary-50)',
          color: 'var(--brand-primary-600)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={15} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
    </button>
  );
}
