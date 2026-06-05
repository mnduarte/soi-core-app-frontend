import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, FormField } from '../common/Modal';
import { Icon } from '../common/Icon';
import {
  clinicalEntriesApi,
  type ClinicalEntryType,
} from '../../api/clinical-entries';
import { useUIStore } from '../../store/ui.store';

interface NewClinicalEntryModalProps {
  open: boolean;
  onClose: () => void;
  patientId: string;
  // Cuando se documenta un turno: el backend enlaza la entrada y apaga su badge
  // "ficha pendiente". Si no viene, es una entrada manual (llamado, nota suelta).
  appointmentId?: string;
}

const TYPE_OPTIONS: { value: ClinicalEntryType; label: string }[] = [
  { value: 'TREATMENT', label: 'Tratamiento' },
  { value: 'CONTROL', label: 'Control' },
  { value: 'PHOTO', label: 'Foto' },
  { value: 'NOTE', label: 'Nota' },
];

const QUICK_NOTES = [
  'Control de rutina · sin novedades.',
  'Continúa según plan de tratamiento.',
  'Buena respuesta al tratamiento. Sin sensibilidad.',
  'Se entregan indicaciones de higiene. Paciente colaborador.',
];

export function NewClinicalEntryModal({
  open,
  onClose,
  patientId,
  appointmentId,
}: NewClinicalEntryModalProps) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);

  const [type, setType] = useState<ClinicalEntryType>('CONTROL');
  const [procedure, setProcedure] = useState('');
  const [tooth, setTooth] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  // Reset en cada apertura/cierre para que el form arranque limpio.
  useEffect(() => {
    setType('CONTROL');
    setProcedure('');
    setTooth('');
    setContent('');
    setError('');
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      clinicalEntriesApi.create(patientId, {
        content: content.trim(),
        type,
        procedure: procedure.trim() || undefined,
        toothNumber: tooth ? Number(tooth) : undefined,
        appointmentId,
      }),
    onError: (err: unknown) => {
      const raw = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      const inner = raw && typeof raw === 'object' ? (raw as { message?: unknown }).message : raw;
      const msg = Array.isArray(inner) ? inner.join(', ') : typeof inner === 'string' ? inner : undefined;
      setError(msg ?? 'No se pudo guardar la entrada');
    },
  });

  const isValid = content.trim().length > 0;

  const submit = async () => {
    await mutation.mutateAsync();
    qc.invalidateQueries({ queryKey: ['clinical-entries', patientId] });
    // Si documentó un turno, refrescamos la agenda para que el badge se actualice.
    if (appointmentId) qc.invalidateQueries({ queryKey: ['appointments'] });
    showToast('Entrada guardada en la evolución');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva entrada de evolución"
      sub={
        appointmentId
          ? 'Documenta este turno. Queda en la historia clínica con fecha y profesional.'
          : 'Queda registrada en la historia clínica con fecha y profesional.'
      }
      width={580}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </button>
          <button
            className="btn btn--primary"
            disabled={!isValid || mutation.isPending}
            onClick={submit}
          >
            <Icon name="plus" /> {mutation.isPending ? 'Guardando…' : 'Guardar entrada'}
          </button>
        </>
      }
    >
      {error && (
        <div
          style={{
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12.5,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      <FormField label="Tipo de evento">
        <div className="seg">
          {TYPE_OPTIONS.map(t => (
            <button
              key={t.value}
              type="button"
              className={`seg__btn ${type === t.value ? 'is-active' : ''}`}
              onClick={() => setType(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </FormField>

      <div className="form-row form-row--2">
        <FormField label="Prestación / título" hint="Opcional">
          <input
            className="input"
            placeholder={TYPE_OPTIONS.find(t => t.value === type)?.label}
            value={procedure}
            onChange={e => setProcedure(e.target.value)}
          />
        </FormField>
        <FormField label="Diente (FDI)" hint="Opcional">
          <input
            className="input mono"
            placeholder="16"
            value={tooth}
            onChange={e => setTooth(e.target.value.replace(/\D/g, '').slice(0, 2))}
          />
        </FormField>
      </div>

      <FormField label="Nota clínica">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {QUICK_NOTES.map(q => (
            <button
              key={q}
              type="button"
              onClick={() => setContent(q)}
              style={{
                padding: '4px 10px',
                fontSize: 11.5,
                borderRadius: 999,
                border: '1px solid',
                borderColor: content === q ? 'var(--brand-primary)' : 'var(--border-default)',
                background: content === q ? 'var(--brand-primary-50)' : 'var(--bg-surface)',
                color: content === q ? 'var(--brand-primary-600)' : 'var(--text-secondary)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {q}
            </button>
          ))}
        </div>
        <textarea
          className="input"
          rows={3}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
          placeholder="Describí lo realizado en esta visita…"
          value={content}
          onChange={e => setContent(e.target.value)}
          autoFocus
        />
      </FormField>
    </Modal>
  );
}
