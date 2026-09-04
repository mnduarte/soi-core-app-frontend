import { useEffect, useState } from 'react';
import { Modal, FormField } from '../common/Modal';
import { Icon } from '../common/Icon';
import { toWhatsAppNumber } from '../../lib/phone';
import { buildMsg } from '../../lib/reminder';

interface Props {
  open: boolean;
  onClose: () => void;
  patientName: string;
  phone?: string;
  dateLabel: string; // ej "miércoles 8 de julio"
  time: string; // ej "09:00"
  clinicName?: string;
  alreadySent?: boolean;
  onSent: () => void; // marca el turno como recordado
}

export function AppointmentReminderModal({
  open,
  onClose,
  patientName,
  phone,
  dateLabel,
  time,
  clinicName = 'tu consultorio',
  alreadySent,
  onSent,
}: Props) {
  const firstName = patientName.split(' ')[0];
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (open) setMsg(buildMsg(firstName, clinicName, dateLabel, time));
  }, [open, firstName, clinicName, dateLabel, time]);

  const send = () => {
    const p = toWhatsAppNumber(phone);
    // encodeURIComponent codifica bien acentos/saltos de línea.
    window.open(`https://wa.me/${p}?text=${encodeURIComponent(msg)}`, '_blank');
    onSent();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Recordar turno por WhatsApp"
      sub={`${patientName}${phone ? ` · ${phone}` : ''}`}
      width={520}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={send} style={{ background: 'var(--success)', color: '#fff' }}>
            <Icon name="whatsapp" /> {alreadySent ? 'Reenviar por WhatsApp' : 'Abrir WhatsApp'}
          </button>
        </>
      }
    >
      {alreadySent && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
            padding: '9px 12px', borderRadius: 8, fontSize: 12.5,
            color: 'var(--text-secondary)',
            background: 'color-mix(in srgb, var(--success) 10%, var(--bg-surface))',
            border: '1px solid color-mix(in srgb, var(--success) 30%, var(--border-subtle))',
          }}
        >
          <Icon name="check" size={14} style={{ color: 'var(--success)' }} />
          Ya se envió un recordatorio para este turno. Podés reenviarlo.
        </div>
      )}

      <FormField label="Mensaje" hint="Podés editarlo antes de enviar">
        <textarea
          className="input"
          rows={6}
          style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, minHeight: 140, padding: 12 }}
          value={msg}
          onChange={e => setMsg(e.target.value)}
        />
      </FormField>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-tertiary)' }}>
        <Icon name="alert" size={13} />
        Se abre WhatsApp con el mensaje listo — vos confirmás el envío.
      </div>
    </Modal>
  );
}
