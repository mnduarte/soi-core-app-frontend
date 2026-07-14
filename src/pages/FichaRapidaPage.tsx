import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { patientsApi, type Patient } from '../api/patients';
import { transactionsApi, type Transaction, type PaymentMethod } from '../api/transactions';
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
import { galleryApi, photoTypeLabel, type GalleryPhoto, type UploadedPhotoRef } from '../api/gallery';
import { fmtMoney, patientAge } from '../lib/format';
import { toWhatsAppNumber } from '../lib/phone';
import { QUICK_CHIPS } from '../lib/quickWork';

type Kind = 'PAYMENT' | 'CHARGE';

// Montos por defecto (5) si el consultorio todavía no personalizó los suyos.
const DEFAULT_QUICK_AMOUNTS = [5000, 10000, 20000, 30000, 50000];

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
function txLabel(t: Transaction): string {
  if (t.description?.trim()) return t.description;
  return t.type === 'PAYMENT' ? `Pago — ${methodLabel(t.paymentMethod)}` : 'Cargo';
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

  // ---- movimientos ----
  const { data: txs = [] } = useQuery({
    queryKey: ['transactions', id],
    queryFn: () => transactionsApi.findAll(id!),
    enabled: Boolean(id),
  });

  // Fotos de la galería del paciente → agrupadas por movimiento vinculado,
  // para mostrar "foto vinculada" en cada fila de la cuenta corriente.
  const { data: gallerySessions = [] } = useQuery({
    queryKey: ['gallery-sessions', id],
    queryFn: () => galleryApi.listSessions(id!),
    enabled: Boolean(id),
  });
  const photosByTx = useMemo(() => {
    // Cada foto lleva su sessionId + el título/descripción de la sesión (ahí viven).
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

  // Cuenta corriente: cargos/pagos vigentes, orden cronológico + saldo running.
  const rows = useMemo(() => {
    const list = txs
      .filter(t => (t.type === 'CHARGE' || t.type === 'PAYMENT') && !t.voidedAt)
      .sort((a, b) => isoDateOf(a).localeCompare(isoDateOf(b)));
    let saldo = 0;
    return list.map(t => {
      saldo += t.type === 'CHARGE' ? t.amount : -t.amount;
      return { t, saldo };
    });
  }, [txs]);
  const totalDebe = rows.reduce((s, r) => s + (r.t.type === 'CHARGE' ? r.t.amount : 0), 0);
  const totalHaber = rows.reduce((s, r) => s + (r.t.type === 'PAYMENT' ? r.t.amount : 0), 0);

  // ---- formulario de carga ----
  const [kind, setKind] = useState<Kind>('PAYMENT');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [date, setDate] = useState(todayYMD());
  const [prestacion, setPrestacion] = useState('');
  const [amount, setAmount] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [montoOpen, setMontoOpen] = useState(false);
  const montoRef = useRef<HTMLDivElement>(null);
  const [prestOpen, setPrestOpen] = useState(false);
  const prestRef = useRef<HTMLDivElement>(null);

  // Cerrar los popovers (monto / prestación) al clickear afuera.
  useEffect(() => {
    if (!montoOpen && !prestOpen) return;
    const h = (e: MouseEvent) => {
      if (montoRef.current && !montoRef.current.contains(e.target as Node)) setMontoOpen(false);
      if (prestRef.current && !prestRef.current.contains(e.target as Node)) setPrestOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [montoOpen, prestOpen]);

  // Montos rápidos del consultorio (personalizables). Si no configuró, defaults.
  const [customOpen, setCustomOpen] = useState(false);
  const { data: settings } = useQuery({ queryKey: ['clinic-settings'], queryFn: clinicsApi.getSettings });
  const quickAmounts = settings?.quickAmounts?.length ? settings.quickAmounts : DEFAULT_QUICK_AMOUNTS;
  const treatments = settings?.quickTreatments?.length ? settings.quickTreatments : QUICK_CHIPS;
  const [customTreatOpen, setCustomTreatOpen] = useState(false);
  const addPrest = (t: string) => setPrestacion(p => (p.trim() ? `${p.trim()} ${t}` : t));

  const resetForm = () => {
    setEditingId(null);
    setPrestacion('');
    setAmount('');
    setDate(todayYMD());
    setKind('PAYMENT');
    setMethod('CASH');
    setAttachedPhotos([]);
  };

  // Al llegar desde la Agenda (?trabajo=…) se podía precargar la prestación y
  // dejarlo en Cargo. DESHABILITADO por ahora (lo dejamos por si lo necesitamos
  // más adelante): poné PREFILL_FROM_AGENDA = true para reactivarlo.
  const PREFILL_FROM_AGENDA = false;
  const [searchParams] = useSearchParams();
  useEffect(() => {
    if (!PREFILL_FROM_AGENDA) return;
    const trabajo = searchParams.get('trabajo');
    if (trabajo) {
      setPrestacion(trabajo);
      setKind('CHARGE');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addMut = useMutation({ mutationFn: transactionsApi.addMovement });
  const updateMut = useMutation({
    mutationFn: (v: { id: string; dto: Parameters<typeof transactionsApi.updateMovement>[1] }) =>
      transactionsApi.updateMovement(v.id, v.dto),
  });
  const delMut = useMutation({ mutationFn: (txId: string) => transactionsApi.remove(txId) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['transactions', id] });
    qc.invalidateQueries({ queryKey: ['balance', id] });
  };

  // El modal de subida devuelve las fotos ya subidas → las mostramos en el form
  // y las vinculamos al movimiento recién al Agregar.
  const handleUploaded = (refs: UploadedPhotoRef[]) => setAttachedPhotos(prev => [...prev, ...refs]);
  const removeAttached = async (ref: UploadedPhotoRef) => {
    setAttachedPhotos(prev => prev.filter(p => p.photoId !== ref.photoId));
    try {
      await galleryApi.removePhoto(patient!._id, ref.sessionId, ref.photoId);
      qc.invalidateQueries({ queryKey: ['gallery-sessions', id] });
    } catch { /* si falla, la foto queda en la galería sin vincular */ }
  };
  // Vincula las fotos adjuntas al movimiento (txId) y limpia el estado.
  const linkAttached = async (txId: string) => {
    if (!patient || attachedPhotos.length === 0) return;
    for (const ref of attachedPhotos) {
      await galleryApi.updatePhoto(patient._id, ref.sessionId, ref.photoId, { transactionId: txId });
    }
    setAttachedPhotos([]);
    qc.invalidateQueries({ queryKey: ['gallery-sessions', id] });
  };

  // Borrar movimiento: borra el mov y, con sus fotos vinculadas, según la
  // elección: borrarlas también o solo desvincularlas (quedan en la galería).
  const confirmDeleteMovement = async () => {
    if (!patient || !toDelete) return;
    const tx = toDelete;
    const photos = photosByTx.get(tx._id) ?? [];
    const alsoDelete = alsoDeletePhotos;
    setToDelete(null);
    setAlsoDeletePhotos(false);
    try {
      await delMut.mutateAsync(tx._id);
      for (const item of photos) {
        if (alsoDelete) await galleryApi.removePhoto(patient._id, item.sessionId, item.photo._id);
        else await galleryApi.updatePhoto(patient._id, item.sessionId, item.photo._id, { transactionId: '' });
      }
      if (photos.length) qc.invalidateQueries({ queryKey: ['gallery-sessions', id] });
      invalidate();
      showToast(
        photos.length && alsoDelete
          ? `Movimiento y ${photos.length} foto${photos.length === 1 ? '' : 's'} borrados`
          : photos.length
            ? `Movimiento borrado · ${photos.length} foto${photos.length === 1 ? '' : 's'} quedaron en la galería`
            : 'Movimiento borrado',
      );
    } catch {
      showToast('No se pudo borrar', 'error');
    }
  };

  const submit = async () => {
    if (!patient || submitting) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      showToast('Ingresá un monto', 'error');
      return;
    }
    setSubmitting(true);
    // El PATCH de edición NO lleva patientId (el backend no lo acepta).
    const base = {
      type: kind,
      amount: amt,
      paymentMethod: kind === 'PAYMENT' ? method : undefined,
      description: prestacion.trim() || undefined,
      date: new Date(`${date}T12:00:00`).toISOString(),
    };
    const firstName = patient.name.split(' ')[0];
    const nPhotos = attachedPhotos.length;
    try {
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, dto: base });
        await linkAttached(editingId);
        showToast('¡Guardado! Movimiento actualizado', 'success');
      } else {
        const saved = await addMut.mutateAsync({ patientId: patient._id, ...base });
        await linkAttached(saved._id);
        showToast(
          nPhotos > 0
            ? `¡Listo! Movimiento y ${nPhotos} foto${nPhotos === 1 ? '' : 's'} — ${firstName}`
            : kind === 'PAYMENT'
              ? `¡Listo! Pago de ${fmtMoney(amt)} — ${firstName}`
              : `¡Listo! Cargo de ${fmtMoney(amt)} — ${firstName}`,
          'success',
        );
      }
      invalidate();
      resetForm();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast(typeof msg === 'string' ? msg : 'No se pudo guardar', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (t: Transaction) => {
    setEditingId(t._id);
    setKind(t.type === 'CHARGE' ? 'CHARGE' : 'PAYMENT');
    setMethod((t.paymentMethod as PaymentMethod) || 'CASH');
    setDate(isoDateOf(t).slice(0, 10));
    setPrestacion(t.description ?? '');
    setAmount(String(t.amount));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const [toDelete, setToDelete] = useState<Transaction | null>(null);
  const [alsoDeletePhotos, setAlsoDeletePhotos] = useState(false);
  const [odoOpen, setOdoOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState<
    { url: string; category?: string; title?: string; description?: string } | null
  >(null);
  // Fotos ya subidas (vía modal) que se van a vincular al movimiento al Agregar.
  const [attachedPhotos, setAttachedPhotos] = useState<UploadedPhotoRef[]>([]);
  // Cubre TODO el guardado (movimiento + subida de fotos), que puede tardar:
  // deshabilita el botón y muestra spinner para evitar doble click.
  const [submitting, setSubmitting] = useState(false);

  // ============================ RENDER ============================
  return (
    <div className="content" style={{ padding: 0, overflow: 'auto', height: '100%' }}>
      <SectionHeader
        icon="clipboard"
        accent="#7C3AED"
        title="Ficha clínica"
        sub="Registrá tratamientos y pagos en segundos — como el cuaderno, pero sincronizado"
      />
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: isMobile ? 16 : 28 }}>
        <div className="card" style={{ overflow: 'visible' }}>
          <div className="card__header">
            <div>
              <div className="card__title">Cargar movimiento</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 2 }}>
                Elegí el paciente y registrá en una línea
              </div>
            </div>
          </div>

          <div style={{ padding: 16 }}>
            {/* PACIENTE */}
            <div style={{ marginBottom: patient ? 16 : 0 }}>
              <div style={label}>Paciente</div>
              {patient ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 8px 6px 6px',
                      border: '1px solid var(--border-default)',
                      borderRadius: 10,
                      background: 'var(--bg-surface)',
                    }}
                  >
                    <Avatar name={patient.name} lastName={patient.lastName} id={patient._id} size="sm" />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{patient.name} {patient.lastName}</span>
                    <button
                      className="btn btn--ghost btn--icon btn--sm"
                      title="Cambiar paciente"
                      onClick={() => { navigate('/ficha-rapida'); resetForm(); }}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>

                  {/* Datos rápidos del paciente (como en la ficha) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)' }}>
                    {patientAge(patient) != null && (
                      <span><b style={{ color: 'var(--text-primary)' }}>{patientAge(patient)}</b> años</span>
                    )}
                    {patient.phone && (
                      <a
                        href={`https://wa.me/${toWhatsAppNumber(patient.phone)}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir WhatsApp"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--success)', fontWeight: 500, textDecoration: 'none' }}
                      >
                        <Icon name="whatsapp" size={15} /> {patient.phone}
                      </a>
                    )}
                    {patient.obraSocial && <span>· {patient.obraSocial}</span>}
                    {patient.locality && <span style={{ color: 'var(--text-tertiary)' }}>· {patient.locality}</span>}
                  </div>

                  <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
                    <button className="btn btn--secondary btn--sm" onClick={() => setGalleryOpen(true)}>
                      <Icon name="image" size={14} /> Galería
                    </button>
                    <button className="btn btn--secondary btn--sm" onClick={() => setOdoOpen(true)}>
                      <Icon name="tooth" size={14} /> Odontograma
                    </button>
                  </div>
                </div>
              ) : (
                <div ref={searchRef} style={{ position: 'relative', maxWidth: 460 }}>
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
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        right: 0,
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 10,
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 20,
                        overflow: 'hidden',
                      }}
                    >
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

            {/* FILA DE CARGA (solo con paciente elegido) */}
            {patient && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ width: isMobile ? '100%' : 140 }}>
                  <div style={label}>Fecha</div>
                  <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', height: 40 }} />
                </div>

                <div style={{ flex: '1 1 180px', minWidth: 150 }}>
                  <div style={label}>Prestación</div>
                  <div ref={prestRef} style={{ position: 'relative' }}>
                    <input
                      className="input"
                      placeholder={kind === 'PAYMENT' ? 'Opcional (ej: seña)' : 'ej: Extracción 38, Limpieza…'}
                      value={prestacion}
                      onChange={e => setPrestacion(e.target.value)}
                      onFocus={() => setPrestOpen(true)}
                      onKeyDown={e => e.key === 'Enter' && submit()}
                      style={{ width: '100%', height: 40 }}
                    />
                    {prestOpen && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 4px)',
                          left: 0,
                          zIndex: 30,
                          width: 260,
                          maxWidth: '90vw',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 10,
                          boxShadow: 'var(--shadow-lg)',
                          padding: 10,
                        }}
                      >
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                          Trabajos rápidos
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {treatments.map(t => (
                            <button
                              key={t}
                              type="button"
                              onMouseDown={e => { e.preventDefault(); addPrest(t); }}
                              style={{
                                fontSize: 12,
                                padding: '4px 10px',
                                borderRadius: 999,
                                border: '1px solid var(--border-default)',
                                background: 'var(--bg-surface)',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                              }}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); setPrestOpen(false); setCustomTreatOpen(true); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 10, padding: 8, borderRadius: 7, border: '1px dashed var(--border-default)', background: 'transparent', color: 'var(--brand-primary-600)', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, justifyContent: 'center' }}
                        >
                          <Icon name="settings" size={13} /> Personalizar trabajos
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ width: isMobile ? '100%' : 160 }}>
                  <div style={label}>Monto</div>
                  <div ref={montoRef} style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 11, top: 10, color: 'var(--text-tertiary)', fontSize: 13, zIndex: 1 }}>$</span>
                    <input
                      className="input"
                      inputMode="numeric"
                      placeholder="0"
                      value={amount}
                      onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                      onFocus={() => setMontoOpen(true)}
                      onKeyDown={e => e.key === 'Enter' && submit()}
                      style={{ width: '100%', height: 40, paddingLeft: 22 }}
                    />
                    {montoOpen && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 4px)',
                          left: 0,
                          zIndex: 30,
                          width: 240,
                          maxWidth: '86vw',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 10,
                          boxShadow: 'var(--shadow-lg)',
                          padding: 10,
                        }}
                      >
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                          Montos rápidos
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                          {quickAmounts.map(v => (
                            <button
                              key={v}
                              type="button"
                              className="mono"
                              onClick={() => { setAmount(String(v)); setMontoOpen(false); }}
                              style={{
                                padding: '8px 0',
                                borderRadius: 7,
                                fontSize: 13,
                                fontWeight: 600,
                                background: String(v) === amount ? 'var(--brand-primary)' : 'var(--bg-surface)',
                                color: String(v) === amount ? '#fff' : 'var(--text-primary)',
                                border: '1px solid',
                                borderColor: String(v) === amount ? 'var(--brand-primary)' : 'var(--border-subtle)',
                                cursor: 'pointer',
                              }}
                            >
                              {fmtMoney(v)}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onMouseDown={e => { e.preventDefault(); setMontoOpen(false); setCustomOpen(true); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                            marginTop: 8, padding: '8px', borderRadius: 7, border: '1px dashed var(--border-default)',
                            background: 'transparent', color: 'var(--brand-primary-600)', cursor: 'pointer',
                            fontSize: 12.5, fontWeight: 500, justifyContent: 'center',
                          }}
                        >
                          <Icon name="settings" size={13} /> Personalizar montos
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div style={label}>Tipo</div>
                  <div className="seg">
                    {(['CHARGE', 'PAYMENT'] as const).map(k => (
                      <button key={k} type="button" className={`seg__btn ${kind === k ? 'is-active' : ''}`} onClick={() => setKind(k)}>
                        {k === 'CHARGE' ? 'Debe' : 'Haber'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Método: solo aplica al Pago. En Cargo queda visible pero
                    deshabilitado (así el layout no se mueve). */}
                <div style={{ opacity: kind === 'CHARGE' ? 0.45 : 1 }}>
                  <div style={label}>Método</div>
                  <div className="seg">
                    {(['CASH', 'TRANSFER'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        disabled={kind === 'CHARGE'}
                        className={`seg__btn ${kind === 'PAYMENT' && method === m ? 'is-active' : ''}`}
                        onClick={() => setMethod(m)}
                        style={{ cursor: kind === 'CHARGE' ? 'not-allowed' : 'pointer' }}
                      >
                        {m === 'CASH' ? 'Efectivo' : 'Transf.'}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn--primary" onClick={submit} disabled={submitting} style={{ height: 40, minWidth: 116 }}>
                    {submitting ? (
                      <>
                        <span
                          style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', animation: 'spin 0.7s linear infinite', display: 'inline-block' }}
                        />
                        Guardando…
                      </>
                    ) : (
                      <>
                        <Icon name={editingId ? 'check' : 'plus'} size={14} /> {editingId ? 'Guardar' : 'Agregar'}
                      </>
                    )}
                  </button>
                  {editingId && (
                    <button className="btn btn--secondary" onClick={resetForm} disabled={submitting} style={{ height: 40 }}>
                      Cancelar
                    </button>
                  )}
                </div>

                {/* Subir foto: abre el modal; al terminar la muestra acá para
                    vincularla al movimiento recién al Agregar (con opción a quitar). */}
                <div style={{ flex: '1 1 100%', marginTop: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => openModal('uploadPhotos', { patientId: patient._id, onUploaded: handleUploaded })}
                    style={{ border: '1px dashed var(--border-default)' }}
                  >
                    <Icon name="image" size={14} /> Subir foto
                  </button>
                  {attachedPhotos.map(ref => (
                    <div key={ref.photoId} style={{ position: 'relative' }}>
                      <img
                        src={ref.url}
                        onClick={() => setZoomPhoto({ url: ref.url, category: ref.type, title: ref.title, description: ref.description })}
                        style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-subtle)', cursor: 'zoom-in', display: 'block' }}
                      />
                      <button
                        type="button"
                        onClick={() => removeAttached(ref)}
                        title="Quitar foto"
                        style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 999, background: 'var(--danger)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {attachedPhotos.length > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      se {attachedPhotos.length === 1 ? 'vincula' : 'vinculan'} al {editingId ? 'guardar' : 'crear el movimiento'}
                    </span>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* CUENTA CORRIENTE */}
          {patient && (
            <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border-subtle)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}>
                    <Th>Fecha</Th>
                    <Th>Prestación realizada</Th>
                    <Th right>Debe</Th>
                    <Th right>Haber</Th>
                    <Th right>Acciones</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: 28, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                        Sin movimientos todavía. Cargá el primero arriba ↑
                      </td>
                    </tr>
                  )}
                  {rows.map(({ t }) => {
                    const txPhotos = photosByTx.get(t._id) ?? [];
                    return (
                    <tr
                      key={t._id}
                      className="fr-row"
                      style={{ borderTop: '1px solid var(--border-subtle)' }}
                    >
                      <td style={cell} className="mono">{fmtDate(isoDateOf(t))}</td>
                      <td style={cell}>
                        <span className={`badge ${t.type === 'PAYMENT' ? 'badge--success' : 'badge--danger'}`} style={{ marginRight: 8 }}>
                          {t.type === 'PAYMENT' ? 'Pago' : 'Cargo'}
                        </span>
                        {txLabel(t)}
                        {txPhotos.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                            {txPhotos.map(({ photo: ph, title, description }) => (
                              <img
                                key={ph._id}
                                src={ph.thumbnailUrl || ph.url}
                                onClick={() => setZoomPhoto({ url: ph.url, category: ph.type, title, description })}
                                title={`${photoTypeLabel(ph.type)} — foto vinculada`}
                                style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-subtle)', cursor: 'zoom-in', display: 'block' }}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }} className="mono">
                        {t.type === 'CHARGE' ? fmtMoney(t.amount) : '—'}
                      </td>
                      <td style={{ ...cell, textAlign: 'right', color: t.type === 'PAYMENT' ? 'var(--success)' : undefined }} className="mono">
                        {t.type === 'PAYMENT' ? fmtMoney(t.amount) : '—'}
                      </td>
                      <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', gap: 2 }}>
                          <button
                            className="btn btn--ghost btn--icon btn--sm"
                            title={txPhotos.length ? 'Ver / agregar fotos' : 'Adjuntar foto'}
                            onClick={() => openModal('uploadPhotos', { patientId: id, transactionId: t._id })}
                            style={{ position: 'relative', color: txPhotos.length ? 'var(--brand-primary-600)' : undefined }}
                          >
                            <Icon name="image" size={15} />
                            {txPhotos.length > 0 && (
                              <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 999, background: 'var(--brand-primary)', color: 'white', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {txPhotos.length}
                              </span>
                            )}
                          </button>
                          <button className="btn btn--ghost btn--icon btn--sm" title="Editar" onClick={() => startEdit(t)}>
                            <Icon name="edit" size={15} />
                          </button>
                          <button className="btn btn--ghost btn--icon btn--sm" title="Borrar" onClick={() => { setAlsoDeletePhotos(false); setToDelete(t); }} style={{ color: 'var(--danger)' }}>
                            <Icon name="trash" size={15} />
                          </button>
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>

              {rows.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 22, alignItems: 'baseline', padding: '14px 16px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-muted)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Debe total <b className="mono" style={{ fontSize: 15 }}>{fmtMoney(totalDebe)}</b>
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Haber total <b className="mono" style={{ fontSize: 15, color: 'var(--success)' }}>{fmtMoney(totalHaber)}</b>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {(() => {
        const delPhotos = toDelete ? (photosByTx.get(toDelete._id) ?? []) : [];
        const n = delPhotos.length;
        return (
          <ConfirmDialog
            open={!!toDelete}
            title="¿Borrar este movimiento?"
            message="No se puede deshacer. Se recalcula el saldo de la cuenta."
            confirmLabel="Borrar"
            danger
            extra={
              n > 0 ? (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer', lineHeight: 1.4 }}>
                  <input
                    type="checkbox"
                    checked={alsoDeletePhotos}
                    onChange={e => setAlsoDeletePhotos(e.target.checked)}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <span>
                    Borrar también {n === 1 ? 'la foto' : `las ${n} fotos`} vinculada{n === 1 ? '' : 's'}.
                    <br />
                    <span style={{ color: 'var(--text-tertiary)' }}>
                      Si no, {n === 1 ? 'queda' : 'quedan'} en la galería como “Sin movimiento”.
                    </span>
                  </span>
                </label>
              ) : undefined
            }
            onConfirm={confirmDeleteMovement}
            onCancel={() => { setToDelete(null); setAlsoDeletePhotos(false); }}
          />
        );
      })()}

      <CustomAmountsModal open={customOpen} initial={quickAmounts} onClose={() => setCustomOpen(false)} />
      <CustomTreatmentsModal open={customTreatOpen} initial={treatments} onClose={() => setCustomTreatOpen(false)} />

      {/* Modal del odontograma (reusa el componente de la ficha clásica) */}
      {odoOpen && patient && (
        <div
          onClick={() => setOdoOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: isMobile ? 8 : 24, overflowY: 'auto', animation: 'overlayFade 0.12s ease-out' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 1100, margin: 'auto', animation: 'dialogPop 0.16s cubic-bezier(0.16,1,0.3,1)' }}
          >
            <OdontogramCard
              patientId={patient._id}
              patientName={`${patient.name} ${patient.lastName}`}
              onClose={() => setOdoOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Modal de galería del paciente (reusa el contenedor de la sección Galería) */}
      {galleryOpen && patient && (
        <div
          onClick={() => setGalleryOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: isMobile ? 8 : 24, overflowY: 'auto', animation: 'overlayFade 0.12s ease-out' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 1100, margin: 'auto', background: 'var(--bg-surface)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', animation: 'dialogPop 0.16s cubic-bezier(0.16,1,0.3,1)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
                <Icon name="image" size={17} style={{ color: '#7C3AED' }} />
                Galería · {patient.name} {patient.lastName}
              </div>
              <button className="btn btn--secondary btn--sm" onClick={() => setGalleryOpen(false)}>
                <Icon name="x" size={13} /> Cerrar
              </button>
            </div>
            <div style={{ padding: isMobile ? 12 : 18 }}>
              <GalleryContainer patientId={patient._id} embedded />
            </div>
          </div>
        </div>
      )}

      {/* Lightbox de zoom para las fotos vinculadas / preview, con su info */}
      {zoomPhoto && (
        <div
          onClick={() => setZoomPhoto(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, zIndex: 1200, padding: isMobile ? 16 : 32, cursor: 'zoom-out', animation: 'overlayFade 0.12s ease-out' }}
        >
          <button
            onClick={() => setZoomPhoto(null)}
            title="Cerrar"
            style={{ position: 'absolute', top: 18, right: 18, width: 40, height: 40, borderRadius: 999, background: 'rgba(255,255,255,0.16)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(8px)' }}
          >
            <Icon name="x" size={20} />
          </button>
          <img
            src={zoomPhoto.url}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: zoomPhoto.category || zoomPhoto.title || zoomPhoto.description ? '72vh' : '86vh', borderRadius: 10, boxShadow: 'var(--shadow-lg)', cursor: 'default' }}
          />
          {(zoomPhoto.category || zoomPhoto.title || zoomPhoto.description) && (
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '12px 16px', maxWidth: 520, width: '100%', boxShadow: 'var(--shadow-lg)', cursor: 'default' }}
            >
              {zoomPhoto.category && (
                <span
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: 'var(--brand-primary-50)', color: 'var(--brand-primary-600)', fontSize: 12, fontWeight: 600, marginBottom: zoomPhoto.title || zoomPhoto.description ? 8 : 0 }}
                >
                  <Icon name="image" size={12} /> {photoTypeLabel(zoomPhoto.category)}
                </span>
              )}
              {zoomPhoto.title && (
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{zoomPhoto.title}</div>
              )}
              {zoomPhoto.description && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>{zoomPhoto.description}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
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

  // Sincroniza con los montos vigentes cada vez que se abre.
  useEffect(() => {
    if (open) setList(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveMut = useMutation({
    mutationFn: (amounts: number[]) => clinicsApi.updateSettings({ quickAmounts: amounts }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic-settings'] }),
    onError: () => showToast('No se pudo guardar', 'error'),
  });

  // Guarda solo (al agregar/quitar) y confirma con un toast.
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
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, animation: 'overlayFade 0.12s ease-out' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-surface)', borderRadius: 14, width: '100%', maxWidth: 380, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', animation: 'dialogPop 0.16s cubic-bezier(0.16,1,0.3,1)' }}
      >
        <div style={{ padding: '18px 20px 6px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Personalizar montos</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 3 }}>
              Se guardan solos, para todo el equipo.
            </div>
          </div>
          <button className="btn btn--secondary btn--sm" onClick={onClose}>
            <Icon name="x" size={13} /> Cerrar
          </button>
        </div>

        <div style={{ padding: '10px 20px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
          {list.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', padding: '6px 0' }}>Sin montos. Agregá abajo.</div>
          )}
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
            <input
              className="input"
              inputMode="numeric"
              placeholder="Nuevo monto"
              value={nuevo}
              onChange={e => setNuevo(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={e => e.key === 'Enter' && add()}
              style={{ width: '100%', height: 38, paddingLeft: 22 }}
            />
          </div>
          <button className="btn btn--primary" onClick={add} style={{ height: 38 }}>
            <Icon name="plus" size={14} /> Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

const label: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontWeight: 600,
  marginBottom: 6,
};
const cell: CSSProperties = { padding: '11px 14px', fontSize: 13.5, verticalAlign: 'middle' };

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, textAlign: right ? 'right' : 'left', background: 'var(--bg-muted)' }}>
      {children}
    </th>
  );
}
