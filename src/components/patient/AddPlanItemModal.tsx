import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, FormField } from '../common/Modal';
import { Icon } from '../common/Icon';
import { DatePicker } from '../common/DatePicker';
import {
  treatmentPlansApi,
  type TreatmentItemStatus,
} from '../../api/treatment-plans';
import { useUIStore } from '../../store/ui.store';

interface AddPlanItemModalProps {
  open: boolean;
  onClose: () => void;
  patientId: string;
}

const COMMON_PRESTACIONES = [
  'Control', 'Limpieza', 'Conducto', 'Composite', 'Extracción',
  'Ortodoncia — ajuste', 'Blanqueamiento', 'Corona', 'Implante',
];

const STATUSES: { key: TreatmentItemStatus; label: string }[] = [
  { key: 'PROPOSED',    label: 'Propuesto' },
  { key: 'SCHEDULED',   label: 'Programado' },
  { key: 'IN_PROGRESS', label: 'En curso' },
  { key: 'COMPLETED',   label: 'Completado' },
  { key: 'RECURRENT',   label: 'Recurrente' },
];

export function AddPlanItemModal({ open, onClose, patientId }: AddPlanItemModalProps) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);

  const [diente, setDiente] = useState('');
  const [estimatedDate, setEstimatedDate] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TreatmentItemStatus>('PROPOSED');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
    } else {
      setDiente('');
      setEstimatedDate('');
      setDescription('');
      setStatus('PROPOSED');
      setError('');
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      treatmentPlansApi.addItem(patientId, {
        description: description.trim(),
        toothNumber: diente ? parseInt(diente, 10) : undefined,
        status,
        estimatedDate: estimatedDate || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treatment-plans', patientId] });
      showToast(`Agregado al plan — ${description}`);
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'No se pudo agregar al plan');
    },
  });

  const isValid = description.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agregar al plan de tratamiento"
      sub="Una prestación a realizar. Podés dejar el diente vacío si es general."
      width={580}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </button>
          <button
            className="btn btn--primary"
            disabled={!isValid || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <Icon name="plus" /> {mutation.isPending ? 'Agregando…' : 'Agregar'}
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

      <div className="form-row form-row--2">
        <FormField label="Diente (FDI)" hint="Opcional · ej. 16, 24…">
          <input
            className="input mono"
            placeholder="16"
            value={diente}
            onChange={e => setDiente(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
            autoFocus
          />
        </FormField>
        <FormField label="Fecha estimada" hint="Opcional">
          <DatePicker value={estimatedDate} onChange={setEstimatedDate} placeholder="dd/mm/aaaa" />
        </FormField>
      </div>

      <FormField label="Prestación">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {COMMON_PRESTACIONES.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setDescription(p)}
              style={{
                padding: '4px 10px',
                fontSize: 11.5,
                borderRadius: 999,
                border: '1px solid',
                borderColor: description === p ? 'var(--brand-primary)' : 'var(--border-default)',
                background: description === p ? 'var(--brand-primary-50)' : 'var(--bg-surface)',
                color: description === p ? 'var(--brand-primary-600)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <input
          className="input"
          placeholder="O escribí otra…"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </FormField>

      <FormField label="Estado">
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {STATUSES.map(s => (
            <button
              key={s.key}
              type="button"
              className={`seg__btn ${status === s.key ? 'is-active' : ''}`}
              onClick={() => setStatus(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </FormField>
    </Modal>
  );
}
