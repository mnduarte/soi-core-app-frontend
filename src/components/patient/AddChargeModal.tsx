import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, FormField } from '../common/Modal';
import { Icon } from '../common/Icon';
import { transactionsApi } from '../../api/transactions';
import { useUIStore } from '../../store/ui.store';
import { fmtMoney } from '../../lib/format';

interface AddChargeModalProps {
  open: boolean;
  onClose: () => void;
  patientId: string;
}

export function AddChargeModal({ open, onClose, patientId }: AddChargeModalProps) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setAmount('');
    setDescription('');
    setError('');
  }, [open]);

  const amountNum = parseInt(amount.replace(/\D/g, ''), 10) || 0;

  const mutation = useMutation({
    mutationFn: () =>
      transactionsApi.createCharge({
        patientId,
        amount: amountNum,
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['balance'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      showToast(`Cargo agregado — ${fmtMoney(amountNum)}`);
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'No se pudo agregar el cargo');
    },
  });

  const isValid = amountNum > 0 && description.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agregar cargo"
      sub="Carga una prestación a la cuenta corriente del paciente (DEBE)."
      width={520}
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
            <Icon name="plus" /> {mutation.isPending ? 'Agregando…' : `Agregar cargo ${amountNum > 0 ? fmtMoney(amountNum) : ''}`}
          </button>
        </>
      }
    >
      {error && (
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '8px 12px', borderRadius: 6, fontSize: 12.5, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <FormField label="Prestación / concepto">
        <input
          className="input"
          autoFocus
          placeholder="Composite 24, Corona 26…"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </FormField>

      <FormField label="Monto">
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 20, fontWeight: 600, color: 'var(--text-tertiary)',
          }}>$</span>
          <input
            className="input mono"
            style={{ height: 56, fontSize: 24, paddingLeft: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
            placeholder="0"
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
          />
        </div>
      </FormField>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
        <Icon name="alert" size={13} />
        Para cobrar, usá <b style={{ color: 'var(--text-secondary)' }}>Registrar cobro</b>. Esto solo agrega lo que el paciente debe.
      </div>
    </Modal>
  );
}
