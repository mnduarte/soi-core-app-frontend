import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { patientsApi, type Patient } from '../api/patients';
import { transactionsApi, type Transaction, type PaymentMethod } from '../api/transactions';
import { worksApi, type Work, type WorkStatus, type CreateWorkInput } from '../api/works';
import { clinicsApi } from '../api/clinics';
import { useUIStore } from '../store/ui.store';
import { useIsMobile } from '../hooks/useIsMobile';
import { Icon } from '../components/common/Icon';
import { VisorFotos, type FotoVisor } from '../components/common/VisorFotos';
import { FichaEsqueleto } from '../components/patient/FichaEsqueleto';
import { Desplegable } from '../components/common/Desplegable';
import { Avatar } from '../components/common/Avatar';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { OdontogramCard } from '../components/patient/OdontogramCard';
import { GalleryContainer } from '../components/gallery/GalleryContainer';
import { CustomTreatmentsModal } from '../components/common/CustomTreatmentsModal';
import { SectionHeader } from '../components/common/SectionHeader';
import { DatePicker } from '../components/common/DatePicker';
import { galleryApi, photoTypeLabel, type GalleryPhoto } from '../api/gallery';
import { fmtMoney, patientAge } from '../lib/format';
import { toWhatsAppNumber } from '../lib/phone';
import { QUICK_CHIPS } from '../lib/quickWork';

// Montos por defecto (5) si el consultorio todavía no personalizó los suyos.
const DEFAULT_QUICK_AMOUNTS = [5000, 10000, 20000, 30000, 50000];

// Un trabajo cuenta como "hecho" (suma a lo realizado) cuando está COMPLETED.
// Cualquier otro estado es "pendiente" (por hacer). El toggle alterna estos dos.
const DONE = 'COMPLETED' as const;
const PENDING = 'PROPOSED' as const;

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoDateOf(t: Transaction): string {
  return t.date ?? t.createdAt;
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}
function methodLabel(m?: string): string {
  return m === 'TRANSFER' ? 'transferencia' : m === 'CARD' ? 'tarjeta' : m === 'OTHER' ? 'otro' : 'efectivo';
}
function num(s: string): number {
  return Number(s.replace(/[^\d]/g, '')) || 0;
}

// Duración de la animación de salida de una fila: antes de borrar o de mover
// un trabajo de lista se espera esto para que alcance a desvanecerse. Tiene que
// coincidir con la animación `rowOut` de index.css.
const ROW_OUT_MS = 120;

// Lo que tarda un desplegable en contraerse (`Desplegable`, 140ms) más un
// margen. Se usa para NO refrescar datos mientras eso pasa: un refetch
// vuelve a dibujar la ficha entera, y esa animación corre en el hilo
// principal, así que se queda sin frames y se ve a los tirones. Los datos
// llegan 160ms más tarde y nadie lo nota; los saltos sí se notan.
const COLAPSO_MS = 160;

// Correlativo para los ids provisorios de las filas optimistas.
let secuenciaTemp = 0;

