import { useEffect } from 'react';
import { useUIStore } from '../../store/ui.store';
import { Icon } from './Icon';

export function ToastHost() {
  const toast = useUIStore(s => s.toast);
  const clearToast = useUIStore(s => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 3500);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;

  return (
    <div className="toast-host">
      <div className="toast">
        <div className="toast__icon">
          <Icon name="check" size={13} />
        </div>
        {toast}
      </div>
    </div>
  );
}
