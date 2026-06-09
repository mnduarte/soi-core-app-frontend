import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { patientsApi } from '../api/patients';
import { Icon } from '../components/common/Icon';
import { Avatar } from '../components/common/Avatar';
import { GalleryContainer } from '../components/gallery/GalleryContainer';

// Standalone /gallery route. If a patientId is in the query string we show
// that patient's gallery; otherwise the page becomes a patient picker so the
// dentist can pick whose photos to browse. Keeps the deep-link friendly
// (?patientId=…) for when navigating from search.
export default function GalleryPage() {
  const [params, setParams] = useSearchParams();
  const patientId = params.get('patientId');
  const [query, setQuery] = useState('');

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['patients', 'all'],
    queryFn: () => patientsApi.findAll(),
    enabled: !patientId,
  });

  const filtered = useMemo(() => {
    if (!query.trim()) return patients;
    const q = query.toLowerCase();
    return patients.filter(p =>
      `${p.name} ${p.lastName}`.toLowerCase().includes(q),
    );
  }, [patients, query]);

  if (patientId) {
    return (
      <div className="content fade-in">
        <Link
          to="/gallery"
          onClick={() => setParams({})}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--text-tertiary)',
            textDecoration: 'none',
            marginBottom: 12,
          }}
        >
          <Icon name="arrowLeft" size={12} /> Cambiar de paciente
        </Link>
        <GalleryContainer patientId={patientId} />
      </div>
    );
  }

  return (
    <div className="content fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Galería</h1>
          <div className="page-sub">Elegí un paciente para ver sus fotos</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ padding: 14 }}>
          <div
            className="input"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Icon name="search" size={14} style={{ color: 'var(--text-tertiary)' }} />
            <input
              autoFocus
              placeholder="Buscar paciente…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                border: 'none',
                background: 'none',
                outline: 'none',
                width: '100%',
                fontSize: 13,
              }}
            />
          </div>
        </div>
      </div>

      {isLoading && (
        <div
          style={{
            padding: 60,
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 13,
          }}
        >
          Cargando…
        </div>
      )}

      {!isLoading && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 10,
          }}
        >
          {filtered.map(p => (
            <button
              key={p._id}
              onClick={() => setParams({ patientId: p._id })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 12,
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                background: 'var(--bg-surface)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Avatar name={p.name} lastName={p.lastName} id={p._id} size="md" />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.name} {p.lastName}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                  Ver galería →
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 13,
          }}
        >
          Sin pacientes que coincidan.
        </div>
      )}
    </div>
  );
}
