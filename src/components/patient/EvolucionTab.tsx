import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clinicalEntriesApi, type ClinicalEntry } from '../../api/clinical-entries';
import { useUIStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';
import { Icon } from '../common/Icon';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useDictado } from '../../hooks/useDictado';
import { useFlip } from '../../hooks/useFlip';

/**
 * Hoja "Evolución" de la ficha clínica.
 *
 * El texto clínico ya vivía en `clinical-entries` (con historial de ediciones
 * del lado del backend), pero colgado de la ficha vieja — `ficha-clasica/:id`,
 * que el consultorio no usa. Acá se trae a la ficha real sin tocar el modelo.
 *
 * Fase 1: notas escritas. El dictado por voz entra después, y por eso el botón
 * del micrófono depende de `onDictar`: si nadie pasa el handler, el botón no se
 * dibuja. Un botón que no hace nada es peor que no tenerlo.
 */

const DOS = (n: number) => String(n).padStart(2, '0');

/** 30/09/26 — como la ficha de papel, y en mono porque es un dato. */
const fechaCorta = (iso: string) => {
  const d = new Date(iso);
  return `${DOS(d.getDate())}/${DOS(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};
const horaCorta = (iso: string) => {
  const d = new Date(iso);
  return `${DOS(d.getHours())}:${DOS(d.getMinutes())}`;
};

/** Lo que tarda el panel en irse. Tiene que coincidir con la animación del
 *  CSS: si acá fuera más corto, el nodo se desmonta a mitad del movimiento. */
const SALIDA_MS = 180;

const mmss = (s: number) => `${Math.floor(s / 60)}:${DOS(s % 60)}`;

const conTitulo = (nombre: string, titulo?: string | null) =>
  titulo === 'DR' ? `Dr. ${nombre}` : titulo === 'DRA' ? `Dra. ${nombre}` : nombre;

/** Lo que la ficha ya arma para las fotos de un trabajo, reusado tal cual. */
export interface FotoDeNota {
  photo: { _id: string; url: string; thumbnailUrl?: string; type?: string };
  sessionId: string;
  title: string;
  description?: string;
}

interface Props {
  patientId: string;
  /**
   * Apilado (celular/tablet): ahí scrollea la PÁGINA, así que la lista no
   * puede tener scroll propio — serían dos barras bajo el mismo dedo. Es la
   * misma regla que sigue la lista de trabajos, y por eso el valor se recibe
   * del padre en vez de calcularlo acá: si cada uno usara su propio
   * breakpoint podrían discrepar en el medio.
   */
  stack?: boolean;
  /** Fotos ya vinculadas, por id de nota. Las arma la ficha, que es quien
   *  tiene las sesiones de galería cargadas. */
  photos?: Map<string, FotoDeNota[]>;
  /** Abre el modal de subida apuntando a esta nota. */
  onFotos?: (entryId: string) => void;
  /** Abre el visor en la foto tocada. */
  onZoom?: (lista: FotoDeNota[], idx: number) => void;
}

export function EvolucionTab({ patientId, stack, photos, onFotos, onZoom }: Props) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const user = useAuthStore(s => s.user);

  const { data: entradas = [], isPending } = useQuery({
    queryKey: ['clinical-entries', patientId],
    queryFn: () => clinicalEntriesApi.findAll(patientId),
  });

  // Más reciente arriba. El backend no garantiza el orden, así que se ordena acá.
  const ordenadas = useMemo(
    () => [...entradas].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entradas],
  );

  const [nota, setNota] = useState('');
  const notaRef = useRef<HTMLInputElement>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');
  const [aBorrar, setABorrar] = useState<ClinicalEntry | null>(null);
  const dic = useDictado();
  // El panel en vivo se mantiene pegado abajo mientras dicta: lo último que
  // dijo es lo que hay que poder leer, no lo primero.
  const vivoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = vivoRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dic.texto, dic.parcial]);
  // El micrófono solo se ofrece si el navegador lo expone y todavía no lo
  // rechazó. Donde no se puede dictar, la barra queda igual que antes y la
  // nota escrita sigue siendo el camino — nadie se topa con un botón muerto.
  const puedeDictar = dic.soportado && !dic.bloqueado;

  /**
   * El panel del dictado se cierra con animación, así que el nodo tiene que
   * seguir montado mientras se va. No uso un efecto para esto a propósito: el
   * cierre siempre nace de un gesto concreto (descartar, guardar, parar sin
   * haber dicho nada), y atarlo al evento evita un setState dentro de un
   * efecto, que en este proyecto es error de lint y además encadena renders.
   */
  const [saliendo, setSaliendo] = useState(false);
  const panelAbierto = dic.estado === 'grabando' || dic.estado === 'listo';
  const mostrarPanel = panelAbierto || saliendo;
  const cerrarPanel = (despues: () => void) => {
    setSaliendo(true);
    window.setTimeout(() => {
      setSaliendo(false);
      despues();
    }, SALIDA_MS);
  };

  const refrescar = () => qc.invalidateQueries({ queryKey: ['clinical-entries', patientId] });

  /**
   * Al borrar una nota, las de abajo suben acompañando en vez de saltar.
   * `soloAltaYBaja` es imprescindible acá: editar una nota abre un textarea
   * que cambia el alto de su fila, y sin esa guarda el hook lo tomaría por un
   * reordenamiento y animaría las filas de abajo encima de su propia
   * animación.
   */
  const listaRef = useRef<HTMLDivElement>(null);
  useFlip(listaRef, { insert: true, soloAltaYBaja: true });

  const crear = useMutation({
    mutationFn: (content: string) => clinicalEntriesApi.create(patientId, { content, type: 'NOTE' }),
    onSuccess: () => {
      setNota('');
      refrescar();
      showToast('Nota guardada');
      // Devolver el foco: el Dr. suele escribir dos seguidas.
      notaRef.current?.focus();
    },
    onError: () => showToast('No se pudo guardar la nota', 'error'),
  });

  const editar = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      clinicalEntriesApi.update(patientId, id, content),
    onSuccess: () => {
      setEditando(null);
      refrescar();
      showToast('Nota actualizada');
    },
    onError: () => showToast('No se pudo actualizar la nota', 'error'),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => clinicalEntriesApi.remove(patientId, id),
    onSuccess: () => {
      setABorrar(null);
      refrescar();
      showToast('Nota borrada');
    },
    onError: () => showToast('No se pudo borrar la nota', 'error'),
  });

  const guardarNota = () => {
    const t = nota.trim();
    if (!t) {
      showToast('Escribí la nota', 'error');
      return;
    }
    crear.mutate(t);
  };

  return (
    <>
      {/* Barra de carga: fija arriba de la línea de tiempo. Tres estados —
          reposo, grabando y transcripto— pero siempre la misma altura, para
          que la lista de abajo no salte al cambiar de uno a otro. */}
      {dic.estado === 'grabando' ? (
        <div className="ev-bar">
          {/* El estado a la izquierda y la acción a la derecha, en el MISMO
              borde donde está el micrófono cuando no grabás: arrancar y parar
              se tocan en el mismo lugar, no hay que ir a buscar el botón.
              El grupo lleva el flex:1 (y no la frase de ayuda) justo para eso:
              antes, al ocultar la frase en pantalla angosta, desaparecía el
              empuje y "Parar" se caía a la izquierda. */}
          <span className="ev-grabando">
            <span className="ev-dot" aria-hidden="true" />
            <span className="ev-timer">{mmss(dic.segundos)}</span>
            <span className="ev-oyendo-hint">Cerca del micrófono, fuerte y claro</span>
          </span>
          <button
            type="button"
            className="ev-mic ev-mic--rec"
            onClick={() =>
              // Si no llegó a transcribir nada, parar cierra el panel: ahí no
              // hay borrador que mostrar y desaparecer de golpe se ve como un
              // parpadeo.
              dic.texto.trim() ? dic.parar() : cerrarPanel(dic.parar)
            }
          >
            Parar
          </button>
        </div>
      ) : (
        <div className="ev-bar">
          <input
            ref={notaRef}
            className="ev-in"
            placeholder="Escribí la nota de hoy…"
            value={nota}
            onChange={e => setNota(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                guardarNota();
              }
            }}
          />
          {/* Un solo botón contra el borde derecho, como WhatsApp: con el campo
              vacío es el micrófono y, apenas escribís, pasa a Guardar. Tener
              los dos a la vez hacía que se pelearan por el ancho justo en
              celular, que es donde menos sobra. */}
          {nota.trim() ? (
            <button type="button" className="ev-save ev-save--bar" onClick={guardarNota} disabled={crear.isPending}>
              {crear.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          ) : puedeDictar ? (
            <button type="button" className="ev-mic" onClick={dic.empezar} title="Dictar evolución">
              <Icon name="mic" size={17} />
              <span className="ev-mic__lbl">Dictar evolución</span>
            </button>
          ) : null}
        </div>
      )}

      {/* El panel del dictado: en vivo mientras habla, borrador al parar.
          Son el mismo hueco, por eso cambian de contenido adentro del mismo
          contenedor en vez de desmontarse uno y montarse el otro — así el
          paso de uno a otro no anima nada, que es lo correcto: el panel no se
          fue a ningún lado, solo cambió lo que tiene adentro. */}
      {mostrarPanel && (
        <div className={`ev-panel ${saliendo ? 'is-saliendo' : ''}`}>
          <div className="ev-panel__in">
            <div className="ev-draft">
              {dic.estado === 'grabando' ? (
                <div className="ev-vivo" ref={vivoRef}>
                  {dic.texto}
                  {dic.parcial && <i>{dic.parcial}</i>}
                  {!dic.texto && !dic.parcial && (
              <em>Escuchando… hablá cerca del micrófono, fuerte y claro.</em>
            )}
                </div>
              ) : (
                <>
                  {/* El dictado no guarda solo: lo transcripto se revisa y se
                      corrige antes de entrar a la historia clínica. */}
                  <textarea
                    className="ev-ta"
                    value={dic.texto}
                    autoFocus
                    rows={4}
                    onChange={e => dic.corregir(e.target.value)}
                  />
                  <div className="ev-acc">
                    <span className="ev-dur">{mmss(dic.segundos)} dictados</span>
                    <span style={{ flex: 1 }} />
                    {/* Parar para pensar la frase que sigue es lo normal.
                        Sin esto, volver a tocar el micrófono arrancaba de cero
                        y se perdía lo dictado. */}
                    <button type="button" className="ev-seguir" onClick={dic.empezar}>
                      <Icon name="mic" size={13} /> Seguir dictando
                    </button>
                    <button
                      type="button"
                      className="ev-ghost"
                      onClick={() => cerrarPanel(dic.descartar)}
                    >
                      Descartar
                    </button>
                    <button
                      type="button"
                      className="ev-save"
                      disabled={crear.isPending || !dic.texto.trim()}
                      onClick={() =>
                        crear.mutate(dic.texto.trim(), {
                          onSuccess: () => cerrarPanel(dic.descartar),
                        })
                      }
                    >
                      {crear.isPending ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {dic.error && <div className="ev-error">{dic.error}</div>}

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
          <div className="ev-vacio">Trayendo la evolución…</div>
        ) : ordenadas.length === 0 ? (
          <div className="ev-vacio">
            Todavía no hay evolución de este paciente. Escribí la primera arriba ↑
          </div>
        ) : (
          ordenadas.map(e => {
            const editado = e.updatedAt !== e.createdAt;
            // Solo se puede nombrar al profesional si es el que está logueado:
            // todavía no hay endpoint para resolver a los demás usuarios.
            const mio = !!user && e.professionalId === user.id;
            const fotos = photos?.get(e._id) ?? [];
            return (
              <div key={e._id} data-flip={e._id} className="ev-fila">
                <div className="ev-fecha">
                  {fechaCorta(e.createdAt)}
                  <small>
                    {horaCorta(e.createdAt)}
                    {mio && ` · ${conTitulo(user.name, user.title)}`}
                  </small>
                </div>

                <div className="ev-cuerpo">
                  {editando === e._id ? (
                    <>
                      <textarea
                        className="ev-ta"
                        value={borrador}
                        autoFocus
                        rows={4}
                        onChange={ev => setBorrador(ev.target.value)}
                      />
                      <div className="ev-acc">
                        <button
                          type="button"
                          className="ev-save"
                          disabled={editar.isPending || !borrador.trim()}
                          onClick={() => editar.mutate({ id: e._id, content: borrador.trim() })}
                        >
                          {editar.isPending ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button type="button" className="ev-ghost" onClick={() => setEditando(null)}>
                          Cancelar
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="ev-texto">{e.content}</p>
                      {/* "escrito" salía en todas y no decía nada. Queda solo
                          "editado", que sí informa: en una historia clínica
                          importa saber que un texto se cambió después.
                          Cuando el backend guarde el origen, acá vuelve a
                          tener sentido distinguir dictado de escrito. */}
                      {editado && (
                        <div className="ev-meta">
                          <span>editado</span>
                        </div>
                      )}
                      {/* Miniaturas en línea, igual que en la fila de un
                          trabajo: la imagen al lado del texto que la explica. */}
                      {fotos.length > 0 && (
                        <div className="ev-ths">
                          {fotos.map((f, idx) => (
                            <img
                              key={f.photo._id}
                              src={f.photo.thumbnailUrl || f.photo.url}
                              onClick={() => onZoom?.(fotos, idx)}
                              title="Foto de esta nota"
                              alt=""
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="ev-side">
                  {editando !== e._id && (
                    <span className="ev-mi">
                      {onFotos && (
                        <button
                          type="button"
                          title="Fotos de esta nota"
                          className={fotos.length ? 'is-on' : undefined}
                          onClick={() => onFotos(e._id)}
                        >
                          <Icon name="image" size={13} />
                          {fotos.length > 0 && <b>{fotos.length}</b>}
                        </button>
                      )}
                      <button
                        type="button"
                        title="Editar la nota"
                        onClick={() => {
                          setEditando(e._id);
                          setBorrador(e.content);
                        }}
                      >
                        <Icon name="edit" size={13} />
                      </button>
                      <button type="button" title="Borrar la nota" onClick={() => setABorrar(e)}>
                        <Icon name="trash" size={13} />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={!!aBorrar}
        title="¿Borrar esta nota?"
        message="La evolución es parte de la historia clínica. Esto no se puede deshacer."
        confirmLabel="Borrar"
        danger
        icon="trash"
        onConfirm={() => aBorrar && borrar.mutate(aBorrar._id)}
        onCancel={() => setABorrar(null)}
      />
    </>
  );
}

export default EvolucionTab;
