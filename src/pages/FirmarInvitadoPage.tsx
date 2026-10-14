import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { publicConsentsApi } from '../api/publicConsents';
import { FirmaPad, type FirmaPadHandle } from '../components/common/FirmaPad';

/**
 * Firma por link, desde el celular del paciente.
 *
 * Es la misma pantalla que la del consultorio pero en una columna y sin nada
 * de la app: no hay sesión, no hay navegación y no hay forma de llegar a
 * ninguna ficha. Lo único que existe acá es este documento.
 *
 * El DNI viene vacío a propósito aunque el consultorio lo tenga cargado: si
 * el servidor lo mandara, cualquiera que vea ese WhatsApp se enteraría del
 * documento del paciente. Lo escribe él, que además es la confirmación que el
 * consentimiento necesita.
 */
export default function FirmarInvitadoPage() {
  const { token } = useParams<{ token: string }>();

  const { data: consent, isPending, error } = useQuery({
    queryKey: ['public-consent', token],
    queryFn: () => publicConsentsApi.ver(token!),
    enabled: !!token,
    retry: false,
  });

  const [dni, setDni] = useState('');
  const [leyo, setLeyo] = useState(false);
  const [alFinal, setAlFinal] = useState(false);
  // Cuánto del texto se leyó, de 0 a 1. El candado de "leé hasta el final" es
  // correcto, pero sin mostrar cuánto falta se vive como un botón roto: se
  // firma, no se habilita, y nadie entiende por qué.
  const [leido, setLeido] = useState(0);
  const [trazo, setTrazo] = useState(false);
  const [listo, setListo] = useState(false);

  const textoRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<FirmaPadHandle>(null);

  const alScrollear = () => {
    const el = textoRef.current;
    if (!el) return;
    const total = el.scrollHeight - el.clientHeight;
    setLeido(total <= 0 ? 1 : Math.min(1, (el.scrollTop + 24) / total));
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setAlFinal(true);
  };

  // Si el texto entra entero sin scroll no hay nada que leer "hasta el final".
  // Se mide después de pintar: antes el contenedor no tiene su alto definitivo
  // y mediría que entra cuando en realidad no entra.
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
      publicConsentsApi.firmar(token!, {
        signaturePng: padRef.current!.toPng()!,
        dni: dni.trim() || undefined,
      }),
    onSuccess: () => setListo(true),
  });

  if (isPending) return <div className="fi-cargando">Abriendo el consentimiento…</div>;

  if (error || !consent) {
    return (
      <div className="fi-cargando">
        <b>Este link ya no está disponible</b>
        <p style={{ maxWidth: 360, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          Puede que ya lo hayas firmado o que haya pasado demasiado tiempo.
          Pedile uno nuevo a tu odontólogo.
        </p>
      </div>
    );
  }

  if (listo) {
    return (
      <div className="fi-cargando">
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>
          Listo, gracias {consent.patientName.split(' ')[0]}
        </b>
        <p style={{ maxWidth: 360, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          Tu consentimiento quedó firmado. Ya podés cerrar esta página.
        </p>
      </div>
    );
  }

  const puedeFirmar = alFinal && leyo && trazo && !firmar.isPending;

  return (
    <div className="fi fi--invitado">
      <header className="fi-head">
        <div>
          <b>{consent.clinicName}</b>
          <small>Consentimiento informado</small>
        </div>
      </header>

      <div className="fi-cols">
        <section className="fi-texto-col">
          <h1>{consent.templateName}</h1>
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
            <input value={consent.patientName} readOnly />
          </label>
          <label className="fi-campo">
            DNI — escribí tu documento
            <input
              className="mono"
              value={dni}
              inputMode="numeric"
              onChange={e => setDni(e.target.value)}
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
          {firmar.isError && (
            <p className="fi-falta" style={{ color: 'var(--danger)' }}>
              No se pudo guardar la firma. Probá de nuevo.
            </p>
          )}

          <p className="fi-pie">
            Se guarda tu firma con la fecha, la hora y tu DNI, junto al texto que
            leíste.
          </p>
        </section>
      </div>
    </div>
  );
}
