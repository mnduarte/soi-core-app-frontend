import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useAnchored } from '../../hooks/useAnchored';

export interface SelectOption {
  value: string;
  label: string;
  /** Texto secundario a la derecha (ej: "falta $30.000"). */
  hint?: string;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  /** Opciones sueltas (se muestran antes de los grupos). */
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  style?: CSSProperties;
  title?: string;
}

/**
 * Selector propio, con el tema de la app.
 *
 * El <select> nativo en Android abre una hoja negra a pantalla completa con la
 * tipografía del sistema: rompe con todo lo demás y, con nombres de trabajo
 * largos, parte el texto en dos renglones sin control. Este usa las mismas
 * fichas, colores y tipografías que el resto.
 *
 * Sin librería a propósito: son dos selectores en toda la app y el proyecto no
 * tiene librería de UI — meter una por esto costaría más de lo que resuelve.
 */
export function Select({
  value, onChange, options = [], groups = [], placeholder = 'Elegir…', style, title,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const cerrar = useCallback(() => setOpen(false), []);
  const posicion = useAnchored(open, btnRef, cerrar);

  const todas = [...options, ...groups.flatMap(g => g.options)];
  const elegida = todas.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onMouse = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const opcion = (o: SelectOption) => (
    <button
      key={o.value}
      type="button"
      className={`sel__opt ${o.value === value ? 'is-on' : ''}`}
      onClick={() => { onChange(o.value); setOpen(false); }}
    >
      <span className="sel__opt-lbl">{o.label}</span>
      {o.hint && <span className="sel__opt-hint">{o.hint}</span>}
      {o.value === value && <Icon name="check" size={13} />}
    </button>
  );

  return (
    <div ref={wrapRef} style={{ position: 'relative', minWidth: 0, ...style }}>
      <button
        ref={btnRef}
        type="button"
        className="input sel__btn"
        title={title}
        onClick={() => setOpen(o => !o)}
      >
        <span className={`sel__val ${elegida ? '' : 'is-empty'}`}>
          {elegida ? elegida.label : placeholder}
        </span>
        <Icon name="chevronDown" size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
      </button>

      {/* Montado en <body>: un ancestro con `transform` (los modales lo tienen
          por su animacion de entrada) convierte a position:fixed en relativo a
          ese ancestro, y el panel aparecia lejos del campo. El portal lo saca
          de ahi y de cualquier overflow. */}
      {open && createPortal(
        <div ref={popRef} className="sel__pop lb-menupop" style={posicion}>
          {options.map(opcion)}
          {groups.map(g => (
            g.options.length > 0 && (
              <div key={g.label}>
                <div className="sel__group">{g.label}</div>
                {g.options.map(opcion)}
              </div>
            )
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
