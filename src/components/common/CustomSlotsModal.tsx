import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicsApi } from '../../api/clinics';
import { useUIStore } from '../../store/ui.store';
import { Icon } from './Icon';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

// Personaliza los horarios (slots) del día de la Libreta. 24hs, sin AM/PM.
// Guarda solo, por consultorio.
export function CustomSlotsModal({
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

  // Selector de hora propio (24hs).
  const [pickH, setPickH] = useState('09');
  const [pickM, setPickM] = useState('00');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const picked = `${pickH}:${pickM}`;

  useEffect(() => {
    if (open) setList(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!pickerOpen) return;
    const h = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [pickerOpen]);

  const saveMut = useMutation({
    mutationFn: (items: string[]) => clinicsApi.updateSettings({ slotTimes: items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-settings'] }),
    onError: () => showToast('No se pudo guardar', 'error'),
  });

  const commit = (items: string[], msg: string) => {
    const sorted = [...new Set(items)].sort();
    setList(sorted);
    saveMut.mutate(sorted, { onSuccess: () => showToast(msg) });
  };

  const add = () => {
    if (list.includes(picked)) return;
    commit([...list, picked], `${picked} agregado ✓`);
  };

  if (!open) return null;

  const colStyle: CSSProperties = {
    maxHeight: 168, overflowY: 'auto', width: 62, padding: 4,
    display: 'flex', flexDirection: 'column', gap: 2,
  };
  const optStyle = (active: boolean): CSSProperties => ({
    padding: '6px 0', borderRadius: 6, textAlign: 'center', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', border: 'none',
    background: active ? 'var(--brand-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--text-primary)',
  });

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16, animation: 'overlayFade 0.12s ease-out' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-surface)', borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-lg)', overflow: 'visible', animation: 'dialogPop 0.16s cubic-bezier(0.16,1,0.3,1)' }}
      >
        <div style={{ padding: '18px 20px 6px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Personalizar horarios</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 3 }}>
              Los slots del día de tu consultorio. Se guardan solos.
            </div>
          </div>
          <button className="btn btn--secondary btn--sm" onClick={onClose}>
            <Icon name="x" size={13} /> Cerrar
          </button>
        </div>

        {/* Lista de slots */}
        <div style={{ padding: '8px 20px 6px', display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
          {list.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', padding: '4px 0' }}>Sin horarios. Agregá abajo.</div>
          )}
          {list.map(t => (
            <span key={t} className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 4px 4px 10px', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
              {t}
              <button
                onClick={() => commit(list.filter(x => x !== t), `${t} quitado`)}
                className="btn btn--ghost btn--icon btn--sm"
                title="Quitar"
                style={{ color: 'var(--danger)', width: 20, height: 20 }}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>

        {/* Agregar con selector propio 24hs */}
        <div style={{ padding: '8px 20px 20px', display: 'flex', gap: 8 }}>
          <div ref={pickerRef} style={{ position: 'relative', flex: 1 }}>
            <button
              type="button"
              className="input"
              onClick={() => setPickerOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, cursor: 'pointer', width: '100%', background: 'var(--bg-surface)' }}
            >
              <Icon name="clock" size={14} style={{ color: 'var(--text-tertiary)' }} />
              <span className="mono" style={{ fontWeight: 600 }}>{picked}</span>
              <Icon name="chevronDown" size={13} style={{ color: 'var(--text-tertiary)', marginLeft: 'auto' }} />
            </button>
            {pickerOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 4px)',
                  left: 0,
                  zIndex: 30,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 10,
                  boxShadow: 'var(--shadow-lg)',
                  padding: 8,
                  display: 'flex',
                  gap: 4,
                }}
              >
                <div style={colStyle}>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: 2 }}>Hora</div>
                  {HOURS.map(h => (
                    <button key={h} type="button" className="mono" style={optStyle(h === pickH)} onClick={() => setPickH(h)}>{h}</button>
                  ))}
                </div>
                <div style={colStyle}>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: 2 }}>Min</div>
                  {MINUTES.map(m => (
                    <button key={m} type="button" className="mono" style={optStyle(m === pickM)} onClick={() => setPickM(m)}>{m}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button className="btn btn--secondary" onClick={add} style={{ height: 38 }}>
            <Icon name="plus" size={14} /> Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
