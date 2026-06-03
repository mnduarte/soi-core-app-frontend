import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, sub, width = 560, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div onClick={onClose} className="modal-overlay">
      <div onClick={e => e.stopPropagation()} className="modal-card" style={{ maxWidth: width }}>
        <div className="modal-card__header">
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
            {sub && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>}
          </div>
          <button onClick={onClose} className="btn btn--ghost btn--icon">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-card__body">{children}</div>
        {footer && <div className="modal-card__footer">{footer}</div>}
      </div>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
  span?: number;
}

export function FormField({ label, hint, children, span }: FormFieldProps) {
  return (
    <div className="field-group" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <label className="field-label">{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
