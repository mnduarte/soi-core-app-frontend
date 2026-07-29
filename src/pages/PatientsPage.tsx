import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { patientsApi, type Patient } from '../api/patients';
import { useUIStore } from '../store/ui.store';
import { SectionHeader } from '../components/common/SectionHeader';
import { Icon } from '../components/common/Icon';
import { Avatar } from '../components/common/Avatar';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { useIsMobile } from '../hooks/useIsMobile';

type View = 'list' | 'grid';

export default function PatientsPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const openModal = useUIStore(s => s.openModal);
  const showToast = useUIStore(s => s.showToast);
  const isMobile = useIsMobile(720);

  // En "Pacientes viejos" cada paciente abre la ficha CLÁSICA (perfil completo);
  // en Pacientes normal abre la Ficha rápida (cuenta corriente).
  const classic = pathname.startsWith('/pacientes-viejos');
  const openPatient = (patientId: string) =>
    navigate(classic ? `/ficha-clasica/${patientId}` : `/patients/${patientId}`);

  const onEdit = (p: Patient) => openModal('newPatient', { patientId: p._id });

  // Hard delete (con cascade). Confirmación fuerte porque es irreversible.
  const [toDelete, setToDelete] = useState<Patient | null>(null);
  const deleteMut = useMutation({
    mutationFn: (id: string) => patientsApi.hardRemove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      showToast('Paciente eliminado');
    },
    onError: () => showToast('No se pudo eliminar', 'error'),
  });

  const [view, setView] = useState<View>('list');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['patients', debouncedSearch],
    queryFn: () => patientsApi.findAll(debouncedSearch || undefined),
    // Un paciente cargado en otro dispositivo aparece acá sin recargar (y baja el
    // riesgo de cargar un duplicado). Solo mientras la pestaña está visible.
    refetchInterval: 15_000,
  });

  // DNI duplicados (mismo DNI en 2+ fichas) → banner de reconciliación.
  const dupDniGroups = useMemo(() => {
    const map = new Map<string, Patient[]>();
    for (const p of patients) {
      const dni = (p.dni ?? '').trim();
      if (!dni) continue;
      if (!map.has(dni)) map.set(dni, []);
      map.get(dni)!.push(p);
    }
    return [...map.entries()].filter(([, list]) => list.length > 1);
  }, [patients]);

  return (
    <div className="content fade-in" style={{ padding: 0 }}>
      <SectionHeader
        title="Pacientes"
        sub={`${patients.length} fichas ${debouncedSearch ? 'encontradas' : 'activas'}`}
        icon="users"
        accent="#0D9488"
      />

      <div style={{ padding: isMobile ? '18px 16px' : '28px 32px' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px 12px 0 0',
          borderBottom: 'none',
          padding: '12px 16px',
        }}
      >
        <div className="search" style={{ flex: 1, maxWidth: 400, minWidth: 180, background: 'var(--bg-muted)' }}>
          <Icon name="search" size={14} style={{ color: 'var(--text-tertiary)' }} />
          <input
            placeholder="Buscar por nombre, DNI, teléfono…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
          {!isMobile && (
            <div style={{ display: 'flex', background: 'var(--bg-muted)', borderRadius: 8, padding: 3 }}>
              <button
                onClick={() => setView('list')}
                style={{
                  padding: 5,
                  borderRadius: 5,
                  background: view === 'list' ? 'var(--bg-surface)' : 'transparent',
                  color: view === 'list' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  cursor: 'pointer',
                  display: 'flex',
                }}
              >
                <Icon name="list" size={14} />
              </button>
              <button
                onClick={() => setView('grid')}
                style={{
                  padding: 5,
                  borderRadius: 5,
                  background: view === 'grid' ? 'var(--bg-surface)' : 'transparent',
                  color: view === 'grid' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  cursor: 'pointer',
                  display: 'flex',
                }}
              >
                <Icon name="grid" size={14} />
              </button>
            </div>
          )}
          <button className="btn btn--primary" onClick={() => openModal('newPatient')}>
            <Icon name="plus" /> <span>Nuevo paciente</span>
          </button>
        </div>
      </div>

      {/* DNI duplicados — banner suave de reconciliación */}
      {dupDniGroups.length > 0 && (
        <div
          style={{
            background: 'color-mix(in srgb, var(--warning) 9%, var(--bg-surface))',
            border: '1px solid color-mix(in srgb, var(--warning) 35%, var(--border-subtle))',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 12,
            fontSize: 12.5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            <Icon name="alert" size={14} style={{ color: 'var(--warning)' }} />
            {dupDniGroups.length} DNI duplicado{dupDniGroups.length !== 1 ? 's' : ''} — revisá cuál queda y corregí el otro
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {dupDniGroups.map(([dni, list]) => (
              <div key={dni} style={{ color: 'var(--text-secondary)' }}>
                <span className="mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>DNI {dni}</span>:{' '}
                {list.map((p, i) => (
                  <span key={p._id}>
                    {i > 0 && ' · '}
                    {p.name} {p.lastName}{' '}
                    <button
                      onClick={() => onEdit(p)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-primary-600)', fontSize: 12 }}
                    >
                      <Icon name="edit" size={11} style={{ verticalAlign: -1 }} /> (editar)
                    </button>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '0 0 12px 12px',
            padding: 32,
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 13,
          }}
        >
          Buscando…
        </div>
      ) : patients.length === 0 ? (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '0 0 12px 12px',
            padding: 48,
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 13,
          }}
        >
          {debouncedSearch ? 'Sin resultados.' : 'Aún no hay pacientes cargados.'}
        </div>
      ) : isMobile || view === 'list' ? (
        <ListView patients={patients} onOpen={openPatient} onEdit={onEdit} onDelete={setToDelete} />
      ) : (
        <GridView patients={patients} onOpen={openPatient} />
      )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title={`¿Eliminar a ${toDelete?.name ?? ''} ${toDelete?.lastName ?? ''}?`}
        message="Se borran también sus turnos y todo lo cargado en su ficha (cuenta corriente, odontograma, evoluciones). No se puede deshacer."
        confirmLabel="Eliminar paciente"
        danger
        requireTextConfirmation="eliminar"
        onConfirm={() => {
          if (toDelete) deleteMut.mutate(toDelete._id);
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function ListView({
  patients,
  onOpen,
  onEdit,
  onDelete,
}: {
  patients: Patient[];
  onOpen: (id: string) => void;
  onEdit: (p: Patient) => void;
  onDelete: (p: Patient) => void;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '0 0 12px 12px',
      }}
    >
      <table className="tbl">
        <thead>
          <tr>
            <th>Paciente</th>
            <th>DNI</th>
            <th>Teléfono</th>
            <th>Email</th>
            <th style={{ textAlign: 'right', width: 140 }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {patients.map(p => (
            <tr key={p._id}>
              <td>
                <div className="row" style={{ gap: 10 }}>
                  <Avatar name={p.name} lastName={p.lastName} id={p._id} size="sm" />
                  <div>
                    <div style={{ fontWeight: 500 }}>{p.name} {p.lastName}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                      {p.isActive ? 'Activo' : 'Inactivo'}
                    </div>
                  </div>
                </div>
              </td>
              <td className="mono" style={{ color: 'var(--text-secondary)' }}>{p.dni ?? '—'}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{p.phone ?? '—'}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{p.email ?? '—'}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'inline-flex', gap: 2 }}>
                  <button className="btn btn--ghost btn--icon btn--sm" title="Ficha clínica" onClick={e => { e.stopPropagation(); onOpen(p._id); }} style={{ color: 'var(--brand-primary-600)' }}>
                    <Icon name="clipboard" size={15} />
                  </button>
                  <button className="btn btn--ghost btn--icon btn--sm" title="Editar" onClick={e => { e.stopPropagation(); onEdit(p); }}>
                    <Icon name="edit" size={15} />
                  </button>
                  <button className="btn btn--ghost btn--icon btn--sm" title="Eliminar" onClick={e => { e.stopPropagation(); onDelete(p); }} style={{ color: 'var(--danger)' }}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GridView({ patients, onOpen }: { patients: Patient[]; onOpen: (id: string) => void }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '0 0 12px 12px',
        padding: 16,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 12,
      }}
    >
      {patients.map(p => (
        <div
          key={p._id}
          onClick={() => onOpen(p._id)}
          style={{
            padding: 16,
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
            cursor: 'pointer',
            transition: 'all 0.12s',
          }}
          onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
          onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
        >
          <Avatar name={p.name} lastName={p.lastName} id={p._id} size="lg" />
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>
            {p.name} {p.lastName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {[p.phone, p.dni].filter(Boolean).join(' · ') || 'Sin contacto'}
          </div>
        </div>
      ))}
    </div>
  );
}
