import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { consentsApi, type Consent } from '../../api/consents';
import { clinicsApi } from '../../api/clinics';
import { usersApi } from '../../api/users';
import { useUIStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';
import { Icon } from '../common/Icon';
import { Select } from '../common/Select';
import { useFlip } from '../../hooks/useFlip';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ConsentTemplatesModal } from '../common/ConsentTemplatesModal';
import { AnularConsentimientoModal } from '../common/AnularConsentimientoModal';
import { MiPerfilModal } from '../common/MiPerfilModal';
import { descargarConsentimiento } from '../../lib/consentPdf';
import { toWhatsAppNumber } from '../../lib/phone';
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
  pacienteTelefono?: string;
  trabajos?: TrabajoLite[];
  stack?: boolean;
  /** Abre la pantalla de firma para este consentimiento. */
  onFirmar?: (consent: Consent) => void;
}

export function ConsentimientosTab({
  patientId,
  pacienteNombre,
  pacienteDni,
  pacienteTelefono,
  trabajos = [],
  stack,
  onFirmar,
}: Props) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const user = useAuthStore(s => s.user);
  const clinic = useAuthStore(s => s.clinic);

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
  const [aAnular, setAAnular] = useState<Consent | null>(null);
  const [plantillasAbiertas, setPlantillasAbiertas] = useState<false | 'lista' | 'nueva'>(false);
  /**
   * Token ya generado para cada consentimiento, en memoria.
   *
   * Cada llamada a `crearLink` pisa el hash guardado, o sea que **invalida el
   * link anterior**. Sin esto, mandar por WhatsApp y después copiar generaría
   * dos tokens y el que ya mandaste dejaría de servir. Guardando el primero,
   * las dos acciones comparten el mismo.
   */
  const [links, setLinks] = useState<Record<string, string>>({});
  const [perfilAbierto, setPerfilAbierto] = useState(false);

  /**
   * Lo que falta del perfil del profesional para que el documento salga
   * completo.
   *
   * El aviso vive acá y no en la configuración porque es acá donde importa:
   * matrícula y DNI entran en el TEXTO al generar el consentimiento, y la
   * firma se copia adentro en el momento en que el paciente firma. Cargarlas
   * después no arregla lo ya firmado — queda con los renglones en blanco para
   * siempre.
   *
   * Solo para quien atiende: una secretaria no tiene matrícula y nada se
   * arregla pidiéndosela.
   */
  const faltan = useMemo(() => {
    if (!me?.isClinical) return [];
    const p = me.clinicalProfile;
    return [
      !p?.license && 'tu matrícula',
      !p?.dni && 'tu DNI',
      !p?.signaturePng && 'tu firma',
    ].filter(Boolean) as string[];
  }, [me]);
  // Qué botones hay realmente en la lista, para que la leyenda de abajo
  // nombre solo esos. Un firmado anulado ya no ofrece anular, pero sigue
  // ofreciendo descargar.
  const hayPendiente = consents.some(c => c.status !== 'SIGNED');
  const hayFirmado = consents.some(c => c.status === 'SIGNED');

  const faltanTexto =
    faltan.length < 2
      ? faltan[0]
      : `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}`;

  // Mismo acompañamiento que la hoja de evolución al borrar uno pendiente.
  const listaRef = useRef<HTMLDivElement>(null);
  useFlip(listaRef, { insert: true, soloAltaYBaja: true });

  const plantilla = plantillas.find(p => p.id === plantillaId) ?? plantillas[0];
  // El <select> nativo dibuja sus opciones con el tema del sistema operativo
  // —azul de Windows, hoja negra en Android— y no hay forma de estilarlas.
  // El Select propio ya existía en el proyecto justamente por eso.
  const NUEVA = '__nueva__';
  const opcPlantillas = [
    ...plantillas.map(p => ({ value: p.id, label: p.name })),
    // Al final y separado: crear una no es elegir una, pero es lo que vas a
    // querer justo cuando mirás la lista y no está la que necesitás.
    { value: NUEVA, label: '+ Crear una plantilla nueva' },
  ];
  const opcTrabajos = [
    { value: '', label: 'Sin vincular' },
    ...trabajos.map(t => ({ value: t._id, label: t.description || 'Trabajo' })),
  ];
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

  /**
   * Genera el link y abre WhatsApp con el mensaje listo.
   *
   * No se manda nada desde el servidor: se abre `wa.me` y el envío lo hace el
   * profesional desde su propio WhatsApp, igual que los recordatorios de
   * turno. Así no hace falta ninguna integración ni guardar conversaciones.
   */
  /** Devuelve la URL del link, generándolo solo la primera vez. */
  const obtenerUrl = async (c: Consent) => {
    const guardado = links[c._id];
    const token = guardado ?? (await consentsApi.crearLink(patientId, c._id)).token;
    if (!guardado) {
      setLinks(l => ({ ...l, [c._id]: token }));
      qc.invalidateQueries({ queryKey: ['consents', patientId] });
    }
    return `${window.location.origin}/firmar-invitado/${token}`;
  };

  const mensaje = (url: string) =>
    `Hola ${pacienteNombre.split(' ')[0]}, te paso el consentimiento para que lo leas y lo firmes ` +
    `desde el celular. El link vence en 48 horas:
${url}`;

  const porWhatsApp = useMutation({
    mutationFn: obtenerUrl,
    onSuccess: url => {
      const tel = toWhatsAppNumber(pacienteTelefono);
      const t = encodeURIComponent(mensaje(url));
      // Sin número, WhatsApp abre igual y el profesional elige el contacto.
      window.open(tel ? `https://wa.me/${tel}?text=${t}` : `https://wa.me/?text=${t}`, '_blank');
    },
    onError: () => showToast('No se pudo generar el link', 'error'),
  });

  const copiarLink = useMutation({
    mutationFn: obtenerUrl,
    onSuccess: async url => {
      try {
        await navigator.clipboard.writeText(url);
        showToast('Link copiado ✓');
      } catch {
        // Sin permiso de portapapeles (pasa en http y en algunos navegadores):
        // mostrarlo es mejor que no dar ninguna salida.
        window.prompt('Copiá el link:', url);
      }
    },
    onError: () => showToast('No se pudo generar el link', 'error'),
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
      {/* Solo mientras falte algo: una vez completo el perfil no vuelve a
          aparecer, así no se convierte en un cartel que se aprende a ignorar. */}
      {faltan.length > 0 && (
        <button type="button" className="cs-perfil" onClick={() => setPerfilAbierto(true)}>
          <Icon name="user" size={15} />
          <span>
            <b>Falta {faltanTexto}.</b>
            Son tus datos que quedan dentro del consentimiento cuando el paciente firma.
          </span>
          <Icon name="chevronRight" size={14} />
        </button>
      )}

      {/*
        Barra: elegir y pasar. Sin botón relleno — adentro de una hoja de la
        ficha ninguna acción va sólida (ver la regla de botones).

        Desaparece con el panel abierto, porque el panel ES su forma
        desplegada: trae los mismos dos selects (`opcPlantillas` /
        `opcTrabajos`) y un botón con la misma etiqueta. Dejarla encima de su
        propio desplegado era, además de redundante, engañoso: tocar "Pasar al
        paciente" con el panel ya abierto no cambiaba nada en pantalla pero
        `abrirPanel` reseteaba el DNI y el nombre en el texto. Un botón que
        parece inerte y en realidad borra lo que escribiste.

        Para cerrar está "Cancelar", adentro del panel.
      */}
      {/* La misma condición exacta que el panel, no solo `!abierto`: si el
          panel no llegara a renderizar, esconder la barra te dejaría sin
          barra Y sin panel, o sea sin salida. */}
      {!(abierto && plantilla) && (
      <div className="ev-bar cs-bar">
        <span className="cs-barsel cs-barsel--plantilla">
          <span>Plantilla</span>
          <Select
            value={plantilla?.id ?? ''}
            options={opcPlantillas}
            onChange={v => (v === NUEVA ? setPlantillasAbiertas('nueva') : abrirPanel(v))}
            title="Elegí la plantilla"
          />
        </span>
        <span className="cs-barsel cs-barsel--trabajo">
          <span>Trabajo</span>
          <Select
            value={workId}
            options={opcTrabajos}
            onChange={v => { setWorkId(v); setTocoNombre(false); }}
            title="Trabajo que documenta"
          />
        </span>
        <button type="button" className="btn-hoja" onClick={() => abrirPanel(plantilla?.id)}>
          <Icon name="clipboard" size={15} /> Pasar al paciente
        </button>
      </div>
      )}

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
                        onClick={() => setPlantillasAbiertas('lista')}
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
                  <div className="cs-campo">
                    Plantilla
                    <Select
                      value={plantilla.id}
                      options={opcPlantillas}
                      onChange={v => (v === NUEVA ? setPlantillasAbiertas('nueva') : setPlantillaId(v))}
                    />
                  </div>
                  <div className="cs-campo">
                    Trabajo vinculado
                    <Select
                      value={workId}
                      options={[
                        { value: '', label: 'Sin vincular (general)' },
                        ...opcTrabajos.slice(1),
                      ]}
                      onChange={v => { setWorkId(v); setTocoNombre(false); }}
                    />
                  </div>
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
        ref={listaRef}
        className="ev-lista"
        style={
          stack
            ? { isolation: 'isolate' }
            : { flex: 1, minHeight: 0, overflowY: 'auto', isolation: 'isolate' }
        }
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
            const anulado = !!c.annulledAt;
            return (
              <div
                key={c._id}
                data-flip={c._id}
                className={`ev-fila cs-fila${anulado ? ' cs-fila--anulado' : ''}`}
              >
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
                  {/* Cuándo dejó de valer. Va en el cuerpo y no escondido en un
                      tooltip: es el dato que explica por qué ese documento
                      firmado está apagado. */}
                  {anulado && (
                    <div className="cs-anulado">
                      Anulado el {fechaCorta(c.annulledAt!)}
                      {c.annulledReason ? ` — ${c.annulledReason}` : ''}
                    </div>
                  )}
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
                      <button type="button" title="Pasar la pantalla al paciente para que firme" onClick={() => onFirmar(c)}>
                        <Icon name="smartphone" size={13} />
                      </button>
                    )}
                    {!firmado && (
                      <button
                        type="button"
                        className="cs-wsp"
                        title="Mandar el link por WhatsApp"
                        disabled={porWhatsApp.isPending}
                        onClick={() => porWhatsApp.mutate(c)}
                      >
                        <Icon name="whatsapp" size={13} />
                      </button>
                    )}
                    {!firmado && (
                      <button
                        type="button"
                        title="Copiar el link para mandarlo por donde quieras"
                        disabled={copiarLink.isPending}
                        onClick={() => copiarLink.mutate(c)}
                      >
                        <Icon name="link" size={13} />
                      </button>
                    )}
                    {!firmado && (
                      <button type="button" title="Borrar" onClick={() => setABorrar(c)}>
                        <Icon name="trash" size={13} />
                      </button>
                    )}
                    {firmado && (
                      <button
                        type="button"
                        title="Descargar el PDF"
                        onClick={() => {
                          descargarConsentimiento({
                            consent: c,
                            paciente: pacienteNombre,
                            consultorio: clinic?.name,
                          }).catch(() => showToast('No se pudo generar el PDF', 'error'));
                        }}
                      >
                        <Icon name="download" size={13} />
                      </button>
                    )}
                    {/* Anular es una baja, no una acción de todos los días: va
                        última y sin color, para que no compita con descargar. */}
                    {firmado && !anulado && (
                      <button
                        type="button"
                        title="Anular este consentimiento"
                        onClick={() => setAAnular(c)}
                      >
                        <Icon name="undo" size={13} />
                      </button>
                    )}
                    {firmado && (
                      <span className={`cs-sello${anulado ? ' cs-sello--anulado' : ''}`}>
                        {anulado ? 'ANULADO' : 'FIRMADO'}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {/*
          Qué hace cada ícono.

          Los botones tienen `title`, pero el `title` es un tooltip de hover y
          en tablet el hover no existe — o sea que justo en el aparato donde
          se usa esto no hay forma de averiguarlo.

          Va DENTRO de la lista y pegada a la última fila. Afuera quedaba al
          fondo de la tarjeta, porque la lista es `flex: 1` y se come el alto
          sobrante: una leyenda a 300px de los íconos que explica no la mira
          nadie. `useFlip` solo toca lo que tenga `data-flip`, así que esto no
          le molesta.

          Nombra solo lo que está realmente en pantalla: una leyenda que
          menciona botones que no están es ruido, y enseña a no leerla.
        */}
        {(hayPendiente || hayFirmado) && (
          <div className="cs-leyenda">
            {hayPendiente && (
              <>
                {onFirmar && <span><Icon name="smartphone" size={12} /> Firmar acá</span>}
                <span><Icon name="whatsapp" size={12} /> Mandar por WhatsApp</span>
                <span><Icon name="link" size={12} /> Copiar el link</span>
                <span><Icon name="trash" size={12} /> Borrar</span>
              </>
            )}
            {hayFirmado && (
              <>
                <span><Icon name="download" size={12} /> Descargar PDF</span>
                <span><Icon name="undo" size={12} /> Anular</span>
              </>
            )}
          </div>
        )}
      </div>

      {plantillasAbiertas && (
        <ConsentTemplatesModal
          abrirEnNueva={plantillasAbiertas === 'nueva'}
          onClose={() => setPlantillasAbiertas(false)}
        />
      )}

      {/* El mismo modal que abre la hoja de cuenta: al cerrarlo, `me` se
          revalida y el aviso de arriba se va solo si ya está todo. */}
      {perfilAbierto && <MiPerfilModal onClose={() => setPerfilAbierto(false)} />}

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

      {/* Modal propio y no ConfirmDialog: anular pide motivo y contraseña. */}
      {aAnular && (
        <AnularConsentimientoModal
          consent={aAnular}
          patientId={patientId}
          onClose={() => setAAnular(null)}
          onHecho={() => {
            setAAnular(null);
            qc.invalidateQueries({ queryKey: ['consents', patientId] });
            showToast('Consentimiento anulado');
          }}
        />
      )}
    </>
  );
}

export default ConsentimientosTab;
