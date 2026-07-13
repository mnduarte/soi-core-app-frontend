import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../common/Icon';
import {
  galleryApi,
  type GallerySession,
  type GalleryPhoto,
  type PhotoType,
} from '../../api/gallery';
import { usePhotoCategories } from '../../hooks/usePhotoCategories';
import { useUIStore } from '../../store/ui.store';
import { GridView } from './GridView';
import { CustomCategoriesModal } from '../common/CustomCategoriesModal';

// Valor especial de filtro: fotos sin vincular a un movimiento.
const UNLINKED = '__unlinked__';
type TypeFilter = 'Todos' | typeof UNLINKED | PhotoType;

interface GalleryContainerProps {
  patientId: string;
  // When mounted inside the patient tab we hide the page header (the patient
  // header is already on top). When mounted standalone, we show our own.
  embedded?: boolean;
}

export function GalleryContainer({ patientId, embedded = false }: GalleryContainerProps) {
  const openModal = useUIStore(s => s.openModal);
  const categories = usePhotoCategories();
  const [filter, setFilter] = useState<TypeFilter>('Todos');
  const [catsOpen, setCatsOpen] = useState(false);

  // Chips de filtro = "Todos" + categorías del consultorio + "Sin movimiento".
  const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
    { key: 'Todos', label: 'Todos' },
    ...categories.map(c => ({ key: c, label: c })),
    { key: UNLINKED, label: 'Sin movimiento' },
  ];

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
    if (filter === UNLINKED) return allPhotos.filter(({ photo }) => !photo.transactionId);
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
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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

          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setCatsOpen(true)}
            title="Personalizar categorías"
            style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}
          >
            <Icon name="settings" size={13} /> Categorías
          </button>

          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
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

      <CustomCategoriesModal open={catsOpen} initial={categories} onClose={() => setCatsOpen(false)} />

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
        <GridView photos={filteredPhotos} patientId={patientId} />
      )}
    </div>
  );
}

// ---- Type re-exports so the view files don't have to import from api/ ----
export type SessionWithFilter = GallerySession & { filteredPhotos: GalleryPhoto[] };
