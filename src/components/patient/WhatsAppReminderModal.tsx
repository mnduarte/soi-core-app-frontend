import { useEffect, useState } from 'react';
import { Modal, FormField } from '../common/Modal';
import { Icon } from '../common/Icon';
import { fmtMoney } from '../../lib/format';

interface ReminderPatient {
  name: string;
  lastName?: string;
  phone?: string;
  obraSocial?: string;
}

interface WhatsAppReminderModalProps {
  open: boolean;
  onClose: () => void;
  patient: ReminderPatient;
  // Saldo deuda-positiva: > 0 = el paciente debe.
  balance: number;
  clinicName?: string;
}

type Tone = 'cordial' | 'firme' | 'link';

const TONES: { key: Tone; label: string }[] = [
  { key: 'cordial', label: 'Cordial' },
  { key: 'firme', label: 'Firme' },
  { key: 'link', label: 'Con link de pago' },
];

function buildMessage(tone: Tone, firstName: string, debtStr: string, clinic: string): string {
  if (tone === 'firme') {
    return `Hola ${firstName}, te contactamos de ${clinic}. Figura un saldo pendiente de ${debtStr} en tu cuenta. Te pedimos por favor regularizarlo a la brevedad. Ante cualquier duda, quedamos a disposición.`;
  }
  if (tone === 'link') {
    return `Hola ${firstName} 👋 Te escribimos de ${clinic}. Tenés un saldo pendiente de ${debtStr}. Podés abonarlo desde este link: https://pago.soi.app — ¡Gracias!`;
  }
  return `Hola ${firstName} 👋 Te escribimos de ${clinic}. Te recordamos que tenés un saldo pendiente de ${debtStr}. Podés abonar por transferencia, débito o Mercado Pago. ¡Cualquier duda avisanos! 🦷`;
}

export function WhatsAppReminderModal({
  open,
  onClose,
  patient,
  balance,
  clinicName = 'tu consultorio',
}: WhatsAppReminderModalProps) {
  const firstName = patient.name.split(' ')[0];
  const debtStr = fmtMoney(Math.abs(balance));
  const [tone, setTone] = useState<Tone>('cordial');
  const [msg, setMsg] = useState('');
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    if (open) {
      setTone('cordial');
      setEdited(false);
    }
  }, [open]);

  // Regenera la plantilla al cambiar de tono, salvo que el usuario haya editado.
  useEffect(() => {
    if (open && !edited) setMsg(buildMessage(tone, firstName, debtStr, clinicName));
  }, [open, tone, firstName, debtStr, clinicName, edited]);

  const send = () => {
    const phone = (patient.phone ?? '').replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Recordar pago por WhatsApp"
      sub={`Mensaje para ${patient.name} ${patient.lastName ?? ''}${patient.phone ? ` · ${patient.phone}` : ''}`}
      width={560}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn--whatsapp"
            onClick={send}
            style={{ background: '#25D366', color: '#fff' }}
          >
            <Icon name="whatsapp" /> Abrir WhatsApp
          </button>
        </>
      }
    >
      {/* Saldo */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          marginBottom: 16,
          borderRadius: 8,
          background: balance > 0 ? '#FEF2F2' : 'var(--bg-muted)',
          border: balance > 0 ? '1px solid #FECACA' : '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Saldo pendiente</div>
          <div
            className="mono"
            style={{ fontSize: 20, fontWeight: 700, color: balance > 0 ? 'var(--danger)' : 'var(--success)' }}
          >
            {debtStr}
          </div>
        </div>
        {patient.obraSocial && (
          <div style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
            {patient.obraSocial}
          </div>
        )}
      </div>

      <FormField label="Tono del mensaje">
        <div className="seg">
          {TONES.map(t => (
            <button
              key={t.key}
              type="button"
              className={`seg__btn ${tone === t.key ? 'is-active' : ''}`}
              onClick={() => { setTone(t.key); setEdited(false); }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Mensaje" hint="Podés editarlo antes de enviar">
        <textarea
          className="input"
          rows={8}
          style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, minHeight: 160, padding: 12 }}
          value={msg}
          onChange={e => { setMsg(e.target.value); setEdited(true); }}
        />
      </FormField>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
        <Icon name="alert" size={13} />
        Se abre WhatsApp con el mensaje listo — vos confirmás el envío.
      </div>
    </Modal>
  );
}
