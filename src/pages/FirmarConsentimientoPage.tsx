import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { consentsApi } from '../api/consents';
import { patientsApi } from '../api/patients';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/auth.store';
import { useUIStore } from '../store/ui.store';
import { Icon } from '../components/common/Icon';
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
  const [trazo, setTrazo] = useState(false);
  const [pidiendoClave, setPidiendoClave] = useState(false);
  const [clave, setClave] = useState('');

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
      if (el.scrollHeight <= el.clientHeight + 4) setAlFinal(true);
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
      navigate(`/patients/${patientId}`, { replace: true });
    },
    onError: () => showToast('No se pudo guardar la firma', 'error'),
  });

  const salir = useMutation({
    mutationFn: () => authApi.verifyPassword(clave),
    onSuccess: () => navigate(`/patients/${patientId}`, { replace: true }),
    onError: () => showToast('Contraseña incorrecta', 'error'),
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
        <button type="button" className="fi-soy" onClick={() => setPidiendoClave(true)}>
          <Icon name="arrowLeft" size={14} /> Salir
          <small>soy el profesional</small>
        </button>
      </header>

      <div className="fi-cols">
        <section className="fi-texto-col">
          <h1>Consentimiento informado</h1>
          <p className="fi-sub">
            {consent.templateName} · {fechaCorta(new Date())}
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
          {!puedeFirmar && !firmar.isPending && (
            <p className="fi-falta">
              {!alFinal
                ? 'Leé el texto hasta el final para poder firmar.'
                : !leyo
                  ? 'Marcá la casilla para confirmar que lo leíste.'
                  : 'Firmá en el recuadro.'}
            </p>
          )}

          <p className="fi-pie">
            Se guarda tu firma con la fecha, la hora y tu DNI, junto al texto que
            leíste.
          </p>
        </section>
      </div>

      {pidiendoClave && (
        <div className="fi-clave-fondo" onClick={() => setPidiendoClave(false)}>
          <div className="fi-clave" onClick={e => e.stopPropagation()}>
            <b>Salir sin firmar</b>
            <p>Poné tu contraseña para volver a la ficha.</p>
            <input
              type="password"
              autoFocus
              value={clave}
              onChange={e => setClave(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') salir.mutate(); }}
            />
            <div className="fi-clave__acc">
              <button type="button" className="ev-ghost" onClick={() => setPidiendoClave(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="ev-save"
                disabled={!clave || salir.isPending}
                onClick={() => salir.mutate()}
              >
                {salir.isPending ? 'Verificando…' : 'Salir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
