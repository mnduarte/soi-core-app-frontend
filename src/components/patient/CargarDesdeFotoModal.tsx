import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../common/Modal';
import { Icon } from '../common/Icon';
import { worksApi, type TrabajoDictado } from '../../api/works';
import { fileToScaledBase64 } from '../../lib/image';
import { fmtMoney } from '../../lib/format';
import { useUIStore } from '../../store/ui.store';

/**
 * Cargar por única vez la ficha de papel de un paciente que recién entra.
 *
 * ── Por qué aparece solo con la ficha vacía ──
 * Esto es una migración, no una función de todos los días: quien viene de 500
 * fichas en papel las carga de a una, y cada una se carga UNA vez. No hace
 * falta guardar en ningún lado si ya se usó — la ficha vacía ES el estado. Si
 * se cargó algo, por foto o a mano, deja de estar vacía y el ofrecimiento
 * desaparece solo; si se cerró esto sin hacer nada, sigue vacía y se sigue
 * ofreciendo. Sin un flag que mantener ni que pueda quedar mal.
 *
 * ── Por qué no trae los pagos ──
 * El modelo de SOI es "realizado − pagado": no hace falta el historial de
 * pagos, hace falta el SALDO. Un historial mal leído de una foto cambiaría lo
 * que el paciente debe sin que nadie lo vuelva a revisar. El saldo se escribe
 * a mano, una línea, y el historial viejo queda en el papel.
 *
 * El padre lo monta sólo mientras está abierto, así que el estado se limpia
 * al desmontarse y no hay nada que resetear a mano.
 *
 * ── Por qué una sola pantalla de revisión ──
 * No se escribe nada hasta el botón final. Tres confirmaciones seguidas se
 * aceptan sin leer; una sola, con todo junto y el total a la vista, se lee.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  patientId: string;
  /** Para que la pantalla diga de quién se trata. */
  nombre?: string;
}

type Paso = 'inicio' | 'leyendo' | 'revisar';

