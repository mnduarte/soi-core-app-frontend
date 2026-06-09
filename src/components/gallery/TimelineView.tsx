import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../common/Icon';
import {
  galleryApi,
  PHOTO_TYPE_LABEL,
  type GallerySession,
  type GalleryPhoto,
  type PhotoType,
} from '../../api/gallery';
import { useUIStore } from '../../store/ui.store';
import { PhotoThumb } from './PhotoThumb';

const TYPE_ORDER: PhotoType[] = ['INTRAORAL', 'EXTRAORAL', 'RADIOGRAFIA'];
const MONTH_LABEL = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

interface TimelineViewProps {
  sessions: GallerySession[];
  filter: 'Todos' | PhotoType;
  patientId: string;
}

export function TimelineView({ sessions, filter, patientId }: TimelineViewProps) {
  // Sessions are returned newest-first by the backend, which matches the
  // prototype's "first session = Más reciente" label up top.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sessions.map((session, sIdx) => (
        <SessionCard
          key={session._id}
          session={session}
          isFirst={sIdx === 0}
          patientId={patientId}
          filter={filter}
        />
      ))}
    </div>
  );
}

function SessionCard({
  session,
  isFirst,
  patientId,
  filter,
}: {
  session: GallerySession;
  isFirst: boolean;
  patientId: string;
  filter: 'Todos' | PhotoType;
}) {
  const openModal = useUIStore(s => s.openModal);
  const showToast = useUIStore(s => s.showToast);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(session.title);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['gallery-sessions', patientId] });

  const renameMutation = useMutation({
    mutationFn: (title: string) =>
      galleryApi.updateSession(patientId, session._id, { title }),
    onSuccess: () => {
      invalidate();
      setEditing(false);
      showToast('Sesión renombrada');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => galleryApi.deleteSession(patientId, session._id),
    onSuccess: () => {
      invalidate();
      showToast('Sesión eliminada');
    },
  });

  const handleSaveRename = () => {
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === session.title) {
      setEditing(false);
      setDraftTitle(session.title);
      return;
    }
    renameMutation.mutate(trimmed);
  };

  const handleDelete = () => {
    if (
      !window.confirm(
        `¿Eliminar la sesión "${session.title}" y todas sus ${session.photos.length} fotos? No se puede deshacer.`,
      )
    )
      return;
    deleteMutation.mutate();
  };

  const allPhotos = session.photos;
  const visible =
    filter === 'Todos' ? allPhotos : allPhotos.filter(p => p.type === filter);

  if (visible.length === 0 && filter !== 'Todos') return null;

  const byType: Record<PhotoType, GalleryPhoto[]> = {
    INTRAORAL: visible.filter(p => p.type === 'INTRAORAL'),
    EXTRAORAL: visible.filter(p => p.type === 'EXTRAORAL'),
    RADIOGRAFIA: visible.filter(p => p.type === 'RADIOGRAFIA'),
  };

  const date = new Date(session.createdAt);

  return (
    <div className="card">
      <div className="card__header">
        <div className="row" style={{ gap: 12, flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              background: isFirst ? 'var(--brand-primary-50)' : 'var(--bg-muted)',
              color: isFirst ? 'var(--brand-primary-600)' : 'var(--text-secondary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 600 }}>
              {MONTH_LABEL[date.getMonth()]}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>
              {date.getDate()}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <input
                autoFocus
                className="input"
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                onBlur={handleSaveRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSaveRename();
                  if (e.key === 'Escape') {
                    setDraftTitle(session.title);
                    setEditing(false);
                  }
                }}
                disabled={renameMutation.isPending}
                style={{ fontSize: 14, fontWeight: 600, height: 32 }}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                {session.title}
                <button
                  onClick={() => setEditing(true)}
                  title="Renombrar sesión"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-tertiary)',
                    padding: 2,
                    display: 'inline-flex',
                  }}
                >
                  <Icon name="edit" size={12} />
                </button>
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {date.toLocaleDateString('es-AR')} · {allPhotos.length} fotos
              {isFirst && (
                <span className="badge badge--brand" style={{ marginLeft: 8 }}>
                  Más reciente
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => openModal('uploadPhotos', { patientId })}
          >
            <Icon name="plus" size={12} /> Agregar foto
          </button>
          <button
            className="btn btn--ghost btn--icon"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            title="Eliminar sesión"
            style={{ color: 'var(--danger)' }}
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>
      <div className="card__body" style={{ padding: 14 }}>
        {TYPE_ORDER.map(t =>
          byType[t].length > 0 ? (
            <div key={t} style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                }}
              >
                {PHOTO_TYPE_LABEL[t]} · {byType[t].length}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: 8,
                }}
              >
                {byType[t].map(photo => (
                  <PhotoThumb
                    key={photo._id}
                    photo={photo}
                    patientId={patientId}
                    sessionId={session._id}
                  />
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
