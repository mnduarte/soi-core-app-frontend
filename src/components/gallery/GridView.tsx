import { useState } from 'react';
import { photoTypeLabel, type GalleryPhoto, type GallerySession } from '../../api/gallery';
import { PhotoThumb } from './PhotoThumb';
import { VisorFotos } from '../common/VisorFotos';

interface GridViewProps {
  photos: { photo: GalleryPhoto; session: GallerySession }[];
  patientId: string;
}

// Flat grid — all photos together, sorted by session date desc. Useful when
// looking for "that photo of tooth 16" without caring which session.
export function GridView({ photos, patientId }: GridViewProps) {
  // El visor vive acá y no en la miniatura para que pueda recorrer TODAS las
  // fotos que están a la vista —las del filtro actual, en el mismo orden que
  // se ven— en vez de abrir una sola y obligar a cerrar para ver la de al lado.
  const [zoom, setZoom] = useState<number | null>(null);

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
      {photos.map(({ photo, session }, i) => (
        <PhotoThumb
          key={photo._id}
          photo={photo}
          patientId={patientId}
          sessionId={session._id}
          onAbrir={() => setZoom(i)}
          label={`${new Date(session.createdAt).toLocaleDateString('es-AR')} · ${session.title}`}
        />
      ))}

      {zoom !== null && (
        <VisorFotos
          fotos={photos.map(({ photo, session }) => ({
            url: photo.url,
            category: photo.type,
            // El título y las notas viven en la sesión, no en la foto.
            title: session.title,
            description: session.notes,
          }))}
          indice={zoom}
          onCerrar={() => setZoom(null)}
          etiquetaCategoria={photoTypeLabel}
        />
      )}
    </div>
  );
}