export function CargarDesdeFotoModal({ open, onClose, patientId, nombre }: Props) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);

  const [paso, setPaso] = useState<Paso>('inicio');
  const [encontrados, setEncontrados] = useState<TrabajoDictado[]>([]);
  const [saldo, setSaldo] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const leerFoto = async (file?: File) => {
    if (!file) return;
    setError('');
    setPaso('leyendo');
    try {
      const { data, mediaType } = await fileToScaledBase64(file);
      const leidos = await worksApi.scanPlan(data, mediaType);
      setEncontrados(leidos);
      setPaso('revisar');
      if (!leidos.length) {
        setError('No se encontró ningún trabajo escrito. Podés cargar solo el saldo.');
      }
    } catch {
      setError('No se pudo leer la foto. Probá con una más nítida y de cerca.');
      setPaso('inicio');
    }
  };

  const editar = (i: number, campo: 'descripcion' | 'precio', valor: string) =>
    setEncontrados(old =>
      old.map((t, j) =>
        j !== i
          ? t
          : campo === 'descripcion'
            ? { ...t, descripcion: valor }
            : { ...t, precio: valor ? Number(valor.replace(/[^\d]/g, '')) : null },
      ),
    );

  const totalPlan = encontrados.reduce((a, t) => a + (t.precio ?? 0), 0);
  const saldoNum = Number(saldo.replace(/[^\d]/g, '')) || 0;
  const hayAlgo = encontrados.length > 0 || saldoNum > 0;

  const cargar = async () => {
    setGuardando(true);
    let hechos = 0;
    try {
      // El saldo primero: si algo falla después, lo que quedó cargado es la
      // deuda, que es el dato que no se puede perder.
      if (saldoNum > 0) {
        await worksApi.create({
          patientId,
          // Se registra como trabajo HECHO y no pagado, que es exactamente lo
          // que significa un saldo anterior en el modelo "realizado − pagado".
          // Con nombre explícito para que en el historial se lea como lo que
          // es y no se confunda con un trabajo del consultorio.
          description: 'Saldo anterior — ficha en papel',
          price: saldoNum,
          status: 'COMPLETED',
        });
        hechos++;
      }
      for (const t of encontrados) {
        const desc = t.descripcion.trim();
        if (!desc) continue;
        await worksApi.create({
          patientId,
          description: t.pieza ? `${desc} — ${t.pieza}` : desc,
          toothNumber: t.pieza ?? undefined,
          price: t.precio ?? 0,
          status: 'PROPOSED',
        });
        hechos++;
      }
      qc.invalidateQueries({ queryKey: ['works', patientId] });
      showToast(`Ficha cargada — ${hechos} ${hechos === 1 ? 'registro' : 'registros'}`, 'success');
      onClose();
    } catch {
      // Lo que entró queda: se refresca para que se vea, en vez de dejar la
      // pantalla diciendo que no se cargó nada.
      qc.invalidateQueries({ queryKey: ['works', patientId] });
      showToast(hechos ? `Se cargaron ${hechos} y falló el resto` : 'No se pudo cargar', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const tituloSeccion = {
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--text-tertiary)',
    marginBottom: 8,
  };

  return (
    <Modal
      open={open}
      onClose={guardando ? () => {} : onClose}
      title="Cargar la ficha de papel"
      sub={nombre ? `Por única vez, para ${nombre}.` : 'Por única vez, al abrir la ficha.'}
      width={620}
      footer={
        paso === 'revisar' ? (
          <>
            <span style={{ marginRight: 'auto', fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Plan <b style={{ color: 'var(--text-primary)' }}>{fmtMoney(totalPlan)}</b>
              {saldoNum > 0 && (
                <>
                  {' · '}Debe <b style={{ color: 'var(--danger)' }}>{fmtMoney(saldoNum)}</b>
                </>
              )}
            </span>
            <button className="btn btn--ghost" onClick={onClose} disabled={guardando}>
              Cancelar
            </button>
            <button className="btn btn--primary" onClick={cargar} disabled={guardando || !hayAlgo}>
              {guardando ? 'Cargando…' : 'Cargar en la ficha'}
            </button>
          </>
        ) : (
          <button className="btn btn--ghost" onClick={onClose} disabled={paso === 'leyendo'}>
            {paso === 'leyendo' ? 'Leyendo…' : 'Ahora no'}
          </button>
        )
      }
    >
      {error && (
        <div
          style={{
            background: 'var(--warning-bg)',
            color: 'var(--warning)',
            border: '1px solid var(--warning-border)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12.5,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {paso === 'inicio' && (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.5, color: 'var(--text-primary)' }}>
            Sacale una foto a la ficha de papel y armamos el plan de tratamiento solo.
          </p>
          {/* Decir qué NO hace es tan importante como qué hace: si alguien
              espera que traiga el odontograma, va a dar por cargado algo que
              nunca se cargó. */}
          <ul
            style={{
              margin: '0 0 16px',
              paddingLeft: 18,
              fontSize: 13,
              lineHeight: 1.7,
              color: 'var(--text-secondary)',
            }}
          >
            <li>
              Se cargan los <b>trabajos del plan</b> que estén escritos.
            </li>
            <li>
              El <b>saldo</b> lo escribís vos en el paso siguiente.
            </li>
            <li>
              El <b>odontograma no</b> se carga: se va armando a medida que atendés.
            </li>
            <li>Revisás todo antes de que entre nada a la ficha.</li>
          </ul>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => {
              void leerFoto(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            className="btn btn--primary"
            onClick={() => fileRef.current?.click()}
            style={{ width: '100%', height: 46 }}
          >
            <Icon name="camera" size={16} /> Sacar o elegir la foto
          </button>
        </>
      )}

      {paso === 'leyendo' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '22px 0' }}>
          <div className="spinner" style={{ width: 20, height: 20 }} />
          <div>
            <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>Leyendo la ficha…</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Tarda unos segundos.</div>
          </div>
        </div>
      )}

      {paso === 'revisar' && (
        <>
          {encontrados.length > 0 && (
            <>
              <div style={tituloSeccion}>Trabajos encontrados — corregí lo que haga falta</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                {encontrados.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      className="input"
                      value={t.descripcion}
                      onChange={e => editar(i, 'descripcion', e.target.value)}
                      style={{ flex: '1 1 140px', minWidth: 0, height: 36 }}
                    />
                    <div style={{ position: 'relative', width: 120, flexShrink: 0 }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: 10,
                          top: 9,
                          color: 'var(--text-tertiary)',
                          fontSize: 13,
                          pointerEvents: 'none',
                        }}
                      >
                        $
                      </span>
                      <input
                        className="input"
                        inputMode="numeric"
                        placeholder="0"
                        value={t.precio != null ? String(t.precio) : ''}
                        onChange={e => editar(i, 'precio', e.target.value)}
                        style={{ width: '100%', height: 36, paddingLeft: 20 }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon"
                      aria-label={`Sacar ${t.descripcion}`}
                      onClick={() => setEncontrados(old => old.filter((_, j) => j !== i))}
                      style={{ height: 36, flexShrink: 0 }}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={tituloSeccion}>¿Con cuánto arranca?</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative', width: 150, flexShrink: 0 }}>
              <span
                style={{
                  position: 'absolute',
                  left: 10,
                  top: 10,
                  color: 'var(--text-tertiary)',
                  fontSize: 13,
                  pointerEvents: 'none',
                }}
              >
                $
              </span>
              <input
                className="input"
                inputMode="numeric"
                placeholder="0"
                value={saldo}
                onChange={e => setSaldo(e.target.value.replace(/[^\d]/g, ''))}
                style={{ width: '100%', height: 38, paddingLeft: 20 }}
              />
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Lo que ya debía del papel. Dejalo en cero si está al día.
            </span>
          </div>
        </>
      )}
    </Modal>
  );
}
