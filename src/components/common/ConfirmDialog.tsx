import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  icon?: IconName;
  // Contenido extra entre el mensaje y los botones (ej. un checkbox).
  extra?: ReactNode;
  // Para operaciones destructivas: requiere que el usuario escriba este texto exacto.
  requireTextConfirmation?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Diálogo de confirmación propio (reemplaza al window.confirm nativo), con el
// look de la app. Enter confirma, Escape cancela.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  icon,
  extra,
  requireTextConfirmation,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [textInput, setTextInput] = useState('');

  useEffect(() => {
    if (open) {
      setTextInput('');
    }
  }, [open]);

  useEffect(() => {
    if (!open || !requireTextConfirmation) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && textInput === requireTextConfirmation) onConfirm();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onConfirm, onCancel, textInput, requireTextConfirmation]);

  useEffect(() => {
    if (!open || requireTextConfirmation) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onConfirm, onCancel, requireTextConfirmation]);

  if (!open) return null;

  const accent = danger ? 'var(--danger)' : 'var(--brand-primary)';

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
        animation: 'overlayFade 0.12s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 14,
          width: '100%',
          maxWidth: 344,
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          animation: 'dialogPop 0.16s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ padding: '18px 18px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: message ? 10 : 0 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                color: accent,
              }}
            >
              <Icon name={icon ?? (danger ? 'trash' : 'alert')} size={16} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          </div>
          {message && (
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45, paddingLeft: 45 }}>
              {message}
            </div>
          )}
          {requireTextConfirmation && (
            <div style={{ paddingLeft: 45, marginTop: 12 }}>
              <input
                autoFocus
                type="text"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder={`Escribe "${requireTextConfirmation}" para confirmar`}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: 12.5,
                  border: '1px solid var(--border-default)',
                  borderRadius: 6,
                  background: 'var(--bg-default)',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
          {extra && <div style={{ paddingLeft: 45, marginTop: 10 }}>{extra}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 18px 16px' }}>
          <button className="btn btn--secondary btn--sm" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className="btn btn--sm"
            onClick={onConfirm}
            disabled={requireTextConfirmation ? textInput !== requireTextConfirmation : false}
            style={{
              background: accent,
              borderColor: accent,
              color: '#fff',
              opacity: requireTextConfirmation && textInput !== requireTextConfirmation ? 0.5 : 1,
              cursor: requireTextConfirmation && textInput !== requireTextConfirmation ? 'not-allowed' : 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
