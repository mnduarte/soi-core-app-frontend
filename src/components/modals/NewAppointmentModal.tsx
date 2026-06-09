import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, FormField } from '../common/Modal';
import { Icon } from '../common/Icon';
import { DatePicker } from '../common/DatePicker';
import { PatientPicker } from '../common/PatientPicker';
import { appointmentsApi } from '../../api/appointments';
import { useUIStore } from '../../store/ui.store';

interface NewAppointmentModalProps {
  open: boolean;
  onClose: () => void;
  defaultPatientId?: string;
}

const DURATIONS = [15, 30, 45, 60, 90];
const TREATMENTS = [
  'Control', 'Limpieza', 'Conducto', 'Composite', 'Extracción',
  'Ortodoncia — ajuste', 'Blanqueamiento', 'Corona', 'Consulta inicial', 'Radiografía',
];

const TIMES = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30',
];

function toLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function isoOf(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

export function NewAppointmentModal({ open, onClose, defaultPatientId }: NewAppointmentModalProps) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);

  const [patientId, setPatientId] = useState<string | null>(defaultPatientId ?? null);
  const [date, setDate] = useState(toLocalDateInput(new Date()));
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(30);
  const [title, setTitle] = useState('Control');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  // Sync patientId from props on open, and wipe the whole form on close so the
  // next opening is always a clean slate — no stale date/time/notes leaking
  // from the previous booking.
  useEffect(() => {
    if (open) {
      setPatientId(defaultPatientId ?? null);
      setError('');
    } else {
      setPatientId(null);
      setDate(toLocalDateInput(new Date()));
      setTime('10:00');
      setDuration(30);
      setTitle('Control');
      setNotes('');
      setError('');
    }
  }, [open, defaultPatientId]);

  // Fetch existing appointments for the selected date to grey out taken slots
  const { data: dayAppts = [] } = useQuery({
    queryKey: ['appointments', 'modal-day', date],
    queryFn: () => {
      const from = new Date(`${date}T00:00:00`).toISOString();
      const to = new Date(`${date}T23:59:59`).toISOString();
      return appointmentsApi.findAll({ from, to });
    },
    enabled: open && Boolean(date),
  });

  const takenSet = useMemo(() => {
    return new Set(
      dayAppts
        .filter(a => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW')
        .map(a => new Date(a.startsAt).toTimeString().slice(0, 5)),
    );
  }, [dayAppts]);

  const reset = (keepPatient = false) => {
    if (!keepPatient) setPatientId(defaultPatientId ?? null);
    setTime('10:00');
    setDuration(30);
    setTitle('Control');
    setNotes('');
    setError('');
  };

  const mutation = useMutation({
    mutationFn: appointmentsApi.create,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      const dt = new Date(vars.startsAt);
      showToast(`Turno confirmado — ${dt.toLocaleDateString('es-AR')} ${dt.toTimeString().slice(0, 5)}`);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'No se pudo crear el turno');
    },
  });

  const isValid = Boolean(patientId && date && time);

  const buildPayload = () => {
    if (!patientId) return null;
    const startsAt = isoOf(date, time);
    const endsAt = new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString();
    return {
      patientId,
      startsAt,
      endsAt,
      title,
      notes: notes.trim() || undefined,
    };
  };

  const submit = async (mode: 'close' | 'another') => {
    const payload = buildPayload();
    if (!payload) return;
    await mutation.mutateAsync(payload);
    if (mode === 'close') {
      onClose();
    } else {
      reset(true);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo turno"
      sub="Programá un turno para un paciente existente"
      width={620}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={mutation.isPending}>Cancelar</button>
          <button
            className="btn btn--secondary"
            disabled={!isValid || mutation.isPending}
            onClick={() => submit('another')}
          >
            Guardar y otro
          </button>
          <button
            className="btn btn--primary"
            disabled={!isValid || mutation.isPending}
            onClick={() => submit('close')}
          >
            <Icon name="check" /> {mutation.isPending ? 'Guardando…' : 'Confirmar turno'}
          </button>
        </>
      }
    >
      {error && (
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '8px 12px', borderRadius: 6, fontSize: 12.5, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div className="form-row">
        <FormField label="Paciente">
          <PatientPicker value={patientId} onChange={setPatientId} />
        </FormField>
      </div>

      <div className="form-row form-row--3">
        <FormField label="Fecha">
          <DatePicker value={date} onChange={setDate} />
        </FormField>
        <FormField label="Hora">
          <div className="input" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
            <Icon name="clock" size={13} style={{ color: 'var(--text-tertiary)' }} />
            <input
              type="time"
              style={{ border: 'none', background: 'none', outline: 'none', width: '100%', fontSize: 13 }}
              value={time}
              onChange={e => setTime(e.target.value)}
            />
          </div>
        </FormField>
        <FormField label="Duración">
          <div className="seg" style={{ flexWrap: 'wrap' }}>
            {DURATIONS.map(d => (
              <button
                key={d}
                type="button"
                className={`seg__btn ${duration === d ? 'is-active' : ''}`}
                onClick={() => setDuration(d)}
              >
                {d}m
              </button>
            ))}
          </div>
        </FormField>
      </div>

      <FormField label="Slots disponibles del día" hint="Click para elegir un horario libre">
        <div className="slot-grid">
          {TIMES.map(t => {
            const isTaken = takenSet.has(t);
            const isSelected = t === time;
            return (
              <button
                key={t}
                type="button"
                disabled={isTaken}
                onClick={() => setTime(t)}
                className="mono"
                style={{
                  padding: '6px 0',
                  borderRadius: 5,
                  fontSize: 11.5,
                  fontWeight: 500,
                  background: isTaken ? 'var(--bg-muted)' : isSelected ? 'var(--brand-primary)' : 'var(--bg-surface)',
                  color: isTaken ? 'var(--text-tertiary)' : isSelected ? 'white' : 'var(--text-primary)',
                  border: '1px solid',
                  borderColor: isSelected ? 'var(--brand-primary)' : 'var(--border-subtle)',
                  textDecoration: isTaken ? 'line-through' : 'none',
                  cursor: isTaken ? 'not-allowed' : 'pointer',
                  opacity: isTaken ? 0.6 : 1,
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      </FormField>

      <FormField label="Tratamiento o motivo">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {TREATMENTS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTitle(t)}
              style={{
                padding: '4px 10px',
                fontSize: 11.5,
                borderRadius: 999,
                border: '1px solid',
                borderColor: title === t ? 'var(--brand-primary)' : 'var(--border-default)',
                background: title === t ? 'var(--brand-primary-50)' : 'var(--bg-surface)',
                color: title === t ? 'var(--brand-primary-600)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          className="input"
          placeholder="O escribí otro…"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
      </FormField>

      <FormField label="Nota interna">
        <textarea
          className="input"
          style={{ height: 60, padding: 10, resize: 'none' }}
          placeholder="Visible solo para el equipo. Ej: traer radiografías previas, alergia a penicilina…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </FormField>

    </Modal>
  );
}
