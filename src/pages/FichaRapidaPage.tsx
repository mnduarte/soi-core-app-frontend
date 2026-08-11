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
    queryFn: () => worksApi.findAll(id!, { status: 'done', limit: CAP }),
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
        .sort((a, b) => isoDateOf(b).localeCompare(isoDateOf(a))),
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
      await addItemMut.mutateAsync({ description: d, price: num(twAmount), status: twDone ? DONE : PENDING });
      setTwDesc(''); setTwAmount(''); setTwDone(false);
      invalidateWorks();
      showToast(twDone ? '¡Hecho! ✓ Trabajo agregado' : 'Trabajo agregado', 'success');
    } catch {
      showToast('No se pudo agregar', 'error');
    } finally { setTwBusy(false); }
  };

  // ---- edición / toggle / borrado de trabajo ----
  const [editItem, setEditItem] = useState<string | null>(null);
  const [eiDesc, setEiDesc] = useState('');
  const [eiAmount, setEiAmount] = useState('');
  const updateItemMut = useMutation({
    mutationFn: (v: { workId: string; dto: Partial<CreateWorkInput> }) =>
      worksApi.update(v.workId, v.dto),
  });
  const toggleDone = async (it: Work) => {
    const next = it.status === DONE ? PENDING : DONE;
    try {
      await updateItemMut.mutateAsync({ workId: it._id, dto: { status: next } });
      invalidateWorks();
      // Refuerzo positivo: al marcar hecho lo festejamos y confirmamos que
      // sumó a lo que hay que cobrar (así no "se sale de una" sin feedback).
      if (next === DONE) {
        showToast(it.price ? `¡Hecho! ✓ Suma ${fmtMoney(it.price)} a cobrar` : '¡Hecho! ✓', 'success');
      } else {
        showToast('Volvió a pendiente', 'success');
      }
    } catch { showToast('No se pudo actualizar', 'error'); }
  };
  const startEditItem = (it: Work) => {
    setEditItem(it._id);
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
      invalidateWorks();
      showToast('Trabajo actualizado', 'success');
    } catch { showToast('No se pudo guardar', 'error'); }
  };
  const removeItemMut = useMutation({
    mutationFn: (workId: string) => worksApi.remove(workId),
  });
  const [delItem, setDelItem] = useState<Work | null>(null);
  const confirmDelItem = async () => {
    if (!delItem) return;
    const it = delItem; setDelItem(null);
    try {
      await removeItemMut.mutateAsync(it._id);
      invalidateWorks();
      showToast('Trabajo borrado', 'success');
    } catch { showToast('No se pudo borrar', 'error'); }
  };

  // ---- alta de pago ----
  const [pgAmount, setPgAmount] = useState('');
  const [pgMethod, setPgMethod] = useState<PaymentMethod>('CASH');
  const [pgDate, setPgDate] = useState(todayYMD());
  const [pgBusy, setPgBusy] = useState(false);
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
        paymentMethod: pgMethod,
        date: new Date(`${pgDate}T12:00:00`).toISOString(),
      });
      setPgAmount(''); setPgDate(todayYMD());
      invalidateTx();
      showToast(`¡Pago de ${fmtMoney(amt)} registrado!`, 'success');
    } catch {
      showToast('No se pudo registrar', 'error');
    } finally { setPgBusy(false); }
  };

  // ---- edición / borrado de pago ----
  const [editPago, setEditPago] = useState<string | null>(null);
  const [epAmount, setEpAmount] = useState('');
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
    const amt = num(epAmount);
    if (amt <= 0) { showToast('Ingresá un monto', 'error'); return; }
    try {
      await updatePagoMut.mutateAsync({
        id: editPago,
        dto: { amount: amt, paymentMethod: epMethod, date: new Date(`${epDate}T12:00:00`).toISOString() },
      });
      setEditPago(null);
      invalidateTx();
      showToast('Pago actualizado', 'success');
    } catch { showToast('No se pudo guardar', 'error'); }
  };
  const delPagoMut = useMutation({ mutationFn: (txId: string) => transactionsApi.remove(txId) });
  const [delPago, setDelPago] = useState<Transaction | null>(null);
  const confirmDelPago = async () => {
    if (!delPago) return;
    const t = delPago; const photos = photosByTx.get(t._id) ?? []; setDelPago(null);
    try {
      await delPagoMut.mutateAsync(t._id);
      // Las fotos quedan en la galería (solo se desvinculan del pago borrado).
      for (const item of photos) {
        await galleryApi.updatePhoto(patient!._id, item.sessionId, item.photo._id, { transactionId: '' });
      }
      if (photos.length) qc.invalidateQueries({ queryKey: ['gallery-sessions', id] });
      invalidateTx();
      showToast('Pago borrado', 'success');
    } catch { showToast('No se pudo borrar', 'error'); }
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
  const [showDone, setShowDone] = useState(false);

  // ---- fila de un trabajo (se reusa en pendientes y en hechos) ----
  const renderWorkRow = (it: Work, dense = false) => {
    const done = it.status === DONE;
    const editing = editItem === it._id;
    const itemPhotos = photosByItem.get(it._id) ?? [];
    return (
      <div key={it._id} className="fr-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: dense ? '6px 12px' : '10px 12px', borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={() => toggleDone(it)}
          title={done ? 'Marcar pendiente' : 'Marcar hecho'}
          style={{
            width: 22, height: 22, borderRadius: 999, flexShrink: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: done ? 'none' : '2px solid var(--border-default)',
            background: done ? 'var(--success)' : 'transparent', color: 'white', padding: 0,
          }}
        >
          {done && <Icon name="check" size={13} />}
        </button>
        {editing ? (
          <>
            <input className="input" value={eiDesc} onChange={e => setEiDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEditItem()} style={{ flex: 1, height: 32 }} autoFocus />
            <div style={{ position: 'relative', width: 100 }}>
              <span style={{ position: 'absolute', left: 9, top: 7, color: 'var(--text-tertiary)', fontSize: 12 }}>$</span>
              <input className="input" inputMode="numeric" value={eiAmount} onChange={e => setEiAmount(e.target.value.replace(/[^\d]/g, ''))} onKeyDown={e => e.key === 'Enter' && saveEditItem()} style={{ width: '100%', height: 32, paddingLeft: 18 }} />
            </div>
            <button className="btn btn--primary btn--sm" onClick={saveEditItem}><Icon name="check" size={13} /></button>
            <button className="btn btn--ghost btn--icon btn--sm" onClick={() => setEditItem(null)}><Icon name="x" size={14} /></button>
          </>
        ) : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, color: done ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>{it.description || '(sin nombre)'}</span>
              {!done && <span style={pendBadge}>por hacer</span>}
              {done && it.completedAt && (
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--success)', whiteSpace: 'nowrap' }}>
                  hecho {fmtDate(it.completedAt)}
                </span>
              )}
              {itemPhotos.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
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
            <span className="mono" style={{ fontSize: 13.5, fontWeight: 600, color: it.price ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{it.price ? fmtMoney(it.price) : '—'}</span>
            <span style={{ display: 'inline-flex' }}>
              <button className="btn btn--ghost btn--icon btn--sm" title="Fotos del trabajo" onClick={() => openModal('uploadPhotos', { patientId: id, treatmentItemId: it._id })} style={{ color: itemPhotos.length ? 'var(--brand-primary-600)' : undefined }}><Icon name="image" size={14} /></button>
              <button className="btn btn--ghost btn--icon btn--sm" title="Editar" onClick={() => startEditItem(it)}><Icon name="edit" size={14} /></button>
              <button className="btn btn--ghost btn--icon btn--sm" title="Borrar" onClick={() => setDelItem(it)} style={{ color: 'var(--danger)' }}><Icon name="trash" size={14} /></button>
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
      <div key={t._id} className="fr-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: dense ? '6px 12px' : '10px 12px', borderTop: '1px solid var(--border-subtle)' }}>
        {editing ? (
          <>
            <input type="date" className="input" value={epDate} onChange={e => setEpDate(e.target.value)} style={{ width: 130, height: 32 }} />
            <div style={{ position: 'relative', width: 100 }}>
              <span style={{ position: 'absolute', left: 9, top: 7, color: 'var(--text-tertiary)', fontSize: 12 }}>$</span>
              <input className="input" inputMode="numeric" value={epAmount} onChange={e => setEpAmount(e.target.value.replace(/[^\d]/g, ''))} onKeyDown={e => e.key === 'Enter' && saveEditPago()} style={{ width: '100%', height: 32, paddingLeft: 18 }} />
            </div>
            <div className="seg">
              {(['CASH', 'TRANSFER'] as const).map(m => (
                <button key={m} type="button" className={`seg__btn ${epMethod === m ? 'is-active' : ''}`} onClick={() => setEpMethod(m)}>{m === 'CASH' ? 'Efec.' : 'Transf.'}</button>
              ))}
            </div>
            <button className="btn btn--primary btn--sm" onClick={saveEditPago}><Icon name="check" size={13} /></button>
            <button className="btn btn--ghost btn--icon btn--sm" onClick={() => setEditPago(null)}><Icon name="x" size={14} /></button>
          </>
        ) : (
          <>
            <span className="mono" style={{ fontSize: 12.5, color: 'var(--text-tertiary)', width: 56, flexShrink: 0 }}>{fmtDate(isoDateOf(t))}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{methodLabel(t.paymentMethod)}</span>
              {ph.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                  {ph.map(({ photo, title, description }) => (
                    <img key={photo._id} src={photo.thumbnailUrl || photo.url}
                      onClick={() => setZoomPhoto({ url: photo.url, category: photo.type, title, description })}
                      title={`${photoTypeLabel(photo.type)} — foto vinculada`}
                      style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-subtle)', cursor: 'zoom-in', display: 'block' }} />
                  ))}
                </div>
              )}
            </div>
            <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)' }}>{fmtMoney(t.amount)}</span>
            <span style={{ display: 'inline-flex' }}>
              <button className="btn btn--ghost btn--icon btn--sm" title="Editar" onClick={() => startEditPago(t)}><Icon name="edit" size={14} /></button>
              <button className="btn btn--ghost btn--icon btn--sm" title="Borrar" onClick={() => setDelPago(t)} style={{ color: 'var(--danger)' }}><Icon name="trash" size={14} /></button>
            </span>
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
    <div className="content" style={{ padding: 0, overflow: 'auto', minHeight: 0 }}>
      <SectionHeader
        kicker="Ficha clínica"
        title={<>Trabajos, pagos y <em>cuánto falta cobrar</em></>}
      />
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: isMobile ? 14 : 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ---------- PACIENTE ---------- */}
        <div className="card" style={{ overflow: 'visible' }}>
          <div style={{ padding: patient ? 0 : 16 }}>
            {!patient && <div style={label}>Paciente</div>}
            {patient ? (
              /* Encabezado del paciente: avatar + nombre + datos + acciones */
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: isMobile ? '12px 14px' : '16px 20px' }}>
                <Avatar name={patient.name} lastName={patient.lastName} id={patient._id} size="lg" />
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 18 : 22, fontWeight: 600, margin: 0 }}>
                    {patient.name} {patient.lastName}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {patientAge(patient) != null && <span>{patientAge(patient)} años</span>}
                    {patient.phone && (
                      <a
                        href={`https://wa.me/${toWhatsAppNumber(patient.phone)}`}
                        target="_blank" rel="noreferrer" title="Abrir WhatsApp"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--success)', fontWeight: 600, textDecoration: 'none' }}
                      >
                        <Icon name="whatsapp" size={14} /> {patient.phone}
                      </a>
                    )}
                    {patient.obraSocial && <span>{patient.obraSocial}</span>}
                    {patient.locality && <span>{patient.locality}</span>}
                  </div>
                </div>

                <div className="row" style={{ gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                  <button className="btn btn--secondary btn--sm" title="Editar datos del paciente" onClick={() => openModal('newPatient', { patientId: patient._id })}>
                    <Icon name="edit" size={14} /> Editar
                  </button>
                  <button className="btn btn--secondary btn--sm" onClick={() => setGalleryOpen(true)}>
                    <Icon name="image" size={14} /> Galería
                  </button>
                  <button className="btn btn--secondary btn--sm" onClick={() => setOdoOpen(true)}>
                    <Icon name="tooth" size={14} /> {isMobile ? 'Odont.' : 'Odontograma'}
                  </button>
                  <button className="btn btn--ghost btn--icon btn--sm" title="Cambiar paciente" onClick={() => navigate('/ficha-rapida')}>
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
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 20, overflow: 'hidden' }}>
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
            {/* Sello de estado de cuenta a todo ancho */}
            <div
              key={debe ? 'debe' : 'aldia'}
              className={`lb-estado ${debe ? 'lb-estado--debe' : ''}`}
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

            {/* En celular: pestañas en vez de dos columnas */}
            {isMobile && (
              <div className="seg" style={{ width: '100%' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: stack ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start' }}>

            {/* ---------- TRABAJOS ---------- */}
            <div
              className="card"
              style={{
                overflow: 'visible',
                display: isMobile && mobileTab !== 'trabajos' ? 'none' : 'flex',
                flexDirection: 'column',
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
                    style={{ flex: '1 1 150px', minWidth: 120, height: 38 }}
                  />
                  <div style={{ position: 'relative', width: 100 }}>
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
                  <button className="btn btn--primary" onClick={addTrabajo} disabled={twBusy} style={{ height: 38 }}>
                    {twBusy ? <Spinner /> : <><Icon name="plus" size={14} /> Agregar</>}
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
                        <button key={t} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { addChip(t); setWorkPanel(null); }} style={{ ...chip, fontWeight: 500, color: 'var(--text-primary)' }}>{t}</button>
                      ))}
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setCustomTreatOpen(true)} style={{ ...chip, borderStyle: 'dashed', color: 'var(--brand-primary-600)' }}>
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
                        <button key={v} type="button" className="mono" onMouseDown={e => e.preventDefault()} onClick={() => { setTwAmount(String(v)); setWorkPanel(null); }} style={{ ...chip, fontWeight: 600 }}>{fmtMoney(v)}</button>
                      ))}
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setCustomAmountsOpen(true)} style={{ ...chip, borderStyle: 'dashed', color: 'var(--brand-primary-600)' }}>
                        <Icon name="settings" size={12} /> Editar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* lista de trabajos: pendientes visibles, hechos colapsados */}
              <div style={{ maxHeight: 'min(48vh, 520px)', overflowY: 'auto' }}>
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
                        {hechosRecent.map(it => renderWorkRow(it))}
                        {hechosCount > CAP && (
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
                display: isMobile && mobileTab !== 'pagos' ? 'none' : 'flex',
                flexDirection: 'column',
              }}
            >
              <div className="card__header" style={{ alignItems: 'center' }}>
                <div className="card__title">
                  Pagos
                  {pagos.length > 0 && <span style={countBadge}>{pagos.length}</span>}
                </div>
              </div>

              <div ref={pagoRef} className="lb-addrow" style={{ position: 'relative', display: 'block' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ position: 'relative', flex: '1 1 110px', minWidth: 100 }}>
                    <span style={dollarPrefix}>$</span>
                    <input className="input" inputMode="numeric" placeholder="Monto" value={pgAmount} onFocus={() => setPagoPanel(true)} onClick={() => setPagoPanel(true)} onChange={e => setPgAmount(e.target.value.replace(/[^\d]/g, ''))} onKeyDown={e => e.key === 'Enter' && addPago()} style={{ width: '100%', height: 38, paddingLeft: 20 }} />
                  </div>
                  <input type="date" className="input" value={pgDate} onChange={e => setPgDate(e.target.value)} style={{ width: 140, height: 38 }} />
                  <div className="seg">
                    {(['CASH', 'TRANSFER'] as const).map(m => (
                      <button key={m} type="button" className={`seg__btn ${pgMethod === m ? 'is-active' : ''}`} onClick={() => setPgMethod(m)}>
                        {m === 'CASH' ? 'Efec.' : 'Transf.'}
                      </button>
                    ))}
                  </div>
                  <button className="btn btn--primary" onClick={addPago} disabled={pgBusy} style={{ height: 38 }}>
                    {pgBusy ? <Spinner /> : <><Icon name="plus" size={14} /> Pago</>}
                  </button>
                </div>

                {pagoPanel && (
                  <div style={popover}>
                    <div style={popTitle}>Montos</div>
                    <div style={chipsWrap}>
                      {quickAmounts.map(v => (
                        <button key={v} type="button" className="mono" onMouseDown={e => e.preventDefault()} onClick={() => { setPgAmount(String(v)); setPagoPanel(false); }} style={{ ...chip, fontWeight: 600 }}>{fmtMoney(v)}</button>
                      ))}
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setCustomAmountsOpen(true)} style={{ ...chip, borderStyle: 'dashed', color: 'var(--brand-primary-600)' }}>
                        <Icon name="settings" size={12} /> Editar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* lista de pagos */}
              <div style={{ maxHeight: 'min(48vh, 520px)', overflowY: 'auto' }}>
                {pagos.length === 0 && (
                  <div style={emptyRow}>Sin pagos todavía.</div>
                )}
                {pagos.slice(0, CAP).map(t => renderPagoRow(t))}
                {pagos.length > CAP && (
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

      {/* ---------- confirmaciones de borrado ---------- */}
      <ConfirmDialog
        open={!!delItem}
        title="¿Borrar este trabajo?"
        message="Se saca del plan. No se puede deshacer."
        confirmLabel="Borrar"
        danger
        onConfirm={confirmDelItem}
        onCancel={() => setDelItem(null)}
      />
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
              <div style={filterRow}>
                {/* DatePicker propio en vez de <input type="date">: el nativo
                    muestra "mm/dd/yyyy" según el idioma del navegador, que no se
                    entiende y encima queda en formato yanqui. */}
                <div style={filterDate}>
                  <span style={filterLabel}>Fecha de inicio</span>
                  <DatePicker
                    value={hechosFrom}
                    onChange={v => setHechosDate('from', v)}
                    placeholder="Desde cuándo"
                  />
                </div>
                <div style={filterDate}>
                  <span style={filterLabel}>Fecha de fin</span>
                  <DatePicker
                    value={hechosTo}
                    onChange={v => setHechosDate('to', v)}
                    placeholder="Hasta cuándo"
                  />
                </div>
                <div ref={hechosSearchRef} style={{ position: 'relative', flex: '1 1 200px', minWidth: 140 }}>
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
                            style={{ ...chip, fontWeight: 500, color: 'var(--text-primary)' }}
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
            <div style={filterRow}>
              <div style={filterDate}>
                <span style={filterLabel}>Fecha de inicio</span>
                <DatePicker
                  value={pagoFilterDraft.from}
                  onChange={v => setPagoFilterDraft(f => ({ ...f, from: v }))}
                  placeholder="Desde cuándo"
                />
              </div>
              <div style={filterDate}>
                <span style={filterLabel}>Fecha de fin</span>
                <DatePicker
                  value={pagoFilterDraft.to}
                  onChange={v => setPagoFilterDraft(f => ({ ...f, to: v }))}
                  placeholder="Hasta cuándo"
                />
              </div>
              <input
                className="input"
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
const chip: CSSProperties = {
  fontSize: 12, padding: '4px 10px', borderRadius: 999,
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  color: 'var(--text-secondary)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 5,
};
const emptyRow: CSSProperties = {
  padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13,
};
const countBadge: CSSProperties = {
  marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
  background: 'var(--bg-hover)', borderRadius: 999, padding: '1px 8px',
};
const pendBadge: CSSProperties = {
  marginLeft: 8, fontSize: 10.5, fontWeight: 600, color: 'var(--text-tertiary)',
  border: '1px solid var(--border-subtle)', borderRadius: 999, padding: '1px 7px',
  whiteSpace: 'nowrap',
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
const filterRow: CSSProperties = {
  display: 'flex', flexWrap: 'nowrap', gap: 8, alignItems: 'flex-end',
};
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
};
const popTitle: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
  color: 'var(--text-tertiary)', marginBottom: 6,
};
const chipsWrap: CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: 6,
};
