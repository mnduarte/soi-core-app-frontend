import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { patientsApi, type Patient } from '../../api/patients';
import { appointmentsApi } from '../../api/appointments';
import { Icon } from '../common/Icon';
import { hhmm } from '../../lib/appointment';

interface RailProps {
  patient: Patient;
}

export function ObservationsCard({ patient }: RailProps) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(patient.medicalHistory?.notes ?? '');

  useEffect(() => {
    setDraft(patient.medicalHistory?.notes ?? '');
  }, [patient._id, patient.medicalHistory?.notes]);

  const mutation = useMutation({
    mutationFn: (notes: string) =>
      patientsApi.update(patient._id, {
        medicalHistory: { ...(patient.medicalHistory ?? {}), notes },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient', patient._id] });
      qc.invalidateQueries({ queryKey: ['patients'] });
      setEditing(false);
    },
  });

  const notes = patient.medicalHistory?.notes;

  return (
    <div className="card">
      <div className="card__header">
        <div className="card__title">Observaciones</div>
        {!editing && (
          <button className="btn btn--ghost btn--icon" onClick={() => setEditing(true)}>
            <Icon name="edit" size={12} />
          </button>
        )}
      </div>
      <div
        className="card__body"
        style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}
      >
        {editing ? (
          <>
            <textarea
              className="input"
              style={{ width: '100%', minHeight: 100, padding: 10, resize: 'vertical' }}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setDraft(notes ?? '');
                  setEditing(false);
                }}
              >
                Cancelar
              </button>
              <button
                className="btn btn--primary btn--sm"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(draft)}
              >
                {mutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </>
        ) : notes ? (
          <>
            <div style={{ whiteSpace: 'pre-wrap' }}>{notes}</div>
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid var(--border-subtle)',
                fontSize: 11,
                color: 'var(--text-tertiary)',
              }}
            >
              Última edición · ficha del paciente
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12.5 }}>
            Sin observaciones aún. Hacé click en el lápiz para agregar.
          </div>
        )}
      </div>
    </div>
  );
}

export function NextAppointmentCard({ patient }: RailProps) {
  const { data: appts = [] } = useQuery({
    queryKey: ['appointments', 'by-patient', patient._id],
    queryFn: () => appointmentsApi.findAll({ patientId: patient._id }),
  });

  const now = Date.now();
  const next = appts
    .filter(a =>
      new Date(a.startsAt).getTime() > now &&
      a.status !== 'CANCELLED' && a.status !== 'NO_SHOW',
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  if (!next) {
    return (
      <div className="card">
        <div className="card__header">
          <div className="card__title">Próxima cita</div>
        </div>
        <div
          className="card__body"
          style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}
        >
          Sin turnos agendados.
        </div>
      </div>
    );
  }

  const start = new Date(next.startsAt);
  const end = new Date(next.endsAt);
  const month = start.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase();
  const day = start.getDate();
  const reminderDays = Math.max(
    0,
    Math.ceil((start.getTime() - now) / 86_400_000) - 1,
  );

  return (
    <div className="card">
      <div className="card__header">
        <div className="card__title">Próxima cita</div>
      </div>
      <div className="card__body">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              background: 'var(--brand-primary-50)',
              color: 'var(--brand-primary-600)',
              borderRadius: 8,
              padding: '8px 12px',
              textAlign: 'center',
              minWidth: 52,
            }}
          >
            <div style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>
              {month}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{day}</div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{next.title ?? 'Turno'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {hhmm(next.startsAt)} – {hhmm(next.endsAt)}
              {start.toDateString() !== end.toDateString() ? '' : ''}
            </div>
            <div style={{ marginTop: 8 }}>
              <span className="badge badge--success">
                <Icon name="whatsapp" size={10} /> Recordatorio en {reminderDays}d
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AllergiesCard({ patient }: RailProps) {
  const allergies = patient.medicalHistory?.allergies ?? [];
  const notes = patient.medicalHistory?.notes;
  const conditions = patient.medicalHistory?.conditions ?? [];

  return (
    <div className="card">
      <div className="card__header">
        <div className="card__title">Alergias y antecedentes</div>
      </div>
      <div
        className="card__body"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {allergies.length > 0 ? (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {allergies.map(a => (
              <span key={a} className="badge badge--warning">
                <Icon name="alert" size={10} /> {a}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Sin alergias registradas.
          </div>
        )}
        {conditions.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {conditions.join(' · ')}
          </div>
        )}
        {/* Mirror of the clinical notes — present here as a quick read-only
            recap so the dentist sees it without scrolling to the main card. */}
        {notes && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{notes}</div>
        )}
      </div>
    </div>
  );
}
