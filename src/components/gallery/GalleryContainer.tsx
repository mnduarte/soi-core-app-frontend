import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon, type IconName } from '../common/Icon';
import {
  galleryApi,
  PHOTO_TYPE_LABEL,
  type GallerySession,
  type GalleryPhoto,
  type PhotoType,
} from '../../api/gallery';
import { useUIStore } from '../../store/ui.store';
import { TimelineView } from './TimelineView';
import { GridView } from './GridView';
import { CompareView } from './CompareView';

type View = 'timeline' | 'grid' | 'compare';
type TypeFilter = 'Todos' | PhotoType;

interface GalleryContainerProps {
  patientId: string;
  // When mounted inside the patient tab we hide the page header (the patient
  // header is already on top). When mounted standalone, we show our own.
  embedded?: boolean;
}

const VIEWS: { key: View; label: string; icon: IconName }[] = [
  { key: 'timeline', label: 'Timeline', icon: 'history' },
  { key: 'grid', label: 'Grid', icon: 'grid' },
  { key: 'compare', label: 'Comparar antes/después', icon: 'layers' },
];

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'Todos', label: 'Todos' },
  { key: 'INTRAORAL', label: PHOTO_TYPE_LABEL.INTRAORAL },
  { key: 'EXTRAORAL', label: PHOTO_TYPE_LABEL.EXTRAORAL },
  { key: 'RADIOGRAFIA', label: PHOTO_TYPE_LABEL.RADIOGRAFIA },
];

export function GalleryContainer({ patientId, embedded = false }: GalleryContainerProps) {
  const openModal = useUIStore(s => s.openModal);
  const [view, setView] = useState<View>('timeline');
  const [filter, setFilter] = useState<TypeFilter>('Todos');

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['gallery-sessions', patientId],
    queryFn: () => galleryApi.listSessions(patientId),
  });

  // Flat photo list with the parent session info attached. We keep this as
  // a memo so the three views below can each pick what they need without
  // re-walking the original tree.
  const allPhotos = useMemo(() => {
    return sessions.flatMap(s =>
      s.photos.map(p => ({
        photo: p,
        session: s,
      })),
    );
  }, [sessions]);

  const filteredPhotos = useMemo(() => {
    if (filter === 'Todos') return allPhotos;
    return allPhotos.filter(({ photo }) => photo.type === filter);
  }, [allPhotos, filter]);

  const totalPhotos = filteredPhotos.length;

  const handleUpload = () => openModal('uploadPhotos', { patientId });

  return (
    <div className={embedded ? '' : 'content fade-in'}>
      {!embedded && (
        <div className="page-header">
          <div>
            <h1 className="page-title">Galería</h1>
            <div className="page-sub">
              Fotos de evolución por paciente · subidas desde celular o computadora
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn--secondary" onClick={handleUpload}>
              <Icon name="upload" /> Subir desde PC
            </button>
            <button className="btn btn--primary" onClick={handleUpload}>
              <Icon name="camera" /> Sacar fotos (mobile)
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-muted)',
              borderRadius: 8,
              padding: 3,
            }}
          >
            {VIEWS.map(v => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12.5,
                  fontWeight: 500,
                  borderRadius: 6,
                  color: view === v.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: view === v.key ? 'var(--bg-surface)' : 'transparent',
                  boxShadow: view === v.key ? 'var(--shadow-xs)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                }}
              >
                <Icon name={v.icon} size={12} />
                {v.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {TYPE_FILTERS.map(t => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                style={{
                  padding: '5px 11px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 999,
                  border: '1px solid',
                  borderColor:
                    filter === t.key ? 'var(--brand-primary)' : 'var(--border-default)',
                  background:
                    filter === t.key ? 'var(--brand-primary-50)' : 'var(--bg-surface)',
                  color:
                    filter === t.key
                      ? 'var(--brand-primary-600)'
                      : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
            {totalPhotos} {totalPhotos === 1 ? 'foto' : 'fotos'} · {sessions.length}{' '}
            {sessions.length === 1 ? 'sesión' : 'sesiones'}
          </div>
          {embedded && (
            <button className="btn btn--primary btn--sm" onClick={handleUpload}>
              <Icon name="plus" size={12} /> Subir
            </button>
          )}
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

      {!isLoading && sessions.length === 0 && (
        <div
          style={{
            padding: 60,
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 13,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
          }}
        >
          Todavía no hay fotos cargadas para este paciente.
          <div style={{ marginTop: 12 }}>
            <button className="btn btn--primary btn--sm" onClick={handleUpload}>
              <Icon name="upload" size={12} /> Subir primera foto
            </button>
          </div>
        </div>
      )}

      {!isLoading && sessions.length > 0 && (
        <>
          {view === 'timeline' && (
            <TimelineView
              sessions={sessions}
              filter={filter}
              patientId={patientId}
            />
          )}
          {view === 'grid' && (
            <GridView photos={filteredPhotos} patientId={patientId} />
          )}
          {view === 'compare' && <CompareView sessions={sessions} />}
        </>
      )}
    </div>
  );
}

// ---- Type re-exports so the view files don't have to import from api/ ----
export type SessionWithFilter = GallerySession & { filteredPhotos: GalleryPhoto[] };
