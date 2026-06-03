import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { patientsApi, type Patient } from '../api/patients';
import { useUIStore } from '../store/ui.store';
import { PageHeader } from '../components/common/PageHeader';
import { Icon } from '../components/common/Icon';
import { Avatar } from '../components/common/Avatar';
import { useIsMobile } from '../hooks/useIsMobile';

type View = 'list' | 'grid';

export default function PatientsPage() {
  const navigate = useNavigate();
  const openModal = useUIStore(s => s.openModal);
  const isMobile = useIsMobile(720);

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
  });

  return (
    <div className="content fade-in">
      <PageHeader
        title="Pacientes"
        sub={`${patients.length} fichas ${debouncedSearch ? 'encontradas' : 'activas'}`}
        actions={
          <>
            <button className="btn btn--secondary">
              <Icon name="download" /> Exportar
            </button>
            <button className="btn btn--primary" onClick={() => openModal('newPatient')}>
              <Icon name="plus" /> Nuevo paciente
            </button>
          </>
        }
      />

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
        <div className="search" style={{ flex: 1, maxWidth: 400, background: 'var(--bg-muted)' }}>
          <Icon name="search" size={14} style={{ color: 'var(--text-tertiary)' }} />
          <input
            placeholder="Buscar por nombre, DNI, teléfono…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

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
      </div>

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
        <ListView patients={patients} onOpen={id => navigate(`/patients/${id}`)} />
      ) : (
        <GridView patients={patients} onOpen={id => navigate(`/patients/${id}`)} />
      )}
    </div>
  );
}

function ListView({ patients, onOpen }: { patients: Patient[]; onOpen: (id: string) => void }) {
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
            <th style={{ width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {patients.map(p => (
            <tr key={p._id} onClick={() => onOpen(p._id)}>
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
              <td style={{ textAlign: 'right' }}>
                <Icon name="chevronRight" size={14} style={{ color: 'var(--text-tertiary)' }} />
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
