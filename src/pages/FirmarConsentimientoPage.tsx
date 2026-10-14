import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { consentsApi } from '../api/consents';
import { patientsApi } from '../api/patients';
import { useAuthStore } from '../store/auth.store';
import { useUIStore } from '../store/ui.store';
import { Icon } from '../components/common/Icon';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { FirmaPad, type FirmaPadHandle } from '../components/common/FirmaPad';

/**
 * Pantalla de firma — modo bloqueado.
 *
 * Acá la tablet se la queda el paciente, así que la pantalla no puede ser una
 * vista más de la app: no hay navegación, no hay sidebar y no se puede llegar
 * a la ficha de nadie. La salida sin firmar pide la contraseña del
 * profesional.
 *
 * Honestidad sobre el "bloqueo": esto es un disuasivo, no un candado. El
 * paciente puede deslizar, cambiar de app o cerrar la pestaña, y ningún
 * navegador deja impedirlo. El candado real lo pone el sistema operativo —
 * Acceso Guiado en iPad, Anclar pantalla en Android— y eso hay que decírselo
 * al profesional en vez de dejar que crea que la app se lo resuelve.
 */

const DOS = (n: number) => String(n).padStart(2, '0');
const fechaCorta = (d: Date) =>
  `${DOS(d.getDate())}/${DOS(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;

export default function FirmarConsentimientoPage() {
  const { patientId, id } = useParams<{ patientId: string; id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const { user, clinic } = useAuthStore();

  const { data: consent, isPending } = useQuery({
    queryKey: ['consent', patientId, id],
    queryFn: () => consentsApi.findAll(patientId!).then(l => l.find(c => c._id === id)),
    enabled: !!patientId && !!id,
  });
  const consentDni = consent?.dni;
  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => patientsApi.findById(patientId!),
    enabled: !!patientId,
  });

  // Derivado, no sincronizado con un efecto: mientras el paciente no toque
  // el campo sigue al DNI que venía cargado. Un setState adentro de un efecto
  // encadena renders y además es error de lint en este proyecto.
  const [dniTocado, setDniTocado] = useState<string | null>(null);
  const dni = dniTocado ?? consentDni ?? '';
  const [leyo, setLeyo] = useState(false);
  const [alFinal, setAlFinal] = useState(false);
  // Cuánto del texto se leyó, de 0 a 1. El candado de "leé hasta el final" es
  // correcto, pero sin mostrar cuánto falta se vive como un botón roto: se
  // firma, no se habilita, y nadie entiende por qué.
  const [leido, setLeido] = useState(0);
  const [trazo, setTrazo] = useState(false);
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);

  const textoRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<FirmaPadHandle>(null);

  // Avisar antes de cerrar la pestaña: si el paciente la cierra sin querer,
  // el consentimiento queda pendiente y hay que rehacerlo delante de él.
  useEffect(() => {
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, []);

  /** Habilitar "Firmar" recién con el texto leído hasta el final. Un botón
   *  activo desde el primer segundo invita a firmar sin leer, que es
   *  exactamente lo que un consentimiento no tiene que permitir. */
  const alScrollear = () => {
    const el = textoRef.current;
    if (!el) return;
    const total = el.scrollHeight - el.clientHeight;
    setLeido(total <= 0 ? 1 : Math.min(1, (el.scrollTop + 24) / total));
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setAlFinal(true);
  };

  // Si el texto entra ENTERO sin scroll, no hay nada que scrollear y darlo
  // por leído es correcto. Se mide después de pintar, porque antes el
  // contenedor todavía no tiene su alto definitivo y mediría que entra
  // cuando en realidad no entra — que fue justo el bug: el candado se abría
  // solo y el botón quedaba disponible sin que nadie leyera nada.
  useEffect(() => {
    const el = textoRef.current;
    if (!el) return;
    const medir = () => {
      if (el.scrollHeight <= el.clientHeight + 4) { setAlFinal(true); setLeido(1); }
    };
    const t = requestAnimationFrame(medir);
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => { cancelAnimationFrame(t); ro.disconnect(); };
  }, [consent?.finalText]);

  const firmar = useMutation({
    mutationFn: () =>
      consentsApi.sign(patientId!, id!, {
        signaturePng: padRef.current!.toPng()!,
        dni: dni.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consents', patientId] });
      showToast('Consentimiento firmado ✓');
      navigate(`/patients/${patientId}?hoja=consentimientos`, { replace: true });
    },
    onError: () => showToast('No se pudo guardar la firma', 'error'),
  });

  const puedeFirmar = alFinal && leyo && trazo && !firmar.isPending;

  if (isPending) return <div className="fi-cargando">Abriendo el consentimiento…</div>;
  if (!consent) return <div className="fi-cargando">No encontramos este consentimiento.</div>;
  if (consent.status === 'SIGNED') {
    return (
      <div className="fi-cargando">
        Este consentimiento ya está firmado.
        <button className="btn-hoja" onClick={() => navigate(`/patients/${patientId}`)}>
          Volver a la ficha
        </button>
      </div>
    );
  }

  const nombre = patient ? `${patient.name} ${patient.lastName}` : '';

  return (
    <div className="fi">
      <header className="fi-head">
        <div>
          <b>{clinic?.name}</b>
          <small>{user?.name}</small>
        </div>
        {/* El nombre del handoff era "Soy el profesional", que dice QUIÉN sos
            y no QUÉ hace el botón. En la prueba nadie encontró cómo salir.
            El verbo primero y la aclaración después. */}
        <button type="button" className="fi-soy" onClick={() => setConfirmandoSalida(true)}>
          <Icon name="arrowLeft" size={14} />
          <span>
            Salir
            <small>soy el profesional</small>
          </span>
        </button>
      </header>

      <div className="fi-cols">
        <section className="fi-texto-col">
          <h1>Consentimiento informado</h1>
          <p className="fi-sub">
            {consent.templateName} · {fechaCorta(new Date())}
          </p>
          {/* La regla, ANTES de tocar nada. Enterarse de que el botón no
              anda y recién ahí descubrir por qué se vive como un error de la
              app, aunque el candado esté funcionando bien. */}
          <p className="fi-regla">
            Leé el consentimiento completo: el botón para firmar se habilita
            cuando llegues al final del texto.
          </p>
          <div className="fi-texto" ref={textoRef} onScroll={alScrollear}>
            {consent.finalText}
          </div>
          {!alFinal && <div className="fi-desliza">Deslizá para leer todo ↓</div>}
        </section>

        <section className="fi-form">
          <label className="fi-campo">
            Nombre
            <input value={nombre} readOnly />
          </label>
          <label className="fi-campo">
            DNI — confirmá tu documento
            <input
              className="mono"
              value={dni}
              inputMode="numeric"
              onChange={e => setDniTocado(e.target.value)}
            />
          </label>

          <label className="fi-check">
            <input type="checkbox" checked={leyo} onChange={e => setLeyo(e.target.checked)} />
            Leí el consentimiento completo, me explicaron el procedimiento y pude
            hacer preguntas.
          </label>

          <FirmaPad ref={padRef} onCambio={setTrazo} />

          <button
            type="button"
            className="fi-firmar"
            disabled={!puedeFirmar}
            onClick={() => firmar.mutate()}
          >
            {firmar.isPending ? 'Guardando…' : 'Firmar'}
          </button>
          {/* El aviso de qué falta va ACÁ, pegado al botón: es donde se mira
              cuando el botón no responde. Debajo del texto quedaba fuera de
              pantalla justo en el momento en que hacía falta. */}
          {!puedeFirmar && !firmar.isPending && (
            !alFinal ? (
              <div className="fi-avance">
                <div className="fi-avance__barra">
                  <span style={{ width: `${Math.round(leido * 100)}%` }} />
                </div>
                <span>Leé el texto hasta el final · {Math.round(leido * 100)}%</span>
              </div>
            ) : (
              <p className="fi-falta">
                {!leyo
                  ? 'Marcá la casilla para confirmar que lo leíste.'
                  : 'Firmá en el recuadro.'}
              </p>
            )
          )}

          <p className="fi-pie">
            Se guarda tu firma con la fecha, la hora y tu DNI, junto al texto que
            leíste.
          </p>
        </section>
      </div>

      {/* Confirmación, no contraseña.
          Lo que había antes era pedir la contraseña del profesional, y en la
          práctica se paga en cada aborto —que pasa seguido: el paciente se
          arrepiente, suena el teléfono— mientras que proteger de verdad la
          ficha mientras el paciente tiene la tablet es trabajo del sistema
          operativo (Acceso Guiado en iPad, Anclar pantalla en Android), no de
          un formulario que igual se puede saltear cerrando la pestaña. */}
      <ConfirmDialog
        open={confirmandoSalida}
        title="¿Salir sin firmar?"
        message="El consentimiento queda pendiente y vas a poder retomarlo desde la ficha."
        confirmLabel="Salir"
        cancelLabel="Seguir acá"
        onConfirm={() => navigate(`/patients/${patientId}?hoja=consentimientos`, { replace: true })}
        onCancel={() => setConfirmandoSalida(false)}
      />
    </div>
  );
}
