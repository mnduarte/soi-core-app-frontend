import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../common/Icon';
import {
  galleryApi,
  PHOTO_TYPE_LABEL,
  type GalleryPhoto,
  type PhotoType,
} from '../../api/gallery';
import { useUIStore } from '../../store/ui.store';

interface PhotoThumbProps {
  photo: GalleryPhoto;
  label?: string;
  // When provided, the thumb shows hover actions (move type, delete). Without
  // these the thumb is read-only (used by the compare picker, for example).
  patientId?: string;
  sessionId?: string;
}

const PHOTO_TYPES: PhotoType[] = ['INTRAORAL', 'EXTRAORAL', 'RADIOGRAFIA'];

export function PhotoThumb({ photo, label, patientId, sessionId }: PhotoThumbProps) {
  const [zoom, setZoom] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const isXray = photo.type === 'RADIOGRAFIA';
  const editable = !!patientId && !!sessionId;

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['gallery-sessions', patientId] });

  const updateTypeMutation = useMutation({
    mutationFn: (newType: PhotoType) =>
      galleryApi.updatePhoto(patientId!, sessionId!, photo._id, { type: newType }),
    onSuccess: (_, type) => {
      invalidate();
      showToast(`Movida a ${PHOTO_TYPE_LABEL[type]}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => galleryApi.removePhoto(patientId!, sessionId!, photo._id),
    onSuccess: () => {
      invalidate();
      showToast('Foto eliminada');
    },
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('¿Eliminar esta foto? No se puede deshacer.')) return;
    deleteMutation.mutate();
  };

  return (
    <>
      <div
        onClick={() => setZoom(true)}
        style={{
          borderRadius: 10,
          overflow: 'hidden',
          position: 'relative',
          aspectRatio: '1/1',
          background: isXray ? '#0F1218' : `url(${photo.url}) center/cover`,
          cursor: 'zoom-in',
        }}
      >
        {isXray && (
          <img
            src={photo.url}
            alt={photo.caption ?? ''}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              background: '#0F1218',
            }}
          />
        )}

        {editable && (
          <div
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              display: 'flex',
              gap: 4,
            }}
          >
            <button
              onClick={e => {
                e.stopPropagation();
                setTypeOpen(o => !o);
              }}
              title="Mover de tipo"
              style={iconButtonStyle}
            >
              <Icon name="more" size={11} />
            </button>
            <button
              onClick={handleDelete}
              title="Eliminar foto"
              disabled={deleteMutation.isPending}
              style={{ ...iconButtonStyle, background: 'rgba(220,38,38,0.85)' }}
            >
              <Icon name="trash" size={11} />
            </button>
          </div>
        )}

        {typeOpen && editable && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 36,
              right: 6,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              boxShadow: 'var(--shadow-lg)',
              minWidth: 130,
              overflow: 'hidden',
              zIndex: 2,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: 'var(--text-tertiary)',
                padding: '6px 10px 4px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 600,
              }}
            >
              Mover a
            </div>
            {PHOTO_TYPES.map(t => (
              <button
                key={t}
                disabled={t === photo.type || updateTypeMutation.isPending}
                onClick={() => {
                  setTypeOpen(false);
                  updateTypeMutation.mutate(t);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '7px 10px',
                  border: 'none',
                  background:
                    t === photo.type ? 'var(--brand-primary-50)' : 'transparent',
                  color:
                    t === photo.type
                      ? 'var(--brand-primary-600)'
                      : 'var(--text-primary)',
                  fontSize: 12.5,
                  textAlign: 'left',
                  cursor: t === photo.type ? 'default' : 'pointer',
                  fontWeight: t === photo.type ? 600 : 400,
                }}
              >
                {t === photo.type && <Icon name="check" size={11} />}
                {PHOTO_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        )}

        {label && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              right: 8,
              padding: '2px 8px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.55)',
              color: 'white',
              fontSize: 10.5,
              fontWeight: 500,
              backdropFilter: 'blur(8px)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </div>
        )}
      </div>

      {zoom && (
        <div
          onClick={() => setZoom(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 24,
            cursor: 'zoom-out',
          }}
        >
          <img
            src={photo.url}
            alt={photo.caption ?? ''}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: 4,
            }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

const iconButtonStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  background: 'rgba(0,0,0,0.55)',
  color: 'white',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
};
