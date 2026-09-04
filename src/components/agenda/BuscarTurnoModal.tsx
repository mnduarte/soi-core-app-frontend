import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '../common/Modal';
import { Icon } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { patientsApi, type Patient } from '../../api/patients';
import { appointmentsApi, type Appointment } from '../../api/appointments';
import { worksApi } from '../../api/works';
import { fmtMoney, patientAge, relativeDay, relativeSoon } from '../../lib/format';
import { toWhatsAppNumber } from '../../lib/phone';
import { buildMsgVarios } from '../../lib/reminder';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';

/**
 * "¿Cuándo tengo turno?" — la pregunta que llega por teléfono.
 *
 * Hasta ahora había que ir pasando día por día en la agenda hasta encontrarlo,
 * con el paciente esperando en la línea. Esto la contesta en dos toques.
 *
 * Decisiones que valen la pena recordar:
 *
 * - **Solo lectura.** No se agenda desde acá. Un segundo flujo de alta de
 *   turnos terminaría comportándose distinto del de la agenda, y el que menos
 *   se usa es el que se rompe sin que nadie se entere. El botón de agendar no
 *   crea nada: deja el paciente cargado en la fila de anotar y cierra.
 *
 * - **Se muestra el último turno pasado, no solo los próximos.** El motivo más
 *   común de la llamada es creer que se perdió el turno. Sin ese dato, un
 *   paciente sin turnos futuros da "no tiene nada" y el doctor no puede
 *   contestar nada; con él, la misma pantalla dice "tu último turno fue el 12
 *   de agosto y no tenés uno nuevo" — que además es una oportunidad de agendar.
 *
 * - **La plata no se muestra sola.** Esto se lee en voz alta con gente en la
 *   sala de espera. Queda detrás de un toque.
 */

interface Props {
  open: boolean;
  /**
   * Reloj de la página. Viene por prop y no se lee acá adentro: leer la hora
   * durante el render hace que el componente devuelva algo distinto en cada
   * pasada. AgendaPage ya lo tiene latiendo cada minuto para el resto de la
   * agenda, así que el "en 5 días" queda sincronizado con lo que se ve al lado.
   */
  now: Date;
  onClose: () => void;
  onVerFicha: (patientId: string) => void;
  /** Deja el paciente puesto en la fila de anotar. NO crea el turno. */
  onAgendar: (p: Patient) => void;
  /** Lleva la agenda al día de ese turno y resalta la fila. */
  onIrAlTurno: (a: Appointment) => void;
}

