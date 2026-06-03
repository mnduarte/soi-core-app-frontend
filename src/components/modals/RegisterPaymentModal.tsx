import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, FormField } from '../common/Modal';
import { Icon } from '../common/Icon';
import { Toggle } from '../common/Toggle';
import { PatientPicker } from '../common/PatientPicker';
import { transactionsApi } from '../../api/transactions';
import { patientsApi } from '../../api/patients';
import { useUIStore } from '../../store/ui.store';
import { fmtMoney } from '../../lib/format';

interface RegisterPaymentModalProps {
  open: boolean;
  onClose: () => void;
  defaultPatientId?: string;
}

const METHODS: { k: string; l: string; i: 'cash' | 'send' | 'receipt' | 'zap' }[] = [
  { k: 'CASH', l: 'Efectivo', i: 'cash' },
  { k: 'TRANSFER', l: 'Transfer.', i: 'send' },
  { k: 'DEBIT', l: 'Débito', i: 'receipt' },
  { k: 'CREDIT', l: 'Crédito', i: 'receipt' },
  { k: 'MP', l: 'MercadoPago', i: 'zap' },
];

export function RegisterPaymentModal({ open, onClose, defaultPatientId }: RegisterPaymentModalProps) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);

  const [patientId, setPatientId] = useState<string | null>(defaultPatientId ?? null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [description, setDescription] = useState('Pago a cuenta');
  const [sendReceipt, setSendReceipt] = useState(true);
  const [error, setError] = useState('');

  // Sync patient on open, wipe everything on close so the next opening doesn't
  // show the previous amount/method/concept.
  useEffect(() => {
    if (open) {
      setPatientId(defaultPatientId ?? null);
      setAmount('');
      setError('');
    } else {
      setPatientId(null);
      setAmount('');
      setMethod('CASH');
      setDescription('Pago a cuenta');
      setSendReceipt(true);
      setError('');
    }
  }, [open, defaultPatientId]);

  const { data: balanceData } = useQuery({
    queryKey: ['balance', patientId],
    queryFn: () => transactionsApi.getBalance(patientId!),
    enabled: Boolean(patientId),
  });

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => patientsApi.findById(patientId!),
    enabled: Boolean(patientId),
  });

  const amountNum = parseInt(amount.replace(/\D/g, ''), 10) || 0;
  const currentBalance = balanceData?.balance ?? 0;
  const newBalance = currentBalance + amountNum;

  const mutation = useMutation({
    mutationFn: transactionsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['balance'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      showToast(`Cobro registrado — ${fmtMoney(amountNum)}`);
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'No se pudo registrar el cobro');
    },
  });

  const isValid = patientId && amountNum > 0;

  const submit = () => {
    if (!patientId) return;
    mutation.mutate({
      patientId,
      amount: amountNum,
      paymentMethod: method,
      description: description.trim() || undefined,
    });
  };

  const QUICK_AMOUNTS = currentBalance < 0
    ? [Math.abs(currentBalance), Math.round(Math.abs(currentBalance) / 2), 10000, 25000]
    : [10000, 20000, 30000, 50000];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar cobro"
      sub="Anota un pago en la cuenta corriente del paciente"
      width={580}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn--primary"
            disabled={!isValid || mutation.isPending}
            style={{ background: isValid ? 'var(--success)' : undefined }}
            onClick={submit}
          >
            <Icon name="check" /> {mutation.isPending ? 'Guardando…' : `Confirmar cobro ${amountNum > 0 ? fmtMoney(amountNum) : ''}`}
          </button>
        </>
      }
    >
      {error && (
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '8px 12px', borderRadius: 6, fontSize: 12.5, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <FormField label="Paciente">
        <PatientPicker value={patientId} onChange={setPatientId} />
      </FormField>

      {patientId && (
        <div
          style={{
            margin: '10px 0 16px',
            padding: '12px 14px',
            background: currentBalance < 0 ? '#FEF2F2' : 'var(--bg-muted)',
            border: currentBalance < 0 ? '1px solid #FECACA' : '1px solid var(--border-subtle)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Saldo actual</div>
            <div
              className="mono"
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: currentBalance < 0 ? 'var(--danger)' : 'var(--success)',
              }}
            >
              {fmtMoney(currentBalance)}
            </div>
          </div>
          <Icon name="arrowRight" size={14} style={{ color: 'var(--text-tertiary)' }} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Saldo después del cobro</div>
            <div
              className="mono"
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: newBalance < 0 ? 'var(--danger)' : 'var(--success)',
              }}
            >
              {fmtMoney(newBalance)}
            </div>
          </div>
        </div>
      )}

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
            autoFocus
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {QUICK_AMOUNTS.map((q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setAmount(String(q))}
              style={{
                padding: '4px 10px',
                fontSize: 11.5,
                borderRadius: 999,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {fmtMoney(q)}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Método de pago">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {METHODS.map(m => (
            <button
              key={m.k}
              type="button"
              onClick={() => setMethod(m.k)}
              style={{
                padding: '10px 6px',
                fontSize: 11.5,
                fontWeight: 500,
                borderRadius: 8,
                border: '1px solid',
                borderColor: method === m.k ? 'var(--brand-primary)' : 'var(--border-default)',
                background: method === m.k ? 'var(--brand-primary-50)' : 'var(--bg-surface)',
                color: method === m.k ? 'var(--brand-primary-600)' : 'var(--text-secondary)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
              }}
            >
              <Icon name={m.i} size={15} />
              {m.l}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Concepto">
        <input className="input" value={description} onChange={e => setDescription(e.target.value)} />
      </FormField>

      <div
        style={{
          padding: '10px 12px',
          background: 'var(--bg-muted)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Icon name="whatsapp" size={16} style={{ color: '#25D366' }} />
        <div style={{ flex: 1, fontSize: 12.5 }}>
          <div style={{ fontWeight: 500 }}>Enviar comprobante por WhatsApp</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {patient?.phone ?? '—'}
          </div>
        </div>
        <Toggle checked={sendReceipt} onChange={setSendReceipt} />
      </div>
    </Modal>
  );
}
