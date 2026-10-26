import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appointmentsApi, type IntencionAgenda } from '../../api/appointments';
import { patientsApi } from '../../api/patients';
import { clinicsApi } from '../../api/clinics';
import { useUIStore } from '../../store/ui.store';
import { useDictado } from '../../hooks/useDictado';
import { useNivelVoz } from '../../hooks/useNivelVoz';
import { Icon } from '../common/Icon';
import { OndaVoz } from '../common/OndaVoz';
import { SelectorHorario } from './SelectorHorario';
import { BuscadorPaciente } from './BuscadorPaciente';
import { DatePicker } from '../common/DatePicker';
import { QUICK_CHIPS } from '../../lib/quickWork';
import { HORARIOS } from './horarios';

/**
 * Anotar un turno diciendo una frase.
 *
 * ── Por qué NO es un formulario ──
 * La primera versión mostraba el resultado como campos con etiquetas. Pero lo
 * que estás confirmando es un TURNO, y un turno ya tiene una forma conocida en
 * esta app: día, hora, paciente. Mostrarlo como se va a ver en la libreta deja
 * comparar de un vistazo contra lo que dijiste; un formulario obliga a leer
 * etiqueta por etiqueta para reconstruir lo mismo.
 *
 * Por eso la fecha y la hora acá NO parecen campos: se leen como el turno, y
 * son editables igual —hay un input nativo transparente encima de cada una—.
 * Tocás el día y se abre el calendario del sistema. Sin modo edición, sin
 * botón de lápiz, sin que parezca un trámite.
 *
 * ── El micrófono ──
 * En celular se mantiene apretado y se suelta, como un audio de WhatsApp. En
 * escritorio se toca para arrancar y para parar, porque sostener el mouse
 * veinte segundos no es un gesto que exista. Y si te quedás callado dos
 * segundos, interpreta solo: el final de una frase dicha es un silencio, no un
 * botón.
 */

interface Props {
  /**
   * Por qué puerta entraste.
   *
   * NO cambia el mecanismo: lo que decís sigue decidiendo si termina agendando
   * o buscando. Cambia el ejemplo que se te sugiere y el color de la escucha,
   * que es lo que te ubica — entrar desde "Buscar turno" y que el ejemplo te
   * hable de agendar desorienta.
   */
  modo?: 'anotar' | 'buscar';
  onClose: () => void;
  onCreado?: (fechaISO: string) => void;
  /**
   * Abre el buscador de turnos con ese nombre ya puesto.
   *
   * "cuándo viene Federico" es una pregunta, no un turno. En vez de cortar el
   * camino diciéndote que abras el buscador, la frase termina allá con la
   * búsqueda hecha: se reutiliza la pantalla que ya sabe mostrar turnos, en
   * lugar de rehacerla adentro de ésta.
   */
  onBuscar?: (nombre?: string, patientId?: string) => void;
}

/**
 * Silencio que cierra la frase.
 *
 * Los dos errores NO cuestan lo mismo, y eso define el número. Si corta antes
 * de que termines, perdés la frase entera y hay que volver a dictarla. Si
 * espera de más, perdés un segundo. La asimetría favorece esperar, así que el
 * valor se elige por el lado largo.
 *
 * (Estuvo en 1,5s un rato, elegido para que la espera total se sintiera
 * corta. Fue optimizar lo que no dolía: la espera molesta es tener que repetir
 * la frase, no un segundo de más.)
 *
 * En celular casi no se usa: soltar el botón envía al instante.
 */
const SILENCIO_MS = 2500;
/**
 * Agendar espera un poco más que preguntar.
 *
 * No es la misma frase. Para buscar ya sabés a quién buscás y lo decís de
 * corrido; para agendar hay que acordarse del nombre del paciente, y esa pausa
 * en el medio cortaba la frase al mandar a los 2,5s. Tres segundos y medio es
 * lo que dura pensar un apellido sin que la espera se note.
 */
const SILENCIO_ANOTAR_MS = 3500;

/** Hoy en el huso del consultorio, como YYYY-MM-DD. */
const hoyISO = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

const SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "Lunes 19 de octubre". Sin año: el turno siempre es cerca. */
const diaLargo = (iso: string) => {
  if (!iso) return 'Falta el día';
  const d = new Date(`${iso}T12:00:00-03:00`);
  if (Number.isNaN(d.getTime())) return 'Falta el día';
  // Mayúscula solo en la primera letra: con `text-transform: capitalize` el
  // CSS la pone en cada palabra y salía "Lunes 19 De Octubre".
  const t = `${SEM[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  return t[0].toUpperCase() + t.slice(1);
};

export function AgendarDictandoModal({
  modo = 'anotar',
  onClose,
  onCreado,
  onBuscar,
}: Props) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const dic = useDictado();

  const [tipeado, setTipeado] = useState<string | null>(null);
  const dictado = [dic.texto, dic.parcial].filter(Boolean).join(' ').trim();
  // Derivado, no sincronizado con un efecto: un setState adentro de un efecto
  // encadena renders y es error de lint en este proyecto.
  const texto = tipeado ?? dictado;

  const [intencion, setIntencion] = useState<IntencionAgenda | null>(null);
  const [paciente, setPaciente] = useState<{ id: string; nombre: string } | null>(null);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [trabajo, setTrabajo] = useState('');
  const [duracion, setDuracion] = useState<number | null>(null);
  const [sobreturno, setSobreturno] = useState(false);
  const [horaAbierta, setHoraAbierta] = useState(false);
  const [trabAbierto, setTrabAbierto] = useState(false);
  const [editando, setEditando] = useState<'fecha' | null>(null);
  const [cambiandoPac, setCambiandoPac] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /* El nivel se escribe acá y no en el botón: las variables CSS bajan a
     todos los hijos, así la onda y el micrófono leen el mismo número. */
  const decirRef = useRef<HTMLDivElement>(null);

  /**
   * Resuelto el paciente, el día queda señalado.
   *
   * Antes esto abría el calendario solo. Con el `DatePicker` del proyecto no
   * se puede —no expone forma de abrirlo desde afuera— y no vale modificar un
   * componente compartido por esto: el control está ahí, dice "¿Qué día?" y se
   * pinta en rojo cuando falta. Se ve sin que nadie lo abra.
   */
  const elegirPaciente = (p: { id: string; nombre: string }) => setPaciente(p);

  const { data: settings } = useQuery({
    queryKey: ['clinic-settings'],
    queryFn: clinicsApi.getSettings,
  });
  const dura = duracion ?? settings?.appointmentDurationDefault ?? 30;
  const slots = settings?.slotTimes?.length ? settings.slotTimes : HORARIOS;
  const trabajos = settings?.quickTreatments?.length ? settings.quickTreatments : QUICK_CHIPS;

  /**
   * Horarios ya ocupados del día elegido, para marcarlos en el selector.
   *
   * Se piden recién cuando hay fecha: antes de interpretar la frase no se sabe
   * de qué día estamos hablando, y traer la agenda de hoy "por las dudas" sería
   * una request que casi siempre se tira.
   */
  const { data: delDia = [] } = useQuery({
    queryKey: ['appointments', fecha],
    queryFn: () =>
      appointmentsApi.findAll({
        // El día ENTERO y en -03:00. Mandar "YYYY-MM-DD" pelado no sirve: el
        // backend hace `new Date(from)`, que lo lee como medianoche UTC, y
        // pedía desde medianoche hasta medianoche — una ventana vacía. Por eso
        // no detectaba ningún sobreturno.
        from: new Date(`${fecha}T00:00:00-03:00`).toISOString(),
        to: new Date(`${fecha}T23:59:59.999-03:00`).toISOString(),
      }),
    enabled: !!fecha,
  });
  // Se avisa apenas se entiende la frase y no recién al apretar "Anotar":
  // enterarte del choque después de confirmar es enterarte tarde. El 409 del
  // servidor sigue siendo el que manda —entre que mirás y confirmás puede
  // entrar otro turno—, esto es el aviso temprano.
  const ocupados = new Set(
    delDia
      .filter(a => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW')
      // En -03:00 y no en la hora local del navegador: si la máquina está en
      // otro huso, "16:30" se compararía contra otra cosa.
      .map(a =>
        new Date(a.startsAt)
          .toLocaleTimeString('es-AR', {
            hour: '2-digit', minute: '2-digit', hour12: false,
            timeZone: 'America/Argentina/Buenos_Aires',
          }),
      ),
  );

  const interpretar = useMutation({
    mutationFn: (t: string) => appointmentsApi.interpretar(t),
    onSuccess: i => {
      /*
       * Entraste a preguntar y la pregunta se entendió: no hay nada que
       * confirmar, así que pasa derecho al buscador con el paciente puesto.
       * Buscar es leer —si se equivocó, volvés— y pedir un click de más
       * cobraría una confirmación que no protege de nada. Agendar sí se
       * confirma siempre: ahí un error escribe.
       */
      const aQuien = i.patientNombre ?? i.nombreDicho;
      // Solo se traspasa si SABEMOS a quién. Sin nombre, el buscador abre con
      // el campo vacío y muestra la lista general de turnos próximos: parece
      // que ignoró lo que dijiste. Mejor quedarse acá y preguntar quién.
      if (modo === 'buscar' && i.accion === 'buscar' && onBuscar && aQuien) {
        onClose();
        onBuscar(aQuien, i.patientId ?? undefined);
        return;
      }
      setIntencion(i);
      // El nombre sale del paciente REAL, no de lo que se escuchó. Antes se
      // mostraba `nombreDicho`: con "Nicolás aguirra" la tarjeta decía
      // "Nicolás Aguirra" aunque por dentro tuviera el id de Nicolás Aguirre.
      // Parecía que había acertado y mostraba un nombre que no existe.
      setPaciente(
        i.patientId ? { id: i.patientId, nombre: i.patientNombre ?? 'Paciente' } : null,
      );
      setFecha(i.fecha ?? '');
      setHora(i.hora ?? '');
      setTrabajo(i.trabajo ?? '');
      setDuracion(i.duracionMin);
      setSobreturno(false);
      setEditando(null);
      setCambiandoPac(false);
    },
  });

  // El buscador de paciente hace su propia búsqueda: acá no hace falta
  // adivinar parecidos por adelantado.

  const enviarRef = useRef<() => void>(() => {});
  const enviar = () => {
    // Si está grabando, `parar` devuelve el texto ya consolidado: el estado
    // todavía no se re-renderizó.
    const t = (dic.estado === 'grabando' ? dic.parar() : texto).trim();
    if (t.length >= 2 && !interpretar.isPending) interpretar.mutate(t);
  };
  useEffect(() => {
    enviarRef.current = enviar;
  });

  // Dos segundos sin que cambie lo transcripto = terminaste de hablar. El
  // disparo va dentro del timeout, así que no es un setState sincrónico en el
  // cuerpo del efecto.
  useEffect(() => {
    if (dic.estado !== 'grabando' || !dictado) return;
    const t = setTimeout(
      () => enviarRef.current(),
      modo === 'buscar' ? SILENCIO_MS : SILENCIO_ANOTAR_MS,
    );
    return () => clearTimeout(t);
  }, [dictado, dic.estado, modo]);

  /**
   * Abre escuchando.
   *
   * El botón de la barra ya fue el gesto de "quiero dictar": pedir un segundo
   * toque adentro anula la ventaja de velocidad, que es todo el punto. Va en
   * un timeout corto —no en el cuerpo del efecto— para que la hoja alcance a
   * pintarse antes de que el navegador tape todo con el permiso del micrófono,
   * y porque un setState sincrónico adentro de un efecto es error de lint acá.
   */
  useEffect(() => {
    if (!dic.soportado || dic.bloqueado) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => dic.empezar(), 150);
    return () => clearTimeout(t);
    // Solo al montar: `dic` cambia en cada render del hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const crearPaciente = useMutation({
    mutationFn: (nombre: string) => patientsApi.quickCreate(nombre),
    onSuccess: p => {
      elegirPaciente({ id: p._id, nombre: `${p.name} ${p.lastName}`.trim() });
      qc.invalidateQueries({ queryKey: ['patients'] });
    },
    onError: () => showToast('No se pudo crear el paciente', 'error'),
  });

  const agendar = useMutation({
    mutationFn: () => {
      const inicio = new Date(`${fecha}T${hora}:00-03:00`);
      return appointmentsApi.create({
        patientId: paciente!.id,
        startsAt: inicio.toISOString(),
        endsAt: new Date(inicio.getTime() + dura * 60_000).toISOString(),
        title: trabajo.trim() || undefined,
        allowOverlap: choca || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['patients'] });
      showToast('Turno anotado');
      onCreado?.(fecha);
      onClose();
    },
    onError: (e: { response?: { status?: number } }) => {
      // Horario ocupado no es un fallo: es una decisión de la persona.
      if (e?.response?.status === 409) setSobreturno(true);
      else showToast('No se pudo anotar el turno', 'error');
    },
  });

  /** Volver a decirlo ES volver a decirlo: arranca grabando sin pedir otro
   *  toque. Si el navegador no deja dictar, deja el foco en el campo. */
  const volver = () => {
    setIntencion(null);
    dic.descartar();
    setTipeado(null);
    setTimeout(() => {
      if (dic.soportado && !dic.bloqueado) dic.empezar();
      else inputRef.current?.focus();
    }, 60);
  };

  /**
   * Tocar afuera cierra lo que esté abierto, y vuelve la fecha a texto.
   *
   * No alcanza con un `onBlur` en el contenedor: el calendario del
   * `DatePicker` se monta por portal, o sea que en el DOM NO está adentro del
   * control. Un blur lo cerraría justo antes de que el click en un día llegue
   * a registrarse. Por eso se mira el click a nivel documento y se exceptúa
   * explícitamente el portal (`.datepicker-pop`).
   */
  useEffect(() => {
    if (!editando && !horaAbierta && !trabAbierto) return;
    const afuera = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.ag-fecha') || t.closest('.datepicker-pop')) return;
      if (t.closest('.ag-horawrap') || t.closest('.ag-trabwrap')) return;
      setEditando(null);
      setHoraAbierta(false);
      setTrabAbierto(false);
    };
    document.addEventListener('mousedown', afuera);
    return () => document.removeEventListener('mousedown', afuera);
  }, [editando, horaAbierta, trabAbierto]);

  /**
   * Qué falta para poder anotar.
   *
   * Va pegado al botón y no solo marcado en el campo: un botón apagado sin
   * decir por qué se lee como roto. Es la misma lección de la pantalla de
   * firma —ahí el candado de "leé hasta el final" parecía una falla hasta que
   * se puso el motivo al lado del botón—.
   */
  const faltan = [
    !paciente && 'el paciente',
    !fecha && 'el día',
    !hora && 'la hora',
  ].filter(Boolean) as string[];
  const queFalta =
    faltan.length === 0
      ? null
      : faltan.length === 1
        ? `Falta ${faltan[0]}`
        : `Faltan ${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}`;

  /**
   * La respuesta a una pregunta sobre el día.
   *
   * "próximo" mira desde ahora hacia adelante —hasta dos semanas, para que la
   * consulta tenga techo—; "primero" y "último" miran un día concreto. Los
   * cancelados y los ausentes no cuentan: preguntar quién sigue es preguntar a
   * quién vas a atender.
   */
  const preguntaAgenda = intencion?.accion === 'agenda';
  const diaPregunta = intencion?.fecha ?? hoyISO();
  const { data: turnosPregunta = [], isPending: buscandoTurnos } = useQuery({
    queryKey: ['appointments', 'pregunta', intencion?.cual, diaPregunta],
    queryFn: () => {
      const desde =
        intencion?.cual === 'proximo'
          ? new Date()
          : new Date(`${diaPregunta}T00:00:00-03:00`);
      const hasta =
        intencion?.cual === 'proximo'
          ? new Date(Date.now() + 14 * 864e5)
          : new Date(`${diaPregunta}T23:59:59.999-03:00`);
      return appointmentsApi.findAll({
        from: desde.toISOString(),
        to: hasta.toISOString(),
      });
    },
    enabled: preguntaAgenda,
  });
  const { data: padron = [] } = useQuery({
    queryKey: ['patients', ''],
    queryFn: () => patientsApi.findAll(),
    enabled: preguntaAgenda,
  });

  const utiles = turnosPregunta.filter(
    a => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW',
  );
  const turnoResp =
    intencion?.cual === 'ultimo' ? utiles[utiles.length - 1] : utiles[0];
  const nombreDe = (a?: typeof turnoResp) => {
    if (!a) return '';
    if (a.patientId) {
      const p = padron.find(x => x._id === a.patientId);
      if (p) return `${p.name} ${p.lastName}`.trim();
    }
    return a.patientName ?? 'Sin nombre';
  };

  /**
   * Encontrado el turno, se pasa a la ficha del paciente.
   *
   * Diferido: llamar a `onClose`/`onBuscar` —que son setState del padre— en el
   * cuerpo del efecto encadena renders y es error de lint en este proyecto.
   */
  useEffect(() => {
    if (!preguntaAgenda || !turnoResp || !onBuscar) return;
    const nombre = nombreDe(turnoResp);
    const t = setTimeout(() => {
      onClose();
      onBuscar(nombre, turnoResp.patientId ?? undefined);
    }, 0);
    return () => clearTimeout(t);
    // `nombreDe` depende del padrón, que ya está en las dependencias por
    // `turnoResp`; agregarlo haría re-correr el efecto en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preguntaAgenda, turnoResp, onBuscar, onClose]);

  /** Choca con otro turno: lo vemos en la agenda del día, o lo dijo el 409. */
  const choca = sobreturno || (!!hora && ocupados.has(hora));

  const grabando = dic.estado === 'grabando';
  const puedeDictar = dic.soportado && !dic.bloqueado;
  useNivelVoz(grabando, decirRef);

  /**
   * En táctil: mantener y soltar. Con mouse: tocar y volver a tocar.
   * Sostener el botón del mouse veinte segundos no es un gesto que exista, y
   * en el celular soltar para enviar ya es un gesto que todos tienen aprendido.
   */
  // El `click` sintético llega DESPUÉS del `pointerup` en táctil. Sin esta
  // marca, soltar el dedo enviaba y acto seguido el click volvía a arrancar
  // el dictado.
  const fueTactil = useRef(false);
  const alApretar = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    fueTactil.current = true;
    setTipeado(null);
    dic.empezar();
  };
  const alSoltar = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    if (grabando) enviar();
  };
  const alClickear = (e: React.MouseEvent) => {
    if (fueTactil.current) { fueTactil.current = false; return; }
    if ((e.nativeEvent as PointerEvent).pointerType === 'touch') return;
    if (grabando) return enviar();
    // Con texto escrito el botón ya no arranca el dictado: interpreta lo que
    // hay. Arrancar de nuevo borraría lo que acabás de escribir.
    if (texto.trim().length >= 2) return enviar();
    setTipeado(null);
    dic.empezar();
  };

  const seg = `${Math.floor(dic.segundos / 60)}:${String(dic.segundos % 60).padStart(2, '0')}`;

  return (
    <div
      className="ag-ov"
      onClick={onClose}
      role="presentation"
    >
      <div className={`ag-sheet ag-sheet--${modo}`} onClick={e => e.stopPropagation()}>
        <button className="ag-x" title="Cerrar" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>

        {/* Por qué puerta entraste. Distinguible sin ser otro diseño: las dos
            hojas son la misma, y lo que cambia es qué se espera que digas. */}
        <div className={`ag-modo ag-modo--${modo}`}>
          <Icon name={modo === 'buscar' ? 'search' : 'plus'} size={13} />
          {modo === 'buscar' ? 'Preguntar' : 'Anotar un turno'}
        </div>

        {/* ──────────── Decir la frase ──────────── */}
        {!intencion && (
          <div className="ag-decir" ref={decirRef}>
            {/*
              UNA sola superficie para la frase.

              Antes eran dos —el panel grande y un campo abajo— y las dos
              mostraban lo mismo: lo dictado aparecía duplicado, una vez
              entero y otra cortado. No era un error de estado, era tener dos
              lugares para una sola cosa.

              Ahora el panel ES el campo. Mientras dicta es de solo lectura
              (lo escribe tu voz); al parar se puede corregir a mano. El
              parcial —lo que todavía está interpretando— va encima en gris,
              porque un textarea no puede pintar la mitad de su contenido.
            */}
            <div className={`ag-campo${grabando ? ' is-on' : ''}`}>
              <textarea
                ref={inputRef}
                className="ag-texto"
                value={texto}
                readOnly={grabando}
                placeholder={
                  grabando
                    ? ''
                    : modo === 'buscar'
                      ? 'Decí o escribí: ¿cuándo viene Federico?'
                      : 'Decí o escribí: agendame a Marcela el martes a las 3 de la tarde'
                }
                onChange={e => setTipeado(e.target.value)}
                onKeyDown={e => {
                  // Enter envía; Shift+Enter deja saltar de renglón por si
                  // alguien dicta dos cosas y quiere separarlas.
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
                }}
              />
              {grabando && dic.parcial && <span className="ag-parcial">{dic.parcial}</span>}
              {grabando && !texto && <span className="ag-parcial">Te escucho…</span>}
            </div>

            {/* La onda vive FUERA del campo: adentro empujaría el texto hacia
                arriba a medida que se llena, y el renglón que estás leyendo se
                movería mientras hablás. */}
            <OndaVoz activa={grabando} />

            <div className="ag-bar">
              {puedeDictar ? (
                <button
                  type="button"
                  className={`ag-mic${grabando ? ' is-on' : ''}`}
                  title={grabando ? 'Listo' : texto.trim() ? 'Interpretar' : 'Mantené apretado para dictar'}
                  aria-label={grabando ? 'Terminar de dictar' : 'Dictar'}
                  disabled={interpretar.isPending}
                  onPointerDown={alApretar}
                  onPointerUp={alSoltar}
                  onPointerLeave={alSoltar}
                  onClick={alClickear}
                >
                  {/* El ícono dice qué va a pasar: micrófono = voy a hablar,
                      tilde = ya está, interpretalo. */}
                  <Icon name={grabando || texto.trim().length >= 2 ? 'check' : 'mic'} size={22} />
                </button>
              ) : (
                <button
                  type="button"
                  className="ag-mic"
                  title="Interpretar"
                  disabled={texto.trim().length < 2 || interpretar.isPending}
                  onClick={enviar}
                >
                  <Icon name="check" size={22} />
                </button>
              )}
            </div>

            {/* Esqueleto con la FORMA del turno que viene. Además de llenar la
                espera, reserva el espacio: cuando llega el resultado no salta
                nada porque el hueco ya estaba. */}
            {interpretar.isPending && (
              <div className="ag-esq" aria-hidden="true">
                <div className="ag-esq__fila">
                  <span style={{ width: '46%' }} />
                  <span style={{ width: '18%' }} />
                  <span style={{ width: '14%' }} />
                </div>
                <div className="ag-esq__sep" />
                <span style={{ width: '58%', height: 18 }} />
                <span style={{ width: '26%' }} />
              </div>
            )}

            <div className="ag-pie">
              {interpretar.isPending ? (
                <span className="ag-pensando">Armando el turno…</span>
              ) : interpretar.isError ? (
                <span className="ag-mal">No se pudo interpretar. Probá de nuevo o anotalo a mano.</span>
              ) : dic.error ? (
                <span className="ag-mal">{dic.error}</span>
              ) : grabando ? (
                <span className="ag-seg">{seg} · soltá cuando termines</span>
              ) : puedeDictar ? (
                <span>Mantené apretado el micrófono para hablar</span>
              ) : (
                <span>Este navegador no deja dictar. Escribí la frase.</span>
              )}
            </div>
          </div>
        )}

        {/* ──────────── El turno, como se va a ver ──────────── */}
        {intencion?.accion === 'agendar' && (
          <div className="ag-res">
            <p className="ag-dicho">«{texto}»</p>

            <div className="ag-turno">
              {/* Día y hora: se leen, pero tienen un input nativo transparente
                  encima. Tocar abre el calendario o el reloj del sistema. */}
              {/*
                En reposo se LEE como un turno; al tocar, se convierte en el
                control de la agenda.

                Las dos cosas importaban y parecían excluyentes: el formato
                grande ("Lunes 19 de octubre · 15:00") se compara de un vistazo
                contra lo que dijiste, y un control de formulario no. Pero
                editar tiene que usar el calendario del proyecto, no el del
                navegador en inglés. Entonces: el texto es el estado de reposo,
                y al tocarlo aparece el control YA ABIERTO —si pidiera un
                segundo toque para desplegarse sería repetir el mismo gesto—.
              */}
              <div className="ag-cuando">
                {editando === 'fecha' ? (
                  /* Vuelve a texto al elegir, al tocar afuera o con Escape: el
                     control es un modo de edición, no el estado de reposo. */
                  <div className="ag-fecha">
                    <DatePicker
                      value={fecha}
                      abrirAlMontar
                      placeholder="¿Qué día?"
                      onChange={v => { setFecha(v); if (v) setEditando(null); }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`ag-tap ag-dia${fecha ? '' : ' is-falta'}`}
                    onClick={() => { setEditando('fecha'); setHoraAbierta(false); setTrabAbierto(false); }}
                  >
                    {diaLargo(fecha)}
                  </button>
                )}

                <span className="ag-horawrap">
                  {/* La hora y la duración abren el MISMO popover: el de la
                      libreta trae las dos cosas, así que separarlas obligaba a
                      abrir dos veces lo mismo. */}
                  <button
                    type="button"
                    className={`ag-tap ag-hora${hora ? '' : ' is-falta'}`}
                    onClick={() => { setHoraAbierta(v => !v); setEditando(null); setTrabAbierto(false); }}
                  >
                    {hora || 'Falta la hora'}
                  </button>
                  <button
                    type="button"
                    className="ag-dura"
                    onClick={() => { setHoraAbierta(v => !v); setEditando(null); setTrabAbierto(false); }}
                  >
                    {dura} min
                  </button>
                  {horaAbierta && (
                    <SelectorHorario
                      style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40 }}
                      time={hora}
                      duration={dura}
                      slots={slots}
                      taken={ocupados}
                      onDuration={setDuracion}
                      onTime={t => { setHora(t); setHoraAbierta(false); }}
                    />
                  )}
                </span>
              </div>

              <div className="ag-quien">
                <div className="ag-quien__txt">
                {paciente && !cambiandoPac ? (
                  /* Tocar el nombre lo vuelve a abrir: equivocarse de persona
                     es el error más común y no tiene por qué costar volver a
                     dictar la frase entera. */
                  <button
                    type="button"
                    className="ag-tap ag-nombre"
                    onClick={() => setCambiandoPac(true)}
                  >
                    {paciente.nombre}
                  </button>
                ) : paciente && cambiandoPac ? (
                  <BuscadorPaciente
                    inicial={paciente.nombre}
                    creando={crearPaciente.isPending}
                    onCrear={n => crearPaciente.mutate(n)}
                    onElegir={p => {
                      elegirPaciente({ id: p._id, nombre: `${p.name} ${p.lastName}`.trim() });
                      setCambiandoPac(false);
                    }}
                  />
                ) : (
                  <div className="ag-falta">
                    <b>
                      {intencion.nombreDicho
                        ? `No encontré a ${intencion.nombreDicho}`
                        : 'No entendí de quién es el turno'}
                    </b>
                    <BuscadorPaciente
                      inicial={intencion.nombreDicho ?? undefined}
                      creando={crearPaciente.isPending}
                      onCrear={n => crearPaciente.mutate(n)}
                      onElegir={p =>
                        elegirPaciente({ id: p._id, nombre: `${p.name} ${p.lastName}`.trim() })
                      }
                    />
                  </div>
                )}

                {/* Los mismos chips de trabajos frecuentes que la fila de
                    anotar. Escribir "limpieza" entero cuando hay un chip que
                    lo dice es trabajo de más. */}
                <div className="ag-trabwrap">
                  <button
                    type="button"
                    className={`ag-trabajo${trabajo ? ' is-puesto' : ''}`}
                    onClick={() => { setTrabAbierto(v => !v); setEditando(null); setHoraAbierta(false); }}
                  >
                    {trabajo || '+ trabajo'}
                  </button>
                  {trabAbierto && (
                    <div className="lb-menupop ag-trabpop">
                      <input
                        autoFocus
                        className="input"
                        placeholder="¿De qué es el turno?"
                        value={trabajo}
                        onChange={e => setTrabajo(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setTrabAbierto(false); }}
                      />
                      <div className="lb-twpanel__chips">
                        {trabajos.map(c => (
                          <button
                            key={c}
                            type="button"
                            className="lb-chip"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { setTrabajo(c); setTrabAbierto(false); }}
                          >
                            {c}
                          </button>
                        ))}
                        {trabajo && (
                          <button
                            type="button"
                            className="lb-chip lb-chip--del"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { setTrabajo(''); setTrabAbierto(false); }}
                          >
                            <Icon name="x" size={11} /> sin trabajo
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                </div>

                {/* A la derecha del paciente, adentro de la tarjeta: el turno y
                    la forma de rehacerlo viven juntos. */}
                <button
                  type="button"
                  className="ag-mic ag-mic--otra"
                  title="Volver a decirlo"
                  aria-label="Volver a decirlo"
                  onClick={volver}
                >
                  <Icon name={puedeDictar ? 'mic' : 'undo'} size={18} />
                </button>
              </div>
            </div>

            {choca && (
              <p className="ag-ojo">
                <Icon name="alert" size={13} /> Ya hay un turno a esa hora. Lo podés apilar
                como sobreturno o cambiar la hora.
              </p>
            )}

            {/*
              El botón redondo queda en el MISMO lugar en los dos estados:
              mientras dictás es el micrófono, y acá es "volver a decirlo".
              Antes estaba arriba junto a la frase y el control saltaba de
              esquina al cambiar de estado — tenías que volver a buscarlo.
            */}
            <div className="ag-acciones">
              {queFalta && <span className="ag-quefalta">{queFalta}</span>}
              <button
                className="ag-ok"
                disabled={!paciente || !fecha || !hora || agendar.isPending}
                onClick={() => agendar.mutate()}
              >
                {agendar.isPending ? 'Anotando…' : choca ? 'Anotar igual' : 'Anotar turno'}
              </button>
            </div>
          </div>
        )}

        {/*
          La pregunta sobre el día NO tiene pantalla propia.

          Antes mostraba acá una tarjeta chica con el turno. Eran dos
          resultados distintos para la misma pregunta —"¿cuándo viene X?" caía
          en la ficha completa y "¿quién sigue?" en una tarjeta mía—, y esa de
          acá no tenía ni WhatsApp ni copiar mensaje, que es justo lo que
          querés cuando sabés quién sigue.

          Ahora, apenas se encuentra el turno, se traspasa a la MISMA ficha.
          Acá solo queda el "mirando" y el caso sin turnos.
        */}
        {intencion?.accion === 'agenda' && (
          <div className="ag-res">
            <p className="ag-dicho">«{texto}»</p>
            {buscandoTurnos || turnoResp ? (
              <p className="ag-nota">Mirando la agenda…</p>
            ) : (
              <>
                <p className="ag-nota">
                  {intencion.cual === 'proximo'
                    ? 'No hay turnos por delante en las próximas dos semanas.'
                    : `No hay turnos el ${diaLargo(diaPregunta).toLowerCase()}.`}
                </p>
                <div className="ag-acciones">
                  <button className="ag-ok" onClick={volver}>Volver a decirlo</button>
                </div>
              </>
            )}
          </div>
        )}

        {intencion?.accion === 'buscar' && (
          <div className="ag-res">
            <p className="ag-dicho">«{texto}»</p>
            {intencion.patientNombre ?? intencion.nombreDicho ? (
              <p className="ag-nota">
                Son los turnos de{' '}
                {intencion.patientNombre ?? intencion.nombreDicho}, no un turno nuevo.
              </p>
            ) : (
              /* Entendió que era una pregunta pero no de quién. En vez de
                 mandarte al buscador vacío —que se lee como si te hubiera
                 ignorado—, se elige acá y recién entonces se traspasa. */
              <div className="ag-falta" style={{ marginTop: 10 }}>
                <b>¿De quién querés ver los turnos?</b>
                {/* El botón de volver a decirlo va ACÁ, al lado del campo.
                    Sin él este estado era una trampa: si te colgaste y no
                    llegaste a decir el nombre, no quedaba forma de volver a
                    intentarlo sin cerrar y empezar de nuevo. En la rama de
                    agendar el redondo ya estaba al costado; faltaba sólo en
                    ésta. */}
                {onBuscar && (
                  <div className="ag-conmic">
                    <BuscadorPaciente
                      sinCrear
                      onElegir={p => {
                        onClose();
                        onBuscar(`${p.name} ${p.lastName}`.trim(), p._id);
                      }}
                    />
                    <button
                      type="button"
                      className="ag-mic ag-mic--otra"
                      title="Volver a decirlo"
                      aria-label="Volver a decirlo"
                      onClick={volver}
                    >
                      <Icon name={puedeDictar ? 'mic' : 'undo'} size={18} />
                    </button>
                  </div>
                )}
              </div>
            )}
            {/*
              El pie va SOLO cuando sabemos de quién.

              Si no, el buscador de arriba ya tiene su propio botón de volver a
              decirlo al lado del campo, y éste quedaba como un segundo
              micrófono suelto: dos controles idénticos en la misma hoja, uno
              sin nada al lado.
            */}
            {(intencion.patientNombre ?? intencion.nombreDicho) && (
              <div className="ag-acciones">
                {onBuscar && (
                  <button
                    className="ag-ok"
                    onClick={() => {
                      onClose();
                      onBuscar(
                        (intencion.patientNombre ?? intencion.nombreDicho)!,
                        intencion.patientId ?? undefined,
                      );
                    }}
                  >
                    Ver sus turnos
                  </button>
                )}
                <button
                  type="button"
                  className="ag-mic ag-mic--otra"
                  title="Volver a decirlo"
                  aria-label="Volver a decirlo"
                  onClick={volver}
                >
                  <Icon name={puedeDictar ? 'mic' : 'undo'} size={18} />
                </button>
              </div>
            )}
          </div>
        )}

        {intencion?.accion === 'nada' && (
          <div className="ag-res">
            <p className="ag-dicho">«{texto}»</p>
            <p className="ag-nota">
              No entendí eso. Por ahora sé <b>anotar turnos</b> y <b>buscar</b> los de un
              paciente — mover o cancelar todavía no.
            </p>
            <div className="ag-acciones">
              <button className="ag-ok" onClick={volver}>Volver a decirlo</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AgendarDictandoModal;
