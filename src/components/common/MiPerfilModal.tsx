import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../api/users';
import { useUIStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';
import { Icon } from './Icon';
import { FirmaPad, type FirmaPadHandle } from './FirmaPad';

/**
 * "Mi perfil": los datos con los que el profesional aparece en la app y,
 * sobre todo, **dentro de un consentimiento firmado**.
 *
 * Por eso vive acá y no escondido en una pantalla de administración: el
 * nombre y la matrícula que se escriben en este formulario son los que van a
 * quedar congelados en un documento legal cuando un paciente firme.
 */
export function MiPerfilModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const setUser = useAuthStore(s => s.setUser);

  const { data: me, isPending } = useQuery({ queryKey: ['me'], queryFn: usersApi.me });

  const [nombre, setNombre] = useState<string | null>(null);
  const [matricula, setMatricula] = useState<string | null>(null);
  const [documento, setDocumento] = useState<string | null>(null);
  const padRef = useRef<FirmaPadHandle>(null);
  const [firmaNueva, setFirmaNueva] = useState(false);

  const nombreAct = nombre ?? me?.name ?? '';
  const matriculaAct = matricula ?? me?.clinicalProfile?.license ?? '';
  const documentoAct = documento ?? me?.clinicalProfile?.dni ?? '';
  const sucio =
    nombre !== null || matricula !== null || documento !== null || firmaNueva;

  const guardar = useMutation({
    mutationFn: () =>
      usersApi.updateMe(me!._id, {
        name: nombreAct.trim(),

        clinicalProfile: {
          ...me?.clinicalProfile,
          license: matriculaAct.trim() || undefined,
          dni: documentoAct.trim() || undefined,
          // No se edita acá, pero se reenvía para no borrarlo sin querer.
          specialty: me?.clinicalProfile?.specialty,
          // Solo si dibujaron una nueva: si no, se conserva la que había.
          signaturePng: firmaNueva
            ? (padRef.current?.toPng() ?? undefined)
            : me?.clinicalProfile?.signaturePng,
        },
      }),
    onSuccess: actualizado => {
      qc.invalidateQueries({ queryKey: ['me'] });
      // La sesión guarda el nombre para el sidebar y los encabezados: si no se
      // refresca, seguís viendo el anterior hasta volver a entrar.
      setUser({ name: actualizado.name });
      showToast('Perfil guardado');
      onClose();
    },
    onError: () => showToast('No se pudo guardar el perfil', 'error'),
  });

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
          <div className="card__title">Mi perfil</div>
          <button className="btn btn--ghost btn--icon btn--sm" title="Cerrar" onClick={onClose}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="modal-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isPending ? (
            <div className="ev-vacio">Trayendo tus datos…</div>
          ) : (
            <>
              <label className="ct-campo">
                Nombre y apellido
                <input value={nombreAct} onChange={e => setNombre(e.target.value)} />
              </label>

              <label className="ct-campo">
                Matrícula
                <input
                  className="mono"
                  value={matriculaAct}
                  placeholder="ej: MN 12345"
                  onChange={e => setMatricula(e.target.value)}
                />
              </label>

              <label className="ct-campo">
                Documento
                <input
                  className="mono"
                  value={documentoAct}
                  placeholder="ej: 28.456.789"
                  onChange={e => setDocumento(e.target.value)}
                />
              </label>

              {/* Sin etiqueta propia: el pad ya trae la suya ("Firmá con el
                  dedo") y dos títulos encima del mismo recuadro se leen como
                  un error. */}
              <FirmaPad
                ref={padRef}
                inicial={me?.clinicalProfile?.signaturePng}
                onCambio={setFirmaNueva}
              />

              <p className="mp-nota">
                <Icon name="alert" size={13} /> Tu nombre, tu matrícula y tu firma se estampan
                dentro de los consentimientos que firman tus pacientes, y ahí quedan
                congelados: cambiarlos acá no toca los que ya están firmados.
              </p>
            </>
          )}
        </div>

        <div className="modal-card__footer">
          <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn--primary"
            disabled={!sucio || !nombreAct.trim() || guardar.isPending}
            onClick={() => guardar.mutate()}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MiPerfilModal;
