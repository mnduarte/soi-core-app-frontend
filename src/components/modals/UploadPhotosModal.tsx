import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, FormField } from '../common/Modal';
import { Icon } from '../common/Icon';
import { useUIStore } from '../../store/ui.store';
import { galleryApi, photoTypeLabel } from '../../api/gallery';
import { usePhotoCategories } from '../../hooks/usePhotoCategories';
import { CustomCategoriesModal } from '../common/CustomCategoriesModal';

interface UploadPhotosModalProps {
  open: boolean;
  onClose: () => void;
  defaultPatientId?: string;
  // Si viene, las fotos quedan vinculadas a ese movimiento (cuenta corriente).
  transactionId?: string;
  // Si viene, las fotos quedan vinculadas a ese trabajo (item del plan).
  treatmentItemId?: string;
  // Se llama con las fotos subidas (para vincularlas luego desde el formulario).
  onUploaded?: (
    refs: { sessionId: string; photoId: string; url: string; type?: string; title?: string; description?: string }[],
  ) => void;
}

// One pending upload slot — we keep the File around (for the actual upload),
// the object URL (for the preview), and the async status so the row can flip
// from "waiting" to "uploading 67%" to "done" / "failed" without losing spot.
interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
  size: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPhotosModal({
  open,
  onClose,
  defaultPatientId,
  transactionId,
  treatmentItemId,
  onUploaded,
}: UploadPhotosModalProps) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const categories = usePhotoCategories();
  const patientId = defaultPatientId;

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  // Una categoría para toda la subida (personalizable, como trabajos/montos).
  const [category, setCategory] = useState('');
  const [catsOpen, setCatsOpen] = useState(false);
  const [files, setFiles] = useState<PendingPhoto[]>([]);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pcInputRef = useRef<HTMLInputElement>(null);
  const camInputRef = useRef<HTMLInputElement>(null);

  // Categoría por defecto = la primera configurada (cuando abre o cambian).
  useEffect(() => {
    if (open && !category && categories.length) setCategory(categories[0]);
  }, [open, categories, category]);

  useEffect(() => {
    if (!open) {
      // Free the object URLs we created for previews so the browser can
      // garbage-collect them. Doing it on close means we don't accidentally
      // revoke while the user is still looking at the thumbs.
      files.forEach(f => URL.revokeObjectURL(f.previewUrl));
      setFiles([]);
      setTitle('');
      setNotes('');
      setCategory('');
      setUploading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const newPhotos: PendingPhoto[] = Array.from(incoming).map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
      size: formatSize(file.size),
      status: 'pending',
      progress: 0,
    }));
    setFiles(prev => [...prev, ...newPhotos]);
  };

  const updateFile = (id: string, patch: Partial<PendingPhoto>) =>
    setFiles(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));

  const removeFile = (id: string) => {
    setFiles(prev => {
      const target = prev.find(f => f.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  };

  // Título y descripción son opcionales: solo hace falta el paciente y ≥1 foto.
  const isValid = !!patientId && files.length > 0;

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!patientId) throw new Error('Sin paciente');
      // 1) Cada subida crea una sesión (contenedor interno). Si no ponen título,
      // se auto-titula con la categoría o "Fotos".
      const created = await galleryApi.createSession(patientId, {
        title:
          title.trim() ||
          (treatmentItemId
            ? 'Foto del trabajo'
            : transactionId
              ? 'Foto de movimiento'
              : category || 'Fotos'),
        notes: notes.trim() || undefined,
      });
      const targetSessionId = created._id;

      // 2) Pull signed upload params once — Cloudinary allows reuse within
      // the timestamp window so we don't need a fresh signature per file.
      const params = await galleryApi.getUploadParams(patientId);

      // 3) Upload each file directly to Cloudinary, then attach to session.
      // Sequential keeps the progress display sane and avoids hammering
      // free-tier quotas. For 30 photos we're looking at maybe a minute.
      const uploaded: { sessionId: string; photoId: string; url: string; type?: string; title?: string; description?: string }[] = [];
      for (const f of files) {
        if (f.status === 'done') continue;
        updateFile(f.id, { status: 'uploading', progress: 0 });
        try {
          const result = await galleryApi.uploadToCloudinary(
            f.file,
            params,
            pct => updateFile(f.id, { progress: pct }),
          );
          const updated = await galleryApi.addPhoto(patientId, targetSessionId, {
            publicId: result.public_id,
            url: result.secure_url,
            type: category || undefined,
            transactionId,
            treatmentItemId,
          });
          const newPhoto = updated.photos.find(p => p.publicId === result.public_id);
          if (newPhoto)
            uploaded.push({
              sessionId: targetSessionId,
              photoId: newPhoto._id,
              url: result.secure_url,
              type: category || undefined,
              title: title.trim() || undefined,
              description: notes.trim() || undefined,
            });
          updateFile(f.id, { status: 'done', progress: 100 });
        } catch (err) {
          updateFile(f.id, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Error desconocido',
          });
        }
      }
      return uploaded;
    },
    onSuccess: (uploaded) => {
      qc.invalidateQueries({ queryKey: ['gallery-sessions', patientId] });
      const success = files.filter(f => f.status !== 'error').length;
      const failed = files.length - success;
      showToast(
        failed === 0
          ? `¡Listo! ${success} foto${success === 1 ? '' : 's'} subida${success === 1 ? '' : 's'} ✓`
          : `${success} subidas · ${failed} con error`,
        failed === 0 ? 'success' : 'error',
      );
      if (failed === 0) {
        onUploaded?.(uploaded);
        onClose();
      }
    },
    onSettled: () => setUploading(false),
  });

  const startUpload = () => {
    if (!isValid) return;
    setUploading(true);
    uploadMutation.mutate();
  };

  if (!patientId) {
    return (
      <Modal open={open} onClose={onClose} title="Subir fotos" width={420}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Abrí esta pantalla desde la ficha de un paciente.
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={uploading ? () => {} : onClose}
      title="Subir fotos"
      sub="Elegí la categoría y agregá las fotos. Título y descripción son opcionales."
      width={680}
      footer={
        <>
          <button
            className="btn btn--ghost"
            onClick={onClose}
            disabled={uploading}
          >
            Cancelar
          </button>
          <button
            className="btn btn--primary"
            disabled={!isValid || uploading}
            onClick={startUpload}
          >
            <Icon name="upload" />{' '}
            {uploading
              ? 'Subiendo…'
              : `Subir ${files.length} foto${files.length === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <FormField label="Categoría">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {categories.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              disabled={uploading}
              style={{
                fontSize: 12.5,
                padding: '5px 12px',
                borderRadius: 999,
                border: '1px solid',
                borderColor: category === c ? 'var(--brand-primary)' : 'var(--border-default)',
                background: category === c ? 'var(--brand-primary-50)' : 'var(--bg-surface)',
                color: category === c ? 'var(--brand-primary-600)' : 'var(--text-secondary)',
                fontWeight: category === c ? 600 : 400,
                cursor: uploading ? 'not-allowed' : 'pointer',
              }}
            >
              {photoTypeLabel(c)}
            </button>
          ))}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setCatsOpen(true)}
            disabled={uploading}
            style={{ color: 'var(--text-tertiary)' }}
          >
            <Icon name="settings" size={13} /> Personalizar
          </button>
        </div>
      </FormField>

      <div className="form-row form-row--2">
        <FormField label="Título (opcional)">
          <input
            className="input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ej: Inicio tratamiento"
            disabled={uploading}
          />
        </FormField>
        <FormField label="Descripción (opcional)">
          <input
            className="input"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ej: se ve fractura en 26"
            disabled={uploading}
          />
        </FormField>
      </div>

      <input
        ref={pcInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={camInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div
        onDragOver={e => {
          e.preventDefault();
          if (!uploading) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault();
          setDrag(false);
          if (!uploading) handleFiles(e.dataTransfer.files);
        }}
        style={{
          border: `2px dashed ${drag ? 'var(--brand-primary)' : 'var(--border-default)'}`,
          background: drag ? 'var(--brand-primary-50)' : 'var(--bg-muted)',
          borderRadius: 12,
          padding: 14,
          textAlign: 'center',
          marginBottom: 16,
          transition: 'all 0.15s',
          opacity: uploading ? 0.5 : 1,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            margin: '0 auto 10px',
            borderRadius: 11,
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--brand-primary)',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <Icon name="upload" size={18} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn--primary"
            onClick={e => {
              e.stopPropagation();
              camInputRef.current?.click();
            }}
            disabled={uploading}
            style={{ flexDirection: 'column', height: 'auto', padding: '10px 20px', gap: 1, minWidth: 150 }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 14 }}>
              <Icon name="camera" size={17} /> Sacar una foto
            </span>
            <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 400 }}>con la cámara</span>
          </button>
          <button
            className="btn btn--secondary"
            onClick={e => {
              e.stopPropagation();
              pcInputRef.current?.click();
            }}
            disabled={uploading}
            style={{ flexDirection: 'column', height: 'auto', padding: '10px 20px', gap: 1, minWidth: 150 }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 14 }}>
              <Icon name="image" size={17} /> Elegir foto
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>de la galería o archivos</span>
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 10 }}>
          JPG, PNG, HEIC · hasta 50 MB c/u
        </div>
      </div>

      {files.length > 0 && (
        <>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
              margin: '8px 0 10px',
            }}
          >
            {files.length} foto{files.length === 1 ? '' : 's'} para subir · categoría: <b>{photoTypeLabel(category)}</b>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 8,
            }}
          >
            {files.map(f => (
              <PhotoUploadCard
                key={f.id}
                photo={f}
                disabled={uploading}
                onRemove={() => removeFile(f.id)}
              />
            ))}
          </div>
        </>
      )}

      <CustomCategoriesModal open={catsOpen} initial={categories} onClose={() => setCatsOpen(false)} />
    </Modal>
  );
}

function PhotoUploadCard({
  photo,
  disabled,
  onRemove,
}: {
  photo: PendingPhoto;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--bg-surface)',
        position: 'relative',
        opacity: photo.status === 'done' ? 0.65 : 1,
      }}
    >
      <div
        style={{
          aspectRatio: '1/1',
          background: `url(${photo.previewUrl}) center/cover`,
          position: 'relative',
        }}
      >
        {photo.status === 'uploading' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {photo.progress}%
          </div>
        )}
        {photo.status === 'done' && (
          <div
            style={{
              position: 'absolute',
              top: 6,
              left: 6,
              width: 22,
              height: 22,
              borderRadius: 50,
              background: 'var(--success)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="check" size={12} />
          </div>
        )}
        {photo.status === 'error' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(220, 38, 38, 0.6)',
              color: 'white',
              padding: 6,
              fontSize: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}
          >
            Error al subir
          </div>
        )}
        {!disabled && photo.status === 'pending' && (
          <button
            onClick={onRemove}
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 22,
              height: 22,
              borderRadius: 50,
              background: 'rgba(0,0,0,0.55)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Icon name="x" size={11} />
          </button>
        )}
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: 4,
          }}
        >
          {photo.file.name}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{photo.size}</span>
        </div>
      </div>
    </div>
  );
}
