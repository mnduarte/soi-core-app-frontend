import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useAnchored } from '../../hooks/useAnchored';

interface DatePickerProps {
  value: string;            // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
}

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function parseISO(v: string): Date {
  if (!v) return new Date();
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatDisplay(d: Date): string {
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function DatePicker({ value, onChange, placeholder = 'Elegir fecha' }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Anclado con position:fixed: adentro de una lista con scroll un panel
  // absolute se recorta contra el borde, por mas z-index que tenga.
  const cerrar = useCallback(() => setOpen(false), []);
  const posicion = useAnchored(open, ref, cerrar, { width: 264 });
  const selected = value ? parseISO(value) : null;
  const today = new Date();

  // The month grid is driven by viewMonth — independent of the selected date so
  // the user can browse without committing a selection. Resets to the selected
  // month each time the popover opens.
  const [viewMonth, setViewMonth] = useState(() =>
    new Date((selected ?? today).getFullYear(), (selected ?? today).getMonth(), 1),
  );

  useEffect(() => {
    if (open && selected) {
      setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouse = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Build calendar cells, Mon-first.
  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstDay = monthStart.getDay(); // 0=Sun..6=Sat
  const firstWeekday = firstDay === 0 ? 6 : firstDay - 1; // 0=Mon..6=Sun
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1));
  };

  const pick = (day: number) => {
    const next = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    onChange(toISO(next));
    setOpen(false);
  };

  const jumpToday = () => {
    const t = new Date();
    setViewMonth(new Date(t.getFullYear(), t.getMonth(), 1));
    onChange(toISO(t));
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="input"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-surface)',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <Icon name="calendar" size={13} style={{ color: 'var(--text-tertiary)' }} />
        <span
          style={{
            fontSize: 13,
            color: selected ? 'var(--text-primary)' : 'var(--text-tertiary)',
            flex: 1,
          }}
        >
          {selected ? formatDisplay(selected) : placeholder}
        </span>
        <Icon name="chevronDown" size={12} style={{ color: 'var(--text-tertiary)' }} />
      </button>

      {/* En <body>: dentro de un modal (que tiene transform por su animacion)
          position:fixed se ancla al modal y el calendario terminaba lejos del
          campo, abajo de todo. */}
      {open && createPortal(
        <div
          ref={popRef}
          className="datepicker-pop lb-menupop"
          style={{
            ...posicion,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-lg)',
            padding: 12,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <button type="button" className="btn btn--ghost btn--icon" onClick={() => shiftMonth(-1)}>
              <Icon name="chevronLeft" />
            </button>
            <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </div>
            <button type="button" className="btn btn--ghost btn--icon" onClick={() => shiftMonth(1)}>
              <Icon name="chevronRight" />
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 2,
              marginBottom: 4,
            }}
          >
            {WEEKDAYS.map(d => (
              <div
                key={d}
                style={{
                  fontSize: 10.5,
                  color: 'var(--text-tertiary)',
                  textAlign: 'center',
                  fontWeight: 600,
                  padding: '4px 0',
                }}
              >
                {d}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((d, i) => {
              if (d == null) return <div key={i} style={{ height: 32 }} />;
              const cellDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d);
              const isSelected = selected ? sameDay(cellDate, selected) : false;
              const isToday = sameDay(cellDate, today);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(d)}
                  className="mono"
                  style={{
                    height: 32,
                    borderRadius: 6,
                    border: isToday && !isSelected ? '1px solid var(--brand-primary)' : '1px solid transparent',
                    background: isSelected ? 'var(--brand-primary)' : 'transparent',
                    color: isSelected
                      ? 'white'
                      : isToday
                      ? 'var(--brand-primary-600)'
                      : 'var(--text-primary)',
                    fontSize: 12.5,
                    fontWeight: isSelected || isToday ? 600 : 500,
                    cursor: 'pointer',
                  }}
                  onMouseOver={e => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseOut={e => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <button type="button" className="btn btn--ghost btn--sm" onClick={jumpToday}>
              Hoy
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
