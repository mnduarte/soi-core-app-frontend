import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useFlip } from '../hooks/useFlip';
import { useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { patientsApi, type Patient } from '../api/patients';
import { transactionsApi, type Transaction, type PaymentMethod } from '../api/transactions';
import { worksApi, type Work, type WorkStatus, type CreateWorkInput } from '../api/works';
import { clinicsApi } from '../api/clinics';
import { useUIStore } from '../store/ui.store';
import { useIsMobile } from '../hooks/useIsMobile';
import { Icon } from '../components/common/Icon';
import { Avatar } from '../components/common/Avatar';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { OdontogramCard } from '../components/patient/OdontogramCard';
import { GalleryContainer } from '../components/gallery/GalleryContainer';
import { CustomTreatmentsModal } from '../components/common/CustomTreatmentsModal';
import { SectionHeader } from '../components/common/SectionHeader';
import { DatePicker } from '../components/common/DatePicker';
import { Select } from '../components/common/Select';
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

export default function FichaRapidaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile(760);
  const showToast = useUIStore(s => s.showToast);
  const openModal = useUIStore(s => s.openModal);

  // ---- paciente seleccionado ----
  const { data: patient } = useQuery({
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
  const CAP = 5;
  // Se traen mas de los que se van a ver: la cantidad visible depende del alto
  // disponible en pantalla, asi que conviene tenerlos ya en memoria.
  const HECHOS_FETCH = 25;
  const PAGE = 20;

  // ---- datos: trabajos (works) + pagos (transactions) ----
  // Pendientes = plan de tratamiento (pocos, se traen enteros). Hechos recientes
  // = solo los últimos CAP inline; el historial completo se busca/pagina en el
  // modal. Resumen = Σ hechos + contadores para la barra Falta.
  const { data: pendientes = [] } = useQuery({
    queryKey: ['works', id, 'pending'],
    queryFn: () => worksApi.findAll(id!, { status: 'pending' }),
    enabled: Boolean(id),
  });
  const { data: hechosRecent = [] } = useQuery({
    queryKey: ['works', id, 'done', 'recent'],
    queryFn: () => worksApi.findAll(id!, { status: 'done', limit: HECHOS_FETCH }),
    enabled: Boolean(id),
  });
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
  const [twDone, setTwDone] = useState(false);
  const [twBusy, setTwBusy] = useState(false);
  const addItemMut = useMutation({
    mutationFn: (dto: { description: string; price?: number; status?: WorkStatus }) =>
      worksApi.create({ patientId: id!, ...dto }),
  });
  const addTrabajo = async () => {
    if (!patient || twBusy) return;
    const d = twDesc.trim();
    if (!d) { showToast('Escribí el trabajo', 'error'); return; }
    setTwBusy(true);
    setWorkPanel(null);
    try {
      const creado = await addItemMut.mutateAsync({ description: d, price: num(twAmount), status: twDone ? DONE : PENDING });
      const eraHecho = twDone, precio = num(twAmount);
      setTwDesc(''); setTwAmount(''); setTwDone(false);
      invalidateWorks();
      // Si lo cargó ya hecho y tiene precio, preguntamos por el cobro igual que
      // al tildar el circulito. Este es el camino que más usa (la mayoría de los
      // trabajos hechos se cargan directamente con "Ya lo hice"), así que sin
      // esto la pregunta casi nunca aparecería.
      if (creado?._id) setNewWorkId(creado._id);
      if (eraHecho && precio > 0) {
        setAskCobro(prev => [...prev, { id: creado._id, unsaved: false }]);
      } else {
        showToast(eraHecho ? '¡Hecho! ✓ Trabajo agregado' : 'Trabajo agregado', 'success');
      }
    } catch {
      showToast('No se pudo agregar', 'error');
    } finally { setTwBusy(false); }
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
    try {
      if (!yaGuardado) {
        // La red viaja EN PARALELO con la animación. Antes esperábamos la
        // respuesta con la fila ya desvanecida: se veía como un tirón porque el
        // movimiento quedaba a merced de la latencia, no del navegador.
        const req = updateItemMut
          .mutateAsync({ workId: it._id, dto: { status: DONE } })
          .then(() => true, () => false);

        // Si "Hechos" está abierto, la fila no desaparece: FLIP la hace viajar
        // hasta su lugar nuevo. Si está cerrado, sí se va, y ahí sí va el fade.
        if (!showDone) { setOutWorkId(it._id); await new Promise(r => setTimeout(r, ROW_OUT_MS)); }
        const movido: Work = { ...it, status: DONE, completedAt: new Date().toISOString() };
        qc.setQueryData<Work[]>(['works', id, 'pending'], (old = []) => old.filter(w => w._id !== it._id));
        qc.setQueryData<Work[]>(['works', id, 'done', 'recent'], (old = []) => [movido, ...old]);
        setOutWorkId(null);
        if (showDone) { setFlashWorkId(it._id); setTimeout(() => setFlashWorkId(null), 900); }
        else setNewWorkId(it._id);

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

    // DESMARCAR: esto sí es un cambio directo, no hay nada que preguntar.
    // El destino (pendientes) siempre está a la vista, así que la fila sube
    // sola con FLIP: no hace falta desvanecerla ni esperar a la red.
    const req = updateItemMut
      .mutateAsync({ workId: it._id, dto: { status: PENDING } })
      .then(() => true, () => false);
    const movido: Work = { ...it, status: PENDING, completedAt: undefined };
    qc.setQueryData<Work[]>(['works', id, 'pending'], (old = []) => [movido, ...old]);
    qc.setQueryData<Work[]>(['works', id, 'done', 'recent'], (old = []) => old.filter(w => w._id !== it._id));
    setFlashWorkId(it._id); setTimeout(() => setFlashWorkId(null), 900);
    if (await req) { invalidateWorks(); showToast('Volvió a pendiente', 'success'); }
    else { showToast('No se pudo actualizar', 'error'); invalidateWorks(); }
  };
  const startEditItem = (it: Work) => {
    setEditItem(it._id);
    setEditPanel(null);
    setEiDesc(it.description);
    setEiAmount(it.price ? String(it.price) : '');
  };
  const saveEditItem = async () => {
    if (!editItem) return;
    const d = eiDesc.trim();
    if (!d) { showToast('El trabajo no puede quedar vacío', 'error'); return; }
    try {
      await updateItemMut.mutateAsync({ workId: editItem, dto: { description: d, price: num(eiAmount) } });
      setEditItem(null);
      setEditPanel(null);
      invalidateWorks();
      showToast('Trabajo actualizado', 'success');
    } catch { showToast('No se pudo guardar', 'error'); }
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
    setDelItemPagos([]);
    setDelItem(it);
    if ((it.paid ?? 0) > 0) {
      try { setDelItemPagos(await transactionsApi.byWork(id!, it._id)); } catch { /* el confirm igual sirve */ }
    }
  };

  const confirmDelItem = async () => {
    if (!delItem) return;
    const it = delItem, pagos = delItemPagos, borrarPagos = alsoDelPagos;
    setDelItem(null);
    try {
      await removeItemMut.mutateAsync(it._id);
      if (borrarPagos) { for (const pg of pagos) await transactionsApi.remove(pg._id); }
      invalidateWorks(); invalidateTx();
      showToast(
        borrarPagos && pagos.length
          ? `Trabajo y ${pagos.length === 1 ? 'su pago' : `sus ${pagos.length} pagos`} borrados`
          : 'Trabajo borrado',
        'success',
      );
    } catch { showToast('No se pudo borrar', 'error'); }
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

  const [askPanel, setAskPanel] = useState(false); // popover de montos rápidos
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
          paymentMethod: 'CASH',
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
        paymentMethod: 'CASH',
        date: new Date(`${todayYMD()}T12:00:00`).toISOString(),
      });
      invalidateWorks(); invalidateTx();
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
    try {
      for (const pg of pagos) await transactionsApi.remove(pg._id);
      invalidateWorks(); invalidateTx();
      showToast(`Se borraron los pagos de ${work.description}`, 'success');
    } catch { showToast('No se pudo deshacer', 'error'); }
  };

  // ---- alta de pago ----
  const [pgAmount, setPgAmount] = useState('');
  const [pgMethod, setPgMethod] = useState<PaymentMethod>('CASH');
  const [pgDate, setPgDate] = useState(todayYMD());
  // Trabajo al que se imputa el pago cargado desde esta columna ('' = a cuenta).
  // Existe para el paciente que pasa solo a dejar una cuota: no hay ningún
  // trabajo que marcar hecho, así que la franja "¿te lo pagó?" nunca aparece.
  const [pgWorkId, setPgWorkId] = useState('');
  const [pgBusy, setPgBusy] = useState(false);
  // Pago recién creado: su fila entra animada (crece desde arriba empujando al
  // resto) y queda resaltada un instante. Sirve de confirmación visual de que
  // el pago entró — sobre todo cuando se carga desde la fila del trabajo, que
  // está en la otra columna y es fácil no registrar el cambio.
  // Fila que se está yendo. React saca el elemento del DOM apenas cambian los
  // datos, así que para poder animar la salida primero marcamos la fila, la
  // dejamos encogerse, y recién después pegamos el borrado al servidor.
  const [outPagoId, setOutPagoId] = useState<string | null>(null);
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
  const addPago = async () => {
    if (!patient || pgBusy) return;
    const amt = num(pgAmount);
    if (amt <= 0) { showToast('Ingresá un monto', 'error'); return; }
    setPgBusy(true);
    setPagoPanel(false);
    try {
      await addPagoMut.mutateAsync({
        patientId: patient._id,
        type: 'PAYMENT',
        amount: amt,
        workId: pgWorkId || undefined,
        description: pgWorkId
          ? trabajosCobrables.find(w => w._id === pgWorkId)?.description
          : undefined,
        paymentMethod: pgMethod,
        date: new Date(`${pgDate}T12:00:00`).toISOString(),
      });
      setPgAmount(''); setPgDate(todayYMD()); setPgWorkId('');
      invalidateWorks();
      invalidateTx();
      showToast(`¡Pago de ${fmtMoney(amt)} registrado!`, 'success');
    } catch {
      showToast('No se pudo registrar', 'error');
    } finally { setPgBusy(false); }
  };

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
  const updatePagoMut = useMutation({
    mutationFn: (v: { id: string; dto: Parameters<typeof transactionsApi.updateMovement>[1] }) =>
      transactionsApi.updateMovement(v.id, v.dto),
  });
  const startEditPago = (t: Transaction) => {
    setEditPago(t._id);
    setEpAmount(String(t.amount));
    setEpMethod((t.paymentMethod as PaymentMethod) || 'CASH');
    setEpDate(isoDateOf(t).slice(0, 10));
  };
  const saveEditPago = async () => {
    if (!editPago) return;
    const pagoEditado = pagos.find(p => p._id === editPago);
    const amt = num(epAmount);
    if (amt <= 0) { showToast('Ingresá un monto', 'error'); return; }
    try {
      await updatePagoMut.mutateAsync({
        id: editPago,
        dto: { amount: amt, paymentMethod: epMethod, date: new Date(`${epDate}T12:00:00`).toISOString() },
      });
      setEditPago(null);
      invalidateTx();
      if (pagoEditado?.workId) invalidateWorks();
      showToast('Pago actualizado', 'success');
    } catch { showToast('No se pudo guardar', 'error'); }
  };
  const delPagoMut = useMutation({ mutationFn: (txId: string) => transactionsApi.remove(txId) });
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
    const req = delPagoMut.mutateAsync(t._id).then(() => true, () => false);
    await new Promise(r => setTimeout(r, ROW_OUT_MS));
    qc.setQueryData<Transaction[]>(['transactions', id], (old = []) =>
      old.filter(x => x._id !== t._id),
    );
    setOutPagoId(null);

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
  const { data: hechosSearchRaw = [], isFetching: hechosSearching } = useQuery({
    queryKey: ['works', id, 'done', 'search', hechosFilter, hechosFrom, hechosTo, hechosLimit],
    queryFn: () =>
      worksApi.findAll(id!, {
        status: 'done',
        q: hechosFilter || undefined,
        from: hechosFrom || undefined,
        to: hechosTo || undefined,
        limit: hechosLimit,
      }),
    enabled: hechosModalOpen && !!id,
    // Mantener las filas previas durante un refetch (cambio de fecha/búsqueda):
    // si no, el cuerpo colapsa a "Buscando…" y el modal se achica y re-centra,
    // pareciendo que se cierra y reabre.
    placeholderData: keepPreviousData,
  });
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
  const [zoomPhoto, setZoomPhoto] = useState<
    { url: string; category?: string; title?: string; description?: string } | null
  >(null);

  const addChip = (t: string) => setTwDesc(p => (p.trim() ? `${p.trim()} ${t}` : t));

  // Layout: dos columnas (Trabajos | Pagos) en pantallas anchas; apiladas si no.
  const stack = useIsMobile(1000);
  // En celular las dos columnas se reemplazan por pestañas segmentadas
  // (Trabajos · N | Pagos · N); en tablet/desktop se muestran las dos hojas.
  const [mobileTab, setMobileTab] = useState<'trabajos' | 'pagos'>('trabajos');

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
  // Desplegado por defecto: con el cobro desde la fila, los trabajos recién
  // hechos son justo los que hay que cobrar — tenerlos escondidos obligaba a
  // desplegar cada vez. Se muestran los CAP más recientes + "Ver todos".
  const [showDone, setShowDone] = useState(true);

  // Cuantas filas de "hechos" entran sin que la lista scrollee. El objetivo es
  // llenar el alto de la pantalla: los pendientes tienen prioridad (van todos) y
  // los hechos ocupan lo que sobra. Se recalcula al cambiar el tamano de la
  // ventana. En celular no se mide: ahi la pagina scrollea de arriba a abajo.
  const [flashWorkId, setFlashWorkId] = useState<string | null>(null);
  const [flashPagoId, setFlashPagoId] = useState<string | null>(null);
  const worksListRef = useRef<HTMLDivElement>(null);
  useFlip(worksListRef);
  const [fitHechos, setFitHechos] = useState(CAP);
  useLayoutEffect(() => {
    if (stack) { setFitHechos(CAP); return; }
    const el = worksListRef.current;
    if (!el) return;
    const ROW = 46;     // alto tipico de una fila
    const HEADER = 40;  // franja "Hechos (N)"
    const FOOTER = 44;  // link "Ver los N trabajos hechos"
    const calc = () => {
      const libre = el.clientHeight - pendientes.length * ROW - HEADER - FOOTER;
      setFitHechos(Math.max(1, Math.floor(libre / ROW)));
    };
    calc();
    // Con debounce a propósito: al marcar un trabajo aparece la franja
    // "¿te lo pagó?", eso cambia el alto de la lista y dispara el observer.
    // Sin la espera, el recálculo agregaba o quitaba filas EN MEDIO de la
    // animación — la lista se re-armaba mientras la fila se encogía y se veía
    // a los saltos. Ahora se recalcula una sola vez, ya terminado el
    // movimiento.
    let t: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(calc, 220);
    });
    ro.observe(el);
    return () => { clearTimeout(t); ro.disconnect(); };
  }, [stack, pendientes.length, patient?._id]);

  // Los hechos que realmente se dibujan: los que entran en el alto disponible.
  const hechosVisibles = hechosRecent.slice(0, stack ? CAP : fitHechos);

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
  const cobrablesHechos = trabajosCobrables.filter(w => w.status === DONE);
  const cobrablesPlan = trabajosCobrables.filter(w => w.status !== DONE);

  // Misma idea para la columna de Pagos, asi las dos crecen parejo.
  const pagosListRef = useRef<HTMLDivElement>(null);
  // `insert` para que un pago nuevo abra su hueco empujando a los de abajo. Va
  // en la LISTA y no en cada `setNewPagoId(...)`: así lo agarra venga de donde
  // venga —del formulario, de cobrar un trabajo, de una tanda— sin que cada
  // lugar tenga que acordarse de avisar. Los pagos se ordenan por fecha, así
  // que uno con fecha vieja nace en el medio.
  useFlip(pagosListRef, { insert: true });
  const [fitPagos, setFitPagos] = useState(CAP);
  useLayoutEffect(() => {
    if (stack) { setFitPagos(CAP); return; }
    const el = pagosListRef.current;
    if (!el) return;
    const ROW = 46, FOOTER = 44;
    const calc = () => setFitPagos(Math.max(1, Math.floor((el.clientHeight - FOOTER) / ROW)));
    calc();
    let t: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(calc, 220); });
    ro.observe(el);
    return () => { clearTimeout(t); ro.disconnect(); };
    // `patient?._id` es imprescindible: en el primer render la tarjeta todavía
    // no existe (no cargó el paciente), el ref está en null y el efecto sale
    // sin medir. Sin esta dependencia no se volvía a ejecutar nunca y la lista
    // quedaba clavada en el valor inicial.
  }, [stack, patient?._id]);

  // ---- fila de un trabajo (se reusa en pendientes y en hechos) ----
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
    const preg = esPregunta(it._id);
    if (preg && !editing) {
      const falta = price - paid;
      const editandoMonto = askMonto !== null && askMontoId === it._id;
      const cerrarPanel = () => { setAskMonto(null); setAskMontoId(null); setAskPanel(false); };
      return (
        <div key={it._id} data-flip={it._id} className="lb-askrow">
          {/* Dos renglones: la pregunta arriba y las respuestas abajo. En una
              sola línea no entraban y el texto se partía letra por letra. */}
          <div className="lb-askrow__q">
            <Icon name="check" size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
            <span className="lb-askrow__txt">
              <b>{it.description}</b>
              {' — '}{editandoMonto ? '¿cuánto pagó?' : '¿lo pagó?'}
            </span>
            {/* Descartar vive acá, lejos de las respuestas, para que no se lea
                como una cuarta opción. Solo si todavía no se guardó nada. */}
            {preg.unsaved && !editandoMonto && (
              <button className="lb-askrow__x" title="Descartar: dejarlo como estaba"
                onClick={() => setAskCobro(prev => prev.filter(a => a.id !== it._id))}>
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
          {editandoMonto ? (
            <span ref={askRef} className="lb-askrow__acts lb-askrow__acts--edit">
              <span className="lb-askrow__field">
                <Icon name="edit" size={13} className="lb-askrow__pencil" />
                <span className="lb-askrow__peso">$</span>
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
                  style={{ width: '100%', height: 32, paddingLeft: 36, fontSize: 13 }}
                />
                {askPanel && (
                  <div style={{ ...popover, top: 'calc(100% + 5px)', left: 0, right: 'auto', width: 250 }}>
                    <div style={popTitle}>Montos</div>
                    <div style={chipsWrap}>
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
                )}
              </span>
              <button className="btn btn--primary btn--sm" onClick={() => { const m = num(askMonto ?? ''); cerrarPanel(); confirmarHecho(it, m, true); }}>
                <Icon name="check" size={13} />
              </button>
              <button className="btn btn--ghost btn--icon btn--sm" onClick={cerrarPanel}><Icon name="x" size={14} /></button>
            </span>
          ) : (
            <div className="lb-askrow__acts">
              <button className="btn btn--primary btn--sm" onClick={() => confirmarHecho(it, undefined, true)}>
                Pagó {fmtMoney(falta)}
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => { setAskMontoId(it._id); setAskMonto(String(falta)); setAskPanel(true); }}>
                Otro monto
              </button>
              <button className="btn btn--secondary btn--sm" onClick={() => confirmarHecho(it)}>
                Todavía no
              </button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div key={it._id} data-flip={it._id} ref={editing ? editRowRef : cobroItem === it._id ? cobroRef : undefined} className={`fr-row fw-row ${editing || cobroItem === it._id ? 'fr-row--edit' : ''} ${it._id === newWorkId ? 'lb-rowin' : ''} ${it._id === flashWorkId ? 'lb-rowflash' : ''} ${it._id === outWorkId ? 'lb-rowout' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: dense ? '6px 12px' : '10px 12px', borderTop: '1px solid var(--border-subtle)' }}>
        {/* El circulito solo no dice qué hace, y en tablet no hay tooltip que lo
            aclare. Los pendientes llevan la etiqueta al lado; los hechos no la
            necesitan (el tilde verde + el tachado + "hecho DD/MM" ya se leen). */}
        <button
          onClick={() => toggleDone(it)}
          title={done ? 'Marcar como pendiente' : 'Marcar como hecho'}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            flexShrink: 0, minWidth: dense ? 22 : 46,
            cursor: 'pointer', background: 'none', border: 0, padding: 0,
          }}
        >
          <span
            style={{
              width: 22, height: 22, borderRadius: 999, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: done ? 'none' : '2px solid var(--border-input)',
              background: done ? 'var(--success)' : '#fff', color: 'white',
            }}
          >
            {done && <Icon name="check" size={13} />}
          </span>
          {!dense && (
            <span className="lb-act__lbl">{done ? 'Desmarcar' : 'Hecho'}</span>
          )}
        </button>
        {editing ? (
          <>
            <input className="input" value={eiDesc} onChange={e => setEiDesc(e.target.value)}
              onFocus={() => setEditPanel('trabajo')} onClick={() => setEditPanel('trabajo')}
              onKeyDown={e => e.key === 'Enter' && saveEditItem()} style={{ flex: 1, minWidth: 120, height: 32 }} autoFocus />
            <div style={{ position: 'relative', width: 100 }}>
              <span style={{ position: 'absolute', left: 9, top: 7, color: 'var(--text-tertiary)', fontSize: 12 }}>$</span>
              <input className="input" inputMode="numeric" value={eiAmount} onChange={e => setEiAmount(e.target.value.replace(/[^\d]/g, ''))}
                onFocus={() => setEditPanel('monto')} onClick={() => setEditPanel('monto')}
                onKeyDown={e => e.key === 'Enter' && saveEditItem()} style={{ width: '100%', height: 32, paddingLeft: 18 }} />
            </div>
            <button className="btn btn--primary btn--sm" onClick={saveEditItem}><Icon name="check" size={13} /></button>
            <button className="btn btn--ghost btn--icon btn--sm" onClick={() => { setEditItem(null); setEditPanel(null); }}><Icon name="x" size={14} /></button>
            {/* `data-flip` propio: el hook lo ve como un nodo nuevo y se saltea
                la animación en esa pasada, así las filas de abajo no quedan
                dibujadas encima del panel mientras se abre. */}
            {editPanel && (
              <div data-flip={`panel-${it._id}`} className="lb-editpanel">
                <div style={popTitle}>{editPanel === 'trabajo' ? 'Trabajos frecuentes' : 'Montos'}</div>
                <div style={chipsWrap}>
                  {editPanel === 'trabajo' ? (
                    <>
                      {treatments.map(t => (
                        <button key={t} type="button" className="lb-chip" onMouseDown={e => e.preventDefault()}
                          onClick={() => { setEiDesc(p => (p.trim() ? `${p.trim()} ${t}` : t)); setEditPanel(null); }}>{t}</button>
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
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)', whiteSpace: 'nowrap' }}>
                      hecho {fmtDate(it.completedAt)}
                    </span>
                  )}
                  {/* Cuanto lleva pagado, para los que se pagan en cuotas */}
                  {parcial && <span className="lb-paidprog">pagó {fmtMoney(paid)}</span>}
                  {/* Pendiente ya cobrado por completo (una seña que cubre todo):
                      el botón de cobrar no está en esta lista, así que el estado
                      tiene que verse igual. */}
                  {!done && cobrado && <span className="lb-paidprog">✓ pagado</span>}
                </div>
              )}
              {itemPhotos.length > 0 && (
                /* flexBasis 100% → las miniaturas siempre arrancan renglón propio */
                <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap', flexBasis: '100%' }}>
                  {itemPhotos.map(({ photo, title, description }) => (
                    <img
                      key={photo._id}
                      src={photo.thumbnailUrl || photo.url}
                      onClick={() => setZoomPhoto({ url: photo.url, category: photo.type, title, description })}
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
            <span className="mono fr-price" style={{ fontSize: 13.5, fontWeight: 600, flexShrink: 0, color: it.price ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{it.price ? fmtMoney(it.price) : '—'}</span>
            <span className="fr-money">
            {!done ? (
              /* Pendiente: se MUESTRA el estado de cobro (una seña se ve como
                 "pagó $X de $Y" junto a la descripción) pero no se ofrece la
                 acción — para eso está el selector del formulario de Pagos. */
              null
            ) : cobroItem === it._id ? (
              /* Monto precargado y EDITABLE: si paga todo se confirma de una, y
                 si deja una parte (cuota de brackets) se corrige el número —
                 ese pago queda atado al trabajo y alimenta el "pagó $X de $Y". */
              <>
              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                <span style={{ position: 'relative', width: 92 }}>
                  <span style={{ position: 'absolute', left: 8, top: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>$</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    autoFocus
                    value={cobroAmount ? Number(cobroAmount).toLocaleString('es-AR') : ''}
                    onChange={e => setCobroAmount(e.target.value.replace(/[^\d]/g, ''))}
                    onFocus={() => setCobroPanel(true)}
                    onClick={() => setCobroPanel(true)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { const m = num(cobroAmount); setCobroPanel(false); setCobroItem(null); marcarCobrado(it, m); }
                      if (e.key === 'Escape') { setCobroPanel(false); setCobroItem(null); }
                    }}
                    style={{ width: '100%', height: 30, paddingLeft: 17, fontSize: 12.5 }}
                  />
                </span>
                <button
                  className="btn btn--primary btn--sm"
                  style={{ height: 30, padding: '0 9px' }}
                  onClick={() => { const m = num(cobroAmount); setCobroItem(null); marcarCobrado(it, m); }}
                >
                  <Icon name="check" size={13} />
                </button>
                <button className="btn btn--ghost btn--icon btn--sm" onClick={() => { setCobroItem(null); setCobroPanel(false); }}>
                  <Icon name="x" size={14} />
                </button>
              </span>
                {cobroPanel && (
                  <div className="lb-editpanel">
                    <div style={popTitle}>Montos</div>
                    <div style={chipsWrap}>
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
                )}
              </>
            ) : (
              <button
                className={`lb-cobro ${cobrado ? 'is-on' : ''} ${it._id === flashWorkId ? 'lb-pop' : ''} ${!cobrado && parcial ? 'lb-cobro--2l' : ''}`}
                disabled={cobroBusy === it._id}
                title={cobrado ? 'Ya cobrado - tocá para deshacer' : `Cobrar (podés editar el monto)`}
                onClick={() => {
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
                {!cobrado && parcial && (
                  <span className="mono" style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.1 }}>
                    {fmtMoney(price - paid)}
                  </span>
                )}
              </button>
            )}
            <span className="fr-acts">
              <button className="btn btn--ghost btn--icon btn--sm" title="Fotos del trabajo" onClick={() => openModal('uploadPhotos', { patientId: id, treatmentItemId: it._id })} style={{ color: itemPhotos.length ? 'var(--brand-primary-600)' : undefined }}><Icon name="image" size={14} /></button>
              <button className="btn btn--ghost btn--icon btn--sm" title="Editar" onClick={() => startEditItem(it)}><Icon name="edit" size={14} /></button>
              <button className="btn btn--ghost btn--icon btn--sm" title="Borrar" onClick={() => pedirBorrarTrabajo(it)} style={{ color: 'var(--danger)' }}><Icon name="trash" size={14} /></button>
            </span>
            </span>
          </>
        )}
      </div>
    );
  };

  // ---- fila de un pago ----
  const renderPagoRow = (t: Transaction, dense = false) => {
    const editing = editPago === t._id;
    const ph = photosByTx.get(t._id) ?? [];
    return (
      <div key={t._id} data-flip={t._id} ref={editing ? epRef : undefined} className={`fr-row fp-row ${editing ? 'fr-row--edit' : ''} ${t._id === flashPagoId ? 'lb-rowflash' : ''} ${t._id === outPagoId ? 'lb-rowout' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: dense ? '6px 12px' : '10px 12px', borderTop: '1px solid var(--border-subtle)' }}>
        {editing ? (
          <>
            <div style={{ width: 132 }}><DatePicker value={epDate} onChange={setEpDate} /></div>
            <div style={{ position: 'relative', width: 100 }}>
              <span style={{ position: 'absolute', left: 9, top: 7, color: 'var(--text-tertiary)', fontSize: 12 }}>$</span>
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
            <button className="btn btn--primary btn--sm" onClick={saveEditPago}><Icon name="check" size={13} /></button>
            <button className="btn btn--ghost btn--icon btn--sm" onClick={() => { setEditPago(null); setEpPanel(false); }}><Icon name="x" size={14} /></button>
                {epPanel && (
                  <div className="lb-editpanel">
                    <div style={popTitle}>Montos</div>
                    <div style={chipsWrap}>
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
                )}
          </>
        ) : (
          <>
            {/* De qué trabajo fue el pago. Va primero: es lo que identifica la
                fila. Misma etiqueta que en la agenda. */}
            <span className="fp-tag">
              {t.workId && t.description && (
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
              <button className="btn btn--ghost btn--icon btn--sm" title="Editar" onClick={() => startEditPago(t)}><Icon name="edit" size={14} /></button>
              <button className="btn btn--ghost btn--icon btn--sm" title="Borrar" onClick={() => setDelPago(t)} style={{ color: 'var(--danger)' }}><Icon name="trash" size={14} /></button>
            </span>
            {ph.length > 0 && (
              <div className="fp-photos">
                {ph.map(({ photo, title, description }) => (
                  <img key={photo._id} src={photo.thumbnailUrl || photo.url}
                    onClick={() => setZoomPhoto({ url: photo.url, category: photo.type, title, description })}
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
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: isMobile ? 14 : 24, display: 'flex', flexDirection: 'column', gap: 14, width: '100%', flex: stack ? undefined : 1, minHeight: 0 }}>
        {/* ---------- PACIENTE ---------- */}
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

        {patient && (
          <>
            {/* ---------- BANNER-AVISO (una sola cosa: deuda o "al día") ---------- */}
            {/* Por seguridad NO exponemos realizado/pagado/por-hacer ni el saldo a
                favor: solo el monto que falta cobrar (ámbar) o "al día" (verde). */}
            {/* Sello de estado de cuenta a todo ancho. En celular no va como
                tarjeta aparte sino pegado abajo de la del paciente: es el mismo
                bloque de "quién es y cómo viene", y ahorra un alto que en el
                teléfono se paga caro. */}
            <div
              key={debe ? 'debe' : 'aldia'}
              className={`lb-estado ${debe ? 'lb-estado--debe' : ''} lb-estado--anexo`}
              style={{ animation: 'dialogPop 0.22s cubic-bezier(0.16,1,0.3,1)' }}
            >
              <Icon name={debe ? 'cash' : 'check'} size={18} />
              {debe ? (
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  Falta cobrar
                  <b className="mono" style={{ fontSize: 20, lineHeight: 1 }}>{fmtMoney(falta)}</b>
                </span>
              ) : (
                <span>Al día — no debe nada</span>
              )}
            </div>

            {/* Una sola columna (celular y tablet) → pestañas. Con las dos
                columnas a la vista no hacen falta. */}
            {stack && (
              <div className="seg lb-tabs-sticky" style={{ width: '100%' }}>
                <button
                  type="button"
                  className={`seg__btn ${mobileTab === 'trabajos' ? 'is-active' : ''}`}
                  onClick={() => setMobileTab('trabajos')}
                  style={{ flex: 1 }}
                >
                  Trabajos · {pendientes.length + hechosCount}
                </button>
                <button
                  type="button"
                  className={`seg__btn ${mobileTab === 'pagos' ? 'is-active' : ''}`}
                  onClick={() => setMobileTab('pagos')}
                  style={{ flex: 1 }}
                >
                  Pagos · {pagos.length}
                </button>
              </div>
            )}

            {/* ---------- DOS COLUMNAS: Trabajos | Pagos ---------- */}
            <div style={{ display: 'grid', gridTemplateColumns: stack ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: stack ? 'start' : 'stretch', flex: stack ? undefined : 1, minHeight: 0 }}>

            {/* ---------- TRABAJOS ---------- */}
            <div
              className="card"
              style={{
                overflow: 'visible',
                display: stack && mobileTab !== 'trabajos' ? 'none' : 'flex',
                flexDirection: 'column',
                minHeight: 0,
                minWidth: 0,
              }}
            >
              <div className="card__header" style={{ alignItems: 'center' }}>
                <div className="card__title">
                  Plan de tratamiento · Trabajos
                  {pendientes.length > 0 && <span style={countBadge}>{pendientes.length} por hacer</span>}
                </div>
              </div>

              <div ref={workRef} className="lb-addrow" style={{ position: 'relative', display: 'block' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <input
                    className="input"
                    placeholder="Trabajo (ej: Extracción 38)"
                    value={twDesc}
                    onFocus={() => setWorkPanel('trabajo')}
                    onClick={() => setWorkPanel('trabajo')}
                    onChange={e => setTwDesc(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addTrabajo()}
                    style={{ flex: '1 1 110px', minWidth: 90, height: 38 }}
                  />
                  <div style={{ position: 'relative', width: isMobile ? 74 : 100, flexShrink: 0 }}>
                    <span style={dollarPrefix}>$</span>
                    <input
                      className="input" inputMode="numeric" placeholder="0"
                      value={twAmount}
                      onFocus={() => setWorkPanel('monto')}
                      onClick={() => setWorkPanel('monto')}
                      onChange={e => setTwAmount(e.target.value.replace(/[^\d]/g, ''))}
                      onKeyDown={e => e.key === 'Enter' && addTrabajo()}
                      style={{ width: '100%', height: 38, paddingLeft: 20 }}
                    />
                  </div>
                  <button className={`btn btn--primary ${isMobile ? 'btn--icon' : ''}`} onClick={addTrabajo} disabled={twBusy} title="Agregar trabajo" style={{ height: 38, flexShrink: 0 }}>
                    {twBusy ? <Spinner /> : <><Icon name="plus" size={14} /> {!isMobile && 'Agregar'}</>}
                  </button>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 8, fontSize: 12.5, color: twDone ? 'var(--success)' : 'var(--text-secondary)', fontWeight: twDone ? 600 : 400, cursor: 'pointer', userSelect: 'none', transition: 'color 0.15s' }}>
                  <input type="checkbox" checked={twDone} onChange={e => setTwDone(e.target.checked)} />
                  {twDone ? '¡Hecho! ✓ (cuenta a cobrar)' : 'Ya lo hice (cuenta a cobrar)'}
                </label>

                {/* popover de chips (contextual al campo enfocado) */}
                {workPanel === 'trabajo' && (
                  <div style={popover}>
                    <div style={popTitle}>Trabajos frecuentes</div>
                    <div style={chipsWrap}>
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
                    <div style={chipsWrap}>
                      {quickAmounts.map(v => (
                        <button key={v} type="button" className="lb-chip mono" onMouseDown={e => e.preventDefault()} onClick={() => { setTwAmount(String(v)); setWorkPanel(null); }} style={{ fontWeight: 600 }}>{fmtMoney(v)}</button>
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
                    : { flex: 1, minHeight: 0, overflowY: 'auto', isolation: 'isolate' }
                }
              >
                {!hasWorks && (
                  <div style={emptyRow}>Todavía no cargaste trabajos. Agregá el primero arriba ↑</div>
                )}
                {hasWorks && pendientes.length === 0 && hechosCount > 0 && (
                  <div style={{ ...emptyRow, padding: '14px' }}>Todo hecho 🎉</div>
                )}
                {pendientes.map(it => renderWorkRow(it))}
                {hechosCount > 0 && (
                  <>
                    <button onClick={() => setShowDone(s => !s)} style={doneToggle}>
                      <Icon name={showDone ? 'chevronDown' : 'chevronRight'} size={14} /> Hechos ({hechosCount})
                    </button>
                    {showDone && (
                      <>
                        {hechosVisibles.map(it => renderWorkRow(it))}
                        {hechosCount > hechosVisibles.length && (
                          <button onClick={() => setHechosModalOpen(true)} style={verTodos}>
                            Ver los {hechosCount} trabajos hechos <Icon name="chevronRight" size={13} />
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Sin total al pie: el único número de plata que se muestra es
                  "Falta cobrar" (arriba). No exponemos el total del plan ni lo
                  pagado — es info sensible y el Dr. atiende con el paciente al
                  lado mirando la pantalla. */}
            </div>

            {/* ---------- PAGOS ---------- */}
            <div
              className="card"
              style={{
                overflow: 'visible',
                display: stack && mobileTab !== 'pagos' ? 'none' : 'flex',
                flexDirection: 'column',
                minHeight: 0,
                minWidth: 0,
              }}
            >
              <div className="card__header" style={{ alignItems: 'center' }}>
                <div className="card__title">
                  Pagos
                  {pagos.length > 0 && <span style={countBadge}>{pagos.length}</span>}
                </div>
              </div>

              <div ref={pagoRef} className="lb-addrow" style={{ position: 'relative', display: 'block' }}>
                {/* Imputar el pago a un trabajo (opcional). Solo aparece si hay
                    alguno con saldo: si no, sería un campo vacío molestando. Por
                    defecto va "a cuenta", que es como se cargó siempre. */}
                {/* Celular: renglón 1 = trabajo + fecha. La fecha sube acá para
                    que el renglón 2 (monto · método · +) entre entero. */}
                {(trabajosCobrables.length > 0 || isMobile) && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12.5, color: 'var(--text-secondary)', flexWrap: 'nowrap' }}>
                    {!isMobile && <span style={{ whiteSpace: 'nowrap' }}>¿De qué trabajo?</span>}
                    {trabajosCobrables.length > 0 && (
                      <Select
                        value={pgWorkId}
                        onChange={v => { setPgWorkId(v); setPagoPanel(false); }}
                        style={{ flex: '1 1 120px', minWidth: 100 }}
                        title="¿De qué trabajo es este pago?"
                        options={[{ value: '', label: isMobile ? 'Pago a cuenta (sin trabajo)' : 'A cuenta (sin trabajo)' }]}
                        groups={[
                          {
                            label: 'Hechos sin cobrar',
                            options: cobrablesHechos.map(w => ({
                              value: w._id,
                              label: w.description,
                              hint: `falta ${fmtMoney((w.price ?? 0) - (w.paid ?? 0))}`,
                            })),
                          },
                          {
                            label: 'Del plan (por hacer)',
                            options: cobrablesPlan.map(w => ({
                              value: w._id,
                              label: w.description,
                              hint: `falta ${fmtMoney((w.price ?? 0) - (w.paid ?? 0))}`,
                            })),
                          },
                        ]}
                      />
                    )}
                    {isMobile && (
                      <div style={{ flex: trabajosCobrables.length > 0 ? '0 0 136px' : '1 1 auto' }}>
                        <DatePicker value={pgDate} onChange={v => { setPagoPanel(false); setPgDate(v); }} />
                      </div>
                    )}
                  </label>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ position: 'relative', flex: '1 1 110px', minWidth: 100 }}>
                    <span style={dollarPrefix}>$</span>
                    <input className="input" inputMode="numeric" placeholder="Monto" value={pgAmount} onFocus={() => setPagoPanel(true)} onClick={() => setPagoPanel(true)} onChange={e => setPgAmount(e.target.value.replace(/[^\d]/g, ''))} onKeyDown={e => e.key === 'Enter' && addPago()} style={{ width: '100%', height: 38, paddingLeft: 20 }} />
                  </div>
                  {/* Tocar otro campo del formulario también cierra el panel de
                      montos: para el usuario es "otro lado" igual que afuera. */}
                  {!isMobile && (
                    <div style={{ width: 148 }}><DatePicker value={pgDate} onChange={v => { setPagoPanel(false); setPgDate(v); }} /></div>
                  )}
                  {/* En celular el método es UN botón que alterna, no dos: la
                      mitad del ancho y un toque en vez de "leer y elegir".
                      Casi siempre es efectivo, así que lo normal es no tocarlo. */}
                  {isMobile ? (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      title="Cambiar a efectivo o transferencia"
                      onClick={() => { setPgMethod(m => (m === 'CASH' ? 'TRANSFER' : 'CASH')); setPagoPanel(false); }}
                      style={{ height: 38, flexShrink: 0, minWidth: 74 }}
                    >
                      {pgMethod === 'CASH' ? 'Efec.' : 'Transf.'}
                    </button>
                  ) : (
                    <div className="seg">
                      {(['CASH', 'TRANSFER'] as const).map(m => (
                        <button key={m} type="button" className={`seg__btn ${pgMethod === m ? 'is-active' : ''}`} onClick={() => { setPgMethod(m); setPagoPanel(false); }}>
                          {m === 'CASH' ? 'Efec.' : 'Transf.'}
                        </button>
                      ))}
                    </div>
                  )}
                  <button className={`btn btn--primary ${isMobile ? 'btn--icon' : ''}`} onClick={addPago} disabled={pgBusy} title="Agregar pago" style={{ height: 38, flexShrink: 0 }}>
                    {pgBusy ? <Spinner /> : <><Icon name="plus" size={14} /> {!isMobile && 'Pago'}</>}
                  </button>
                </div>


                {pagoPanel && (
                  <div style={popover}>
                    <div style={popTitle}>Montos</div>
                    <div style={chipsWrap}>
                      {quickAmounts.map(v => (
                        <button key={v} type="button" className="lb-chip mono" onMouseDown={e => e.preventDefault()} onClick={() => { setPgAmount(String(v)); setPagoPanel(false); }} style={{ fontWeight: 600 }}>{fmtMoney(v)}</button>
                      ))}
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setCustomAmountsOpen(true)} className="lb-chip lb-chip--add">
                        <Icon name="settings" size={12} /> Editar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* lista de pagos */}
              <div
                ref={pagosListRef}
                style={
                  stack
                    ? { isolation: 'isolate' }
                    : { flex: 1, minHeight: 0, overflowY: 'auto', isolation: 'isolate' }
                }
              >
                {pagos.length === 0 && (
                  <div style={emptyRow}>Sin pagos todavía.</div>
                )}
                {pagos.slice(0, stack ? CAP : fitPagos).map(t => renderPagoRow(t))}
                {pagos.length > (stack ? CAP : fitPagos) && (
                  <button onClick={() => setPagosModalOpen(true)} style={verTodos}>
                    Ver los {pagos.length} pagos <Icon name="chevronRight" size={13} />
                  </button>
                )}
              </div>

              {/* Sin total pagado al pie — ver nota en la hoja de Trabajos. */}
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

      {/* Lightbox de zoom */}
      {zoomPhoto && (
        <div onClick={() => setZoomPhoto(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, zIndex: 1200, padding: isMobile ? 16 : 32, cursor: 'zoom-out', animation: 'overlayFade 0.12s ease-out' }}>
          <button onClick={() => setZoomPhoto(null)} title="Cerrar" style={{ position: 'absolute', top: 18, right: 18, width: 40, height: 40, borderRadius: 999, background: 'rgba(255,255,255,0.16)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
            <Icon name="x" size={20} />
          </button>
          <img src={zoomPhoto.url} onClick={e => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: zoomPhoto.category || zoomPhoto.title || zoomPhoto.description ? '72vh' : '86vh', borderRadius: 10, boxShadow: 'var(--shadow-lg)', cursor: 'default' }} />
          {(zoomPhoto.category || zoomPhoto.title || zoomPhoto.description) && (
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '12px 16px', maxWidth: 520, width: '100%', boxShadow: 'var(--shadow-lg)', cursor: 'default' }}>
              {zoomPhoto.category && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: 'var(--brand-primary-50)', color: 'var(--brand-primary-600)', fontSize: 12, fontWeight: 600, marginBottom: zoomPhoto.title || zoomPhoto.description ? 8 : 0 }}>
                  <Icon name="image" size={12} /> {photoTypeLabel(zoomPhoto.category)}
                </span>
              )}
              {zoomPhoto.title && <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{zoomPhoto.title}</div>}
              {zoomPhoto.description && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>{zoomPhoto.description}</div>}
            </div>
          )}
        </div>
      )}

      {/* Historial completo de trabajos hechos — búsqueda + paginación server-side */}
      {hechosModalOpen && (
        <ListModal
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Trabajos hechos{hechosFilterActive ? ` (${hechosSearchRaw.length})` : ` (${hechosCount})`}
              {hechosSearching && hechosSearchRaw.length > 0 && <TitleSpinner />}
            </span>
          }
          icon="check"
          accent="var(--success)"
          isMobile={isMobile}
          onClose={() => {
            setHechosModalOpen(false);
            resetHechosFilter();
          }}
          filterSlot={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                      <div style={chipsWrap}>
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
          {hechosSearchRaw.length === 0 ? (
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
              {hechosSearchRaw.map(it => renderWorkRow(it, true))}
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

function Spinner() {
  return (
    <>
      <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
      Guardando…
    </>
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
const countBadge: CSSProperties = {
  marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
  background: 'var(--bg-hover)', borderRadius: 999, padding: '1px 8px',
};
const dollarPrefix: CSSProperties = {
  position: 'absolute', left: 10, top: 10, color: 'var(--text-tertiary)',
  fontSize: 13, pointerEvents: 'none',
};
const doneToggle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '9px 12px',
  borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-hover)',
  fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer',
  textAlign: 'left',
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
