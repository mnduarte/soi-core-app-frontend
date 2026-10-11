import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clinicsApi } from '../../api/clinics';
import { useUIStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';
import { Icon } from '../common/Icon';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  PLANTILLAS_EJEMPLO,
  VARIABLES,
  segmentar,
  versionVigente,
  type ConsentTemplate,
} from '../../lib/consentTemplates';

/**
 * Modal "Plantillas de consentimiento".
 *
 * Dos reglas que lo separan de los otros editores de configuración:
 *
 *  · Las versiones no se pisan. Cada "Guardar" agrega una; las viejas quedan
 *    porque hay consentimientos firmados que las referencian, y poder mostrar
 *    qué decía el texto el día que alguien lo firmó es el punto de todo esto.
 *  · Edita solo el dueño. Un MEMBER abre el mismo modal en lectura: el texto
 *    legal del consultorio no es algo que deba poder cambiar cualquiera.
 */

const DOS = (n: number) => String(n).padStart(2, '0');
const fechaCorta = (iso: string) => {
  const d = new Date(iso);
  return `${DOS(d.getDate())}/${DOS(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};

const MUESTRA = {
  paciente: 'Lucía Benavídez',
  dni: '38.214.907',
  profesional: 'Dr. Alvarez',
  trabajo: 'extracción de la pieza 38',
  fecha: fechaCorta(new Date().toISOString()),
};

const nuevoId = () => `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function ConsentTemplatesModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const user = useAuthStore(s => s.user);
  const puedeEditar = user?.role === 'OWNER';

  const { data: settings } = useQuery({
    queryKey: ['clinic-settings'],
    queryFn: clinicsApi.getSettings,
  });

  // Mientras el consultorio no haya cargado ninguna, se muestra la de ejemplo
  // para que el circuito se entienda. Guardarla la convierte en propia.
  const plantillas: ConsentTemplate[] = useMemo(() => {
    const propias = settings?.consentTemplates ?? [];
    return propias.length ? propias : PLANTILLAS_EJEMPLO;
  }, [settings]);

  const [selId, setSelId] = useState<string>('');
  const sel = plantillas.find(p => p.id === selId) ?? plantillas[0];

  const [nombre, setNombre] = useState<string | null>(null);
  const [cuerpo, setCuerpo] = useState<string | null>(null);
  const [requerida, setRequerida] = useState<boolean | null>(null);
  const [previa, setPrevia] = useState(false);
  const [aArchivar, setAArchivar] = useState<ConsentTemplate | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const vig = sel ? versionVigente(sel) : undefined;
  // null = sin tocar, sigue a la plantilla elegida.
  const nombreAct = nombre ?? sel?.name ?? '';
  const cuerpoAct = cuerpo ?? vig?.body ?? '';
  const requeridaAct = requerida ?? sel?.required ?? false;
  const sucio = nombre !== null || cuerpo !== null || requerida !== null;

  const limpiar = () => { setNombre(null); setCuerpo(null); setRequerida(null); };
  const elegir = (id: string) => { setSelId(id); limpiar(); };

  const guardar = useMutation({
    mutationFn: (lista: ConsentTemplate[]) => clinicsApi.updateSettings({ consentTemplates: lista }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clinic-settings'] });
      limpiar();
      showToast('Plantilla guardada');
    },
    onError: () => showToast('No se pudo guardar', 'error'),
  });

  /** Reescribe la lista entera: settings se guarda completo, no por campo. */
  const persistir = (cambio: (lista: ConsentTemplate[]) => ConsentTemplate[]) => {
    // Las de ejemplo no están guardadas: al tocar una, se materializa.
    const base = (settings?.consentTemplates ?? []).length
      ? (settings!.consentTemplates as ConsentTemplate[])
      : PLANTILLAS_EJEMPLO.map(p => ({ ...p, esEjemplo: undefined }));
    guardar.mutate(cambio(base.map(p => ({ ...p }))));
  };

  const guardarVersion = () => {
    if (!sel || !cuerpoAct.trim()) { showToast('El texto no puede quedar vacío', 'error'); return; }
    persistir(lista => {
      const i = lista.findIndex(p => p.id === sel.id);
      const prev = i >= 0 ? lista[i] : { ...sel, versions: [] };
      const n = (prev.versions[prev.versions.length - 1]?.n ?? 0) + 1;
      const actualizada: ConsentTemplate = {
        ...prev,
        name: nombreAct.trim() || prev.name,
        required: requeridaAct,
        archived: prev.archived ?? false,
        versions: [
          ...prev.versions,
          {
            id: `${prev.id}-v${n}`,
            n,
            body: cuerpoAct,
            createdAt: new Date().toISOString(),
            createdByName: user?.name,
          },
        ],
      };
      if (i >= 0) { lista[i] = actualizada; return lista; }
      return [...lista, actualizada];
    });
  };

  const nuevaPlantilla = () => {
    const id = nuevoId();
    persistir(lista => [
      ...lista,
      {
        id,
        name: 'Plantilla nueva',
        required: false,
        archived: false,
        versions: [
          { id: `${id}-v1`, n: 1, body: '', createdAt: new Date().toISOString(), createdByName: user?.name },
        ],
      },
    ]);
    setSelId(id);
    limpiar();
  };

  const archivar = (p: ConsentTemplate) => {
    persistir(lista => lista.map(x => (x.id === p.id ? { ...x, archived: !x.archived } : x)));
    setAArchivar(null);
  };

  /** Inserta la variable donde está el cursor. Nadie tipea las llaves. */
  const insertar = (v: string) => {
    const ta = taRef.current;
    const marca = `{{${v}}}`;
    if (!ta) { setCuerpo(cuerpoAct + marca); return; }
    const a = ta.selectionStart ?? cuerpoAct.length;
    const b = ta.selectionEnd ?? a;
    const nuevo = cuerpoAct.slice(0, a) + marca + cuerpoAct.slice(b);
    setCuerpo(nuevo);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(a + marca.length, a + marca.length);
    });
  };

  // Sin useMemo a propósito: el React Compiler no podía preservarlo (el
  // cuerpo sale de un encadenado de fallbacks) y lo marcaba como error.
  // Segmentar unos kB de texto es barato y solo corre con el modal abierto;
  // de la memoización se encarga el compilador.
  const trozos = segmentar(cuerpoAct, MUESTRA);

  return (
    // Mismo overlay que los otros editores de configuración (trabajos
    // frecuentes, horarios, categorías): no inventamos un modal nuevo.
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(60,52,34,0.42)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, padding: 16, animation: 'overlayFade 0.12s ease-out',
      }}
    >
      <div className="modal-card ct-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-card__header">
          <div className="card__title">Plantillas de consentimiento</div>
          <button className="btn btn--ghost btn--icon btn--sm" title="Cerrar" onClick={onClose}>
            <Icon name="x" size={15} />
          </button>
        </div>

        {!puedeEditar && (
          <div className="ct-banda">
            <Icon name="alert" size={14} /> Solo el dueño del consultorio puede editar
            el texto legal. Podés leerlo, pero no cambiarlo.
          </div>
        )}

        <div className="ct-cols">
          {/* Izquierda: la biblioteca del consultorio. */}
          <aside className="ct-lista">
            {plantillas.map(p => {
              const v = versionVigente(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`ct-item ${sel?.id === p.id ? 'is-active' : ''}`}
                  onClick={() => elegir(p.id)}
                >
                  <span className="ct-item__n">{p.name}</span>
                  <span className="ct-item__m mono">
                    {v ? `v${v.n} · ${fechaCorta(v.createdAt)}` : 'sin versiones'}
                  </span>
                  {p.required && <span className="ct-req">REQUERIDA</span>}
                  {p.archived && <span className="ct-arch">archivada</span>}
                </button>
              );
            })}
            {puedeEditar && (
              <button type="button" className="ct-nueva" onClick={nuevaPlantilla}>
                <Icon name="plus" size={13} /> Nueva plantilla
              </button>
            )}
          </aside>

          {/* Derecha: el editor. */}
          <section className="ct-editor">
            {!sel ? (
              <div className="ev-vacio">Elegí una plantilla de la izquierda.</div>
            ) : (
              <>
                <label className="ct-campo">
                  Nombre
                  <input
                    value={nombreAct}
                    disabled={!puedeEditar}
                    onChange={e => setNombre(e.target.value)}
                  />
                </label>

                <label className="ct-check">
                  <input
                    type="checkbox"
                    checked={requeridaAct}
                    disabled={!puedeEditar}
                    onChange={e => setRequerida(e.target.checked)}
                  />
                  Requerida antes de hacer el trabajo
                </label>

                {puedeEditar && (
                  <div className="ct-vars">
                    <span>Insertar:</span>
                    {VARIABLES.map(v => (
                      <button key={v} type="button" onClick={() => insertar(v)}>{v}</button>
                    ))}
                  </div>
                )}

                <textarea
                  ref={taRef}
                  className="ct-ta"
                  value={cuerpoAct}
                  disabled={!puedeEditar}
                  placeholder="Escribí el texto del consentimiento. Usá los chips de arriba para insertar los datos que se completan solos."
                  onChange={e => setCuerpo(e.target.value)}
                />

                <button type="button" className="ct-previa" onClick={() => setPrevia(v => !v)}>
                  <Icon name={previa ? 'chevronDown' : 'chevronRight'} size={13} />
                  Vista previa con datos de muestra
                </button>
                {previa && (
                  <div className="cs-preview ct-prev">
                    {trozos.map((t, i) =>
                      t.variable ? (
                        <mark key={i} className={t.falta ? 'falta' : undefined}>{t.texto}</mark>
                      ) : (
                        <span key={i}>{t.texto}</span>
                      ),
                    )}
                  </div>
                )}

                <div className="ct-pie">
                  <span className="ct-pie__meta mono">
                    {vig
                      ? `Última edición ${fechaCorta(vig.createdAt)}${vig.createdByName ? ` · ${vig.createdByName}` : ''} · ${sel.versions.length} ${sel.versions.length === 1 ? 'versión' : 'versiones'}`
                      : 'sin versiones'}
                  </span>
                  {puedeEditar && (
                    <>
                      <button type="button" className="ct-archivar" onClick={() => setAArchivar(sel)}>
                        {sel.archived ? 'Desarchivar' : 'Archivar'}
                      </button>
                      <button type="button" className="ev-ghost" onClick={onClose}>Cancelar</button>
                      <button
                        type="button"
                        className="ev-save"
                        disabled={!sucio || guardar.isPending}
                        onClick={guardarVersion}
                      >
                        {guardar.isPending
                          ? 'Guardando…'
                          : `Guardar versión ${(vig?.n ?? 0) + 1}`}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={!!aArchivar}
        title={aArchivar?.archived ? '¿Volver a usar esta plantilla?' : '¿Archivar esta plantilla?'}
        message={
          aArchivar?.archived
            ? 'Va a volver a aparecer en la lista para elegir.'
            : 'Desaparece de la lista para elegir, pero no se borra: los consentimientos ya firmados la siguen referenciando.'
        }
        confirmLabel={aArchivar?.archived ? 'Desarchivar' : 'Archivar'}
        onConfirm={() => aArchivar && archivar(aArchivar)}
        onCancel={() => setAArchivar(null)}
      />
    </div>
  );
}

export default ConsentTemplatesModal;
