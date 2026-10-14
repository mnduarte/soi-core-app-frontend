import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { consentsApi, type Consent } from '../../api/consents';
import { Icon } from './Icon';

/**
 * Baja de un consentimiento firmado.
 *
 * Tiene modal propio en vez del `ConfirmDialog` de siempre porque hacen falta
 * dos campos: el motivo y la contraseña.
 *
 * ── Por qué la contraseña acá y no al borrar un pendiente ──
 * La tablet se le pasa al paciente para que firme, y desde que sacamos la
 * clave para salir de esa pantalla, quien la tenga en la mano puede volver a
 * la app. Anular es lo único irreversible que se le puede hacer a un
 * documento firmado, así que pide clave. Borrar un pendiente no: no documenta
 * nada, es un borrador que nadie firmó, y pedir clave para eso enseña a
 * resentirla justo antes de que haga falta de verdad.
 *
 * Además pasa una vez cada tanto. La fricción solo cuesta cuando es seguido:
 * ésta es la misma razón por la que la clave en la pantalla de firma —que
 * disparaba en CADA firma— tenía que irse.
 */

interface Props {
  consent: Consent;
  patientId: string;
  onHecho: () => void;
  onClose: () => void;
}

export function AnularConsentimientoModal({ consent, patientId, onHecho, onClose }: Props) {
  const [motivo, setMotivo] = useState('');
  const [clave, setClave] = useState('');

  const anular = useMutation({
    mutationFn: () => consentsApi.anular(patientId, consent._id, clave, motivo.trim() || undefined),
    onSuccess: onHecho,
  });

  // El servidor contesta 401 con "Contraseña incorrecta". Distinguirlo de un
  // problema de red importa: no es lo mismo "escribiste mal la clave" que
  // "no se pudo".
  const claveMal =
    anular.isError &&
    (anular.error as { response?: { status?: number } })?.response?.status === 401;

  const puede = !!clave && !anular.isPending;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(60,52,34,0.42)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, padding: 16, animation: 'overlayFade 0.12s ease-out',
      }}
    >
      <div className="modal-card" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-card__header">
          <div className="card__title">Anular consentimiento</div>
          <button className="btn btn--ghost btn--icon btn--sm" title="Cerrar" onClick={onClose}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div
          className="modal-card__body"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <p className="mp-nota" style={{ marginTop: 0 }}>
            <b>{consent.templateName}</b>
          </p>

          <p className="mp-nota">
            <Icon name="alert" size={13} /> Deja de valer y el trabajo vinculado vuelve a
            quedar sin consentimiento. <b>No se borra</b>: queda en la ficha marcado como
            anulado y el PDF se sigue pudiendo descargar, cruzado con el sello. Es a
            propósito — que conste que existió y que se dio de baja te deja mejor parado
            que si no estuviera.
          </p>

          <label className="ct-campo">
            Motivo <span style={{ fontWeight: 400, opacity: .7 }}>(opcional)</span>
            <input
              value={motivo}
              maxLength={300}
              placeholder="ej: se generó para el paciente equivocado"
              onChange={e => setMotivo(e.target.value)}
            />
          </label>

          <label className="ct-campo">
            Tu contraseña
            <input
              type="password"
              value={clave}
              autoComplete="current-password"
              onChange={e => setClave(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && puede) anular.mutate();
              }}
            />
          </label>

          {anular.isError && (
            <p className="mp-nota" style={{ color: 'var(--danger)' }}>
              {claveMal
                ? 'Esa no es tu contraseña.'
                : 'No se pudo anular. Probá de nuevo.'}
            </p>
          )}
        </div>

        <div className="modal-card__footer">
          <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          {/* Mismo camino que ConfirmDialog con `danger`: no hay variante
              .btn--danger en el CSS, el color va encima de btn--primary. */}
          <button
            className="btn btn--primary"
            style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
            disabled={!puede}
            onClick={() => anular.mutate()}
          >
            {anular.isPending ? 'Anulando…' : 'Anular'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AnularConsentimientoModal;
