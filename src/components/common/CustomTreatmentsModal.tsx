import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicsApi } from '../../api/clinics';
import { useUIStore } from '../../store/ui.store';
import { Icon } from './Icon';

// Personaliza la lista de trabajos/prestaciones rápidas del consultorio.
// Guarda solo (al agregar/quitar) en la config de la clínica — sin botón Guardar,
// para no confundir con el Agregar. Compartida Agenda + Ficha rápida.
export function CustomTreatmentsModal({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  initial: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const [list, setList] = useState<string[]>(initial);
  const [nuevo, setNuevo] = useState('');

  useEffect(() => {
    if (open) setList(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveMut = useMutation({
    mutationFn: (items: string[]) => clinicsApi.updateSettings({ quickTreatments: items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-settings'] }),
    onError: () => showToast('No se pudo guardar', 'error'),
  });

  // Persiste al instante y confirma con un toast (refuerzo positivo).
  const commit = (items: string[], msg: string) => {
    setList(items);
    saveMut.mutate(items, { onSuccess: () => showToast(msg) });
  };

  const add = () => {
    const v = nuevo.trim();
    setNuevo('');
    if (!v || list.some(x => x.toLowerCase() === v.toLowerCase())) return;
    commit([...list, v], `"${v}" agregado ✓`);
  };
  const remove = (t: string) => commit(list.filter(x => x !== t), `"${t}" quitado`);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(60,52,34,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16, animation: 'overlayFade 0.12s ease-out' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-surface)', borderRadius: 14, width: '100%', maxWidth: 400, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', animation: 'dialogPop 0.16s cubic-bezier(0.16,1,0.3,1)' }}
      >
        <div style={{ padding: '18px 20px 6px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Personalizar trabajos</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 3 }}>
              Se guardan solos. Se usan en la Agenda y la Ficha clínica.
            </div>
          </div>
          <button className="btn btn--secondary btn--sm" onClick={onClose}>
            <Icon name="x" size={13} /> Cerrar
          </button>
        </div>

        <div style={{ padding: '10px 20px', display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {list.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', padding: '4px 0' }}>Sin trabajos. Agregá abajo.</div>
          )}
          {list.map(t => (
            <span
              key={t}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 11px', border: '1px solid var(--border-default)', borderRadius: 999, fontSize: 13 }}
            >
              {t}
              <button
                onClick={() => remove(t)}
                className="btn btn--ghost btn--icon btn--sm"
                title="Quitar"
                style={{ color: 'var(--danger)', width: 20, height: 20 }}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>

        <div style={{ padding: '8px 20px 20px', display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="Nuevo trabajo (ej: Endodoncia)"
            value={nuevo}
            onChange={e => setNuevo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            style={{ flex: 1, height: 38 }}
          />
          <button className="btn btn--primary" onClick={add} style={{ height: 38 }}>
            <Icon name="plus" size={14} /> Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
