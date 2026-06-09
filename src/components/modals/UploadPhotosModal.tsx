import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, FormField } from '../common/Modal';
import { Icon } from '../common/Icon';
import { useUIStore } from '../../store/ui.store';
import {
  galleryApi,
  PHOTO_TYPE_LABEL,
  type GallerySession,
  type PhotoType,
} from '../../api/gallery';

interface UploadPhotosModalProps {
  open: boolean;
  onClose: () => void;
  defaultPatientId?: string;
}

// One pending upload slot — we keep the File around (for the actual upload),
// the object URL (for the preview), the per-file type override, and the
// async status so the row can flip from "waiting" to "uploading 67%" to
// "done" / "failed" without losing position.
interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
  type: PhotoType;
  size: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

const PHOTO_TYPES: PhotoType[] = ['INTRAORAL', 'EXTRAORAL', 'RADIOGRAFIA'];

function inferTypeFromName(name: string): PhotoType {
  const upper = name.toUpperCase();
  if (upper.startsWith('RX') || upper.startsWith('RAD')) return 'RADIOGRAFIA';
  if (upper.includes('EXT') || upper.includes('PERFIL')) return 'EXTRAORAL';
  return 'INTRAORAL';
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPhotosModal({
  open,
  onClose,
  defaultPatientId,
}: UploadPhotosModalProps) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const patientId = defaultPatientId;

  const [sessionId, setSessionId] = useState<string>('__new');
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [files, setFiles] = useState<PendingPhoto[]>([]);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pcInputRef = useRef<HTMLInputElement>(null);
  const camInputRef = useRef<HTMLInputElement>(null);

  // Existing sessions for this patient — feeds the "use existing session"
  // picker. Disabled if patientId is missing (modal opened without context).
  const { data: sessions = [] } = useQuery({
    queryKey: ['gallery-sessions', patientId],
    queryFn: () => galleryApi.listSessions(patientId!),
    enabled: open && !!patientId,
  });

  useEffect(() => {
    if (!open) {
      // Free the object URLs we created for previews so the browser can
      // garbage-collect them. Doing it on close means we don't accidentally
      // revoke while the user is still looking at the thumbs.
      files.forEach(f => URL.revokeObjectURL(f.previewUrl));
      setFiles([]);
      setSessionId('__new');
      setNewSessionTitle('');
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
      type: inferTypeFromName(file.name),
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

  const applyTypeToAll = (type: PhotoType) =>
    setFiles(prev => prev.map(f => ({ ...f, type })));

  const isUsingNewSession = sessionId === '__new';
  const isValid =
    !!patientId &&
    files.length > 0 &&
    (isUsingNewSession ? newSessionTitle.trim().length > 0 : true);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!patientId) throw new Error('Sin paciente');
      // 1) Make sure we have a session to attach the photos to.
      let targetSessionId = sessionId;
      if (isUsingNewSession) {
        const created = await galleryApi.createSession(patientId, {
          title: newSessionTitle.trim(),
        });
        targetSessionId = created._id;
      }

      // 2) Pull signed upload params once — Cloudinary allows reuse within
      // the timestamp window so we don't need a fresh signature per file.
      const params = await galleryApi.getUploadParams(patientId);

      // 3) Upload each file directly to Cloudinary, then attach to session.
      // Sequential keeps the progress display sane and avoids hammering
      // free-tier quotas. For 30 photos we're looking at maybe a minute.
      for (const f of files) {
        if (f.status === 'done') continue;
        updateFile(f.id, { status: 'uploading', progress: 0 });
        try {
          const result = await galleryApi.uploadToCloudinary(
            f.file,
            params,
            pct => updateFile(f.id, { progress: pct }),
          );
          await galleryApi.addPhoto(patientId, targetSessionId, {
            publicId: result.public_id,
            url: result.secure_url,
            type: f.type,
          });
          updateFile(f.id, { status: 'done', progress: 100 });
        } catch (err) {
          updateFile(f.id, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Error desconocido',
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gallery-sessions', patientId] });
      const success = files.filter(f => f.status !== 'error').length;
      const failed = files.length - success;
      showToast(
        failed === 0
          ? `${success} foto${success === 1 ? '' : 's'} subida${success === 1 ? '' : 's'}`
          : `${success} subidas · ${failed} con error`,
      );
      if (failed === 0) onClose();
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
      sub="Arrastrá fotos o eligilas. Después podés asignar tipo y sesión."
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
      <div className="form-row form-row--2">
        <FormField label="Sesión">
          <select
            className="input"
            value={sessionId}
            onChange={e => setSessionId(e.target.value)}
            disabled={uploading}
            style={{ height: 38 }}
          >
            <option value="__new">+ Crear sesión nueva</option>
            {sessions.map((s: GallerySession) => (
              <option key={s._id} value={s._id}>
                {s.title} · {s.photos.length} fotos
              </option>
            ))}
          </select>
        </FormField>
        {isUsingNewSession && (
          <FormField label="Título de la sesión">
            <input
              className="input"
              value={newSessionTitle}
              onChange={e => setNewSessionTitle(e.target.value)}
              placeholder="Ej: Inicio tratamiento"
              disabled={uploading}
            />
          </FormField>
        )}
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
        onClick={() => !uploading && pcInputRef.current?.click()}
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
          padding: 24,
          textAlign: 'center',
          marginBottom: 16,
          transition: 'all 0.15s',
          cursor: uploading ? 'not-allowed' : 'pointer',
          opacity: uploading ? 0.5 : 1,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            margin: '0 auto 8px',
            borderRadius: 12,
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--brand-primary)',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <Icon name="upload" size={20} />
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>
          Arrastrá tus fotos acá o clickeá para elegir
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
          JPG, PNG, HEIC · hasta 50 MB c/u
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <button
            className="btn btn--secondary btn--sm"
            onClick={e => {
              e.stopPropagation();
              pcInputRef.current?.click();
            }}
            disabled={uploading}
          >
            <Icon name="image" size={12} /> Elegir archivos
          </button>
          <button
            className="btn btn--secondary btn--sm"
            onClick={e => {
              e.stopPropagation();
              camInputRef.current?.click();
            }}
            disabled={uploading}
          >
            <Icon name="camera" size={12} /> Sacar foto (cámara)
          </button>
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
            {files.length} foto{files.length === 1 ? '' : 's'} para subir · asigná tipo a cada una
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
                onChangeType={t => updateFile(f.id, { type: t })}
                onRemove={() => removeFile(f.id)}
              />
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 10,
              fontSize: 11.5,
              color: 'var(--text-tertiary)',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <span>Tip: si todas son del mismo tipo, aplicá a todas con un click.</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {PHOTO_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => applyTypeToAll(t)}
                  disabled={uploading}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 5,
                    fontSize: 11,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  Todas → {PHOTO_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function PhotoUploadCard({
  photo,
  disabled,
  onChangeType,
  onRemove,
}: {
  photo: PendingPhoto;
  disabled: boolean;
  onChangeType: (type: PhotoType) => void;
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <select
            value={photo.type}
            onChange={e => onChangeType(e.target.value as PhotoType)}
            disabled={disabled}
            style={{
              fontSize: 10.5,
              padding: '2px 4px',
              borderRadius: 4,
              border: '1px solid var(--border-default)',
              background:
                photo.type === 'RADIOGRAFIA' ? '#0F1218' : 'var(--brand-primary-50)',
              color:
                photo.type === 'RADIOGRAFIA' ? 'white' : 'var(--brand-primary-600)',
              fontWeight: 500,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {PHOTO_TYPES.map(t => (
              <option key={t} value={t}>
                {PHOTO_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{photo.size}</span>
        </div>
      </div>
    </div>
  );
}
