import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { patientsApi, type Patient } from '../../api/patients';
import { useUIStore } from '../../store/ui.store';
import { patientAge } from '../../lib/format';
import { Icon } from './Icon';
import { Avatar } from './Avatar';

function patientSubtext(p: Patient): string {
  const age = patientAge(p);
  const bits: string[] = [];
  if (age != null) bits.push(`${age}a`);
  if (p.obraSocial) bits.push(p.obraSocial);
  if (bits.length === 0) {
    if (p.phone) bits.push(p.phone);
    else if (p.dni) bits.push(p.dni);
  }
  return bits.join(' · ') || '—';
}

interface PatientPickerProps {
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
}

export function PatientPicker({ value, onChange, placeholder = 'Buscar paciente…' }: PatientPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const openModal = useUIStore(s => s.openModal);
  const showToast = useUIStore(s => s.showToast);

  const quickCreateMut = useMutation({
    mutationFn: (fullName: string) => patientsApi.quickCreate(fullName),
    onSuccess: (newPatient) => {
      onChange(newPatient._id);
      setOpen(false);
      setQuery('');
      showToast(`${newPatient.name} ${newPatient.lastName} creado ✓`);
    },
    onError: () => showToast('No se pudo crear el paciente', 'error'),
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data: patients = [] } = useQuery({
    queryKey: ['patients', 'picker', query],
    queryFn: () => patientsApi.findAll(query || undefined),
    enabled: open,
  });

  const { data: allPatients = [] } = useQuery({
    queryKey: ['patients', 'all'],
    queryFn: () => patientsApi.findAll(),
  });

  const selected = value ? allPatients.find(p => p._id === value) : null;

  const matches = patients.slice(0, 8);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          height: 38,
          border: '1px solid var(--border-default)',
          borderRadius: 6,
          background: 'var(--bg-surface)',
          padding: selected ? '5px 12px' : '0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        {selected ? (
          <>
            <Avatar name={selected.name} lastName={selected.lastName} id={selected._id} size="sm" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{selected.name} {selected.lastName}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {patientSubtext(selected)}
              </div>
            </div>
          </>
        ) : (
          <>
            <Icon name="search" size={14} style={{ color: 'var(--text-tertiary)' }} />
            <span style={{ color: 'var(--text-tertiary)', flex: 1 }}>{placeholder}</span>
          </>
        )}
        <Icon name="chevronDown" size={12} style={{ color: 'var(--text-tertiary)' }} />
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-lg)',
            zIndex: 10,
            maxHeight: 320,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid var(--border-subtle)' }}>
            <input
              autoFocus
              className="input"
              placeholder="Buscar por nombre o DNI…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ height: 32 }}
            />
          </div>
          <div style={{ overflow: 'auto' }}>
            {matches.length === 0 && query.trim() && (
              // Si hay query pero no hay resultados, mostrar opción "Crear"
              <div
                onClick={() => {
                  quickCreateMut.mutate(query.trim());
                }}
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: quickCreateMut.isPending ? 'wait' : 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--brand-primary-600)',
                  background: 'var(--brand-primary-50)',
                  opacity: quickCreateMut.isPending ? 0.6 : 1,
                }}
              >
                {!quickCreateMut.isPending && <Icon name="plus" size={14} />}
                {quickCreateMut.isPending ? 'Creando...' : `Crear: ${query.trim()}`}
              </div>
            )}
            {matches.length === 0 && !query.trim() && (
              <div style={{ padding: 16, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
                Sin resultados.
              </div>
            )}
            {matches.map(p => (
              <div
                key={p._id}
                onClick={() => {
                  onChange(p._id);
                  setOpen(false);
                  setQuery('');
                }}
                style={{
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontSize: 13,
                  borderBottom: '1px solid var(--border-subtle)',
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseOut={e => (e.currentTarget.style.background = '')}
              >
                <Avatar name={p.name} lastName={p.lastName} id={p._id} size="sm" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{p.name} {p.lastName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {patientSubtext(p)}
                  </div>
                </div>
              </div>
            ))}

            <div
              onClick={() => {
                setOpen(false);
                openModal('newPatient');
              }}
              style={{
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--brand-primary-600)',
                background: 'var(--brand-primary-50)',
              }}
            >
              <Icon name="plus" size={14} /> Crear paciente nuevo
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