/** "Jueves 11 de septiembre" — pensado para leerse en voz alta, no para una tabla. */
function fechaLarga(iso: string): string {
  const d = new Date(iso);
  const txt = d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

// 24hs, como el resto de la agenda. Con el default de es-AR salía "12:30 p. m."
// y la libreta muestra "18:30": dos relojes distintos en la misma pantalla.
function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Filas fantasma mientras carga.
 *
 * No es decoración: ocupan el lugar EXACTO de las filas reales, así que el
 * modal abre con su tamaño final y no pega el salto de agrandarse cuando
 * llegan los datos. Animar ese salto habría sido peor —`height` dispara layout
 * en cada frame—; reservando el espacio no hay nada que animar.
 */
function Fantasmas() {
  return (
    <div aria-hidden className="bt-skel">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="bt-skel__row">
          <div className="bt-skel__av" />
          <div className="bt-skel__txt">
            {/* Anchos distintos: todos iguales se leen como una tabla vacía,
                no como nombres que están por llegar. */}
            <div className="bt-skel__l1" style={{ width: `${58 + ((i * 13) % 30)}%` }} />
            <div className="bt-skel__l2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BuscarTurnoModal({
  open,
  now,
  onClose,
  onVerFicha,
  onAgendar,
  onIrAlTurno,
}: Props) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Patient | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const altoPrevio = useRef<number | null>(null);

  /**
   * Cambiar de estado (buscar ⇄ ficha) suavizando el cambio de alto.
   *
   * El contenido ya se funde, pero la CAJA saltaba de un tamaño a otro de
   * golpe: el modal crecía o se encogía en un frame y el salto tapaba el
   * fundido. Se mide antes de cambiar y después de pintar, y se anima entre
   * los dos valores.
   *
   * Sí, esto anima `height`, que en listas está prohibido por disparar layout
   * en cada frame. Acá es UN elemento chico durante 220ms, y la alternativa
   * —dejar el salto— es peor. La regla protege el 60fps de cosas grandes; un
   * modal solo no la necesita.
   */
  const cambiarSel = (p: Patient | null) => {
    const caja = document.querySelector('.modal-card') as HTMLElement | null;
    altoPrevio.current = caja?.getBoundingClientRect().height ?? null;
    setSel(p);
  };

  useLayoutEffect(() => {
    const desde = altoPrevio.current;
    altoPrevio.current = null;
    if (desde == null) return;
    const caja = document.querySelector('.modal-card') as HTMLElement | null;
    if (!caja) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const hasta = caja.getBoundingClientRect().height;
    // Diferencias mínimas no se animan: sería movimiento sin motivo.
    if (Math.abs(hasta - desde) < 6) return;
    caja.animate(
      [{ height: `${desde}px` }, { height: `${hasta}px` }],
      { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
  }, [sel]);

  /**
   * El modal se encoge y viaja hasta el campo donde va a caer el nombre.
   *
   * Mismo principio que el FLIP: se miden las dos posiciones y se anima el
   * `transform` entre ellas —nunca `width`/`top`, que dispararían layout en
   * cada frame—. El blanco se encuentra por `data-quick-add-patient`, el
   * atributo que la fila de anotar ya tenía.
   *
   * Si el campo no está a la vista (otra vista de agenda, mobile) o el usuario
   * pidió menos movimiento, no hay vuelo: se cierra y listo. La acción nunca
   * depende de que la animación pueda correr.
   */
  const volarHacia = (selector: string, alTerminar: () => void) => {
    const card = cardRef.current?.closest('.modal-card') as HTMLElement | null;
    const destino = document.querySelector(selector);
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!card || !destino || quieto) return alTerminar();

    const a = card.getBoundingClientRect();
    const b = destino.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);

    const overlay = card.parentElement as HTMLElement | null;

    // Tres cosas se apagan ANTES de animar, y cada una costaba frames:
    //
    //  - `backdrop-filter: blur(4px)` del fondo: mientras se desvanece, el
    //    navegador recalcula el desenfoque de toda la página en cada frame. Es
    //    con diferencia el más caro. Se corta y queda el color plano, que a
    //    esta velocidad no se nota.
    //  - La sombra grande de la tarjeta: se vuelve a rasterizar en cada paso
    //    de escala.
    //  - `will-change` promueve la tarjeta a su propia capa, así el compositor
    //    la mueve sin repintar.
    if (overlay) overlay.style.backdropFilter = 'none';
    card.style.boxShadow = 'none';
    card.style.willChange = 'transform, opacity';

    overlay?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 240,
      easing: 'ease-out',
      fill: 'forwards',
    });
    card
      .animate(
        [
          { transform: 'none', opacity: 1, offset: 0 },
          // Se mantiene VISIBLE casi todo el recorrido y recién se apaga sobre
          // el final. Un intento anterior la desvanecía al 45% para disimular
          // el achatamiento, pero eso ocultaba justo el tramo que dice hacia
          // dónde va: se veía encogerse en el centro y nada más. La
          // deformación fuerte pasa en el último tramo, y ahí sí conviene que
          // ya esté casi apagada.
          { opacity: 0.92, offset: 0.6 },
          {
            // Escala ÚNICA y tope en 1. Con un eje por lado, un destino más
            // ancho que el modal —una fila de la agenda— lo estiraba a lo
            // ancho mientras lo aplastaba a lo alto: se leía como que se
            // expandía. Una sola escala encoge parejo hacia el destino.
            transform: `translate(${dx}px, ${dy}px) scale(${Math.min(b.width / a.width, b.height / a.height, 1)})`,
            opacity: 0,
            offset: 1,
          },
        ],
        { duration: 240, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
      )
      .finished.then(alTerminar, alTerminar);
  };

  /**
   * Volver al listado dejando lo buscado, pero SELECCIONADO.
   *
   * Las dos opciones obvias fallan cada una en un caso: borrarlo obliga a
   * reescribir "Acosta" cuando el doctor se equivocó de Acosta y quiere el de
   * al lado; dejarlo tal cual obliga a borrarlo a mano cuando lo que quiere es
   * buscar a otra persona.
   *
   * Con el texto seleccionado no hay que elegir de antemano: si quiere otro de
   * la misma lista ya la tiene abajo y hace click; si quiere buscar otra cosa,
   * escribe y lo tipeado reemplaza la selección. Es lo que hace la barra de
   * direcciones del navegador.
   */
  const volver = () => {
    cambiarSel(null);
    // En el siguiente frame: mientras hay un paciente elegido el input no está
    // montado, así que la ref todavía no apunta a nada.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  // Solo se enfoca el campo. El estado NO se resetea acá: AgendaPage monta este
  // componente recién al abrirlo, así que cada consulta arranca limpia por
  // construcción. Resetear en un efecto además dispararía un render en cascada.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  // Se busca desde 2 caracteres: con uno solo vuelve medio padrón y no ayuda.
  const busca = q.trim().length >= 2;
  const { data: pacientes = [], isFetching } = useQuery({
    queryKey: ['patients', q.trim()],
    queryFn: () => patientsApi.findAll(q.trim()),
    enabled: open && busca && !sel,
    staleTime: 30_000,
  });

  // Sin nada escrito, la lista NO es alfabética: sería siempre la misma gente
  // (los apellidos con A) y no ayuda a nadie. Se muestra quién tiene turno
  // próximo, que es casi con seguridad quien está llamando — la pregunta que
  // contesta esta pantalla es justamente "¿cuándo tengo turno?".
  //
  // Descartado mostrarlos al azar: una lista que cambia cada vez que se abre no
  // se puede aprender, y obliga a leerla entera siempre.
  //
  // Sale del padrón, que YA está en memoria: la agenda lo pide con esta misma
  // queryKey, así que react-query lo comparte y abrir el buscador no dispara
  // ninguna consulta. Antes esto pedía 21 días de turnos aparte, y era lo que
  // hacía que la primera apertura se sintiera trabada (la segunda ya iba con
  // caché). El `nextVisitAt` lo calcula el backend en el mismo $group que ya
  // recorría los turnos, así que tampoco costó nada allá.
  const { data: padron = [], isLoading: cargandoPadron } = useQuery({
    queryKey: ['patients', 'all'],
    queryFn: () => patientsApi.findAll(),
    enabled: open,
    // Se revalida en CADA apertura. No cuesta espera: react-query pinta lo que
    // tiene en caché al instante y refresca por detrás (la agenda ya mantiene
    // esta misma query viva). Con los 5 minutos que había antes, agendar un
    // turno y abrir el buscador enseguida mostraba la lista vieja —y esto es
    // una herramienta de consulta: servir algo de hace cinco minutos mientras
    // alguien espera en el teléfono es peor que tardar 200ms más.
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const sugeridos = useMemo(
    () =>
      padron
        .filter(p => !!p.nextVisitAt)
        .sort(
          (a, b) =>
            new Date(a.nextVisitAt!).getTime() - new Date(b.nextVisitAt!).getTime(),
        )
        .slice(0, 8)
        .map(p => ({
          p,
          cuando: `${relativeSoon(p.nextVisitAt, now)} · ${hora(p.nextVisitAt!)}`,
        })),
    [padron, now],
  );

  const { data: turnos = [], isLoading: cargandoTurnos } = useQuery({
    queryKey: ['appointments', 'paciente', sel?._id],
    queryFn: () => appointmentsApi.findAll({ patientId: sel!._id }),
    enabled: !!sel,
  });

  const { data: pendientes = [] } = useQuery({
    queryKey: ['works', sel?._id, 'pending'],
    queryFn: () => worksApi.findAll(sel!._id, { status: 'pending', limit: 4 }),
    enabled: !!sel,
  });

  const { data: resumen } = useQuery({
    queryKey: ['works-summary', sel?._id],
    queryFn: () => worksApi.summary(sel!._id),
    enabled: !!sel,
  });

  // El backend no filtra por futuro/pasado, así que se parte acá. Un paciente
  // tiene decenas de turnos como mucho: no justifica un endpoint nuevo.
  const { proximos, ultimo } = useMemo(() => {
    const ahora = now.getTime();
    const inicioDeHoy = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const en = (t: Appointment) => new Date(t.startsAt).getTime();
    const orden = [...turnos].sort((a, b) => en(a) - en(b));
    const futuros = orden.filter(t => en(t) >= ahora);
    const hoyPasados = orden.filter(t => en(t) >= inicioDeHoy && en(t) < ahora);
    const anteriores = orden.filter(t => en(t) < inicioDeHoy);

    // MISMA regla que usa el backend para `nextVisitAt`: si no hay ninguno por
    // venir pero hubo uno hoy, ese sigue contando. Antes esto se calculaba acá
    // con otro criterio (futuro estricto) y las dos vistas se contradecían: la
    // lista decía "hoy · 12:00" y al entrar la ficha decía "no tiene turnos".
    // Una pregunta, una sola regla.
    const proximos = futuros.length
      ? futuros
      : hoyPasados.length
        ? [hoyPasados[hoyPasados.length - 1]]
        : [];

    // "Último" = el anterior a hoy. Si el de hoy ya se muestra arriba, no tiene
    // sentido repetirlo abajo.
    const ultimo = proximos.length
      ? (anteriores[anteriores.length - 1] ?? null)
      : (anteriores[anteriores.length - 1] ?? null);

    return { proximos, ultimo };
  }, [turnos, now]);

  /**
   * Ir a un turno en la agenda.
   *
   * El orden importa: primero se cambia el día —con el modal todavía abierto—
   * y recién después se vuela. Así la fila destino ya existe en el DOM y se
   * puede medir. Volando antes, no había a dónde ir y había que apuntarle a la
   * hoja entera, que es más ancha que el modal y lo hacía crecer.
   *
   * Los 60ms dan tiempo a que React pinte el día nuevo. Si aun así no aparece
   * la fila, `volarHacia` cierra sin animar: la acción nunca queda a medias.
   */
  const irAlTurno = (a: Appointment) => {
    onIrAlTurno(a);
    setTimeout(() => volarHacia(`[data-flip="${a._id}"]`, onClose), 60);
  };

  const clinicName = useAuthStore(st => st.clinic?.name) ?? 'tu consultorio';
  const showToast = useUIStore(st => st.showToast);

  /**
   * Recordatorio del próximo turno.
   *
   * Se ofrece SIEMPRE la copia, no solo cuando falta el teléfono: muchos
   * pacientes avisan por otro lado (mail, Instagram, o el familiar que llamó),
   * y sin esto había que reescribir el mensaje a mano. El texto sale del mismo
   * `buildMsg` que usa el recordatorio de la agenda: si viviera en dos lados,
   * el paciente recibiría uno u otro según desde dónde se lo mandaron.
   */
  const mensajeRecordatorio = () => {
    if (!sel || proximos.length === 0) return '';
    // Van TODOS los turnos por delante, no solo el primero: mandarle "tu turno
    // es el viernes" a alguien que tiene tres lo deja creyendo que tiene uno y
    // faltando a los otros dos.
    return buildMsgVarios(
      sel.name.split(' ')[0],
      clinicName,
      proximos.map(t => ({
        fecha: fechaLarga(t.startsAt).toLowerCase(),
        hora: hora(t.startsAt),
      })),
    );
  };

  const copiarRecordatorio = async () => {
    try {
      await navigator.clipboard.writeText(mensajeRecordatorio());
      showToast('Mensaje copiado ✓');
    } catch {
      // Falla en contextos sin permiso de portapapeles (http, algunos webviews).
      showToast('No se pudo copiar. Probá seleccionando el texto.', 'error');
    }
  };

  const nombre = sel ? `${sel.name} ${sel.lastName}`.trim() : '';
  // Con el paciente elegido el subtítulo no es adorno: en el padrón hay varios
  // apellidos repetidos (tres "Acosta" seguidos en la lista), así que la edad y
  // la obra social son lo que confirma que es la persona correcta antes de
  // decirle una fecha. Además el encabezado deja de cambiar de alto entre los
  // dos estados del modal.
  const subtitulo = sel
    ? [patientAge(sel) != null ? `${patientAge(sel)} años` : null, sel.obraSocial, sel.phone]
        .filter(Boolean)
        .join(' · ') || 'Sin datos de contacto'
    : 'Escribí el nombre o apellido';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={sel ? nombre : 'Buscar turno de un paciente'}
      sub={subtitulo}
      width={520}
      /* Las acciones van al footer del Modal —la misma franja fija que usan
         NewPatient, RegisterPayment y los demás— y no sueltas al final del
         cuerpo. Ahí quedaban a distinta altura según cuánto contenido tuviera
         el paciente: uno con tres turnos y saldo empujaba los botones bien
         abajo, y uno sin nada los dejaba arriba. El botón que se aprieta cada
         vez tiene que estar siempre en el mismo lugar. */
      footer={
        sel ? (
          <>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => onVerFicha(sel._id)}
            >
              Ver ficha
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => volarHacia('[data-quick-add-patient]', () => onAgendar(sel))}
            >
              Agendar turno
            </button>
          </>
        ) : undefined
      }
    >
      {!sel ? (
        <>
          {/* Misma pieza que el buscador de Pacientes: la clase `.search` ya
              existe y pone el ícono ADENTRO del campo. Antes tenía la lupa
              suelta al costado, que se leía como dos controles distintos en
              vez de uno. Al hacer click en cualquier parte de la caja se
              enfoca el campo. */}
          <label
            className="search"
            style={{ width: '100%', background: '#fff', border: '1px solid var(--border-input)', height: 40 }}
          >
            <Icon name="search" size={14} style={{ color: 'var(--text-tertiary)' }} />
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Nombre o apellido…"
              autoComplete="off"
            />
          </label>

          <div className="bt-list bt-list--in">
            {!busca && (cargandoPadron) && <Fantasmas />}
            {!busca && !cargandoPadron && sugeridos.length > 0 && (
              <span className="bt-lbl">
                Con turno próximo <span className="bt-lbl__n">{sugeridos.length}</span>
              </span>
            )}
            {!busca && !cargandoPadron && sugeridos.length === 0 && (
              <p className="bt-empty">
                <Icon name="calendar" size={20} />
                No hay turnos agendados por ahora.
                <span>Escribí un nombre para buscar a cualquier paciente.</span>
              </p>
            )}
            {!busca &&
              !cargandoPadron &&
              sugeridos.map(({ p, cuando }) => (
                <button
                  key={p._id}
                  type="button"
                  className="bt-item"
                  onClick={() => cambiarSel(p)}
                >
                  <Avatar name={p.name} lastName={p.lastName} id={p._id} size="sm" />
                  <span className="bt-item__txt">
                    <span className="bt-item__name">
                      {p.name} {p.lastName}
                    </span>
                    <span className="bt-item__sub">
                      {[patientAge(p) != null ? `${patientAge(p)}a` : null, p.obraSocial]
                        .filter(Boolean)
                        .join(' · ') || 'Sin datos'}
                    </span>
                  </span>
                  {/* El cuándo va a la derecha y no debajo del nombre: es el
                      dato que se compara entre filas, y alineado en columna se
                      barre de un vistazo. */}
                  <span className="bt-when">
                    <span className="bt-when__rel">{cuando.split(' · ')[0]}</span>
                    <span className="bt-when__h">{cuando.split(' · ')[1]}</span>
                  </span>
                </button>
              ))}
            {busca && isFetching && pacientes.length === 0 && <Fantasmas />}
            {busca && !isFetching && pacientes.length === 0 && (
              <p className="bt-empty">
                <Icon name="search" size={20} />
                Ningún paciente con ese nombre.
                <span>Probá con el apellido, o revisá cómo está escrito.</span>
              </p>
            )}
            {(!busca ? [] : pacientes).map(p => {
              const edad = patientAge(p);
              return (
                <button
                  key={p._id}
                  type="button"
                  className="bt-item"
                  onClick={() => cambiarSel(p)}
                >
                  <Avatar name={p.name} lastName={p.lastName} id={p._id} size="sm" />
                  <span className="bt-item__txt">
                    <span className="bt-item__name">
                      {p.name} {p.lastName}
                    </span>
                    <span className="bt-item__sub">
                      {[edad != null ? `${edad}a` : null, p.obraSocial, p.phone]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="bt-card" ref={cardRef}>
          {/* Con borde y flecha: antes era texto plano con un ícono de
              "deshacer" y no se leía como algo que se puede tocar. */}
          <button type="button" className="bt-back" onClick={volver}>
            <Icon name="chevronLeft" size={13} /> Buscar otro
          </button>

          {cargandoTurnos ? (
            // Del mismo alto que el bloque real, así la tarjeta no da el salto
            // al llegar los datos. Mismo criterio que en la lista de búsqueda.
            <div className="bt-next bt-next--skel" aria-hidden>
              <div className="bt-skel__l1" style={{ width: '22%' }} />
              <div className="bt-skel__l1" style={{ width: '64%', height: 15 }} />
              <div className="bt-skel__l1" style={{ width: '30%' }} />
            </div>
          ) : proximos.length > 0 ? (
            <>
              {/* El próximo turno es LA respuesta: grande y primero. */}
              {/* El bloque grande es además el camino a la agenda: ya viste la
                  respuesta, y el paso siguiente natural es ir a ese día. Va acá
                  y no en el click de la fila de la lista, que tiene que seguir
                  abriendo esta tarjeta. */}
              <button
                type="button"
                className="bt-next bt-next--go"
                title="Ver este turno en la agenda"
                onClick={() => irAlTurno(proximos[0])}
              >
                <span className="bt-next__when">{relativeSoon(proximos[0].startsAt, now)}</span>
                <strong className="bt-next__date">{fechaLarga(proximos[0].startsAt)}</strong>
                <span className="bt-next__time">{hora(proximos[0].startsAt)} hs</span>
                {proximos[0].title && (
                  <span className="bt-next__work">{proximos[0].title}</span>
                )}
                <span className="bt-next__go">Ver en la agenda</span>
              </button>

              {proximos.length > 1 && (
                <div className="bt-more">
                  <span className="bt-more__lbl">Después</span>
                  {/* También llevan a la agenda: son turnos como el de arriba,
                      y que solo el primero fuera tocable no tenía explicación
                      desde el lado de quien lo usa. */}
                  {proximos.slice(1, 3).map((t: Appointment) => (
                    <button
                      key={t._id}
                      type="button"
                      className="bt-more__row bt-more__row--go"
                      title="Ver este turno en la agenda"
                      onClick={() => irAlTurno(t)}
                    >
                      {fechaLarga(t.startsAt)} · {hora(t.startsAt)} hs
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            // Sin turnos futuros el dato útil es el último: casi siempre llaman
            // porque creen que se lo perdieron.
            <div className="bt-none">
              <strong>No tiene turnos agendados</strong>
              {ultimo ? (
                <span>
                  Su último turno fue el {fechaLarga(ultimo.startsAt)} ({relativeDay(ultimo.startsAt)}).
                </span>
              ) : (
                <span>Todavía no vino nunca.</span>
              )}
            </div>
          )}

          {/* Recordarle el turno: es lo que sigue naturalmente después de
              contestarle cuándo viene. */}
          {proximos.length > 0 && (
            <div className="bt-remind">
              <span className="bt-remind__lbl">
                {proximos.length > 1
                  ? `Recordarle los ${proximos.length} turnos`
                  : 'Recordarle el turno'}
              </span>
              {sel.phone ? (
                <button
                  type="button"
                  className="bt-remind__wa"
                  onClick={() =>
                    window.open(
                      `https://wa.me/${toWhatsAppNumber(sel.phone)}?text=${encodeURIComponent(mensajeRecordatorio())}`,
                      '_blank',
                    )
                  }
                >
                  <Icon name="whatsapp" size={14} /> Recordar por WhatsApp
                </button>
              ) : (
                <span className="bt-remind__no">Sin teléfono cargado</span>
              )}
              <button type="button" className="bt-remind__copy" onClick={copiarRecordatorio}>
                <Icon name="clipboard" size={13} /> Copiar mensaje
              </button>
            </div>
          )}

          {/* Si tiene turno próximo, el último pasado va discreto abajo. */}
          {proximos.length > 0 && ultimo && (
            <span className="bt-last">Último: {fechaLarga(ultimo.startsAt)}</span>
          )}

          {pendientes.length > 0 && (
            <div className="bt-pend">
              <span className="bt-pend__lbl">
                Pendiente{pendientes.length > 1 ? 's' : ''}
              </span>
              {pendientes.slice(0, 3).map(w => (
                <span key={w._id} className="bt-pend__row">
                  {w.toothNumber ? `${w.toothNumber} · ` : ''}
                  {w.description}
                </span>
              ))}
            </div>
          )}

          {!!resumen && resumen.pendienteTotal > 0 && (
            <span className="bt-money">
              Falta cobrar <strong>{fmtMoney(resumen.pendienteTotal)}</strong>
            </span>
          )}
        </div>
      )}
    </Modal>
  );
}
