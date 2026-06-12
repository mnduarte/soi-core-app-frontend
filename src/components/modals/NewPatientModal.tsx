import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, FormField } from '../common/Modal';
import { SectionLabel } from '../common/Toggle';
import { Icon } from '../common/Icon';
import { patientsApi } from '../../api/patients';
import { useUIStore } from '../../store/ui.store';

interface NewPatientModalProps {
  open: boolean;
  onClose: () => void;
}

const OBRA_SOCIAL_OPTIONS = ['Particular', 'OSDE', 'Swiss Medical', 'Galeno', 'IOMA', 'PAMI', 'Otra'];
const ALLERGY_OPTIONS = ['Penicilina', 'Látex', 'Anestésicos', 'Aspirina', 'Otros antibióticos'];

interface FormState {
  name: string;
  lastName: string;
  birthDate: string;
  phone: string;
  email: string;
  obraSocial: string;
  nAfiliado: string;
  locality: string;
  allergies: string[];
  notes: string;
}

const EMPTY: FormState = {
  name: '',
  lastName: '',
  birthDate: '',
  phone: '',
  email: '',
  obraSocial: '',
  nAfiliado: '',
  locality: 'CABA',
  allergies: [],
  notes: '',
};

// Age derived from a birthdate (YYYY-MM-DD), for the live hint next to the field.
function computeAge(iso: string): number | null {
  if (!iso) return null;
  const b = new Date(iso);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a >= 0 && a < 150 ? a : null;
}

export function NewPatientModal({ open, onClose }: NewPatientModalProps) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const openModal = useUIStore(s => s.openModal);
  const [data, setData] = useState<FormState>(EMPTY);
  const [error, setError] = useState('');

  // Reset on every open/close transition so the form is always blank when the
  // modal becomes visible again, even if the previous close came from a submit.
  useEffect(() => {
    setData(EMPTY);
    setError('');
  }, [open]);

  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => setData(d => ({ ...d, [k]: v }));

  const toggleAllergy = (a: string) => {
    setData(d => ({
      ...d,
      allergies: d.allergies.includes(a) ? d.allergies.filter(x => x !== a) : [...d.allergies, a],
    }));
  };

  const mutation = useMutation({
    mutationFn: patientsApi.create,
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'No se pudo crear la ficha');
    },
  });

  const isValid = data.name.trim() && data.lastName.trim();
  const birthAge = computeAge(data.birthDate);

  const buildPayload = () => ({
    name: data.name.trim(),
    lastName: data.lastName.trim(),
    phone: data.phone.trim() || undefined,
    email: data.email.trim() || undefined,
    locality: data.locality.trim() || undefined,
    obraSocial: data.obraSocial || undefined,
    nAfiliado: data.nAfiliado.trim() || undefined,
    birthDate: data.birthDate || undefined,
    medicalHistory:
      data.allergies.length || data.notes.trim()
        ? {
            allergies: data.allergies.length ? data.allergies : undefined,
            notes: data.notes.trim() || undefined,
          }
        : undefined,
  });

  const submit = async (mode: 'close' | 'andSchedule') => {
    const created = await mutation.mutateAsync(buildPayload());
    qc.invalidateQueries({ queryKey: ['patients'] });
    if (mode === 'andSchedule') {
      showToast(`Ficha creada — ${created.name} ${created.lastName}`);
      openModal('newAppointment', { patientId: created._id });
    } else {
      showToast(`Ficha creada — ${created.name} ${created.lastName}`);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo paciente"
      sub="Crear ficha. Solo lo esencial — el resto se completa después."
      width={680}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={mutation.isPending}>Cancelar</button>
          <button
            className="btn btn--secondary"
            disabled={!isValid || mutation.isPending}
            onClick={() => submit('andSchedule')}
          >
            Guardar y agendar turno
          </button>
          <button
            className="btn btn--primary"
            disabled={!isValid || mutation.isPending}
            onClick={() => submit('close')}
          >
            <Icon name="check" /> {mutation.isPending ? 'Creando…' : 'Crear ficha'}
          </button>
        </>
      }
    >
      {error && (
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '8px 12px', borderRadius: 6, fontSize: 12.5, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <SectionLabel>Datos personales</SectionLabel>
      <div className="form-row form-row--2">
        <FormField label="Nombre">
          <input
            className="input"
            autoFocus
            placeholder="Lucía"
            value={data.name}
            onChange={e => upd('name', e.target.value)}
          />
        </FormField>
        <FormField label="Apellido">
          <input
            className="input"
            placeholder="Fernández"
            value={data.lastName}
            onChange={e => upd('lastName', e.target.value)}
          />
        </FormField>
      </div>
      <div className="form-row form-row--3">
        <FormField label="Fecha de nacimiento" hint={birthAge != null ? `${birthAge} años` : undefined}>
          <input
            className="input"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={data.birthDate}
            onChange={e => upd('birthDate', e.target.value)}
          />
        </FormField>
        <FormField label="Teléfono" hint="Para WhatsApp">
          <input
            className="input"
            placeholder="+54 9 11 ..."
            value={data.phone}
            onChange={e => upd('phone', e.target.value)}
          />
        </FormField>
        <FormField label="Email">
          <input
            className="input"
            type="email"
            placeholder="opcional"
            value={data.email}
            onChange={e => upd('email', e.target.value)}
          />
        </FormField>
      </div>

      <SectionLabel>Obra social</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {OBRA_SOCIAL_OPTIONS.map(o => (
          <button
            key={o}
            type="button"
            onClick={() => upd('obraSocial', o)}
            style={{
              padding: '5px 11px',
              fontSize: 12,
              borderRadius: 999,
              border: '1px solid',
              borderColor: data.obraSocial === o ? 'var(--brand-primary)' : 'var(--border-default)',
              background: data.obraSocial === o ? 'var(--brand-primary-50)' : 'var(--bg-surface)',
              color: data.obraSocial === o ? 'var(--brand-primary-600)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {o}
          </button>
        ))}
      </div>
      <div className="form-row form-row--2">
        <FormField label="Nº de afiliado">
          <input
            className="input"
            placeholder="opcional"
            value={data.nAfiliado}
            onChange={e => upd('nAfiliado', e.target.value)}
          />
        </FormField>
        <FormField label="Localidad">
          <input
            className="input"
            value={data.locality}
            onChange={e => upd('locality', e.target.value)}
          />
        </FormField>
      </div>

      <SectionLabel hint="(opcional, se puede completar después)">Antecedentes</SectionLabel>
      <FormField label="Alergias y advertencias">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ALLERGY_OPTIONS.map(a => {
            const has = data.allergies.includes(a);
            return (
              <button
                key={a}
                type="button"
                onClick={() => toggleAllergy(a)}
                style={{
                  padding: '5px 11px',
                  fontSize: 12,
                  borderRadius: 999,
                  border: '1px solid',
                  borderColor: has ? 'var(--warning)' : 'var(--border-default)',
                  background: has ? '#FEF3C7' : 'var(--bg-surface)',
                  color: has ? '#92400E' : 'var(--text-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                }}
              >
                {has && <Icon name="check" size={11} />}{a}
              </button>
            );
          })}
        </div>
      </FormField>

      <FormField label="Notas clínicas iniciales">
        <textarea
          className="input"
          style={{ height: 60, padding: 10, resize: 'none' }}
          placeholder="Hipertensión, diabético, embarazo, medicación habitual…"
          value={data.notes}
          onChange={e => upd('notes', e.target.value)}
        />
      </FormField>
    </Modal>
  );
}
