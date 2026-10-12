import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { consentsApi, type Consent } from '../../api/consents';
import { clinicsApi } from '../../api/clinics';
import { usersApi } from '../../api/users';
import { useUIStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';
import { Icon } from '../common/Icon';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ConsentTemplatesModal } from '../common/ConsentTemplatesModal';
import {
  PLANTILLAS_EJEMPLO,
  segmentar,
  aplicarVariables,
  versionVigente,
  type ConsentTemplate,
} from '../../lib/consentTemplates';

/**
 * Hoja "Consentimientos" de la ficha.
 *
 * Arma el consentimiento congelando el texto con las variables ya
 * reemplazadas, y lista los del paciente. La pantalla de firma va aparte.
 */

const DOS = (n: number) => String(n).padStart(2, '0');
const fechaCorta = (iso: string) => {
  const d = new Date(iso);
  return `${DOS(d.getDate())}/${DOS(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};
const horaCorta = (iso: string) => {
  const d = new Date(iso);
  return `${DOS(d.getHours())}:${DOS(d.getMinutes())}`;
};
const ORIGEN: Record<string, string> = {
  OFFICE: 'en consultorio',
  LINK: 'por link',
  PAPER: 'PDF subido',
};

interface TrabajoLite {
  _id: string;
  description?: string;
}

interface Props {
  patientId: string;
  pacienteNombre: string;
  pacienteDni?: string;
  trabajos?: TrabajoLite[];
  stack?: boolean;
  /** Abre la pantalla de firma para este consentimiento. */
  onFirmar?: (consent: Consent) => void;
}

export function ConsentimientosTab({
  patientId,
  pacienteNombre,
  pacienteDni,
  trabajos = [],
  stack,
  onFirmar,
}: Props) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const user = useAuthStore(s => s.user);

  const { data: consents = [], isPending } = useQuery({
    queryKey: ['consents', patientId],
    queryFn: () => consentsApi.findAll(patientId),
  });
  const { data: settings } = useQuery({
    queryKey: ['clinic-settings'],
    queryFn: clinicsApi.getSettings,
  });
  // La matrícula no viaja en la sesión, solo está en el perfil.
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: usersApi.me });

  // Las del consultorio mandan; si todavía no cargó ninguna, se ofrecen las
  // de ejemplo que vienen en el código.
  const plantillas: ConsentTemplate[] = useMemo(() => {
    const propias = (settings?.consentTemplates ?? []).filter(p => !p.archived);
    return propias.length ? propias : PLANTILLAS_EJEMPLO;
  }, [settings]);

  const [abierto, setAbierto] = useState(false);
  const [plantillaId, setPlantillaId] = useState('');
  const [workId, setWorkId] = useState('');
  // Cómo se nombra el trabajo DENTRO del texto legal. Va aparte de la
  // descripción del trabajo a propósito: en la ficha dice "extracción", pero
  // el consentimiento tiene que decir "extracción de la pieza 38". Una cosa
  // es una etiqueta de lista y la otra entra en un documento firmado.
  const [nombreEnTexto, setNombreEnTexto] = useState('');
  const [tocoNombre, setTocoNombre] = useState(false);
  const [dni, setDni] = useState(pacienteDni ?? '');
  const [aBorrar, setABorrar] = useState<Consent | null>(null);
  const [plantillasAbiertas, setPlantillasAbiertas] = useState(false);

  const plantilla = plantillas.find(p => p.id === plantillaId) ?? plantillas[0];
  const trabajo = trabajos.find(t => t._id === workId);
  // Mientras no lo toquen, sigue a la descripción del trabajo.
  const nombreTrabajo = tocoNombre ? nombreEnTexto : (trabajo?.description ?? '');

  const datos = useMemo(
    () => ({
      paciente: pacienteNombre,
      dni,
      // Sin "Dr." adelante: ese tratamiento lo escribe la plantilla.
      profesional: me?.name ?? user?.name ?? '',
      matricula: me?.clinicalProfile?.license ?? '',
      documento: me?.clinicalProfile?.dni ?? '',
      trabajo: nombreTrabajo,
      fecha: fechaCorta(new Date().toISOString()),
    }),
    [pacienteNombre, dni, me, user, nombreTrabajo],
  );

  // Siempre la última versión: es la vigente. Las viejas solo existen para
  // poder mostrar de cuál salió un consentimiento ya firmado.
  const version = plantilla ? versionVigente(plantilla) : undefined;

  const trozos = useMemo(
    () => (version ? segmentar(version.body, datos) : []),
    [version, datos],
  );

  const abrirPanel = (id?: string) => {
    setPlantillaId(id ?? plantillas[0]?.id ?? '');
    setDni(pacienteDni ?? '');
    setTocoNombre(false);
    setAbierto(true);
  };

  const crear = useMutation({
    mutationFn: () =>
      consentsApi.create(patientId, {
        templateId: plantilla?.id,
        templateName: plantilla?.name ?? 'Consentimiento',
        templateVersionId: version?.id,
        templateVersionN: version?.n,
        finalText: version ? aplicarVariables(version.body, datos) : '',
        workId: workId || undefined,
        dni: dni.trim() || undefined,
      }),
    onSuccess: creado => {
      qc.invalidateQueries({ queryKey: ['consents', patientId] });
      setAbierto(false);
      // Encadenado: generarlo y no pasárselo al paciente no sirve de nada.
      onFirmar?.(creado);
    },
    onError: () => showToast('No se pudo generar el consentimiento', 'error'),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => consentsApi.remove(patientId, id),
    onSuccess: () => {
      setABorrar(null);
      qc.invalidateQueries({ queryKey: ['consents', patientId] });
      showToast('Consentimiento borrado');
    },
    onError: () => showToast('No se pudo borrar', 'error'),
  });

  return (
    <>
      {/* Barra: elegir y pasar. Sin botón relleno — adentro de una hoja de la
          ficha ninguna acción va sólida (ver la regla de botones). */}
      <div className="ev-bar cs-bar">
        <label className="cs-barsel">
          <span>Plantilla</span>
          <select
            value={plantilla?.id ?? ''}
            onChange={e => abrirPanel(e.target.value)}
          >
            {plantillas.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="cs-barsel">
          <span>Trabajo</span>
          <select value={workId} onChange={e => { setWorkId(e.target.value); setTocoNombre(false); }}>
            <option value="">Sin vincular</option>
            {trabajos.map(t => (
              <option key={t._id} value={t._id}>{t.description || 'Trabajo'}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-hoja" onClick={() => abrirPanel(plantilla?.id)}>
          <Icon name="clipboard" size={15} /> Pasar al paciente
        </button>
      </div>

      {abierto && plantilla && (
        <div className="ev-panel">
          <div className="ev-panel__in">
            <div className="ev-draft cs-nuevo">
              <div className="cs-cols">
                {/* Izquierda: lo que el paciente va a leer, con lo completado
                    resaltado. Es la última oportunidad de ver un dato mal
                    antes de que el texto se congele. */}
                <div>
                  <div className="cs-prevtit">
                    Consentimiento informado · {plantilla.name}
                  </div>
                  {version && (
                    <div className="cs-prevmeta">
                      Plantilla <b className="mono">v{version.n}</b>
                      {' · editada el '}
                      <b className="mono">{fechaCorta(version.createdAt)}</b>
                      {' · '}
                      <button
                        type="button"
                        className="cs-verplantilla"
                        onClick={() => setPlantillasAbiertas(true)}
                      >
                        Ver plantilla
                      </button>
                    </div>
                  )}
                  <div className="cs-preview">
                    {trozos.map((t, i) =>
                      t.variable ? (
                        <mark key={i} className={t.falta ? 'falta' : undefined}>{t.texto}</mark>
                      ) : (
                        <span key={i}>{t.texto}</span>
                      ),
                    )}
                  </div>
                  {plantilla.esEjemplo && (
                    <p className="cs-aviso">
                      <Icon name="alert" size={13} /> Esta plantilla es un{' '}
                      <b>modelo de ejemplo</b>. Antes de usarla con un paciente, el
                      texto lo tiene que revisar y aprobar el profesional.
                    </p>
                  )}
                </div>

                {/* Derecha: lo que se completa. */}
                <div className="cs-form">
                  <label>
                    Plantilla
                    <select value={plantilla.id} onChange={e => setPlantillaId(e.target.value)}>
                      {plantillas.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Trabajo vinculado
                    <select
                      value={workId}
                      onChange={e => { setWorkId(e.target.value); setTocoNombre(false); }}
                    >
                      <option value="">Sin vincular (general)</option>
                      {trabajos.map(t => (
                        <option key={t._id} value={t._id}>{t.description || 'Trabajo'}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Cómo se nombra en el texto
                    <small>editá si hace falta</small>
                    <input
                      value={nombreTrabajo}
                      placeholder="ej: extracción de la pieza 38"
                      onChange={e => { setTocoNombre(true); setNombreEnTexto(e.target.value); }}
                    />
                  </label>
                  <label>
                    DNI del paciente
                    <input
                      className="mono"
                      value={dni}
                      onChange={e => setDni(e.target.value)}
                      placeholder="Lo confirma al firmar"
                    />
                  </label>

                  <button
                    type="button"
                    className="btn-hoja cs-pasar"
                    disabled={crear.isPending}
                    onClick={() => crear.mutate()}
                  >
                    {crear.isPending ? 'Generando…' : 'Pasar al paciente'}
                  </button>
                  <button type="button" className="ev-ghost" onClick={() => setAbierto(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className="ev-lista"
        style={stack ? undefined : { flex: 1, minHeight: 0, overflowY: 'auto' }}
      >
        {isPending ? (
          <div className="ev-vacio">Trayendo los consentimientos…</div>
        ) : consents.length === 0 ? (
          <div className="ev-vacio">
            Todavía no hay consentimientos. Elegí una plantilla arriba para armar el primero.
          </div>
        ) : (
          consents.map(c => {
            const firmado = c.status === 'SIGNED';
            return (
              <div key={c._id} className="ev-fila cs-fila">
                <div className="ev-fecha">
                  {firmado && c.signedAt ? fechaCorta(c.signedAt) : '—'}
                  <small>
                    {firmado && c.signedAt ? horaCorta(c.signedAt) : 'pendiente'}
                    {firmado ? ` · ${ORIGEN[c.origin] ?? ''}` : ''}
                  </small>
                </div>

                <div className="ev-cuerpo">
                  <div className="cs-nombre">{c.templateName}</div>
                  <div className="ev-meta">
                    {c.dni && <span className="mono">DNI {c.dni}</span>}
                    {c.hash && <span className="mono"> · {c.hash.slice(0, 8)}…</span>}
                  </div>
                  {/* Las dos firmas: un consentimiento informado lo firman el
                      paciente y el profesional. */}
                  {firmado && (c.signaturePng || c.professionalSignaturePng) && (
                    <div className="cs-firmas">
                      {c.signaturePng && (
                        <figure>
                          <img src={c.signaturePng} alt="Firma del paciente" />
                          <figcaption>paciente</figcaption>
                        </figure>
                      )}
                      {c.professionalSignaturePng && (
                        <figure>
                          <img src={c.professionalSignaturePng} alt="Firma del profesional" />
                          <figcaption>
                            {c.professionalName ?? 'profesional'}
                            {c.professionalLicense ? ` · ${c.professionalLicense}` : ''}
                          </figcaption>
                        </figure>
                      )}
                    </div>
                  )}
                </div>

                <div className="ev-side">
                  <span className="ev-mi">
                    {!firmado && onFirmar && (
                      <button type="button" title="Pasar al paciente para firmar" onClick={() => onFirmar(c)}>
                        <Icon name="edit" size={13} />
                      </button>
                    )}
                    {!firmado && (
                      <button type="button" title="Borrar" onClick={() => setABorrar(c)}>
                        <Icon name="trash" size={13} />
                      </button>
                    )}
                    {firmado && <span className="cs-sello">FIRMADO</span>}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {plantillasAbiertas && (
        <ConsentTemplatesModal onClose={() => setPlantillasAbiertas(false)} />
      )}

      <ConfirmDialog
        open={!!aBorrar}
        title="¿Borrar este consentimiento?"
        message="Todavía no está firmado, así que se puede borrar."
        confirmLabel="Borrar"
        danger
        icon="trash"
        onConfirm={() => aBorrar && borrar.mutate(aBorrar._id)}
        onCancel={() => setABorrar(null)}
      />
    </>
  );
}

export default ConsentimientosTab;
