import type { GalleryPhoto, GallerySession } from '../../api/gallery';
import { PhotoThumb } from './PhotoThumb';

interface GridViewProps {
  photos: { photo: GalleryPhoto; session: GallerySession }[];
  patientId: string;
}

// Flat grid — all photos together, sorted by session date desc. Useful when
// looking for "that photo of tooth 16" without caring which session.
export function GridView({ photos, patientId }: GridViewProps) {
  if (photos.length === 0) {
    return (
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
        No hay fotos con este filtro.
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 8,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
        padding: 14,
      }}
    >
      {photos.map(({ photo, session }) => (
        <PhotoThumb
          key={photo._id}
          photo={photo}
          patientId={patientId}
          sessionId={session._id}
          sessionTitle={session.title}
          sessionNotes={session.notes}
          label={`${new Date(session.createdAt).toLocaleDateString('es-AR')} · ${session.title}`}
        />
      ))}
    </div>
  );
}