export default function FichaRapidaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile(760);
  const showToast = useUIStore(s => s.showToast);
  const openModal = useUIStore(s => s.openModal);

  // ---- paciente seleccionado ----
  const { data: patient, isPending: patientPending } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientsApi.findById(id!),
    enabled: Boolean(id),
  });

  // ---- buscador de pacientes ----
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const { data: results = [] } = useQuery({
    queryKey: ['patients', 'ficha-rapida', query],
    queryFn: () => patientsApi.findAll(query.trim() || undefined),
    enabled: searchOpen && !id,
  });
  useEffect(() => {
    if (!searchOpen) return;
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [searchOpen]);

  const pickPatient = (p: Patient) => {
    setSearchOpen(false);
    setQuery('');
    navigate(`/ficha-rapida/${p._id}`);
  };

  // Inline mostramos solo los N más recientes de cada historial; PAGE = tamaño
  // de página de los modales ("Cargar más").
  // Se traen mas de los que se van a ver: la cantidad visible depende del alto
  // disponible en pantalla, asi que conviene tenerlos ya en memoria.
  const HECHOS_FETCH = 25;
  const PAGE = 20;
  /**
   * Cuántos trabajos se muestran en la ficha sin filtrar.
   *
   * La ficha es "qué pasó últimamente y qué falta", no el archivo del paciente:
   * pasados los veinte, seguir escupiendo filas hace scrollear para encontrar
   * algo que se busca mejor por fecha o por nombre. Se traen 40 igual —el doble—
   * para saber si hay más sin pedir otra consulta.
   */
  const INLINE_MAX = 20;

  // ---- datos: trabajos (works) + pagos (transactions) ----
  // Pendientes = plan de tratamiento (pocos, se traen enteros). Hechos recientes
  // = solo los últimos CAP inline; el historial completo se busca/pagina en el
  // modal. Resumen = Σ hechos + contadores para la barra Falta.
  const { data: pendientes = [] } = useQuery({
    queryKey: ['works', id, 'pending'],
    queryFn: () => worksApi.findAll(id!, { status: 'pending' }),
    enabled: Boolean(id),
  });
  // UNA sola lista: sin `status` el backend devuelve todo ordenado por
  // createdAt desc. Antes eran dos consultas y dos secciones (Plan / Hechos), y
  // marcar un trabajo como hecho lo hacía saltar de una a la otra — el salto que
  // el FLIP venía a explicar. Con una lista sola no hay salto que explicar.
  const { data: hechosRecent = [] } = useQuery({
    queryKey: ['works', id, 'done', 'recent'],
    queryFn: () => worksApi.findAll(id!, { status: 'done', limit: HECHOS_FETCH }),
    enabled: Boolean(id),
  });
  const { data: todosLosTrabajos = [], isPending: worksPending } = useQuery({
    queryKey: ['works', id, 'todos'],
    queryFn: () => worksApi.findAll(id!, { limit: 40 }),
    enabled: Boolean(id),
  });
  /**
   * Entre elegir un paciente y ver su ficha hay unas décimas de red. Antes en
   * esas décimas quedaba el buscador vacío en pantalla y después aparecía todo
   * de golpe: se leía como que el toque no había registrado.
   *
   * Se espera al paciente Y a la lista de trabajos y se muestran juntos. Que
   * entre primero el encabezado y después la tabla serían dos movimientos
   * encadenados, que se sienten más lentos que uno solo.
   *
   * `isPending` es "todavía no hay nada", no "está refrescando": una
   * invalidación después de agregar un trabajo conserva los datos y no vuelve
   * a mostrar el esqueleto. Y si el paciente ya está en caché —volver a uno que
   * se miró recién— esto es falso desde el primer frame: no hay parpadeo.
   */
  const cargandoFicha = Boolean(id) && (patientPending || worksPending);

  const { data: summary } = useQuery({
    queryKey: ['works', id, 'summary'],
    queryFn: () => worksApi.summary(id!),
    enabled: Boolean(id),
  });
  const { data: txs = [] } = useQuery({
    queryKey: ['transactions', id],
    queryFn: () => transactionsApi.findAll(id!),
    enabled: Boolean(id),
  });

  // Fotos vinculadas a un pago (Transaction) → thumbnails en la fila del pago.
  const { data: gallerySessions = [] } = useQuery({
    queryKey: ['gallery-sessions', id],
    queryFn: () => galleryApi.listSessions(id!),
    enabled: Boolean(id),
  });
  const photosByTx = useMemo(() => {
    const m = new Map<string, { photo: GalleryPhoto; sessionId: string; title: string; description?: string }[]>();
    for (const s of gallerySessions) {
      for (const p of s.photos) {
        if (!p.transactionId) continue;
        const list = m.get(p.transactionId) ?? [];
        list.push({ photo: p, sessionId: s._id, title: s.title, description: s.notes });
        m.set(p.transactionId, list);
      }
    }
    return m;
  }, [gallerySessions]);

  // Fotos vinculadas a un trabajo (item del plan). Vínculo clínico preferido.
  const photosByItem = useMemo(() => {
    const m = new Map<string, { photo: GalleryPhoto; sessionId: string; title: string; description?: string }[]>();
    for (const s of gallerySessions) {
      for (const p of s.photos) {
        if (!p.treatmentItemId) continue;
        const list = m.get(p.treatmentItemId) ?? [];
        list.push({ photo: p, sessionId: s._id, title: s.title, description: s.notes });
        m.set(p.treatmentItemId, list);
      }
    }
    return m;
  }, [gallerySessions]);

  const pagos = useMemo(
    () =>
      txs
        .filter(t => t.type === 'PAYMENT' && !t.voidedAt)
        // Fecha del movimiento descendente y, ante EMPATE, por hora de carga.
        // Todos los pagos de un día se guardan con la misma hora (mediodía), así
        // que sin el desempate quedaban en orden azaroso y encima se
        // reacomodaban al editar cualquier cosa. Con `createdAt` el orden es
        // estable: el último que cargó queda arriba y no se mueve más.
        .sort(
          (a, b) =>
            isoDateOf(b).localeCompare(isoDateOf(a)) ||
            (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
        ),
    [txs],
  );

  // Totales de la barra Falta salen del resumen agregado (no de listas enteras,
  // que ya no traemos). Falta = Σ(hechos) − Σ(pagos).
  const realizado = summary?.realizado ?? 0;
  const hechosCount = summary?.hechosCount ?? hechosRecent.length;
  const pagado = pagos.reduce((s, t) => s + t.amount, 0);
  const falta = realizado - pagado;
  const hasWorks = pendientes.length > 0 || hechosCount > 0;

  // Montos/trabajos rápidos del consultorio (personalizables).
  const { data: settings } = useQuery({ queryKey: ['clinic-settings'], queryFn: clinicsApi.getSettings });
  const quickAmounts = settings?.quickAmounts?.length ? settings.quickAmounts : DEFAULT_QUICK_AMOUNTS;
  const treatments = settings?.quickTreatments?.length ? settings.quickTreatments : QUICK_CHIPS;
  const [customAmountsOpen, setCustomAmountsOpen] = useState(false);
  const [customTreatOpen, setCustomTreatOpen] = useState(false);

  const invalidateWorks = () => qc.invalidateQueries({ queryKey: ['works', id] });
  const invalidateTx = () => qc.invalidateQueries({ queryKey: ['transactions', id] });

  // ---- alta de trabajo ----
  const [twDesc, setTwDesc] = useState('');
  const [twAmount, setTwAmount] = useState('');
  const addItemMut = useMutation({
    mutationFn: (dto: { description: string; price?: number; status?: WorkStatus }) =>
      worksApi.create({ patientId: id!, ...dto }),
  });
  const addTrabajo = async () => {
    if (!patient) return;
    const d = twDesc.trim();
    if (!d) { showToast('Escribí el trabajo', 'error'); return; }
    setWorkPanel(null);
    const precio = num(twAmount);

    // La fila aparece YA, sin esperar al servidor.
    //
    // Antes se hacía `await` y recién después se dibujaba: medio segundo en el
    // que no pasaba nada y el botón parecía trabado. Y no había nada que
    // esperar —el texto y el precio los acaba de escribir el Dr.—, así que el
    // viaje de red no aportaba información, solo demora.
    //
    // El id provisorio se reemplaza por el real cuando vuelve la respuesta. Si
    // falla, la fila se saca y el formulario recupera lo escrito: nadie pierde
    // lo que tipeó por un problema de conexión.
    // Contador de módulo y no `Date.now()`: el lint marca cualquier función
    // impura dentro del componente, aunque acá esté en un manejador de evento
    // y no en el render. Un correlativo alcanza —solo tiene que ser único
    // mientras la fila espera la respuesta.
    const idTemp = `tmp-${++secuenciaTemp}`;
    const optimista = {
      _id: idTemp,
      patientId: id!,
      description: d,
      price: precio,
      status: PENDING,
      createdAt: new Date().toISOString(),
    } as Work;
    qc.setQueryData<Work[]>(['works', id, 'todos'], (old = []) => [optimista, ...old]);
    qc.setQueryData<Work[]>(['works', id, 'pending'], (old = []) => [optimista, ...old]);
    setTwDesc(''); setTwAmount('');
    setNewWorkId(idTemp);

    // El destello verde de la fila nueva dura 800ms (`rowInFlash`). El servidor
    // suele contestar antes, y al cambiar el id provisorio por el real la fila
    // se remonta —el `key` de React sale del id—, así que la animación se
    // cortaba a la mitad: el verde desaparecía de golpe en vez de apagarse.
    //
    // Esta promesa arranca a contar ACÁ, junto con la animación. Esperarla
    // después de la respuesta consume solo lo que falte: si el servidor tardó
    // más de 800ms, ya está cumplida y no agrega ni un milisegundo.
    const destelloListo = new Promise(r => setTimeout(r, 850));
    try {
      const creado = await addItemMut.mutateAsync({ description: d, price: precio, status: PENDING });
      showToast('Trabajo agregado', 'success');
      await destelloListo;
      // Se cambia el provisorio por el de verdad, en su lugar: reemplazar la
      // lista entera haría parpadear la fila que ya está a la vista.
      const reemplazar = (old: Work[] = []) =>
        old.map(w => (w._id === idTemp ? { ...w, ...creado } : w));
      qc.setQueryData<Work[]>(['works', id, 'todos'], reemplazar);
      qc.setQueryData<Work[]>(['works', id, 'pending'], reemplazar);
      // Ojo: NO se vuelve a marcar la fila como nueva ni se invalida la lista.
      //
      // El id provisorio pasa a ser el real, y como el `key` de React sale del
      // id, la fila se remonta. Si además se la marcaba como nueva, la
      // animación de entrada corría por segunda vez y se veía como un
      // pestañeo: aparecía, y medio segundo después volvía a aparecer.
      //
      // Invalidar tampoco hace falta: la caché ya tiene el dato del servidor,
      // recién lo escribimos arriba. Solo se refresca el resumen, que es lo
      // único que el alta cambia y no está en estas listas (el "falta cobrar").
      qc.invalidateQueries({ queryKey: ['works', id, 'summary'] });
    } catch {
      const sacar = (old: Work[] = []) => old.filter(w => w._id !== idTemp);
      qc.setQueryData<Work[]>(['works', id, 'todos'], sacar);
      qc.setQueryData<Work[]>(['works', id, 'pending'], sacar);
      setTwDesc(d); setTwAmount(precio ? String(precio) : '');
      showToast('No se pudo agregar', 'error');
    }
  };

  // ---- edición / toggle / borrado de trabajo ----
  const [editItem, setEditItem] = useState<string | null>(null);
  const [eiDesc, setEiDesc] = useState('');
  const [eiAmount, setEiAmount] = useState('');
  // Chips de la fila en edición. Van EN LÍNEA (empujando la fila hacia abajo) y
  // no flotando como en el form de arriba: la lista tiene scroll propio y un
  // popover absoluto se cortaba contra el borde.
  const [editPanel, setEditPanel] = useState<'trabajo' | 'monto' | null>(null);
  const editRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editPanel || customTreatOpen || customAmountsOpen) return;
    const h = (e: MouseEvent) => {
      if (editRowRef.current && !editRowRef.current.contains(e.target as Node)) setEditPanel(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [editPanel, customTreatOpen, customAmountsOpen]);
  const updateItemMut = useMutation({
    mutationFn: (v: { workId: string; dto: Partial<CreateWorkInput> }) =>
      worksApi.update(v.workId, v.dto),
  });
  // Guarda el "hecho" de un trabajo (y opcionalmente el cobro). Es el commit
  // real: hasta acá no se tocó la base.
  const confirmarHecho = async (it: Work, monto?: number, cobrar = false) => {
    const yaGuardado = esPregunta(it._id)?.unsaved === false;
    setAskCobro(prev => prev.filter(a => a.id !== it._id));
    volverDeLaFranja(it._id);
    try {
      if (!yaGuardado) {
        // La red viaja EN PARALELO con la animación. Antes esperábamos la
        // respuesta con la fila ya desvanecida: se veía como un tirón porque el
        // movimiento quedaba a merced de la latencia, no del navegador.
        const req = updateItemMut
          .mutateAsync({ workId: it._id, dto: { status: DONE } })
          .then(() => true, () => false);

        // La fila NO se mueve ni desaparece: con la lista unificada se queda
        // donde está y solo cambia de estado. Antes saltaba de "Plan" a
        // "Hechos" —o se desvanecía si esa sección estaba cerrada— y había que
        // animar el viaje para que se entendiera a dónde se había ido.
        const movido: Work = { ...it, status: DONE, completedAt: new Date().toISOString() };
        qc.setQueryData<Work[]>(['works', id, 'pending'], (old = []) => old.filter(w => w._id !== it._id));
        qc.setQueryData<Work[]>(['works', id, 'done', 'recent'], (old = []) => [movido, ...old]);
        qc.setQueryData<Work[]>(['works', id, 'todos'], (old = []) =>
          old.map(w => (w._id === it._id ? movido : w)),
        );
        // Igual que al desmarcar: el buscador del historial también tiene que
        // enterarse, y sin moverse de lugar.
        qc.setQueriesData<Work[]>({ queryKey: ['works', id, 'historial'] }, (old = []) =>
          (old ?? []).map(w => (w._id === it._id ? movido : w)),
        );
        setFlashWorkId(it._id);
        setTimeout(() => setFlashWorkId(null), 900);

        if (!(await req)) { showToast('No se pudo guardar', 'error'); invalidateWorks(); return; }
      }
      if (cobrar) await cobrarTanda([{ ...it, status: DONE }], monto);
      else { invalidateWorks(); showToast('¡Hecho! ✓', 'success'); }
    } catch {
      showToast('No se pudo guardar', 'error');
      setOutWorkId(null);
      invalidateWorks();
    }
  };

  const toggleDone = async (it: Work) => {
    // Marcar HECHO: no se guarda todavía. La fila se transforma en la pregunta
    // y recién al responder se escribe. Así, si el toque fue sin querer,
    // "deshacer" no genera ninguna escritura que después haya que revertir.
    if (it.status !== DONE) {
      if ((it.price ?? 0) - (it.paid ?? 0) > 0) {
        setAskCobro(prev => [...prev.filter(a => a.id !== it._id), { id: it._id, unsaved: true }]);
      } else {
        await confirmarHecho(it); // sin precio no hay nada que cobrar
      }
      return;
    }

    // DESMARCAR: pregunta primero, igual que marcar pregunta "¿lo pagó?".
    // Marcar de más es barato —se descarta la pregunta y no se escribió nada—;
    // desmarcar de más es caro: hay que encontrar el trabajo otra vez, volver a
    // marcarlo y pasar de nuevo por el cobro. Los dos gestos son el mismo
    // círculo, así que el que cuesta caro es el que tiene que confirmarse.
    setAskDesmarcar(it._id);
  };

  const confirmarDesmarcar = async (it: Work) => {
    setAskDesmarcar(null);
    const req = updateItemMut
      .mutateAsync({ workId: it._id, dto: { status: PENDING } })
      .then(() => true, () => false);
    const movido: Work = { ...it, status: PENDING, completedAt: undefined };
    qc.setQueryData<Work[]>(['works', id, 'pending'], (old = []) => [movido, ...old]);
    qc.setQueryData<Work[]>(['works', id, 'done', 'recent'], (old = []) => old.filter(w => w._id !== it._id));
    // La lista que se renderiza es `todos`, y este handler no la tocaba: la
    // fila se quedaba como estaba hasta que volvía el servidor y recién ahí
    // cambiaba de golpe. Medio segundo pareciendo colgada.
    qc.setQueryData<Work[]>(['works', id, 'todos'], (old = []) =>
      old.map(w => (w._id === it._id ? movido : w)),
    );
    // El historial del modal tiene su propia clave (con los filtros adentro), así
    // que no lo alcanzan las de arriba: sin esto, destildar desde el buscador
    // dejaba la fila mostrando el tilde verde hasta que algo la refrescara, y
    // ahí cambiaba de golpe. Se parcha EN SU LUGAR: el trabajo no se va de la
    // lista ni cambia de posición, solo cambia de estado — que es justo lo que
    // pasó. Aunque el filtro sea "Hechos": esconderlo al instante te sacaría de
    // los ojos lo que acabás de hacer, y deshacerlo sería buscarlo de nuevo.
    qc.setQueriesData<Work[]>({ queryKey: ['works', id, 'historial'] }, (old = []) =>
      (old ?? []).map(w => (w._id === it._id ? movido : w)),
    );
    setFlashWorkId(it._id); setTimeout(() => setFlashWorkId(null), 900);
    if (await req) {
      // Solo el resumen: las listas ya quedaron bien arriba y refetchearlas
      // provoca una segunda pasada de layout.
      qc.invalidateQueries({ queryKey: ['works', id, 'summary'] });
      showToast('Volvió a pendiente', 'success');
    } else { showToast('No se pudo actualizar', 'error'); invalidateWorks(); }
  };
  // Salir del modo edición. La fila vuelve con un fundido corto: al confirmar
  // o cancelar reaparecen el precio y los cuatro botones de golpe, y ese cambio
  // de contenido sin transición se lee como un salto.
  /**
   * La franja verde de la pregunta se va y en su lugar vuelve la fila de
   * siempre. Es el mismo cambio que salir de "Editar" —el mismo trabajo, otra
   * forma— así que lleva el mismo fundido y no un gesto propio.
   */
  const volverDeLaFranja = (workId: string) => {
    setVolviendo(workId);
    setTimeout(() => setVolviendo(null), 260);
  };

  /**
   * Cerrar el cobro en línea. Existe por lo mismo que `salirDeEdicion`: los dos
   * botones apagaban el modo y la fila volvía a su forma de golpe, sin nada que
   * dijera que era la MISMA fila la que quedaba. Con el fundido hay continuidad;
   * el destello verde que llega después es otra cosa (que se cobró), y llega
   * cuando responde el servidor.
   */
  const salirDeCobro = (workId: string) => {
    setCobroItem(null);
    setCobroPanel(false);
    volverDeLaFranja(workId);
  };

  const salirDeEdicion = (workId: string) => {
    // Salida INMEDIATA, con el fundido de la fila.
    //
    // Se probó cerrar primero el panel y desmontar después, para que el panel
    // se contrajera en vez de irse con su contenedor. Se ve peor: son ~190ms
    // con los inputs todavía puestos y nada más cambiando, y esa pausa se lee
    // como que el botón quedó tildado. Un cambio instantáneo con fundido se
    // siente más rápido que dos gestos encadenados, aunque técnicamente haya
    // un salto de alto.
    setEditItem(null);
    setEditPanel(null);
    setVolviendo(workId);
    setTimeout(() => setVolviendo(null), 260);
  };

  const startEditItem = (it: Work) => {
    setEditItem(it._id);
    // Abierto de entrada. Antes quedaba en null y el panel recién se abría
    // cuando el input recibía el foco —un render y un evento después—, y esa
    // ida y vuelta se sentía como que el efecto tardaba.
    setEditPanel('trabajo');
    setEiDesc(it.description);
    setEiAmount(it.price ? String(it.price) : '');
  };
  const saveEditItem = async () => {
    if (!editItem) return;
    const d = eiDesc.trim();
    if (!d) { showToast('El trabajo no puede quedar vacío', 'error'); return; }
    const workId = editItem;
    const precio = num(eiAmount);

    // La fila vuelve YA con los datos nuevos. Antes se esperaba la respuesta
    // para cerrar la edición: medio segundo con los inputs puestos y sin señal
    // de que el guardado estaba en curso.
    const aplicar = (old: Work[] = []) =>
      old.map(w => (w._id === workId ? { ...w, description: d, price: precio } : w));
    qc.setQueryData<Work[]>(['works', id, 'todos'], aplicar);
    qc.setQueryData<Work[]>(['works', id, 'pending'], aplicar);
    qc.setQueryData<Work[]>(['works', id, 'done', 'recent'], aplicar);
    salirDeEdicion(workId);

    try {
      await updateItemMut.mutateAsync({ workId, dto: { description: d, price: precio } });
      // Solo el resumen: el precio puede cambiar el "falta cobrar", pero las
      // listas ya quedaron bien arriba.
      qc.invalidateQueries({ queryKey: ['works', id, 'summary'] });
      showToast('Trabajo actualizado', 'success');
    } catch {
      invalidateWorks();
      showToast('No se pudo guardar', 'error');
    }
  };
  const removeItemMut = useMutation({
    mutationFn: (workId: string) => worksApi.remove(workId),
  });
  const [delItem, setDelItem] = useState<Work | null>(null);
  // Pagos imputados al trabajo que se va a borrar + si se borran con él.
  const [delItemPagos, setDelItemPagos] = useState<Transaction[]>([]);
  const [alsoDelPagos, setAlsoDelPagos] = useState(false);

  // Antes de confirmar traemos los pagos del trabajo: hay que poder decir cuánta
  // plata está en juego. Borrar el trabajo sin tocar los pagos deja al paciente
  // con saldo "a favor" — que a veces es lo correcto (tratamiento cancelado que
  // ya había pagado) y a veces no (se cargó mal). Por eso decide el Dr.
  const pedirBorrarTrabajo = async (it: Work) => {
    setAlsoDelPagos(false);
    // Se ARRANCA con los pagos que ya están en pantalla (los mismos que muestra
    // la fila en "2 pagos $20.000"), no con la lista vacía. Con vacía el
    // diálogo abría diciendo "se saca del plan" y, cuando volvía el servidor,
    // le crecía adentro el aviso de la plata y el checkbox: el modal cambiaba
    // de tamaño de golpe justo cuando lo estabas leyendo. La consulta sigue,
    // pero ahora solo confirma lo que ya se está mostrando.
    setDelItemPagos(pagos.filter(t => String(t.workId) === it._id));
    setDelItem(it);
    if ((it.paid ?? 0) > 0) {
      try { setDelItemPagos(await transactionsApi.byWork(id!, it._id)); } catch { /* el confirm igual sirve */ }
    }
  };

  const confirmDelItem = async () => {
    if (!delItem) return;
    const it = delItem, pagos = delItemPagos, borrarPagos = alsoDelPagos;
    setDelItem(null);

    // La fila empieza a irse YA, sin esperar al servidor. Antes se hacía
    // `await` primero y la animación arrancaba recién con la respuesta: entre
    // el "Borrar" y el movimiento había medio segundo en el que la pantalla
    // parecía trabada, con el diálogo ya cerrado y la fila todavía ahí.
    setOutWorkId(it._id);
    const salidaLista = new Promise(r => setTimeout(r, ROW_OUT_MS));

    try {
      const req = removeItemMut.mutateAsync(it._id);
      await salidaLista;
      // Sacada de la caché una vez terminada la animación de salida: quitarla
      // antes cortaría el encogimiento a la mitad.
      const sacar = (old: Work[] = []) => old.filter(w => w._id !== it._id);
      qc.setQueryData<Work[]>(['works', id, 'todos'], sacar);
      qc.setQueryData<Work[]>(['works', id, 'pending'], sacar);
      qc.setQueryData<Work[]>(['works', id, 'done', 'recent'], sacar);
      setOutWorkId(null);

      await req;
      if (borrarPagos) { for (const pg of pagos) await transactionsApi.remove(pg._id); }
      // NO se invalidan las listas: la caché ya quedó bien al sacar la fila a
      // mano. Refetchearlas provocaba una segunda pasada de layout y el FLIP
      // volvía a medir sobre posiciones ya acomodadas — de ahí el residuo de
      // una fila cayendo desde arriba después de que el borrado terminó.
      // Se refresca solo lo que el borrado cambia y no vive en estas listas.
      qc.invalidateQueries({ queryKey: ['works', id, 'summary'] });
      if (borrarPagos) invalidateTx();
      showToast(
        borrarPagos && pagos.length
          ? `Trabajo y ${pagos.length === 1 ? 'su pago' : `sus ${pagos.length} pagos`} borrados`
          : 'Trabajo borrado',
        'success',
      );
    } catch {
      // Falló: la fila vuelve. Es preferible verla reaparecer a creer que se
      // borró algo que sigue estando.
      setOutWorkId(null);
      invalidateWorks();
      showToast('No se pudo borrar', 'error');
    }
  };

  // ---- cobro rapido desde la fila del trabajo ----
  // Tildar = registrar el pago de lo que FALTA de ese trabajo, imputado con
  // workId. Asi la fila puede mostrar "pago $X de $Y" en tratamientos largos
  // (opcion elegida por el Dr.). La formula de "Falta cobrar" no cambia: el
  // pago entra en la lista de Pagos como cualquier otro.
  const [cobroBusy, setCobroBusy] = useState<string | null>(null);
  // Trabajo recien marcado como hecho, a la espera de responder si se cobro.
  // Se muestra como franja arriba de la lista (no modal) porque al marcarlo
  // hecho el trabajo se va a la seccion "Hechos" y habria que ir a buscarlo.
  // Trabajos con la pregunta de cobro abierta. La pregunta se dibuja EN LA
  // PROPIA FILA y el trabajo no se mueve hasta que se responde: así queda a la
  // vista lo que estás resolviendo y un toque sin querer se deshace en el acto.
  //   `unsaved: true`  -> se tocó el círculo y todavía NO se guardó nada. Si
  //                       cancela, no se escribe en la base (era un error).
  //   `unsaved: false` -> el trabajo ya existe como hecho (se cargó con "Ya lo
  //                       hice"), solo falta saber si lo cobró.
  const [askCobro, setAskCobro] = useState<{ id: string; unsaved: boolean }[]>([]);
  const esPregunta = (workId: string) => askCobro.find(a => a.id === workId);

  // Sin confirmación no hay escritura: si se va de la ficha con la pregunta
  // abierta, el trabajo queda como estaba (pendiente). Nada se guarda a medias.

  const [askPanel, setAskPanel] = useState(false); // panel de montos rápidos
  const [askMontoId, setAskMontoId] = useState<string | null>(null);
  const askRef = useRef<HTMLDivElement>(null);
  // Se cierra al tocar cualquier otro lado, aunque no se haya elegido monto —
  // como los popovers de Monto y Trabajo. Volver a tocar el campo lo reabre.
  useEffect(() => {
    if (!askPanel) return;
    // Mientras se personalizan los montos, el modal cuenta como "adentro": si
    // no, tocar el modal cerraría el panel y al volver los montos nuevos no
    // estarían a la vista.
    if (customAmountsOpen) return;
    const h = (e: MouseEvent) => {
      if (askRef.current && !askRef.current.contains(e.target as Node)) setAskPanel(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [askPanel, customAmountsOpen]);
  // Monto en edición dentro de la franja (null = todavía no lo tocó). Existe
  // porque 1 de cada 5 veces cobra solo una parte de lo que hizo, y 1 de cada
  // 10 cobra de más (adelanto o deuda vieja): con un botón de monto fijo esos
  // casos no entraban.
  const [askMonto, setAskMonto] = useState<string | null>(null);
  /**
   * Pasa la fila a "¿cuánto pagó?".
   *
   * NO abre acá el panel de montos, aunque sea lo obvio: de eso se encarga el
   * `onFocus` del campo, que llega en el commit siguiente. Medido —la animación
   * de 140ms tardaba 303— el motivo es que una animación de `height` corre en
   * el hilo principal, y abriendo el panel en este mismo lote arrancaba justo
   * en el frame donde React está rehaciendo la fila entera: nacía frenada. Así
   * el trabajo pesado pasa primero y el desplegable anima con el hilo libre.
   * Es lo que hace "Editar" sin habérselo propuesto, y por eso ahí se ve bien.
   */
  const abrirOtroMonto = (workId: string, falta: number) => {
    setAskMontoId(workId);
    setAskMonto(String(falta));
  };
  /** Vuelve a "¿lo pagó?" — el mismo camino para cancelar y para confirmar. */
  const cerrarOtroMonto = () => {
    setAskMonto(null);
    setAskMontoId(null);
    setAskPanel(false);
  };
  // Fila en modo "cobrar": monto precargado y editable (para pagos parciales).
  const [cobroItem, setCobroItem] = useState<string | null>(null);
  const [cobroAmount, setCobroAmount] = useState('');
  // Montos rapidos del cobro en linea y de la edicion de un pago: los mismos
  // que en los formularios. Un campo de plata sin los montos del consultorio
  // obliga a tipear lo que en el resto de la app se elige.
  const [cobroPanel, setCobroPanel] = useState(false);
  const cobroRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!cobroPanel || customAmountsOpen) return;
    const h = (e: MouseEvent) => {
      if (cobroRef.current && !cobroRef.current.contains(e.target as Node)) setCobroPanel(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [cobroPanel, customAmountsOpen]);
  const [uncollect, setUncollect] = useState<{ work: Work; pagos: Transaction[] } | null>(null);

  // Cobra una tanda de trabajos con un solo importe. Se genera UN PAGO POR
  // TRABAJO (cada uno con su workId) para que cada fila quede con su estado
  // correcto; si el monto no alcanza para todos, se reparte en orden hasta donde
  // llega — el resto queda sin cobrar.
  const cobrarTanda = async (works: Work[], montoTotal?: number) => {
    const faltaDe = (w: Work) => (w.price ?? 0) - (w.paid ?? 0);
    let restante = montoTotal ?? works.reduce((a, w) => a + faltaDe(w), 0);
    if (restante <= 0) { showToast('Poné un monto mayor a cero', 'error'); return; }
    let cobrado = 0;
    try {
      for (const w of works) {
        if (restante <= 0) break;
        const cuota = Math.min(faltaDe(w), restante);
        if (cuota <= 0) continue;
        await addPagoMut.mutateAsync({
          patientId: id!,
          type: 'PAYMENT',
          amount: cuota,
          workId: w._id,
          description: w.description,
          paymentMethod: pgMethod,
          date: new Date(`${todayYMD()}T12:00:00`).toISOString(),
        });
        // Reparto en cascada: cada trabajo se lleva lo suyo y lo que queda pasa
        // al siguiente. Sin descontar, un pago parcial se cobraria entero en
        // CADA trabajo de la tanda.
        cobrado += cuota;
        restante -= cuota;
      }
      invalidateWorks(); invalidateTx();
      showToast(`Cobrado ${fmtMoney(cobrado)}`, 'success');
    } catch { showToast('No se pudo registrar el pago', 'error'); }
  };

  // `monto` permite cobrar solo una parte (ej. una cuota de brackets). Si no se
  // pasa, se cobra todo lo que falta de ese trabajo.
  const marcarCobrado = async (it: Work, monto?: number) => {
    const price = it.price ?? 0;
    const resta = monto ?? price - (it.paid ?? 0);
    if (price <= 0) { showToast('Ponele un precio al trabajo antes de cobrarlo', 'error'); return; }
    if (resta <= 0) { showToast('Poné un monto mayor a cero', 'error'); return; }
    setCobroBusy(it._id);
    try {
      await addPagoMut.mutateAsync({
        patientId: id!,
        type: 'PAYMENT',
        amount: resta,
        workId: it._id,
        description: it.description,
        paymentMethod: pgMethod,
        date: new Date(`${todayYMD()}T12:00:00`).toISOString(),
      });
      invalidateWorks(); invalidateTx();
      // Destello del botón: pasa de "Cobrar $X" a "Pagado" y sin esto el cambio
      // era seco, igual que los demás cambios de estado de la fila.
      setFlashWorkId(it._id);
      setTimeout(() => setFlashWorkId(null), 900);
      showToast(`Cobrado ${fmtMoney(resta)} - ${it.description}`, 'success');
    } catch { showToast('No se pudo registrar el pago', 'error'); }
    finally { setCobroBusy(null); }
  };

  // Destildar: primero traemos los pagos de ese trabajo para poder decir en el
  // confirm cuanta plata se va a borrar (nunca borrar montos a ciegas).
  const pedirDescobrar = async (it: Work) => {
    setCobroBusy(it._id);
    try {
      const pagos = await transactionsApi.byWork(id!, it._id);
      if (pagos.length === 0) { showToast('Este trabajo no tiene pagos cargados', 'error'); return; }
      setUncollect({ work: it, pagos });
    } catch { showToast('No se pudieron leer los pagos', 'error'); }
    finally { setCobroBusy(null); }
  };

  const confirmDescobrar = async () => {
    if (!uncollect) return;
    const { work, pagos } = uncollect; setUncollect(null);

    // Los pagos se sacan de la caché YA, sin esperar al servidor. Antes se
    // hacía `await` primero: quedaba medio segundo con el diálogo cerrado y la
    // fila igual —parecía tildada— y al volver la respuesta el bloque de pagos
    // desaparecía de golpe. Sacándolos ahora, el Desplegable los contrae con su
    // animación como cualquier otro cierre.
    const ids = new Set(pagos.map(pg => pg._id));
    const total = pagos.reduce((a, pg) => a + pg.amount, 0);
    qc.setQueryData<Transaction[]>(['transactions', id], (old = []) =>
      old.filter(t => !ids.has(t._id)),
    );
    // Y el trabajo vuelve a figurar impago: si no, el botón seguiría diciendo
    // "Pagado" hasta que llegara la respuesta.
    const sinPagar = (old: Work[] = []) =>
      old.map(w => (w._id === work._id ? { ...w, paid: Math.max(0, (w.paid ?? 0) - total) } : w));
    qc.setQueryData<Work[]>(['works', id, 'todos'], sinPagar);
    qc.setQueryData<Work[]>(['works', id, 'pending'], sinPagar);
    qc.setQueryData<Work[]>(['works', id, 'done', 'recent'], sinPagar);
    // El historial del modal también: tiene su propia clave (lleva los filtros
    // adentro) y quedaba afuera de esta enumeración. Como acá NO se invalidan
    // las listas de trabajos —a propósito, para no provocar un doble
    // movimiento—, nada lo corregía después: el trabajo seguía diciendo
    // "Pagado" ahí adentro, justo donde se lo acababa de destildar, mientras en
    // el resto de la ficha ya figuraba impago.
    qc.setQueriesData<Work[]>({ queryKey: ['works', id, 'historial'] }, old => sinPagar(old ?? []));
    setFlashWorkId(work._id);
    setTimeout(() => setFlashWorkId(null), 900);

    try {
      for (const pg of pagos) await transactionsApi.remove(pg._id);
      qc.invalidateQueries({ queryKey: ['works', id, 'summary'] });
      // Y se revalidan los pagos. La actualización optimista de arriba es para
      // que se vea al instante; ESTA es la que garantiza que sea cierto. Sin
      // ella, si la remoción optimista no acierta —un id que no coincide, un
      // pago que no venía en la lista— el chip queda mostrando un pago que ya
      // no existe y nada lo corrige nunca. Pasó.
      //
      // No provoca el doble movimiento que sí causaba invalidar la lista de
      // trabajos: vuelve el mismo contenido que ya está en pantalla.
      invalidateTx();
      showToast(`Se borraron los pagos de ${work.description}`, 'success');
    } catch {
      // Falló: vuelve todo. Es preferible ver reaparecer el pago a creer que se
      // borró algo que sigue estando.
      invalidateWorks(); invalidateTx();
      showToast('No se pudo deshacer', 'error');
    }
  };

  // ---- alta de pago ----
  const [pgMethod, setPgMethod] = useState<PaymentMethod>('CASH');
  // Trabajo al que se imputa el pago cargado desde esta columna ('' = a cuenta).
  // Existe para el paciente que pasa solo a dejar una cuota: no hay ningún
  // trabajo que marcar hecho, así que la franja "¿te lo pagó?" nunca aparece.
  // Último monto que precargamos NOSOTROS al elegir un trabajo. Sirve para
  // distinguir "el campo tiene lo que puso el sistema" de "el campo tiene lo
  // que tipeó el Dr.": si cambia de trabajo, el primero se pisa y el segundo
  // se respeta. Sin esto, elegir un trabajo después de haber escrito un monto
  // le borraba la cifra sin avisar.
  // Pago recién creado: su fila entra animada (crece desde arriba empujando al
  // resto) y queda resaltada un instante. Sirve de confirmación visual de que
  // el pago entró — sobre todo cuando se carga desde la fila del trabajo, que
  // está en la otra columna y es fácil no registrar el cambio.
  // Fila que se está yendo. React saca el elemento del DOM apenas cambian los
  // datos, así que para poder animar la salida primero marcamos la fila, la
  // dejamos encogerse, y recién después pegamos el borrado al servidor.
  const [outPagoId, setOutPagoId] = useState<string | null>(null);
  /**
   * Trabajo cuyo chip "pagó $X" y cuyo "falta $Y" están por dejar de existir.
   *
   * Esos dos dependen de `it.paid`, que llega del servidor: al borrar el último
   * pago se iban de golpe cuando volvía el refetch, varias décimas después de
   * que el pago ya se había ido. Tres desapariciones a destiempo para un solo
   * acto. Marcándolo se desvanecen JUNTO con la línea del pago, y cuando los
   * datos nuevos llegan ya están invisibles.
   */
  const [sinPagosPronto, setSinPagosPronto] = useState<string | null>(null);
  // Pago (viejo, sin trabajo) al que se le está eligiendo un trabajo. Los 130+
  // pagos que ya existían quedaron sin vincular — no se podía adivinar a qué
  // trabajo correspondía cada uno —, así que se pueden asociar a mano.
  const [linkPago, setLinkPago] = useState<Transaction | null>(null);
  // Mismo mecanismo para el trabajo que cambia de lista al marcarse hecho: se
  // encoge en "pendientes" (las de abajo suben) y entra creciendo en "Hechos"
  // (empuja al resto). Sin esto el trabajo desaparece de un lado y aparece en
  // el otro de golpe, y cuesta seguir a dónde fue.
  const [outWorkId, setOutWorkId] = useState<string | null>(null);
  const [newWorkId, setNewWorkId] = useState<string | null>(null);
  useEffect(() => {
    if (!newWorkId) return;
    const t = setTimeout(() => setNewWorkId(null), 900);
    return () => clearTimeout(t);
  }, [newWorkId]);
  const addPagoMut = useMutation({ mutationFn: transactionsApi.addMovement });

  // ---- edición / borrado de pago ----
  const [editPago, setEditPago] = useState<string | null>(null);
  const [epAmount, setEpAmount] = useState('');
  const [epPanel, setEpPanel] = useState(false);
  const epRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!epPanel || customAmountsOpen) return;
    const h = (e: MouseEvent) => {
      if (epRef.current && !epRef.current.contains(e.target as Node)) setEpPanel(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [epPanel, customAmountsOpen]);
  const [epMethod, setEpMethod] = useState<PaymentMethod>('CASH');
  const [epDate, setEpDate] = useState(todayYMD());
  // Sin `useMutation`: no se mira su estado y cada cambio redibuja la ficha
  // entera, justo cuando la fila está volviendo a su forma. Igual que en el
  // borrado de un pago.
  const guardarPagoEnServidor = (
    id: string,
    dto: Parameters<typeof transactionsApi.updateMovement>[1],
  ) => transactionsApi.updateMovement(id, dto);
  const startEditPago = (t: Transaction) => {
    setEditPago(t._id);
    setEpAmount(String(t.amount));
    setEpMethod((t.paymentMethod as PaymentMethod) || 'CASH');
    setEpDate(isoDateOf(t).slice(0, 10));
  };
  const saveEditPago = async () => {
    if (!editPago) return;
    const pagoId = editPago;
    const pagoEditado = pagos.find(p => p._id === pagoId);
    const amt = num(epAmount);
    if (amt <= 0) { showToast('Ingresá un monto', 'error'); return; }
    const fecha = new Date(`${epDate}T12:00:00`).toISOString();

    // La fila vuelve a su forma YA, con los valores nuevos puestos a mano en la
    // caché; la red viaja en paralelo. Antes se esperaba la respuesta con los
    // inputs todavía abiertos: medio segundo en el que tocar "Guardar" no
    // producía nada, y eso se lee como que el botón quedó tildado.
    salirDeEdicionPago(pagoId);
    qc.setQueryData<Transaction[]>(['transactions', id], (old = []) =>
      old.map(x => (x._id === pagoId ? { ...x, amount: amt, paymentMethod: epMethod, date: fecha } : x)),
    );

    try {
      await guardarPagoEnServidor(pagoId, { amount: amt, paymentMethod: epMethod, date: fecha });
      // La verdad la sigue teniendo el servidor: el trabajo recalcula cuánto
      // lleva pagado y eso no se puede adivinar acá.
      invalidateTx();
      if (pagoEditado?.workId) invalidateWorks();
      showToast('Pago actualizado', 'success');
    } catch {
      showToast('No se pudo guardar', 'error');
      invalidateTx();
    }
  };
  // Sin `useMutation` a propósito: no se usa su estado en ningún lado y cada
  // cambio (pendiente → listo) vuelve a dibujar la ficha entera. Esos dos
  // renders caían JUSTO mientras el desglose se contrae, y una animación de
  // alto corre en el hilo principal: se quedaba sin frames y se veía pesada.
  // El manejo optimista de la caché ya lo hace `confirmDelPago` a mano.
  const borrarPagoEnServidor = (txId: string) => transactionsApi.remove(txId);
  const [delPago, setDelPago] = useState<Transaction | null>(null);
  const vincularPago = async (t: Transaction, workId: string) => {
    const w = trabajosCobrables.find(x => x._id === workId);
    setLinkPago(null);
    try {
      await transactionsApi.updateMovement(t._id, { workId, description: w?.description });
      invalidateWorks(); invalidateTx();
      // Las dos filas se encienden a la vez, en dos columnas distintas. Lo que
      // comunica el vínculo es la SIMULTANEIDAD: el ojo agarra el par sin que
      // haya que dibujar una línea entre ellas. Por separado, cada cambio se
      // leía como un salto de estado sin causa.
      setFlashPagoId(t._id); setFlashWorkId(workId);
      setTimeout(() => { setFlashPagoId(null); setFlashWorkId(null); }, 1000);
      showToast(`Pago vinculado a ${w?.description ?? 'el trabajo'}`, 'success');
    } catch { showToast('No se pudo vincular', 'error'); }
  };

  const confirmDelPago = async () => {
    if (!delPago) return;
    const t = delPago; const photos = photosByTx.get(t._id) ?? []; setDelPago(null);
    // La fila se desvanece y sale de la lista; las de abajo suben con FLIP.
    // La red viaja EN PARALELO: antes se esperaba la respuesta y recién después
    // se sacaba la clase de salida, así que la fila REAPARECÍA un instante
    // (ya no estaba desvanecida, pero los datos todavía la incluían) hasta que
    // llegaba el refetch. Sacarla del cache a mano cierra esa ventana.
    setOutPagoId(t._id);
    // ¿Era el último pago de ese trabajo? El mapa de esta pasada todavía tiene
    // el pago que se está borrando, así que "uno solo" significa "el último".
    // Se cuenta desde `pagos` y no desde `pagosPorTrabajo`: ese mapa se declara
    // más abajo y usarlo acá le hace perder la memoización al compilador de
    // React (lo mismo da, es la misma lista agrupada).
    if (t.workId && pagos.filter(x => String(x.workId) === String(t.workId)).length <= 1) {
      setSinPagosPronto(String(t.workId));
      // Se limpia bien después: el chip tiene que quedarse invisible hasta que
      // lleguen los datos nuevos y lo saquen de verdad. Si se limpiara antes,
      // reaparecería un instante.
      setTimeout(() => setSinPagosPronto(null), 1500);
    }
    const req = borrarPagoEnServidor(t._id).then(() => true, () => false);
    await new Promise(r => setTimeout(r, ROW_OUT_MS));
    qc.setQueryData<Transaction[]>(['transactions', id], (old = []) =>
      old.filter(x => x._id !== t._id),
    );
    setOutPagoId(null);
    // Desde acá el desglose se está contrayendo. Nada de refrescos hasta que
    // termine (ver COLAPSO_MS).
    const contraccionLista = new Promise(r => setTimeout(r, COLAPSO_MS));

    if (!(await req)) {
      // No se borró: se vuelve a pedir la lista y el pago reaparece, ahora sí
      // con motivo.
      showToast('No se pudo borrar', 'error');
      invalidateTx();
      return;
    }

    // Las fotos quedan en la galería (solo se desvinculan del pago borrado).
    for (const item of photos) {
      await galleryApi.updatePhoto(patient!._id, item.sessionId, item.photo._id, { transactionId: '' });
    }
    if (photos.length) qc.invalidateQueries({ queryKey: ['gallery-sessions', id] });
    await contraccionLista;
    invalidateTx();
    // Si el pago estaba imputado a un trabajo, ese trabajo vuelve a tener
    // saldo: hay que refrescar works o sigue mostrando "Pagado" de más.
    if (t.workId) invalidateWorks();
    showToast('Pago borrado', 'success');
  };

  // ---- modales ----
  const [odoOpen, setOdoOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  // "Ver todos" de trabajos hechos / pagos (historial completo con buscador).
  const [hechosModalOpen, setHechosModalOpen] = useState(false);
  const [pagosModalOpen, setPagosModalOpen] = useState(false);
  // Etapa 2: el modal de Pagos busca en el BACKEND. `draft` = lo que se tipea;
  // se "commitea" a `pagoFilter` recién al apretar Buscar → ahí dispara el query.
  const [pagoFilterDraft, setPagoFilterDraft] = useState({ from: '', to: '', q: '' });
  const [pagoFilter, setPagoFilter] = useState({ from: '', to: '', q: '' });
  // Paginación server-side de Pagos: pedimos `pagoLimit` filas; "Cargar más" la
  // sube de a PAGE. Se resetea al buscar/limpiar y al cerrar el modal.
  const [pagoLimit, setPagoLimit] = useState(PAGE);
  const { data: pagosSearchRaw = [], isFetching: pagosSearching } = useQuery({
    queryKey: ['transactions', id, 'search', pagoFilter, pagoLimit],
    queryFn: () =>
      transactionsApi.search(id!, { ...pagoFilter, type: 'PAYMENT', limit: pagoLimit }),
    enabled: pagosModalOpen && !!id,
    // Mismo criterio que el historial de trabajos.
    staleTime: 0,
    refetchOnMount: 'always',
    // Igual que Hechos: no colapsar a "Buscando…" al cambiar el filtro.
    placeholderData: keepPreviousData,
  });
  const pagosVisible = pagosSearchRaw.filter(t => !t.voidedAt);
  const pagosHasMore = pagosSearchRaw.length >= pagoLimit;
  const pagoFilterActive = !!(pagoFilter.from || pagoFilter.to || pagoFilter.q.trim());
  const commitPagoFilter = () => {
    setPagoLimit(PAGE);
    setPagoFilter(pagoFilterDraft);
  };
  const resetPagoFilter = () => {
    setPagoLimit(PAGE);
    setPagoFilterDraft({ from: '', to: '', q: '' });
    setPagoFilter({ from: '', to: '', q: '' });
  };

  // Hechos: ahora que los trabajos son colección plana, el historial se busca y
  // pagina SERVER-SIDE (igual que Pagos). `draft` se commitea al apretar Buscar.
  const [hechosDraft, setHechosDraft] = useState('');
  const [hechosFilter, setHechosFilter] = useState('');
  // Rango de fecha (YYYY-MM-DD). Los inputs date no necesitan Buscar: se commitean
  // solos, así que van directo al filtro (sin draft) y reinician la paginación.
  const [hechosFrom, setHechosFrom] = useState('');
  const [hechosTo, setHechosTo] = useState('');
  const [hechosLimit, setHechosLimit] = useState(PAGE);
  /**
   * Estado por el que filtra el historial. Los mismos tres ejes que los chips
   * de la lista, para no tener dos vocabularios para lo mismo.
   *
   * "Hechos" y "Por hacer" los resuelve el servidor (`status`). "Falta cobrar"
   * NO es un estado guardado sino una cuenta —precio mayor que lo pagado—, así
   * que se pide `done` y se filtra acá con lo que vino. Consecuencia honesta:
   * con historiales muy largos, "Falta cobrar" mira la página traída y no toda
   * la base; "Cargar más" va sumando. Con los datos reales (el paciente más
   * cargado tiene 7 trabajos) eso no se toca nunca, y resolverlo bien pide un
   * endpoint nuevo.
   */
  const [hechosEstado, setHechosEstado] = useState<'todos' | 'hechos' | 'hacer' | 'cobrar'>('todos');
  const { data: hechosSearchRaw = [], isFetching: hechosSearching } = useQuery({
    // Sin `status`: busca en TODO el historial. Antes solo en los hechos,
    // porque la lista de la ficha estaba partida en dos y este modal era el
    // "ver todos" de la mitad de abajo. Con una sola lista, buscar la mitad
    // sería una trampa: escribís "ajuste" y no aparece el que está pendiente.
    queryKey: ['works', id, 'historial', hechosFilter, hechosFrom, hechosTo, hechosEstado, hechosLimit],
    queryFn: () =>
      worksApi.findAll(id!, {
        q: hechosFilter || undefined,
        from: hechosFrom || undefined,
        to: hechosTo || undefined,
        // "Falta cobrar" son hechos con saldo: al servidor se le piden los
        // hechos y el saldo se calcula acá.
        status:
          hechosEstado === 'hacer' ? 'pending'
          : hechosEstado === 'todos' ? undefined
          : 'done',
        limit: hechosLimit,
      }),
    enabled: hechosModalOpen && !!id,
    // Los buscadores NO se sirven de la copia guardada: la app tiene 30
    // segundos de "datos frescos" por defecto, y acá eso alcanza para abrir el
    // historial y ver un trabajo como "Pagado" cuando el pago se borró hace un
    // rato. En una lista que se abre para revisar plata, un número viejo es
    // peor que esperar 200ms. Se pide de nuevo cada vez que se abre.
    staleTime: 0,
    refetchOnMount: 'always',
    // Mantener las filas previas durante un refetch (cambio de fecha/búsqueda):
    // si no, el cuerpo colapsa a "Buscando…" y el modal se achica y re-centra,
    // pareciendo que se cierra y reabre.
    placeholderData: keepPreviousData,
  });
  const hechosSearch = useMemo(
    () =>
      hechosEstado === 'cobrar'
        ? hechosSearchRaw.filter(w => (w.price ?? 0) > (w.paid ?? 0))
        : hechosSearchRaw,
    [hechosSearchRaw, hechosEstado],
  );
  const hechosHasMore = hechosSearchRaw.length >= hechosLimit;
  const hechosFilterActive = !!hechosFilter.trim() || !!hechosFrom || !!hechosTo;
  // `value` opcional: los chips de "trabajos frecuentes" commitean su texto
  // directo (sin depender del estado draft, que es asíncrono).
  const commitHechosFilter = (value?: string) => {
    setHechosLimit(PAGE);
    const v = value ?? hechosDraft;
    if (value !== undefined) setHechosDraft(value);
    setHechosFilter(v);
  };
  const setHechosDate = (which: 'from' | 'to', v: string) => {
    setHechosLimit(PAGE);
    if (which === 'from') setHechosFrom(v);
    else setHechosTo(v);
  };
  const resetHechosFilter = () => {
    setHechosLimit(PAGE);
    setHechosDraft('');
    setHechosFilter('');
    setHechosFrom('');
    setHechosTo('');
  };
  // Popover de "trabajos frecuentes" al enfocar el buscador de Hechos (mismo
  // patrón que el input de Trabajo del alta). Cierra al click afuera.
  const hechosSearchRef = useRef<HTMLDivElement>(null);
  const [hechosPanelOpen, setHechosPanelOpen] = useState(false);
  useEffect(() => {
    if (!hechosPanelOpen) return;
    const h = (e: MouseEvent) => {
      if (hechosSearchRef.current && !hechosSearchRef.current.contains(e.target as Node)) {
        setHechosPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [hechosPanelOpen]);
  /**
   * Visor de fotos. Guarda la LISTA y en cuál se está parado, no una foto
   * suelta: abrir una miniatura y no poder pasar a la de al lado obligaba a
   * cerrar y volver a abrir por cada una. El pase, el teclado y el
   * deslizamiento viven en `VisorFotos`, que comparte con la galería.
   */
  const [zoom, setZoom] = useState<{ fotos: FotoVisor[]; i: number } | null>(null);
  /** Abre el visor con TODAS las fotos del grupo, parado en la que se tocó. */
  const abrirZoom = (
    lista: { photo: { _id: string; url: string; type?: string }; title?: string; description?: string }[],
    idx: number,
  ) =>
    setZoom({
      fotos: lista.map(({ photo, title, description }) => ({
        url: photo.url,
        category: photo.type,
        title,
        description,
      })),
      i: idx,
    });

  // Qué campo se acaba de llenar solo (desde un chip). Sirve para el destello:
  // escribiendo no se anima nada —el valor lo estás poniendo vos y ya lo estás
  // mirando— pero cuando aparece de golpe por tocar una sugerencia conviene
  // avisar dónde cayó. Mismo modismo que el campo de paciente de la agenda.
  // Qué trabajos tienen el desglose de pagos abierto. Por trabajo y no uno
  // solo a la vez: comparar dos tratamientos largos es un caso real.
  // Trabajo hecho al que se le está preguntando si de verdad no se hizo.
  const [askDesmarcar, setAskDesmarcar] = useState<string | null>(null);
  // Fila que acaba de volver de la pregunta. La pregunta entra con su fundido,
  // pero al cancelar la fila normal aparecía en seco: el mismo gesto se sentía
  // suave para un lado y cortado para el otro.
  const [volviendo, setVolviendo] = useState<string | null>(null);
  const cancelarDesmarcar = (workId: string) => {
    setAskDesmarcar(null);
    setVolviendo(workId);
    setTimeout(() => setVolviendo(null), 260);
  };

  /** Cerrar la edición de un pago, con el fundido de la fila que vuelve. */
  const salirDeEdicionPago = (pagoId: string) => {
    setEditPago(null);
    setEpPanel(false);
    setVolviendo(pagoId);
    setTimeout(() => setVolviendo(null), 260);
  };

  /**
   * Deja UNA sola operación abierta en la lista.
   *
   * Se llama al empezar cualquier otra: editar un trabajo, cobrar, editar un
   * pago, marcar o desmarcar, agregar. Antes se podía dejar una fila en
   * edición, tocar "Cobrar" en otra y quedaban las dos abiertas — dos
   * formularios con plata a medio escribir y ninguna pista de cuál se iba a
   * guardar. Nada de esto había escrito todavía, así que cerrar es volver la
   * fila a como estaba, sin perder nada. Cada una se cierra por su camino
   * normal, con su fundido, para que se vea CUÁL se cerró.
   *
   * Lo que NO se cierra: la franja verde de "¿lo pagó?". Esa no es un
   * formulario a medias, es una pregunta pendiente —el trabajo se marcó hecho y
   * todavía no se guardó—; hacerla desaparecer sola sería tragarse el gesto y
   * dejar el trabajo pendiente sin avisar. Además se pueden marcar varios
   * seguidos y responder después, que es como se usa. De esa franja sí se
   * cierra el "¿cuánto pagó?": ahí sí hay un importe a medio escribir, y
   * cerrarlo devuelve la pregunta a sus opciones, sin perderla.
   */
  const cerrarOperaciones = () => {
    if (editItem) salirDeEdicion(editItem);
    if (cobroItem) salirDeCobro(cobroItem);
    if (editPago) salirDeEdicionPago(editPago);
    if (askDesmarcar) cancelarDesmarcar(askDesmarcar);
    if (askMontoId) cerrarOtroMonto();
  };
  const [pagosAbiertos, setPagosAbiertos] = useState<Record<string, boolean>>({});
  // El alto del desglose cambia de golpe y del movimiento se encarga el FLIP:
  // traslada las filas de abajo con `transform`, que corre en el compositor.
  // Antes esto tenía su propia transición de alto y las dos animaciones se
  // pisaban —de ahí el rebote y las fotos yendo y viniendo—.
  //
  // El contenido no se monta ni se desmonta: `Desplegable` lo mantiene siempre
  // y le anima el alto, así el bloque se CONTRAE en vez de desaparecer.
  const togglePagos = (workId: string) =>
    setPagosAbiertos(p => ({ ...p, [workId]: !p[workId] }));
  const [campoLleno, setCampoLleno] = useState<'trabajo' | 'monto' | null>(null);
  useEffect(() => {
    if (!campoLleno) return;
    const t = setTimeout(() => setCampoLleno(null), 700);
    return () => clearTimeout(t);
  }, [campoLleno]);

  const addChip = (t: string) => {
    setTwDesc(p => (p.trim() ? `${p.trim()} ${t}` : t));
    setCampoLleno('trabajo');
  };

  // Layout: dos columnas (Trabajos | Pagos) en pantallas anchas; apiladas si no.
  const stack = useIsMobile(1000);
  // En celular las dos columnas se reemplazan por pestañas segmentadas
  // (Trabajos · N | Pagos · N); en tablet/desktop se muestran las dos hojas.

  // Panel de chips que se abre al enfocar los inputs (ahorra espacio vertical
  // vs. tenerlos siempre visibles). Es contextual: al enfocar "Trabajo" muestra
  // trabajos frecuentes, al enfocar "Precio" muestra montos. Cierra al elegir
  // un chip, al agregar/pagar, o al hacer click afuera.
  const [workPanel, setWorkPanel] = useState<'trabajo' | 'monto' | null>(null);
  const [pagoPanel, setPagoPanel] = useState(false);
  const workRef = useRef<HTMLDivElement>(null);
  const pagoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!workPanel) return;
    const h = (e: MouseEvent) => { if (workRef.current && !workRef.current.contains(e.target as Node)) setWorkPanel(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [workPanel]);
  useEffect(() => {
    if (!pagoPanel) return;
    const h = (e: MouseEvent) => { if (pagoRef.current && !pagoRef.current.contains(e.target as Node)) setPagoPanel(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [pagoPanel]);

  // Los trabajos ya hechos se colapsan (para no saturar cuando se acumulan).
  const [flashWorkId, setFlashWorkId] = useState<string | null>(null);
  const [flashPagoId, setFlashPagoId] = useState<string | null>(null);
  const worksListRef = useRef<HTMLDivElement>(null);
  // Sin FLIP en esta lista.
  //
  // Se peleaba con el desplegable de pagos: al cambiar el alto de una fila
  // tomaba a las de abajo como un reordenamiento y las arrastraba encima de la
  // animación que ya estaba corriendo. Se intentó pausarlo mientras dura el
  // despliegue y no alcanzó —al reanudar veía el desplazamiento acumulado y lo
  // animaba de nuevo—.
  //
  // Y hoy aporta poco: con hechos y pendientes en UNA lista, marcar un trabajo
  // ya no lo manda de una sección a otra, que era el reordenamiento que este
  // hook venía a explicar. Lo que queda —alta y borrado— ya tiene su propia
  // entrada y salida.

  /**
   * Los dos filtros de la lista, uno por cada eje del modelo: falta HACERLO y
   * falta COBRARLO. Antes había uno solo llamado "Pendientes", y esa palabra en
   * esta pantalla puede significar cualquiera de los dos — que es exactamente
   * lo que no puede pasar donde una cosa es trabajo y la otra es plata.
   *
   * Los contadores van siempre a la vista aunque no se filtre: la lista está
   * mezclada por fecha de carga, así que lo que falta hacer o cobrar puede
   * quedar enterrado entre lo demás, y esos dos números son los que el Dr. mira
   * con el paciente en el sillón.
   */
  const [filtro, setFiltro] = useState<'todos' | 'hacer' | 'cobrar'>('todos');
  /**
   * Cambiar de filtro reemplaza el contenido de la lista: entra otro conjunto
   * de trabajos, no se reordenan los mismos. El fundido corto dice "esto se
   * reemplazó" sin prometer que alguna fila viajó de un lado al otro.
   *
   * Se anima el contenedor con la Web Animations API en vez de remontarlo con
   * una `key`: remontar redibuja todas las filas y en Pacientes eso colgaba la
   * pantalla casi un segundo. Es el mismo camino que se usa allá y en la
   * galería.
   */
  const aplicarFiltro = (f: 'todos' | 'hacer' | 'cobrar') => {
    setFiltro(f);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    worksListRef.current?.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
  };
  /**
   * Hechos con plata sin cobrar. "Sin cobrar nada" y "cobrado a medias" van
   * juntos a propósito: los dos responden la misma pregunta —a quién hay que
   * cobrarle— y no se actúa distinto según cuál sea. Separarlos serían dos
   * filtros para una sola decisión.
   *
   * Solo los HECHOS, igual que el total de arriba: un trabajo por hacer todavía
   * no se debe.
   */
  const porCobrar = useMemo(
    () => todosLosTrabajos.filter(w => w.status === DONE && (w.price ?? 0) > (w.paid ?? 0)),
    [todosLosTrabajos],
  );
  // Para "por hacer" se usa la consulta de pendientes, que los trae TODOS, y no
  // un filtro sobre la lista general: esa viene cortada en 40, así que un
  // paciente con mucho historial se habría quedado sin ver los pendientes más
  // viejos — justo los que hay que mirar.
  const trabajosVisibles =
    filtro === 'hacer' ? pendientes
    : filtro === 'cobrar' ? porCobrar
    // Filtrando NO se corta: "por hacer" y "falta cobrar" son listas de cosas
    // por resolver y esconder la número 21 sería esconder trabajo.
    : todosLosTrabajos.slice(0, INLINE_MAX);

  // Trabajos a los que todavía se les puede imputar plata (tienen precio y algo
  // sin cobrar). Alimentan el selector del formulario de Pagos.
  const trabajosCobrables = useMemo(
    () =>
      [...pendientes, ...hechosRecent].filter(
        w => (w.price ?? 0) > 0 && (w.paid ?? 0) < (w.price ?? 0),
      ),
    [pendientes, hechosRecent],
  );
  // Agrupados para el selector: primero lo que ya hizo y no cobró (el caso más
  // probable), después los tratamientos largos que sigue pagando en cuotas. NO
  // se filtran los pendientes: los brackets y los retenedores viven meses en
  // "por hacer" mientras se pagan, y son justo los que se imputan de a partes.

  // ---- fila de un trabajo (se reusa en pendientes y en hechos) ----
  // Los pagos de cada trabajo, para mostrarlos DENTRO de su fila. Antes vivían
  // en una columna aparte y había que cruzarlos a ojo con el trabajo.
  const pagosPorTrabajo = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of pagos) {
      if (!t.workId) continue;
      const k = String(t.workId);
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return m;
  }, [pagos]);

  // Pagos sin trabajo asignado. Casi todos son de junio a agosto, de cuando el
  // modelo de trabajos todavía se estaba asentando: son 153 y siguen contando
  // en el saldo, así que necesitan verse en algún lado o el número no cerraría
  // con nada.
  const pagosACuenta = useMemo(() => pagos.filter(t => !t.workId), [pagos]);

  const renderWorkRow = (it: Work, dense = false) => {
    const done = it.status === DONE;
    const editing = editItem === it._id;
    const itemPhotos = photosByItem.get(it._id) ?? [];
    // Estado de cobro del trabajo (calculado con los pagos imputados a el).
    const price = it.price ?? 0;
    const paid = it.paid ?? 0;
    const cobrado = price > 0 && paid >= price;
    const parcial = paid > 0 && paid < price;

    // La fila se transforma en la pregunta de cobro, en su lugar. El trabajo no
    // se mueve hasta que se responde: así no perdés de vista lo que estás
    // resolviendo, y "deshacer" cancela sin haber escrito nada.
    // Confirmación de desmarcado, en la misma fila y más chica que la del
    // cobro: es una pregunta de sí o no, sin monto que editar. Dice el nombre
    // del trabajo y, si ya tiene plata cobrada, la avisa — desmarcar no borra
    // los pagos, pero conviene saber que quedan colgando de algo sin hacer.
    if (askDesmarcar === it._id) {
      return (
        <div key={it._id} data-flip={it._id} className="lb-askrow lb-askrow--min">
          <div className="lb-askrow__q">
            <Icon name="undo" size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            <span className="lb-askrow__txt">
              <b>{it.description}</b> — ¿no se hizo?
              {paid > 0 && (
                <span className="fr-desm__ojo"> tiene {fmtMoney(paid)} cobrados</span>
              )}
            </span>
          </div>
          <div className="lb-askrow__acts">
            <button className="btn btn--secondary btn--sm" onClick={() => confirmarDesmarcar(it)}>
              Sí, volver a pendiente
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => cancelarDesmarcar(it._id)}>
              Cancelar
            </button>
          </div>
        </div>
      );
    }

    const preg = esPregunta(it._id);
    if (preg && !editing) {
      const falta = price - paid;
      const editandoMonto = askMonto !== null && askMontoId === it._id;
      const cerrarPanel = () => cerrarOtroMonto();
      return (
        // `askRef` en la franja entera y no solo en el campo: los montos están
        // abajo, en el flujo. Si el ref siguiera en el campo, el `mousedown`
        // sobre un chip contaría como "afuera", cerraría el panel y desmontaría
        // el botón ANTES de que llegara su click — el monto no se elegía nunca.
        <div key={it._id} data-flip={it._id} ref={askRef} className="lb-askrow">
          <div className="lb-askrow__q">
            <Icon name="check" size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
            <span className="lb-askrow__txt">
              <b>{it.description}</b>
              {' — '}{editandoMonto ? '¿cuánto pagó?' : '¿lo pagó?'}
            </span>
            {/* Descartar vive acá, lejos de las respuestas, para que no se lea
                como una cuarta opción. Solo si todavía no se guardó nada. */}
            {!editandoMonto && preg.unsaved && (
              <button className="btn btn--ghost btn--sm lb-askrow__x" title="Dejar el trabajo como estaba"
                onClick={() => { setAskCobro(prev => prev.filter(a => a.id !== it._id)); volverDeLaFranja(it._id); }}>
                Cancelar
              </button>
            )}
          </div>

          {/* RENGLÓN 2 — la respuesta. Las opciones y el campo con sus botones
              ocupan el mismo lugar y miden lo mismo (`min-height`), así que
              cambiar de una a otra no mueve nada: solo se reemplaza, y eso se
              cuenta con un fundido corto. */}
          <div
            /* `key` por respuesta: sin ella React reusa el mismo div y solo
               cambia los hijos, así que la animación depende de que la clase
               pase de "ninguna" a "esta" — y si se va y se vuelve rápido, no
               vuelve a correr. Remontando, el fundido arranca siempre. */
            key={editandoMonto ? 'monto' : 'opciones'}
            className={`lb-askrow__acts lb-swap ${editandoMonto ? 'lb-askrow__acts--monto' : ''}`}
          >
            {editandoMonto ? (
              <>
                {/* Mismo ancho que el campo de precio al editar un trabajo: es
                    el mismo dato. Estirado a toda la fila parecía otra cosa. */}
                <span className="fr-monto">
                  <span className="fr-monto__peso">$</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    autoFocus
                    value={askMonto ? Number(askMonto).toLocaleString('es-AR') : ''}
                    onChange={e => setAskMonto(e.target.value.replace(/[^\d]/g, ''))}
                    onFocus={() => setAskPanel(true)}
                    onClick={() => setAskPanel(true)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { const m = num(askMonto ?? ''); cerrarPanel(); confirmarHecho(it, m, true); }
                      if (e.key === 'Escape') cerrarPanel();
                    }}
                    style={{ width: '100%', height: 32, paddingLeft: 18, fontSize: 13 }}
                  />
                </span>
                {/* Con palabras, no con íconos: un ✓ y una ✕ al lado de un
                    importe no dicen qué guardan ni qué descartan, y en una fila
                    con plata la ✕ se puede leer como "borrar". Es el mismo par
                    en los cuatro formularios de la ficha. */}
                <button className="btn btn--primary btn--sm"
                  onClick={() => { const m = num(askMonto ?? ''); cerrarPanel(); confirmarHecho(it, m, true); }}>
                  <Icon name="check" size={13} /> Cobrar
                </button>
                <button className="btn btn--ghost btn--sm" onClick={cerrarPanel}>Cancelar</button>
              </>
            ) : (
              <>
                {/* Las dos opciones a la vista, no un botón que alterna: con uno
                    solo hay que tocarlo para descubrir qué hay del otro lado, y
                    el que no lo sabe no se entera de que puede cambiarlo.
                    Arranca en Efectivo — de 212 pagos reales, 212 fueron en
                    efectivo, aunque eso es en parte porque antes el medio estaba
                    fijo en el código y nunca se preguntó. */}
                <button
                  type="button"
                  className={`lb-medio ${pgMethod === 'TRANSFER' ? 'is-transf' : ''}`}
                  onClick={() => setPgMethod(m => (m === 'CASH' ? 'TRANSFER' : 'CASH'))}
                  title="Tocá para cambiar el medio de pago"
                >
                  <Icon name="undo" size={11} />
                  {pgMethod === 'CASH' ? 'Efectivo' : 'Transferencia'}
                </button>
                <button className="btn btn--primary btn--sm" onClick={() => confirmarHecho(it, undefined, true)}>
                  Pagó {fmtMoney(falta)}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => abrirOtroMonto(it._id, falta)}>
                  Otro monto
                </button>
                <button className="btn btn--secondary btn--sm" onClick={() => confirmarHecho(it)}>
                  Todavía no
                </button>
              </>
            )}
          </div>

          {/* RENGLÓN 3 — los montos. Es LO ÚNICO que cambia de alto, así que es
              lo único animado: el Desplegable lo abre empujando la lista y lo
              cierra de vuelta. Sin `animarAlMontar`: la franja nace con las
              opciones puestas y este bloque nace cerrado. */}
          {/* Nace CON los montos adentro y ya abierto (`animarAlMontar`), igual
              que el panel de "Editar": si el bloque existiera vacío desde antes,
              el contenido llegaría un frame después y el desplegable arrancaría
              dos veces. El contenido NO se desmonta al elegir un monto —solo se
              cierra— así que el espacio se contrae con los chips todavía
              adentro y no vacío. */}
          {editandoMonto && (
          <Desplegable abierto={askPanel} clave="montos" animarAlMontar>
            <div className="lb-askrow__cuerpo">
                <div className="lb-editpanel">
                  <div style={popTitle}>Montos</div>
                  <div className="lb-chips" style={chipsWrap}>
                    {quickAmounts.map(v => (
                      <button key={v} type="button" className="lb-chip mono" style={{ fontWeight: 600 }}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setAskMonto(String(v)); setAskPanel(false); }}>
                        {fmtMoney(v)}
                      </button>
                    ))}
                    {/* Misma lista y mismo editor que el resto de la ficha:
                        los montos son del consultorio, no de cada panel. */}
                    <button type="button" onMouseDown={e => e.preventDefault()}
                      onClick={() => setCustomAmountsOpen(true)} className="lb-chip lb-chip--add">
                      <Icon name="settings" size={12} /> Editar
                    </button>
                  </div>
                </div>
            </div>
          </Desplegable>
          )}
        </div>
      );
    }

    return (
      <div key={it._id} data-flip={it._id} ref={editing ? editRowRef : cobroItem === it._id ? cobroRef : undefined} className={`fr-row fw-row ${editing || cobroItem === it._id ? 'fr-row--edit' : ''} ${it._id === newWorkId ? 'lb-rowin' : ''} ${it._id === flashWorkId ? 'lb-rowflash' : ''} ${it._id === outWorkId ? 'lb-rowout' : ''} ${it._id === volviendo ? 'fr-row--vuelve' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: dense ? '6px 12px' : '10px 12px', borderTop: '1px solid var(--border-subtle)' }}>
        {/* El circulito solo no dice qué hace, y en tablet no hay tooltip que lo
            aclare. Los pendientes llevan la etiqueta al lado; los hechos no la
            necesitan (el tilde verde + el tachado + "hecho DD/MM" ya se leen). */}
        <button
          onClick={() => { cerrarOperaciones(); toggleDone(it); }}
          title={done ? 'Marcar como pendiente' : 'Marcar como hecho'}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            flexShrink: 0, minWidth: dense ? 22 : 46,
            cursor: 'pointer', background: 'none', border: 0, padding: 0,
          }}
        >
          <span
            className={`fr-check ${it._id === flashWorkId ? 'fr-check--pop' : ''}`}
            style={{
              width: 22, height: 22, borderRadius: 999, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: done ? 'none' : '2px solid var(--border-input)',
              /* Verde. Se probó en gris para que el verde fuera solo de plata,
                 pero el tilde perdía fuerza y la fila se veía apagada. La
                 ambigüedad que preocupaba —"todo verde"— la resuelve el rojo:
                 cuando falta plata aparece `falta $X` al lado, así que un
                 verde sin rojo significa hecho Y cobrado. El color que hay que
                 buscar con la vista es el rojo, no el verde. */
              background: done ? 'var(--success)' : '#fff', color: 'white',
            }}
          >
            {done && <Icon name="check" size={13} />}
          </span>
          {/* Etiqueta SOLO en los pendientes.
              En los hechos sobra —el tilde, el tachado y "hecho DD/MM" ya lo
              dicen tres veces— y encima anunciaba la acción de deshacer, que es
              la que menos conviene invitar: desmarcar sin querer obliga a
              buscar el trabajo y volver a marcarlo. Sigue disponible tocando el
              círculo, con su tooltip; simplemente no se ofrece. */}
          {!dense && !done && <span className="lb-act__lbl">Hecho</span>}
        </button>
        {editing ? (
          <>
            <input className="input" value={eiDesc} onChange={e => setEiDesc(e.target.value)}
              onFocus={() => setEditPanel('trabajo')} onClick={() => setEditPanel('trabajo')}
              onKeyDown={e => e.key === 'Enter' && saveEditItem()} style={{ flex: 1, minWidth: 120, height: 32 }} autoFocus />
            <div className="fr-monto">
              <span className="fr-monto__peso">$</span>
              <input className="input" inputMode="numeric" value={eiAmount} onChange={e => setEiAmount(e.target.value.replace(/[^\d]/g, ''))}
                onFocus={() => setEditPanel('monto')} onClick={() => setEditPanel('monto')}
                onKeyDown={e => e.key === 'Enter' && saveEditItem()} style={{ width: '100%', height: 32, paddingLeft: 18 }} />
            </div>
            <button className="btn btn--primary btn--sm" onClick={saveEditItem}><Icon name="check" size={13} /> Guardar</button>
            <button className="btn btn--ghost btn--sm" onClick={() => salirDeEdicion(it._id)}>Cancelar</button>
            {/* Dentro de un Desplegable: antes aparecía de golpe y la fila
                pegaba un salto, y al cambiar de "trabajos" a "montos" el panel
                cambia de alto —son distintas cantidades de chips— y también
                saltaba. El Desplegable sigue las dos cosas: abrir/cerrar y el
                cambio de contenido. */}
            <div style={{ flex: '0 0 100%', width: '100%' }}>
            <Desplegable abierto={!!editPanel} clave={editPanel ?? ''} animarAlMontar>
              {editPanel && (
              /* `key` por panel: sin ella React reusa el mismo elemento al
                 pasar de "trabajos" a "montos" y el fundido de `panelIn` no
                 vuelve a correr —el contenido se reemplazaba de golpe—. Con la
                 key se remonta y entra fundido; el alto ya lo acompaña el
                 Desplegable. */
              <div key={editPanel} className="lb-editpanel">
                <div style={popTitle}>{editPanel === 'trabajo' ? 'Trabajos frecuentes' : 'Montos'}</div>
                <div className="lb-chips" style={chipsWrap}>
                  {editPanel === 'trabajo' ? (
                    <>
                      {/* El chip REEMPLAZA la descripción, no la suma: acá se
                          está corrigiendo un trabajo que ya existe y concatenar
                          dejaba "blanqueamiento ajuste". */}
                      {treatments.map(t => (
                        <button key={t} type="button" className="lb-chip" onMouseDown={e => e.preventDefault()}
                          onClick={() => { setEiDesc(t); setEditPanel(null); }}>{t}</button>
                      ))}
                      <button type="button" className="lb-chip lb-chip--add" onMouseDown={e => e.preventDefault()}
                        onClick={() => setCustomTreatOpen(true)}><Icon name="settings" size={12} /> Editar</button>
                    </>
                  ) : (
                    <>
                      {quickAmounts.map(v => (
                        <button key={v} type="button" className="lb-chip mono" style={{ fontWeight: 600 }} onMouseDown={e => e.preventDefault()}
                          onClick={() => { setEiAmount(String(v)); setEditPanel(null); }}>{fmtMoney(v)}</button>
                      ))}
                      <button type="button" className="lb-chip lb-chip--add" onMouseDown={e => e.preventDefault()}
                        onClick={() => setCustomAmountsOpen(true)}><Icon name="settings" size={12} /> Editar</button>
                    </>
                  )}
                </div>
              </div>
              )}
            </Desplegable>
            </div>
          </>
        ) : (
          <>
            {/* Estructura FIJA en tres zonas, siempre en el mismo orden:
                  1. nombre
                  2. estado (hecho el X · pagó $Y)
                  3. fotos
                Antes iba todo en un mismo flex que envolvia, asi que segun lo
                que hubiera —fecha, pago parcial, una foto— cada fila se armaba
                distinta y la lista se leia desordenada. */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, wordBreak: 'break-word', color: done ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>{it.description || '(sin nombre)'}</div>
              {/* Sin tag "por hacer": estos trabajos ya viven en la sección de
                  pendientes, arriba de "Hechos". Repetirlo ocupaba ancho (partía
                  descripciones largas al medio) y no aportaba nada. */}
              {(((done && it.completedAt) || parcial || (!done && cobrado))) && (
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 8px', marginTop: 3 }}>
                  {done && it.completedAt && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      hecho {fmtDate(it.completedAt)}
                    </span>
                  )}
                  {/* Cuanto lleva pagado, para los que se pagan en cuotas */}
                  {parcial && <span className={`lb-paidprog ${sinPagosPronto === it._id ? 'fr-seva' : ''}`}>pagó {fmtMoney(paid)}</span>}
                  {/* Acá había un chip "✓ pagado" para los pendientes ya
                      cobrados. Existía porque los pendientes NO tenían botón de
                      cobro y era la única forma de ver el estado. Ahora lo
                      tienen y dice "Pagado", así que el chip repetía la misma
                      palabra dos veces en la misma fila. */}
                </div>
              )}

              {itemPhotos.length > 0 && (
                /* flexBasis 100% → las miniaturas siempre arrancan renglón propio */
                <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap', flexBasis: '100%' }}>
                  {itemPhotos.map(({ photo }, idx) => (
                    <img
                      key={photo._id}
                      src={photo.thumbnailUrl || photo.url}
                      onClick={() => abrirZoom(itemPhotos, idx)}
                      title={`${photoTypeLabel(photo.type)} — foto del trabajo`}
                      style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-subtle)', cursor: 'zoom-in', display: 'block' }}
                    />
                  ))}
                </div>
              )}
            </div>
            {/* Precio + cobro + acciones. En escritorio este contenedor no
                existe para el layout (`display: contents`), así que la fila se
                ve igual que siempre. En celular pasa a ocupar su propio renglón:
                no entra todo a lo ancho y el scroll horizontal en una lista es
                lo peor que le podés dar a alguien con el dedo en la pantalla. */}
            {/* La plata es un ATRIBUTO del trabajo, no una acción: va pegada a
                la descripción y no contra el borde derecho. Así el hueco del
                medio —que aparecía con descripciones cortas— se achica solo y
                las acciones quedan solas en el margen.
                El saldo pendiente va debajo del precio y no adentro del botón:
                es información, no el rótulo de lo que hace. */}
            <span className="fr-plata">
              <span className="mono fr-price" style={{ color: it.price ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{it.price ? fmtMoney(it.price) : '—'}</span>
              {/* El rojo aparece SIEMPRE que haya plata sin cobrar, no solo con
                  un pago parcial. La fila ya se apoyaba en eso —"un verde sin
                  rojo significa hecho Y cobrado"— pero un trabajo hecho y sin
                  cobrar nada no mostraba nada, así que se leía igual que uno
                  cobrado. Sin monto en ese caso: el precio está al lado y sería
                  el mismo número dos veces.
                  Los pendientes siguen sin marca: todavía no se deben. */}
              {!cobrado && (parcial || (done && price > 0)) && (
                <span className={`fr-falta ${sinPagosPronto === it._id ? 'fr-seva' : ''}`}>
                  {paid > 0 ? `falta ${fmtMoney(price - paid)}` : 'sin cobrar'}
                </span>
              )}
            </span>
            <span className="fr-money">
            {/* Los PENDIENTES también se cobran. Antes no se ofrecía acá y el
               comentario decía "para eso está el formulario de Pagos" — que ya
               no existe, así que cobrar una seña se había vuelto imposible.
               Y es un caso común: brackets y retenedores se pagan por
               adelantado y viven meses en "por hacer" mientras se pagan. */}
            {cobroItem === it._id ? (
              /* Monto precargado y EDITABLE: si paga todo se confirma de una, y
                 si deja una parte (cuota de brackets) se corrige el número —
                 ese pago queda atado al trabajo y alimenta el "pagó $X de $Y". */
              <>
              <span className="fr-cobro-linea">
                <span className="fr-monto">
                  <span className="fr-monto__peso">$</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    autoFocus
                    value={cobroAmount ? Number(cobroAmount).toLocaleString('es-AR') : ''}
                    onChange={e => setCobroAmount(e.target.value.replace(/[^\d]/g, ''))}
                    onFocus={() => setCobroPanel(true)}
                    onClick={() => setCobroPanel(true)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { const m = num(cobroAmount); salirDeCobro(it._id); marcarCobrado(it, m); }
                      if (e.key === 'Escape') salirDeCobro(it._id);
                    }}
                    style={{ width: '100%', height: 32, paddingLeft: 18, fontSize: 13 }}
                  />
                </span>
                <button
                  className="btn btn--primary btn--sm"
                  onClick={() => { const m = num(cobroAmount); salirDeCobro(it._id); marcarCobrado(it, m); }}
                >
                  <Icon name="check" size={13} /> Cobrar
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => salirDeCobro(it._id)}>Cancelar</button>
              </span>
                {/* El alto lo lleva el Desplegable, igual que en "Editar": suelto,
                    el panel aparecía de golpe y empujaba la lista de un salto. */}
                <div style={{ flex: '0 0 100%', width: '100%' }}>
                {/* El contenido va SIEMPRE montado: si se desmontara al cerrar,
                    los montos desaparecerían primero y el espacio se cerraría
                    después, vacío. Lo abre y lo cierra `abierto`. */}
                <Desplegable abierto={cobroPanel} clave="montos" animarAlMontar>
                  <div className="lb-editpanel">
                    <div style={popTitle}>Montos</div>
                    <div className="lb-chips" style={chipsWrap}>
                      {quickAmounts.map(v => (
                        <button key={v} type="button" className="lb-chip mono" style={{ fontWeight: 600 }}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => { setCobroAmount(String(v)); setCobroPanel(false); }}>
                          {fmtMoney(v)}
                        </button>
                      ))}
                      <button type="button" onMouseDown={e => e.preventDefault()}
                        onClick={() => setCustomAmountsOpen(true)} className="lb-chip lb-chip--add">
                        <Icon name="settings" size={12} /> Editar
                      </button>
                    </div>
                  </div>
                </Desplegable>
                </div>
              </>
            ) : (
              <button
                className={`lb-cobro ${cobrado ? 'is-on' : ''} ${it._id === flashWorkId ? 'lb-pop' : ''}`}
                disabled={cobroBusy === it._id}
                title={cobrado ? 'Ya cobrado - tocá para deshacer' : `Cobrar (podés editar el monto)`}
                onClick={() => {
                  cerrarOperaciones();
                  if (cobrado) { pedirDescobrar(it); return; }
                  setCobroAmount(String(price - paid));
                  setCobroItem(it._id);
                }}
              >
                {/* En un cobro parcial el botón dice el saldo: el Dr. no tiene
                    que restar de cabeza y sabe qué va a pasar si lo toca. El
                    monto va en un renglón aparte para no estirar la fila. */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Icon name={cobrado ? 'check' : 'cash'} size={12} />
                  {cobrado ? 'Pagado' : 'Cobrar'}
                </span>
              </button>
            )}
            {/* Mismo formato que las acciones de la agenda (`lb-act`): ícono en
                cajita con su leyenda abajo. Tres lápices y tachos sin rótulo
                obligan a acordarse cuál es cuál; con la palabra debajo se lee.
                Y de paso el objetivo táctil pasa de 28 a 32px de lado.

                Mientras se está cobrando no van: la fila tiene una sola
                pregunta abierta —cuánto— y sus dos botones para responderla.
                Fotos, Editar y Borrar ahí son ruido, y encima llevan afuera a
                mitad de una operación con plata. Al editar ya pasaba: es la
                misma idea. */}
            {cobroItem !== it._id && (
            <span className="fr-acts">
              <button className="lb-act" title="Fotos del trabajo" onClick={() => openModal('uploadPhotos', { patientId: id, treatmentItemId: it._id })}>
                <span className="lb-act__ic" style={{ color: itemPhotos.length ? 'var(--brand-primary-600)' : undefined }}><Icon name="image" size={16} /></span>
                <span className="lb-act__lbl">{itemPhotos.length ? `Fotos ${itemPhotos.length}` : 'Fotos'}</span>
              </button>
              <button className="lb-act" title="Editar" onClick={() => { cerrarOperaciones(); startEditItem(it); }}>
                <span className="lb-act__ic"><Icon name="edit" size={16} /></span>
                <span className="lb-act__lbl">Editar</span>
              </button>
              <button className="lb-act" title="Borrar" onClick={() => { cerrarOperaciones(); pedirBorrarTrabajo(it); }}>
                <span className="lb-act__ic" style={{ color: 'var(--danger)' }}><Icon name="trash" size={16} /></span>
                <span className="lb-act__lbl">Borrar</span>
              </button>
            </span>
            )}
            </span>
            {/* El desglose de pagos, a lo ANCHO DE LA FILA.
                Vivía adentro de la columna de la descripción, que comparte el
                renglón con el precio y las acciones: en el teléfono eso son
                unos 200px, y ahí el formulario para corregir un pago se apilaba
                de a un campo por renglón. Como hijo directo de la fila ocupa
                todo el ancho y entra en dos. En escritorio se ve igual que
                antes —sigue siendo el renglón de abajo—, solo que ahora las
                líneas de cada pago tienen el ancho completo en vez del de una
                columna. */}
              {/* Los pagos de ESTE trabajo, colapsados en una línea.
                  Desplegados siempre ocupaban tres renglones por trabajo y la
                  lista se volvía larguísima; y con los datos reales ningún
                  trabajo tuvo más de 2 pagos, así que el detalle es el caso
                  raro. La línea dice lo que importa —cuántos y cuánto— y el
                  desglose está a un toque.

                  Va TAMBIÉN en el buscador del historial. Estaba excluido del
                  modo compacto, y eso tenía sentido cuando el desglose venía
                  desplegado y sumaba tres renglones por trabajo; colapsado es
                  una línea. Y es justo donde más se necesita: el historial es
                  la pantalla a la que se entra a revisar qué se cobró de un
                  trabajo viejo.

                  DOS desplegables HERMANOS, no uno adentro del otro. Anidados
                  no funcionaba: al borrar un pago los dos cambiaban de alto por
                  el mismo motivo y cada uno arrancaba su animación; el de
                  afuera, además, mide su contenido con un observador que le
                  avisa DESPUÉS del layout, así que iba siempre un frame atrás y
                  terminaba corrigiendo de un tirón. Se intentó coordinarlos
                  (que el de afuera acompañe sin animar) y funcionaba a veces:
                  depende de en qué orden el navegador entrega los avisos de los
                  dos observadores, y eso no está definido. Como hermanos el
                  problema no existe: el resumen cambia de texto pero no de
                  alto, así que borrar un pago del medio mueve UN solo bloque, y
                  cuando se va el último los dos se cierran a la vez —misma
                  duración, misma curva— y se lee como un solo movimiento. */}
              {(() => {
                const pagosW = pagosPorTrabajo.get(it._id) ?? [];
                const hay = pagosW.length > 0;
                return (
                  /* El envoltorio es el que la fila acomoda. Sin él, el elemento
                     que quedaba suelto en el flex era la caja del Desplegable
                     —el `.fr-wpays` de adentro no le llega—, así que no bajaba
                     de renglón y aplastaba la descripción contra el precio. */
                  <div className="fr-wpays-wrap">
                    <Desplegable abierto={hay}>
                      <div className="fr-wpays">
                        <button
                          type="button"
                          className="fr-wpays__sum"
                          onClick={() => togglePagos(it._id)}
                        >
                          <Icon name={pagosAbiertos[it._id] ? 'chevronDown' : 'chevronRight'} size={12} />
                          {pagosW.length}{' '}
                          {pagosW.length === 1 ? 'pago' : 'pagos'}
                          <b>{fmtMoney(pagosW.reduce((a, t) => a + t.amount, 0))}</b>
                        </button>
                      </div>
                    </Desplegable>
                    {/* Líneas simples, no la fila completa de un pago: acá
                        adentro el tag del trabajo (AJUSTE) es el mismo de la
                        fila que lo contiene, y las cajas de cada pago
                        multiplicaban el alto. Queda lo que cambia entre uno y
                        otro —fecha, medio, monto— y las acciones en chico. */}
                    <Desplegable abierto={hay && !!pagosAbiertos[it._id]}>
                      <div className="fr-wpays__det">
                        {pagosW.map(t => (
                          // El mismo desvanecido que la fila de la lista de
                          // Pagos: sin esto, al borrar no pasaba NADA durante
                          // los 120ms de la salida y después la línea
                          // desaparecía de golpe — la espera se leía como que el
                          // botón no había registrado.
                          <div
                            key={t._id}
                            ref={editPago === t._id ? epRef : undefined}
                            className={`fr-pline ${editPago === t._id ? 'fr-pline--edit' : ''} ${t._id === outPagoId ? 'lb-rowout' : ''} ${t._id === volviendo ? 'fr-row--vuelve' : ''}`}
                          >
                          {editPago === t._id ? formEdicionPago(t) : (
                          <>
                            <span className="mono fr-pline__d">{fmtDate(isoDateOf(t))}</span>
                            <span className="fr-pline__m">{methodLabel(t.paymentMethod)}</span>
                            <span className="mono fr-pline__a">{fmtMoney(t.amount)}</span>
                            <button className="fr-pline__b" title="Editar" onClick={() => { cerrarOperaciones(); startEditPago(t); }}>
                              <Icon name="edit" size={12} />
                            </button>
                            <button className="fr-pline__b fr-pline__b--del" title="Borrar" onClick={() => { cerrarOperaciones(); setDelPago(t); }}>
                              <Icon name="trash" size={12} />
                            </button>
                          </>
                          )}
                          </div>
                        ))}
                      </div>
                    </Desplegable>
                  </div>
                );
              })()}
          </>
        )}
      </div>
    );
  };

  /**
   * El formulario para corregir un pago: fecha, monto, medio.
   *
   * Vive suelto porque un pago se ve en DOS lugares —la fila de "sin trabajo
   * asignado" y la línea del desglose de un trabajo— y hasta ahora solo el
   * primero sabía dibujarlo. Desde el desglose, el lápiz ponía el pago en modo
   * edición y no pasaba nada visible: el formulario estaba en la otra fila, que
   * para un pago asignado a un trabajo ni siquiera se muestra.
   *
   * Se editan los tres campos, no solo el monto. La fecha la pone el cobro en
   * "hoy" sin preguntar, así que si el pago se registra al día siguiente esta
   * es la única forma de corregirla — dejándola afuera quedaba un dato
   * imposible de arreglar.
   */
  const formEdicionPago = (t: Transaction) => (
    <>
            <div style={{ width: 132 }}><DatePicker value={epDate} onChange={setEpDate} /></div>
            <div className="fr-monto">
              <span className="fr-monto__peso">$</span>
              <input className="input" inputMode="numeric" value={epAmount}
                onChange={e => setEpAmount(e.target.value.replace(/[^\d]/g, ''))}
                onFocus={() => setEpPanel(true)} onClick={() => setEpPanel(true)}
                onKeyDown={e => { if (e.key === 'Enter') { setEpPanel(false); saveEditPago(); } if (e.key === 'Escape') setEpPanel(false); }}
                style={{ width: '100%', height: 32, paddingLeft: 18 }} />
            </div>
            <div className="seg">
              {(['CASH', 'TRANSFER'] as const).map(m => (
                <button key={m} type="button" className={`seg__btn ${epMethod === m ? 'is-active' : ''}`} onClick={() => setEpMethod(m)}>{m === 'CASH' ? 'Efec.' : 'Transf.'}</button>
              ))}
            </div>
            {/* Los dos juntos en un grupo que no se parte: sueltos, cuando la
                línea no daba a lo ancho, "Cancelar" caía solo al renglón de
                abajo y parecía otra cosa. */}
            <span className="fp-edit__acts">
              <button className="btn btn--primary btn--sm" onClick={saveEditPago}><Icon name="check" size={13} /> Guardar</button>
              <button className="btn btn--ghost btn--sm" onClick={() => salirDeEdicionPago(t._id)}>Cancelar</button>
            </span>
                {/* El alto lo lleva el Desplegable, igual que en "Editar": suelto,
                    el panel aparecía de golpe y empujaba la lista de un salto. */}
                <div style={{ flex: '0 0 100%', width: '100%' }}>
                {/* El contenido va SIEMPRE montado: si se desmontara al cerrar,
                    los montos desaparecerían primero y el espacio se cerraría
                    después, vacío. Lo abre y lo cierra `abierto`. */}
                <Desplegable abierto={epPanel} clave="montos" animarAlMontar>
                  <div className="lb-editpanel">
                    <div style={popTitle}>Montos</div>
                    <div className="lb-chips" style={chipsWrap}>
                      {quickAmounts.map(v => (
                        <button key={v} type="button" className="lb-chip mono" style={{ fontWeight: 600 }}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => { setEpAmount(String(v)); setEpPanel(false); }}>
                          {fmtMoney(v)}
                        </button>
                      ))}
                      <button type="button" onMouseDown={e => e.preventDefault()}
                        onClick={() => setCustomAmountsOpen(true)} className="lb-chip lb-chip--add">
                        <Icon name="settings" size={12} /> Editar
                      </button>
                    </div>
                  </div>
                </Desplegable>
                </div>
    </>
  );

  // ---- fila de un pago ----
  const renderPagoRow = (t: Transaction, dense = false) => {
    const editing = editPago === t._id;
    const ph = photosByTx.get(t._id) ?? [];
    return (
      <div key={t._id} data-flip={t._id} ref={editing ? epRef : undefined} className={`fr-row fp-row ${editing ? 'fr-row--edit' : ''} ${t._id === flashPagoId ? 'lb-rowflash' : ''} ${t._id === outPagoId ? 'lb-rowout' : ''} ${t._id === volviendo ? 'fr-row--vuelve' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: dense ? '6px 12px' : '10px 12px', borderTop: '1px solid var(--border-subtle)' }}>
        {editing ? (
          <>
            {formEdicionPago(t)}
          </>
        ) : (
          <>
            {/* De qué trabajo fue el pago. Va primero: es lo que identifica la
                fila. Misma etiqueta que en la agenda. */}
            <span className="fp-tag">
              {/* La descripción se muestra SIEMPRE que exista, haya trabajo
                  vinculado o no. Estaba condicionada a que lo hubiera, y en el
                  consultorio real dos de cada tres pagos no lo tienen: ahí la
                  descripción es lo ÚNICO que dice qué fue —"Consulta 1°vez",
                  "op 47", "Extracción simple"—, escrita por el odontólogo, y la
                  fila la escondía justo cuando era el único dato. Quedaba
                  "30/07/26 · efectivo · $45.000" y a adivinar. */}
              {t.description && (
                <span className={`lb-sub ${t._id === flashPagoId ? 'lb-pop' : ''}`}>{t.description}</span>
              )}
              {/* Pago sin trabajo: se puede asociar a uno a mano. Es la forma de
                  recuperar los pagos viejos, que quedaron todos sin vincular. */}
              {!t.workId && trabajosCobrables.length > 0 && (
                <button
                  className="lb-link"
                  title="Asociar este pago a un trabajo"
                  onClick={e => { e.stopPropagation(); setLinkPago(t); }}
                >
                  <Icon name="link" size={11} /> vincular
                </button>
              )}
            </span>
            <span className="mono fp-amount">{fmtMoney(t.amount)}</span>
            {/* Corta el renglón en celular; en escritorio no existe. */}
            <i className="fp-br" aria-hidden="true" />
            <span className="mono fp-date">{fmtDate(isoDateOf(t))}</span>
            <span className="fp-method">{methodLabel(t.paymentMethod)}</span>
            <span className="fp-acts">
              <button className="btn btn--ghost btn--icon btn--sm" title="Editar" onClick={() => { cerrarOperaciones(); startEditPago(t); }}><Icon name="edit" size={14} /></button>
              <button className="btn btn--ghost btn--icon btn--sm" title="Borrar" onClick={() => { cerrarOperaciones(); setDelPago(t); }} style={{ color: 'var(--danger)' }}><Icon name="trash" size={14} /></button>
            </span>
            {ph.length > 0 && (
              <div className="fp-photos">
                {ph.map(({ photo }, idx) => (
                  <img key={photo._id} src={photo.thumbnailUrl || photo.url}
                    onClick={() => abrirZoom(ph, idx)}
                    title={`${photoTypeLabel(photo.type)} — foto vinculada`}
                    style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-subtle)', cursor: 'zoom-in', display: 'block' }} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // ============================ RENDER ============================
  // Banner-aviso: solo dice UNA cosa — cuánto se debe (ámbar) o "al día" (verde).
  // Por seguridad no exponemos realizado/pagado/por-hacer ni el saldo a favor
  // (pagó de más → se muestra igual que "al día", sin revelar el monto).
  const debe = falta > 0;
  // Tercer estado: pagó de más. Aparece cuando se cobra algo que todavía no
  // está hecho (una seña) o cuando se deshace un trabajo ya cobrado. Antes
  // `falta` negativo caía en "Al día — no debe nada" y la seña quedaba
  // invisible: la plata estaba en el saldo pero no se veía en ningún lado.
  const aFavor = falta < 0;

  return (
    <div
      className="content"
      style={{
        padding: 0,
        minHeight: 0,
        // Escritorio/tablet: alto fijo y sin scroll de pagina — las listas se
        // adaptan al espacio. Celular: las columnas se apilan, ahi si scrollea.
        overflow: stack ? 'auto' : 'hidden',
        display: stack ? 'block' : 'flex',
        flexDirection: 'column',
      }}
    >
      <SectionHeader
        kicker="Ficha clínica"
        title={<>Trabajos, pagos y <em>cuánto falta cobrar</em></>}
      />
      {/* El `key` remonta al cruzar el límite —esqueleto → datos, o de un
          paciente a otro— y con eso corre el fundido de `.ficha-in`. Escribiendo
          en el buscador la clave no cambia, así que el input no se remonta ni
          pierde el foco. */}
      <div
        key={cargandoFicha ? 'esqueleto' : (id ?? 'buscar')}
        className="ficha-in"
        style={{ maxWidth: 1080, margin: '0 auto', padding: isMobile ? 14 : 24, display: 'flex', flexDirection: 'column', gap: 14, width: '100%', flex: stack ? undefined : 1, minHeight: 0 }}
      >
        {cargandoFicha && <FichaEsqueleto isMobile={isMobile} />}

        {/* ---------- PACIENTE ---------- */}
        {!cargandoFicha && (
        <div className="card" style={{ overflow: 'visible' }}>
          <div style={{ padding: patient ? 0 : 16 }}>
            {!patient && <div style={label}>Paciente</div>}
            {patient ? (
              /* Encabezado del paciente: avatar + nombre + datos + acciones */
              /* Celular: tres renglones claros en vez de todo apretado contra
                 los botones — nombre y edad · datos · acciones. La edad sube al
                 título porque es una sola palabra y define al paciente junto
                 con el nombre; la localidad puede ser larga y va abajo. */
              <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 12 : 14, flexWrap: isMobile ? 'wrap' : 'nowrap', padding: isMobile ? '14px 16px' : '16px 20px' }}>
                <Avatar name={patient.name} lastName={patient.lastName} id={patient._id} size="lg" />
                <div style={{ minWidth: 0, flex: '1 1 0' }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 18 : 22, fontWeight: 600, margin: 0, lineHeight: 1.25 }}>
                    {patient.name} {patient.lastName}
                    {isMobile && patientAge(patient) != null && (
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 400, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                        {'  ·  '}{patientAge(patient)} años
                      </span>
                    )}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, rowGap: 2, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-tertiary)', marginTop: isMobile ? 3 : 2 }}>
                    {!isMobile && patientAge(patient) != null && <span>{patientAge(patient)} años</span>}
                    {patient.obraSocial && <span>{patient.obraSocial}</span>}
                    {patient.locality && <span>{patient.locality}</span>}
                    {patient.phone && (
                      <a
                        href={`https://wa.me/${toWhatsAppNumber(patient.phone)}`}
                        target="_blank" rel="noreferrer" title="Abrir WhatsApp"
                        // En celular arranca renglón propio: es lo único de acá
                        // que se toca, y merece su propio blanco.
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--success)', fontWeight: 600, textDecoration: 'none', ...(isMobile ? { flexBasis: '100%' } : {}) }}
                      >
                        <Icon name="whatsapp" size={14} /> {patient.phone}
                      </a>
                    )}
                  </div>
                </div>

                {/* Celular: renglón propio y bien espaciados (son destinos
                    distintos, no una botonera). Escritorio: a la derecha del
                    nombre, con texto. */}
                <div className="row" style={isMobile
                  ? { gap: 12, flexBasis: '100%', flexWrap: 'nowrap', marginTop: 4, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }
                  : { gap: 8, marginLeft: 'auto', flexWrap: 'nowrap', flexShrink: 0 }}>
                  <button className={`btn btn--secondary btn--sm ${isMobile ? 'btn--icon' : ''}`} title="Editar datos del paciente" onClick={() => openModal('newPatient', { patientId: patient._id })} style={{ ...(isMobile ? { width: 48, height: 38, paddingInline: 0 } : {}) }}>
                    <Icon name="edit" size={isMobile ? 16 : 14} /> {!isMobile && 'Editar'}
                  </button>
                  <button className={`btn btn--secondary btn--sm ${isMobile ? 'btn--icon' : ''}`} title="Galería de fotos" onClick={() => setGalleryOpen(true)} style={{ ...(isMobile ? { width: 48, height: 38, paddingInline: 0 } : {}) }}>
                    <Icon name="image" size={isMobile ? 16 : 14} /> {!isMobile && 'Galería'}
                  </button>
                  <button className={`btn btn--secondary btn--sm ${isMobile ? 'btn--icon' : ''}`} title="Odontograma" onClick={() => setOdoOpen(true)} style={{ ...(isMobile ? { width: 48, height: 38, paddingInline: 0 } : {}) }}>
                    <Icon name="tooth" size={isMobile ? 16 : 14} /> {!isMobile && 'Odontograma'}
                  </button>
                  <button className="btn btn--ghost btn--icon btn--sm" title="Cambiar paciente" onClick={() => navigate('/ficha-rapida')} style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    <Icon name="x" size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <div ref={searchRef} style={{ position: 'relative', maxWidth: 460, marginTop: 6 }}>
                <Icon name="search" size={15} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
                <input
                  className="input"
                  autoFocus
                  placeholder="Buscar o crear paciente…"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  style={{ width: '100%', paddingLeft: 34, height: 42 }}
                />
                {searchOpen && (
                  <div className="lb-menupop" style={{ transformOrigin: 'top left', position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 20, overflow: 'hidden' }}>
                    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                      {results.slice(0, 5).map(p => (
                        <div
                          key={p._id}
                          onMouseDown={e => { e.preventDefault(); pickPatient(p); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }}
                          onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseOut={e => (e.currentTarget.style.background = '')}
                        >
                          <Avatar name={p.name} lastName={p.lastName} id={p._id} size="sm" />
                          <span style={{ flex: 1, fontWeight: 500, fontSize: 13.5 }}>{p.name} {p.lastName}</span>
                          {p.obraSocial && <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{p.obraSocial}</span>}
                        </div>
                      ))}
                      {results.length === 0 && query.trim() && (
                        <div style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text-tertiary)' }}>Sin coincidencias.</div>
                      )}
                    </div>
                    <div
                      onMouseDown={e => { e.preventDefault(); setSearchOpen(false); openModal('newPatient'); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--brand-primary-600)', background: 'var(--brand-primary-50)' }}
                    >
                      <Icon name="plus" size={14} /> Crear paciente nuevo
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {/* `!cargandoFicha` además de `patient`: el paciente puede llegar antes que
            la lista de trabajos, y media ficha con la tabla vacía es peor que el
            esqueleto entero. */}
        {patient && !cargandoFicha && (
          <>
            {/* ---------- BANNER-AVISO (una sola cosa: deuda o "al día") ---------- */}
            {/* Por seguridad NO exponemos realizado/pagado/por-hacer ni el saldo a
                favor: solo el monto que falta cobrar (ámbar) o "al día" (verde). */}
            {/* Sello de estado de cuenta a todo ancho. En celular no va como
                tarjeta aparte sino pegado abajo de la del paciente: es el mismo
                bloque de "quién es y cómo viene", y ahorra un alto que en el
                teléfono se paga caro. */}
            <div
              key={debe ? 'debe' : aFavor ? 'afavor' : 'aldia'}
              className={`lb-estado ${debe ? 'lb-estado--debe' : ''} ${aFavor ? 'lb-estado--afavor' : ''} lb-estado--anexo`}
              style={{ animation: 'dialogPop 0.22s cubic-bezier(0.16,1,0.3,1)' }}
            >
              <Icon name={debe || aFavor ? 'cash' : 'check'} size={18} style={{ flexShrink: 0 }} />
              {debe ? (
                <span className="lb-estado__txt">
                  Falta cobrar
                  <b className="mono lb-estado__monto">{fmtMoney(falta)}</b>
                </span>
              ) : aFavor ? (
                <span className="lb-estado__txt">
                  Pagó por adelantado
                  <b className="mono lb-estado__monto">{fmtMoney(-falta)}</b>
                </span>
              ) : (
                <span>Al día — no debe nada</span>
              )}
            </div>


            {/* Una sola hoja a todo el ancho. Eran dos columnas —Trabajos |
                Pagos— y al unificarlas el grid seguía reservando la mitad
                derecha para nadie. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: stack ? undefined : 1, minHeight: 0 }}>

            {/* ---------- TRABAJOS ---------- */}
            <div
              className="card"
              style={{
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                minWidth: 0,
              }}
            >
              <div className="card__header" style={{ alignItems: 'center' }}>
                <div className="card__title">
                  Trabajos y pagos
                </div>
                {/* Los tres a la vista, no un interruptor que hay que apagar.
                    Con un solo chip había que descubrir que se destildaba para
                    volver a la lista completa — una acción que no se anuncia en
                    ningún lado. Además así el estado se lee sin tocar nada.
                    "Todos" va sin número a propósito: los otros dos cuentan
                    cosas que hay que hacer o cobrar, y ese número es una señal;
                    la cantidad total de trabajos no le pide nada a nadie. */}
                {(pendientes.length > 0 || porCobrar.length > 0) && (
                <span className="fr-filtros">
                  <button
                    type="button"
                    className={`chip-pill ${filtro === 'todos' ? 'is-active' : ''}`}
                    onClick={() => aplicarFiltro('todos')}
                    title="Ver todos los trabajos"
                  >
                    Todos
                  </button>
                  {pendientes.length > 0 && (
                    <button
                      type="button"
                      className={`chip-pill ${filtro === 'hacer' ? 'is-active' : ''}`}
                      onClick={() => aplicarFiltro('hacer')}
                      title="Ver solo lo que falta hacer"
                    >
                      Por hacer · {pendientes.length}
                    </button>
                  )}
                  {porCobrar.length > 0 && (
                    <button
                      type="button"
                      className={`chip-pill chip-pill--plata ${filtro === 'cobrar' ? 'is-active' : ''}`}
                      onClick={() => aplicarFiltro('cobrar')}
                      title="Ver solo lo que falta cobrar"
                    >
                      Falta cobrar · {porCobrar.length}
                    </button>
                  )}
                </span>
                )}
              </div>

              <div ref={workRef} className="lb-addrow" style={{ position: 'relative', display: 'block' }}>
                {/* El formulario imita la forma de una fila: descripción a la
                    izquierda ocupando lo que sobra, después el precio, y el
                    botón donde las filas tienen su acción de cobro. Así se lee
                    como "la fila que estás por crear" y el ancho deja de ser
                    arbitrario: es el mismo que el de la columna de abajo.
                    Un tope al medio dejaba un hueco a la derecha que no se
                    correspondía con nada. */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', paddingRight: isMobile ? 0 : 128 }}>
                  <span style={{ position: 'relative', flex: '1 1 110px', minWidth: 90 }}>
                    <input
                      className={`input ${campoLleno === 'trabajo' ? 'lb-landed' : ''}`}
                      placeholder="Trabajo (ej: Extracción 38)"
                      value={twDesc}
                      onFocus={() => setWorkPanel('trabajo')}
                      onClick={() => setWorkPanel('trabajo')}
                      onChange={e => setTwDesc(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { cerrarOperaciones(); addTrabajo(); } }}
                      style={{ width: '100%', height: 38, paddingRight: 36 }}
                    />
                    {twDesc && (
                      <button
                        type="button"
                        className="lb-clear"
                        title="Borrar"
                        aria-label="Borrar el trabajo"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setTwDesc(''); setWorkPanel('trabajo'); }}
                      >
                        <Icon name="x" size={13} />
                      </button>
                    )}
                  </span>
                  {/* Más ancho de lo que parece necesario: adentro entran el
                      "$" de la izquierda, la X de borrar a la derecha y un
                      número de seis cifras como 120.000. Con 100px el importe
                      quedaba apretado contra los dos. */}
                  <div style={{ position: 'relative', width: isMobile ? 104 : 140, flexShrink: 0 }}>
                    <span style={dollarPrefix}>$</span>
                    <input
                      className={`input ${campoLleno === 'monto' ? 'lb-landed' : ''}`}
                      inputMode="numeric" placeholder="0"
                      value={twAmount}
                      onFocus={() => setWorkPanel('monto')}
                      onClick={() => setWorkPanel('monto')}
                      onChange={e => setTwAmount(e.target.value.replace(/[^\d]/g, ''))}
                      onKeyDown={e => { if (e.key === 'Enter') { cerrarOperaciones(); addTrabajo(); } }}
                      style={{ width: '100%', height: 38, paddingLeft: 20, paddingRight: twAmount ? 32 : 10 }}
                    />
                    {twAmount && (
                      <button
                        type="button"
                        className="lb-clear"
                        title="Borrar"
                        aria-label="Borrar el monto"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setTwAmount(''); setWorkPanel('monto'); }}
                      >
                        <Icon name="x" size={13} />
                      </button>
                    )}
                  </div>
                  <button className={`btn btn--primary ${isMobile ? 'btn--icon' : ''}`} onClick={() => { cerrarOperaciones(); addTrabajo(); }} title="Agregar trabajo" style={{ height: 38, flexShrink: 0 }}>
                    {/* Sin spinner ni deshabilitado: la fila se dibuja al
                        instante y el campo queda vacío, así que no hay espera
                        que tapar ni doble envío que evitar. */}
                    <Icon name="plus" size={14} /> {!isMobile && 'Agregar'}
                  </button>
                </div>

                {/* popover de chips (contextual al campo enfocado) */}
                {workPanel === 'trabajo' && (
                  <div style={popover}>
                    <div style={popTitle}>Trabajos frecuentes</div>
                    <div className="lb-chips" style={chipsWrap}>
                      {treatments.map(t => (
                        <button key={t} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { addChip(t); setWorkPanel(null); }} className="lb-chip">{t}</button>
                      ))}
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setCustomTreatOpen(true)} className="lb-chip lb-chip--add">
                        <Icon name="settings" size={12} /> Editar
                      </button>
                    </div>
                  </div>
                )}
                {workPanel === 'monto' && (
                  <div style={popover}>
                    <div style={popTitle}>Montos</div>
                    <div className="lb-chips" style={chipsWrap}>
                      {quickAmounts.map(v => (
                        <button key={v} type="button" className="lb-chip mono" onMouseDown={e => e.preventDefault()} onClick={() => { setTwAmount(String(v)); setCampoLleno('monto'); setWorkPanel(null); }} style={{ fontWeight: 600 }}>{fmtMoney(v)}</button>
                      ))}
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setCustomAmountsOpen(true)} className="lb-chip lb-chip--add">
                        <Icon name="settings" size={12} /> Editar
                      </button>
                    </div>
                  </div>
                )}
              </div>


              {/* Lista: los pendientes van siempre; los hechos, los que entren.
                  En escritorio ocupa el alto disponible y no scrollea (scrollear
                  una lista corta marea); en celular mantiene el tope de siempre. */}
              <div
                ref={worksListRef}
                style={
                  // Apilado (celular/tablet) scrollea la PÁGINA: si además la
                  // lista tuviera su propio scroll habría dos barras peleándose
                  // bajo el mismo dedo. Solo en escritorio, donde la página no
                  // scrollea, la lista se queda con el scroll.
                  stack
                    ? { isolation: 'isolate' }
                    : {
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        isolation: 'isolate',
                        // Sin anclaje de scroll. Chrome, cuando el contenido de
                        // un contenedor con scroll se achica, corrige `scrollTop`
                        // para dejar quieto lo que estás mirando. Con una
                        // animación de alto eso pelea frame a frame: el
                        // desglose se cerraba bien pero la LISTA saltaba y
                        // después volvía, y parecía un rebote del desplegable.
                        overflowAnchor: 'none',
                      }
                }
              >
                {!hasWorks && pagosACuenta.length === 0 && (
                  <div style={emptyRow}>Todavía no cargaste trabajos. Agregá el primero arriba ↑</div>
                )}
                {hasWorks && filtro !== 'todos' && trabajosVisibles.length === 0 && (
                  <div style={{ ...emptyRow, padding: '14px' }}>
                    {filtro === 'hacer' ? 'Todo hecho 🎉' : 'No queda nada por cobrar ✓'}
                  </div>
                )}
                {/* Hechos y pendientes en la MISMA lista, del más nuevo al más
                    viejo. Antes estaban en dos secciones y marcar algo como
                    hecho lo mandaba de una a la otra: la fila desaparecía de
                    donde el Dr. la estaba mirando. Acá se queda en su lugar y
                    solo cambia de estado. */}
                {trabajosVisibles.map(it => renderWorkRow(it))}
                {/* Última fila: la puerta al historial completo.
                    Antes solo aparecía con 40 trabajos cargados, o sea nunca
                    —el paciente más cargado tiene 7—, así que el buscador con
                    filtros existía y no había forma de llegar. Ahora está
                    siempre que haya algo que buscar: la lista de arriba muestra
                    lo reciente y esto abre TODO, con fecha, texto y estado. */}
                {/* Los pagos que no están imputados a ningún trabajo NO se
                    listan arriba: eran lo primero que se veía al abrir la ficha
                    —antes que los trabajos— y en el consultorio real son dos de
                    cada tres pagos, así que la tabla abría con un bloque enorme
                    de cosas que el odontólogo ni recuerda.

                    Pero tampoco se esconden: cuentan en "Falta cobrar", y un
                    saldo que no se puede explicar con lo que hay en pantalla es
                    peor que una sección de más. Queda esta línea —solo si
                    existen— que dice cuántos son y cuánto suman, y los abre en
                    su propia lista. */}
                {filtro === 'todos' && pagosACuenta.length > 0 && (
                  <button
                    type="button"
                    className="fr-acuenta__ver"
                    onClick={() => {
                      qc.removeQueries({ queryKey: ['transactions', id, 'search'] });
                      setPagosModalOpen(true);
                    }}
                  >
                    <Icon name="cash" size={13} />
                    <span>
                      {pagosACuenta.length} {pagosACuenta.length === 1 ? 'pago' : 'pagos'} a cuenta
                      <b className="mono"> {fmtMoney(pagosACuenta.reduce((a, t) => a + t.amount, 0))}</b>
                    </span>
                    <span className="fr-acuenta__ver__q">— ya restados de lo que falta cobrar</span>
                    <Icon name="chevronRight" size={13} />
                  </button>
                )}
                {filtro === 'todos' && todosLosTrabajos.length > 0 && (
                  <button
                    /* Se TIRA la copia guardada antes de abrir, no se confía en
                       que esté vencida. Un trabajo cuyo pago se borró seguía
                       mostrándose "Pagado" acá adentro, y no hay margen para
                       eso en la pantalla donde se revisa la plata: el modal
                       arranca vacío, pide todo de nuevo y muestra lo que hay. */
                    onClick={() => {
                      qc.removeQueries({ queryKey: ['works', id, 'historial'] });
                      setHechosModalOpen(true);
                    }}
                    style={verTodos}
                  >
                    {todosLosTrabajos.length >= INLINE_MAX
                      ? 'Ver todo el historial'
                      : 'Buscar en el historial'} <Icon name="chevronRight" size={13} />
                  </button>
                )}
              </div>

              {/* Sin total al pie: el único número de plata que se muestra es
                  "Falta cobrar" (arriba). No exponemos el total del plan ni lo
                  pagado — es info sensible y el Dr. atiende con el paciente al
                  lado mirando la pantalla. */}
            </div>

            </div>
          </>
        )}
      </div>

      {/* Elegir a qué trabajo se imputa un pago viejo */}
      {linkPago && (
        <div className="modal-overlay" onClick={() => setLinkPago(null)}>
          <div className="modal-card" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-card__header">
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>
                  ¿De qué trabajo fue este pago?
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {fmtDate(isoDateOf(linkPago))} · {fmtMoney(linkPago.amount)}
                </div>
              </div>
              <button className="btn btn--ghost btn--icon" onClick={() => setLinkPago(null)}>
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="modal-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {trabajosCobrables.map(w => (
                <button
                  key={w._id}
                  className="lb-pick"
                  onClick={() => vincularPago(linkPago, w._id)}
                >
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    {w.description}
                    {w.status !== DONE && <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}> · por hacer</span>}
                  </span>
                  <span className="mono" style={{ fontSize: 12.5, color: 'var(--text-secondary)', flexShrink: 0 }}>
                    falta {fmtMoney((w.price ?? 0) - (w.paid ?? 0))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Destildar "Pagado": se borran los pagos imputados a ese trabajo. El
          mensaje dice cuantos y cuanta plata, para no borrar montos a ciegas. */}
      {(() => {
        const total = uncollect ? uncollect.pagos.reduce((a, pg) => a + pg.amount, 0) : 0;
        const n = uncollect?.pagos.length ?? 0;
        return (
          <ConfirmDialog
            open={!!uncollect}
            title="¿Marcar como NO cobrado?"
            message={
              uncollect
                ? `Se ${n === 1 ? 'borra el pago' : `borran los ${n} pagos`} de "${uncollect.work.description}" por ${fmtMoney(total)}. Vuelve a sumar a lo que falta cobrar.`
                : ''
            }
            confirmLabel={n === 1 ? 'Borrar el pago' : 'Borrar los pagos'}
            danger
            onConfirm={confirmDescobrar}
            onCancel={() => setUncollect(null)}
          />
        );
      })()}

      {/* ---------- confirmaciones de borrado ---------- */}
      {(() => {
        const cobrado = delItemPagos.reduce((a, pg) => a + pg.amount, 0);
        const n = delItemPagos.length;
        return (
          <ConfirmDialog
            open={!!delItem}
            title="¿Borrar este trabajo?"
            message={
              n > 0
                ? `Este trabajo tiene ${fmtMoney(cobrado)} cobrado${n === 1 ? '' : 's'}.`
                : 'Se saca del plan. No se puede deshacer.'
            }
            confirmLabel="Borrar"
            danger
            extra={
              n > 0 ? (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer', lineHeight: 1.45 }}>
                  <input
                    type="checkbox"
                    checked={alsoDelPagos}
                    onChange={e => setAlsoDelPagos(e.target.checked)}
                    style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16 }}
                  />
                  <span>
                    Borrar también {n === 1 ? 'el pago' : `los ${n} pagos`} de {fmtMoney(cobrado)}.
                    <br />
                    <span style={{ color: 'var(--text-tertiary)' }}>
                      Si no, la plata queda registrada como pago a cuenta y el paciente
                      va a figurar con {fmtMoney(cobrado)} a favor.
                    </span>
                  </span>
                </label>
              ) : undefined
            }
            onConfirm={confirmDelItem}
            onCancel={() => setDelItem(null)}
          />
        );
      })()}
      {(() => {
        const n = delPago ? (photosByTx.get(delPago._id)?.length ?? 0) : 0;
        return (
          <ConfirmDialog
            open={!!delPago}
            title="¿Borrar este pago?"
            message={n > 0 ? `Las ${n} foto${n === 1 ? '' : 's'} vinculada${n === 1 ? '' : 's'} quedan en la galería. Se recalcula lo que falta cobrar.` : 'No se puede deshacer. Se recalcula lo que falta cobrar.'}
            confirmLabel="Borrar"
            danger
            onConfirm={confirmDelPago}
            onCancel={() => setDelPago(null)}
          />
        );
      })()}

      <CustomAmountsModal open={customAmountsOpen} initial={quickAmounts} onClose={() => setCustomAmountsOpen(false)} />
      <CustomTreatmentsModal open={customTreatOpen} initial={treatments} onClose={() => setCustomTreatOpen(false)} />

      {/* Modal del odontograma */}
      {odoOpen && patient && (
        <div onClick={() => setOdoOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(60,52,34,0.42)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: isMobile ? 8 : 24, overflowY: 'auto', animation: 'overlayFade 0.12s ease-out' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 1100, margin: 'auto', animation: 'dialogPop 0.16s cubic-bezier(0.16,1,0.3,1)' }}>
            <OdontogramCard patientId={patient._id} patientName={`${patient.name} ${patient.lastName}`} onClose={() => setOdoOpen(false)} />
          </div>
        </div>
      )}

      {/* Modal de galería */}
      {galleryOpen && patient && (
        <div onClick={() => setGalleryOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(60,52,34,0.42)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: isMobile ? 8 : 24, overflowY: 'auto', animation: 'overlayFade 0.12s ease-out' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 1100, margin: 'auto', background: 'var(--bg-surface)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', animation: 'dialogPop 0.16s cubic-bezier(0.16,1,0.3,1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
                <Icon name="image" size={17} style={{ color: '#7C3AED' }} />
                Galería · {patient.name} {patient.lastName}
              </div>
              <button className="btn btn--secondary btn--sm" onClick={() => setGalleryOpen(false)}><Icon name="x" size={13} /> Cerrar</button>
            </div>
            <div style={{ padding: isMobile ? 12 : 18 }}>
              <GalleryContainer patientId={patient._id} embedded />
            </div>
          </div>
        </div>
      )}

      {zoom && (
        <VisorFotos
          fotos={zoom.fotos}
          indice={zoom.i}
          onCerrar={() => setZoom(null)}
          etiquetaCategoria={photoTypeLabel}
          compacto={isMobile}
        />
      )}

      {/* Historial completo de trabajos hechos — búsqueda + paginación server-side */}
      {hechosModalOpen && (
        <ListModal
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Historial de trabajos{hechosFilterActive ? ` (${hechosSearch.length})` : ''}
              {hechosSearching && hechosSearch.length > 0 && <TitleSpinner />}
            </span>
          }
          icon="check"
          accent="var(--success)"
          isMobile={isMobile}
          onClose={() => {
            setHechosModalOpen(false);
            resetHechosFilter();
            setHechosEstado('todos');
          }}
          filterSlot={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* El estado va PRIMERO y con las mismas palabras que los chips de
                  la lista: es el corte más grueso —de qué estamos hablando— y
                  recién después se afina con fecha o texto. Dos vocabularios
                  para lo mismo obligarían a traducir mentalmente. */}
              <span className="fr-filtros">
                {([
                  ['todos', 'Todos'],
                  ['hechos', 'Hechos'],
                  ['hacer', 'Por hacer'],
                  ['cobrar', 'Falta cobrar'],
                ] as const).map(([v, txt]) => (
                  <button
                    key={v}
                    type="button"
                    className={`chip-pill ${v === 'cobrar' ? 'chip-pill--plata' : ''} ${hechosEstado === v ? 'is-active' : ''}`}
                    onClick={() => { setHechosEstado(v); setHechosLimit(PAGE); }}
                  >
                    {txt}
                  </button>
                ))}
              </span>
              <div className="lb-filters">
                {/* DatePicker propio en vez de <input type="date">: el nativo
                    muestra "mm/dd/yyyy" según el idioma del navegador, que no se
                    entiende y encima queda en formato yanqui. */}
                <div className="lb-filters__date" style={filterDate}>
                  <span style={filterLabel}>Fecha de inicio</span>
                  <DatePicker
                    value={hechosFrom}
                    onChange={v => setHechosDate('from', v)}
                    placeholder="Desde cuándo"
                  />
                </div>
                <div className="lb-filters__date" style={filterDate}>
                  <span style={filterLabel}>Fecha de fin</span>
                  <DatePicker
                    value={hechosTo}
                    onChange={v => setHechosDate('to', v)}
                    placeholder="Hasta cuándo"
                  />
                </div>
                <div ref={hechosSearchRef} className="lb-filters__search" style={{ position: 'relative', flex: '1 1 200px', minWidth: 140 }}>
                  <input
                    className="input"
                    placeholder="Buscar trabajo o diente…"
                    value={hechosDraft}
                    onFocus={() => setHechosPanelOpen(true)}
                    onClick={() => setHechosPanelOpen(true)}
                    onChange={e => setHechosDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        commitHechosFilter();
                        setHechosPanelOpen(false);
                      }
                      if (e.key === 'Escape') setHechosPanelOpen(false);
                    }}
                    style={{ width: '100%', height: 38 }}
                  />
                  {hechosPanelOpen && (
                    <div style={{ ...popover, left: 0, right: 0 }}>
                      <div style={popTitle}>Trabajos frecuentes</div>
                      <div className="lb-chips" style={chipsWrap}>
                        {treatments.map(t => (
                          <button
                            key={t}
                            type="button"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                              commitHechosFilter(t);
                              setHechosPanelOpen(false);
                            }}
                            className="lb-chip"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  className="btn btn--primary btn--icon"
                  onClick={() => commitHechosFilter()}
                  title="Buscar"
                  style={{ ...filterBtn, width: 38 }}
                >
                  <Icon name="search" size={16} />
                </button>
                {hechosFilterActive && (
                  <button
                    className="btn btn--secondary btn--icon"
                    onClick={resetHechosFilter}
                    title="Limpiar filtros"
                    style={{ ...filterBtn, width: 38 }}
                  >
                    <Icon name="x" size={16} />
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon name="undo" size={12} />
                Destildá el ✓ para devolver un trabajo al plan de tratamiento.
              </div>
            </div>
          }
        >
          {hechosSearch.length === 0 ? (
            hechosSearching ? (
              <ListSpinner />
            ) : (
              <div style={emptyRow}>
                {hechosFilterActive
                  ? 'Sin coincidencias.'
                  : 'Sin trabajos hechos todavía.'}
              </div>
            )
          ) : (
            <>
              {hechosSearch.map(it => renderWorkRow(it, true))}
              {hechosHasMore && (
                <button onClick={() => setHechosLimit(l => l + PAGE)} style={verTodos}>
                  Cargar más
                </button>
              )}
            </>
          )}
        </ListModal>
      )}

      {/* Historial completo de pagos — Etapa 2: filtro de fechas + búsqueda backend */}
      {pagosModalOpen && (
        <ListModal
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Pagos{pagoFilterActive ? ` (${pagosVisible.length})` : ` (${pagos.length})`}
              {pagosSearching && pagosVisible.length > 0 && <TitleSpinner />}
            </span>
          }
          icon="cash"
          accent="var(--success)"
          isMobile={isMobile}
          onClose={() => {
            setPagosModalOpen(false);
            resetPagoFilter();
          }}
          filterSlot={
            <div className="lb-filters">
              <div className="lb-filters__date" style={filterDate}>
                <span style={filterLabel}>Fecha de inicio</span>
                <DatePicker
                  value={pagoFilterDraft.from}
                  onChange={v => setPagoFilterDraft(f => ({ ...f, from: v }))}
                  placeholder="Desde cuándo"
                />
              </div>
              <div className="lb-filters__date" style={filterDate}>
                <span style={filterLabel}>Fecha de fin</span>
                <DatePicker
                  value={pagoFilterDraft.to}
                  onChange={v => setPagoFilterDraft(f => ({ ...f, to: v }))}
                  placeholder="Hasta cuándo"
                />
              </div>
              <input
                className="input lb-filters__search"
                placeholder="Monto o método…"
                value={pagoFilterDraft.q}
                onChange={e => setPagoFilterDraft(f => ({ ...f, q: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && commitPagoFilter()}
                style={{ flex: '1 1 200px', minWidth: 140, height: 38 }}
              />
              <button
                className="btn btn--primary btn--icon"
                onClick={commitPagoFilter}
                title="Buscar"
                style={{ ...filterBtn, width: 38 }}
              >
                <Icon name="search" size={16} />
              </button>
              {pagoFilterActive && (
                <button
                  className="btn btn--secondary btn--icon"
                  onClick={resetPagoFilter}
                  title="Limpiar filtros"
                  style={{ ...filterBtn, width: 38 }}
                >
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>
          }
        >
          {pagosVisible.length === 0 ? (
            pagosSearching ? (
              <ListSpinner />
            ) : (
              <div style={emptyRow}>
                {pagoFilterActive
                  ? 'Sin pagos en ese filtro.'
                  : 'Sin pagos todavía.'}
              </div>
            )
          ) : (
            <>
              {pagosVisible.map(t => renderPagoRow(t, true))}
              {pagosHasMore && (
                <button onClick={() => setPagoLimit(l => l + PAGE)} style={verTodos}>
                  Cargar más
                </button>
              )}
            </>
          )}
        </ListModal>
      )}
    </div>
  );
}

// Modal genérico de "historial completo": header con título + botón cerrar,
// buscador sticky y cuerpo scrollable. z-index 990 → queda por DEBAJO del
// ConfirmDialog (1000) para que el confirm de borrado se vea por encima.
function ListModal({
  title,
  icon,
  accent,
  search,
  onSearch,
  searchPlaceholder,
  filterSlot,
  isMobile,
  onClose,
  children,
}: {
  title: React.ReactNode;
  icon: React.ComponentProps<typeof Icon>['name'];
  accent: string;
  // Búsqueda client-side incorporada (Hechos). Si se pasa `filterSlot`, se usa
  // ese en su lugar (Pagos: filtro de fechas + búsqueda backend).
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  filterSlot?: React.ReactNode;
  isMobile: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(60,52,34,0.42)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 990,
        padding: isMobile ? 8 : 24,
        overflowY: 'auto',
        animation: 'overlayFade 0.12s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          margin: 'auto',
          background: 'var(--bg-surface)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          animation: 'dialogPop 0.16s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
            <Icon name={icon} size={17} style={{ color: accent }} />
            {title}
          </div>
          <button className="btn btn--secondary btn--sm" onClick={onClose}>
            <Icon name="x" size={13} /> Cerrar
          </button>
        </div>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          {filterSlot ?? (
            <div style={{ position: 'relative' }}>
              <Icon
                name="search"
                size={15}
                style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-tertiary)', pointerEvents: 'none' }}
              />
              <input
                className="input"
                autoFocus
                placeholder={searchPlaceholder}
                value={search ?? ''}
                onChange={e => onSearch?.(e.target.value)}
                style={{ width: '100%', height: 40, paddingLeft: 34 }}
              />
            </div>
          )}
        </div>
        {/* Altura FIJA (no maxHeight): así el modal no cambia de tamaño ni se
            re-centra cuando cambia la cantidad de filas o mientras busca. */}
        <div style={{ height: 'min(60vh, 440px)', overflowY: 'auto', padding: '4px 8px 10px' }}>{children}</div>
      </div>
    </div>
  );
}


// Spinner centrado para el cuerpo de un ListModal mientras se busca.
function ListSpinner({ label = 'Buscando…' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '48px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', border: '2.5px solid var(--border-subtle)', borderTopColor: 'var(--brand-primary)', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
      {label}
    </div>
  );
}

// Spinner chico para el título del modal (feedback cuando ya hay filas y se
// está refetcheando con keepPreviousData).
function TitleSpinner() {
  return (
    <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid var(--border-subtle)', borderTopColor: 'var(--brand-primary)', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
  );
}

// ===========================================================
// MODAL: montos rápidos personalizados por consultorio
// ===========================================================
function CustomAmountsModal({ open, initial, onClose }: { open: boolean; initial: number[]; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const [list, setList] = useState<number[]>(initial);
  const [nuevo, setNuevo] = useState('');

  // Al abrir, re-sembrar la lista con los montos vigentes. Se ajusta en render
  // (patrón recomendado) en vez de en un effect para no encadenar renders.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setList(initial);
  }

  const saveMut = useMutation({
    mutationFn: (amounts: number[]) => clinicsApi.updateSettings({ quickAmounts: amounts }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-settings'] }),
    onError: () => showToast('No se pudo guardar', 'error'),
  });

  const commit = (items: number[], msg: string) => {
    setList(items);
    saveMut.mutate(items, { onSuccess: () => showToast(msg) });
  };

  if (!open) return null;

  const add = () => {
    const v = Number(nuevo);
    setNuevo('');
    if (!v || v <= 0 || list.includes(v)) return;
    commit([...list, v].sort((a, b) => a - b), `${fmtMoney(v)} agregado ✓`);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(60,52,34,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, animation: 'overlayFade 0.12s ease-out' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 14, width: '100%', maxWidth: 380, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', animation: 'dialogPop 0.16s cubic-bezier(0.16,1,0.3,1)' }}>
        <div style={{ padding: '18px 20px 6px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Personalizar montos</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 3 }}>Se guardan solos, para todo el equipo.</div>
          </div>
          <button className="btn btn--secondary btn--sm" onClick={onClose}><Icon name="x" size={13} /> Cerrar</button>
        </div>

        <div style={{ padding: '10px 20px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
          {list.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', padding: '6px 0' }}>Sin montos. Agregá abajo.</div>}
          {list.map(v => (
            <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
              <span className="mono" style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{fmtMoney(v)}</span>
              <button className="btn btn--ghost btn--icon btn--sm" title="Quitar" onClick={() => commit(list.filter(x => x !== v), `${fmtMoney(v)} quitado`)} style={{ color: 'var(--danger)' }}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ padding: '8px 20px 20px', display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 11, top: 9, color: 'var(--text-tertiary)', fontSize: 13 }}>$</span>
            <input className="input" inputMode="numeric" placeholder="Nuevo monto" value={nuevo} onChange={e => setNuevo(e.target.value.replace(/[^\d]/g, ''))} onKeyDown={e => e.key === 'Enter' && add()} style={{ width: '100%', height: 38, paddingLeft: 22 }} />
          </div>
          <button className="btn btn--primary" onClick={add} style={{ height: 38 }}><Icon name="plus" size={14} /> Agregar</button>
        </div>
      </div>
    </div>
  );
}

const label: CSSProperties = {
  fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase',
  letterSpacing: '0.05em', fontWeight: 600, marginBottom: 6,
};
/* Los chips de atajo usan la clase `.lb-chip` del CSS global (compartida con la
   Agenda), no un estilo local — antes cada pantalla tenía el suyo y quedaban
   distintos. */
const emptyRow: CSSProperties = {
  padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13,
};
const dollarPrefix: CSSProperties = {
  position: 'absolute', left: 10, top: 10, color: 'var(--text-tertiary)',
  fontSize: 13, pointerEvents: 'none',
};
const verTodos: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%',
  padding: '10px 12px', borderTop: '1px solid var(--border-subtle)', background: 'transparent',
  fontSize: 12.5, fontWeight: 600, color: 'var(--brand-primary-600)', cursor: 'pointer',
};
// Fila de filtros de los modales (Hechos / Pagos): una sola línea, sin wrap. El
// campo de texto absorbe el sobrante (flex + minWidth:0) y el botón no se parte.
/* El layout de la fila de filtros vive en la clase `.lb-filters` del CSS,
   porque necesita media query para reacomodarse en celular. */
const filterBtn: CSSProperties = {
  height: 38, flexShrink: 0, whiteSpace: 'nowrap',
};
const filterField: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0,
};
// Los campos de fecha usan el DatePicker propio, cuyo trigger es width:100% —
// por eso el contenedor necesita un ancho propio.
const filterDate: CSSProperties = { ...filterField, width: 152 };
const filterLabel: CSSProperties = {
  fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-label)',
};
const popover: CSSProperties = {
  position: 'absolute', top: 'calc(100% - 4px)', left: 12, right: 12,
  background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
  borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 30, padding: 12,
  // Aparece creciendo desde el campo, como el menú de acciones. Al ser un
  // objeto compartido, alcanza con ponerlo acá para todos los paneles.
  transformOrigin: 'top left', animation: 'menuPop 0.14s cubic-bezier(0.16,1,0.3,1)',
};
const popTitle: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
  color: 'var(--text-tertiary)', marginBottom: 6,
};
const chipsWrap: CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: 6,
};
