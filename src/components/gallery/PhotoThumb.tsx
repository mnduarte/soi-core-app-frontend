import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../common/Icon';
import {
  galleryApi,
  photoTypeLabel,
  type GalleryPhoto,
  type PhotoType,
} from '../../api/gallery';
import { transactionsApi, type Transaction } from '../../api/transactions';
import { usePhotoCategories } from '../../hooks/usePhotoCategories';
import { useUIStore } from '../../store/ui.store';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { fmtMoney } from '../../lib/format';

// Etiqueta corta de un movimiento para el selector de vínculo.
function txLabel(t: Transaction): string {
  const raw = t.date ?? t.createdAt;
  const d = raw ? new Date(raw).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
  const kind = t.type === 'PAYMENT' ? 'Pago' : 'Cargo';
  const desc = t.description?.trim() || kind;
  return `${d ? d + ' · ' : ''}${desc} · ${fmtMoney(t.amount)}`;
}

interface PhotoThumbProps {
  photo: GalleryPhoto;
  label?: string;
  // Título/descripción de la sesión (viven ahí, no en la foto) para mostrarlos
  // al expandir la foto.
  sessionTitle?: string;
  sessionNotes?: string;
  // When provided, the thumb shows hover actions (move type, delete). Without
  // these the thumb is read-only (used by the compare picker, for example).
  patientId?: string;
  sessionId?: string;
}

// Radiografía se muestra sobre fondo oscuro; la detectamos por nombre de
// categoría (string libre) en vez de un enum fijo.
const isXrayCat = (t: string) => /radiograf/i.test(t);

export function PhotoThumb({ photo, label, sessionTitle, sessionNotes, patientId, sessionId }: PhotoThumbProps) {
  const [zoom, setZoom] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const categories = usePhotoCategories();
  const isXray = isXrayCat(photo.type);
  const editable = !!patientId && !!sessionId;

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['gallery-sessions', patientId] });

  const updateTypeMutation = useMutation({
    mutationFn: (newType: PhotoType) =>
      galleryApi.updatePhoto(patientId!, sessionId!, photo._id, { type: newType }),
    onSuccess: (_, type) => {
      invalidate();
      showToast(`Movida a ${photoTypeLabel(type)}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => galleryApi.removePhoto(patientId!, sessionId!, photo._id),
    onSuccess: () => {
      invalidate();
      showToast('Foto eliminada');
    },
  });
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Movimientos del paciente, para vincular la foto a uno (solo se piden con el
  // menú abierto). Al vincular se refleja en la fila de la cuenta corriente.
  const { data: txs = [] } = useQuery({
    queryKey: ['transactions', patientId],
    queryFn: () => transactionsApi.findAll(patientId!),
    enabled: !!patientId && typeOpen,
  });
  const linkMutation = useMutation({
    mutationFn: (txId: string) =>
      galleryApi.updatePhoto(patientId!, sessionId!, photo._id, { transactionId: txId }),
    onSuccess: (_res, txId) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['gallery-sessions', patientId] });
      showToast(txId ? 'Vinculada al movimiento ✓' : 'Desvinculada', 'success');
    },
    onError: () => showToast('No se pudo vincular', 'error'),
  });

  return (
    <>
      <div
        onClick={() => setZoom(true)}
        style={{
          borderRadius: 10,
          // visible (no hidden) para que el menú ⋯ no quede recortado por el
          // tile; la imagen de fondo igual la recorta el border-radius.
          overflow: 'visible',
          position: 'relative',
          aspectRatio: '1/1',
          background: isXray ? '#0F1218' : `url(${photo.url}) center/cover`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
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
              borderRadius: 10,
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
              onClick={e => { e.stopPropagation(); setConfirmOpen(true); }}
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
              minWidth: 230,
              overflow: 'hidden',
              zIndex: 20,
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
            {categories.map(t => (
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
                {photoTypeLabel(t)}
              </button>
            ))}

            {/* Vincular a un movimiento de la cuenta corriente */}
            <div
              style={{
                fontSize: 10,
                color: 'var(--text-tertiary)',
                padding: '8px 10px 4px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 600,
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              Vincular a movimiento
            </div>
            <div style={{ maxHeight: 168, overflowY: 'auto' }}>
              {photo.transactionId && (
                <button
                  onClick={() => { setTypeOpen(false); linkMutation.mutate(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: 12.5, textAlign: 'left', cursor: 'pointer' }}
                >
                  <Icon name="x" size={11} /> Desvincular
                </button>
              )}
              {txs.length === 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', padding: '6px 10px' }}>
                  Sin movimientos cargados.
                </div>
              )}
              {txs.map(t => {
                const linked = photo.transactionId === t._id;
                return (
                  <button
                    key={t._id}
                    disabled={linked || linkMutation.isPending}
                    onClick={() => { setTypeOpen(false); linkMutation.mutate(t._id); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 'none', background: linked ? 'var(--brand-primary-50)' : 'transparent', color: linked ? 'var(--brand-primary-600)' : 'var(--text-primary)', fontSize: 12, textAlign: 'left', cursor: linked ? 'default' : 'pointer', fontWeight: linked ? 600 : 400 }}
                  >
                    {linked && <Icon name="check" size={11} />}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{txLabel(t)}</span>
                  </button>
                );
              })}
            </div>
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

        {/* Indicador de foto vinculada a un movimiento */}
        {photo.transactionId && (
          <div
            title="Vinculada a un movimiento"
            style={{ position: 'absolute', top: 6, left: 6, display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999, background: 'rgba(124,58,237,0.92)', color: 'white', fontSize: 10, fontWeight: 600, backdropFilter: 'blur(8px)' }}
          >
            <Icon name="receipt" size={10} /> Mov.
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
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            zIndex: 1000,
            padding: 24,
            cursor: 'zoom-out',
          }}
        >
          <button
            onClick={() => setZoom(false)}
            title="Cerrar"
            style={{ position: 'absolute', top: 18, right: 18, width: 40, height: 40, borderRadius: 999, background: 'rgba(255,255,255,0.16)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(8px)' }}
          >
            <Icon name="x" size={20} />
          </button>
          <img
            src={photo.url}
            alt={photo.caption ?? ''}
            style={{
              maxWidth: '100%',
              maxHeight: sessionTitle || sessionNotes || photo.type ? '72vh' : '88vh',
              objectFit: 'contain',
              borderRadius: 4,
            }}
            onClick={e => e.stopPropagation()}
          />
          {(photo.type || sessionTitle || sessionNotes) && (
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '12px 16px', maxWidth: 520, width: '100%', boxShadow: 'var(--shadow-lg)', cursor: 'default' }}
            >
              {photo.type && (
                <span
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: 'var(--brand-primary-50)', color: 'var(--brand-primary-600)', fontSize: 12, fontWeight: 600, marginBottom: sessionTitle || sessionNotes ? 8 : 0 }}
                >
                  <Icon name="image" size={12} /> {photoTypeLabel(photo.type)}
                </span>
              )}
              {sessionTitle && (
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{sessionTitle}</div>
              )}
              {sessionNotes && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>{sessionNotes}</div>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="¿Eliminar esta foto?"
        message="No se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onConfirm={() => { setConfirmOpen(false); deleteMutation.mutate(); }}
        onCancel={() => setConfirmOpen(false)}
      />
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
