import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  appointmentsApi,
  type Appointment,
  type AppointmentStatus,
} from '../../api/appointments';
import { patientsApi, type Patient } from '../../api/patients';
import { dayNotesApi, type Priority } from '../../api/dayNotes';
import { clinicsApi } from '../../api/clinics';
import { useUIStore } from '../../store/ui.store';
import { useAuthStore } from '../../store/auth.store';
import { useFlip } from '../../hooks/useFlip';
import { Icon } from '../common/Icon';
import { Avatar } from '../common/Avatar';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { StatusBadge, FichaPendingBadge } from '../common/StatusBadge';
import { ResolveMenu } from '../common/ResolveMenu';
import { PatientPicker } from '../common/PatientPicker';
import { NewPatientModal } from '../modals/NewPatientModal';
import { CustomTreatmentsModal } from '../common/CustomTreatmentsModal';
import { CustomSlotsModal } from '../common/CustomSlotsModal';
import { AppointmentReminderModal } from './AppointmentReminderModal';
import { hhmm, isFichaPending, needsResolution } from '../../lib/appointment';
import { QUICK_CHIPS } from '../../lib/quickWork';

const DURATIONS = [15, 30, 45, 60, 90];
const TIMES = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30',
];

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nextSlot(base: Date): string {
  const d = new Date(base);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function apptLabel(a: Appointment, patientMap: Map<string, Patient>): string {
  const p = a.patientId ? patientMap.get(a.patientId) : undefined;
  if (p) return `${p.name} ${p.lastName}`;
  return a.patientName || 'Paciente';
}

interface LibretaViewProps {
  /** Dirección del último salto de día (para deslizar la hoja al lado correcto). */
  dayMove?: { dir: 'next' | 'prev'; n: number };
  appts: Appointment[];
  patientMap: Map<string, Patient>;
  selectedDate: Date;
  now: Date;
  isMobile: boolean;
  onOpenPatient: (id: string, trabajo?: string) => void;
  onResolve: (id: string, status: AppointmentStatus) => void;
  onReschedule: (appt: Appointment) => void;
  onOpenFicha: (appt: Appointment) => void;
  onDelete: (appt: Appointment) => void;
  onEditPatient: (patientId: string) => void;
}

export function LibretaView({
  dayMove,
  appts,
  patientMap,
  selectedDate,
  now,
  isMobile,
  onOpenPatient,
  onResolve,
  onReschedule,
  onOpenFicha,
  onDelete,
  onEditPatient,
}: LibretaViewProps) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);

  // ---- alta rápida ----
  const [time, setTime] = useState(() => nextSlot(new Date()));
  const [duration, setDuration] = useState(30);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');
  const [trabajo, setTrabajo] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [slotOpen, setSlotOpen] = useState(false);
  const [trabOpen, setTrabOpen] = useState(false);
  const [customTreatOpen, setCustomTreatOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const quickRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const trabRef = useRef<HTMLDivElement>(null);

  // Cerrar popovers (horario / trabajo) al clickear afuera.
  useEffect(() => {
    if (!slotOpen && !trabOpen) return;
    const h = (e: MouseEvent) => {
      if (slotRef.current && !slotRef.current.contains(e.target as Node)) setSlotOpen(false);
      if (trabRef.current && !trabRef.current.contains(e.target as Node)) setTrabOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [slotOpen, trabOpen]);

  // Trabajos rápidos del consultorio (mismos que Ficha rápida). Default = lista corta.
  const { data: settings } = useQuery({ queryKey: ['clinic-settings'], queryFn: clinicsApi.getSettings });
  const treatments = settings?.quickTreatments?.length ? settings.quickTreatments : QUICK_CHIPS;
  const slots = settings?.slotTimes?.length ? settings.slotTimes : TIMES;
  const [customSlotsOpen, setCustomSlotsOpen] = useState(false);

  // Crear paciente rápido desde búsqueda inline
  const quickCreateMut = useMutation({
    mutationFn: (fullName: string) => patientsApi.quickCreate(fullName),
    onSuccess: (newPatient, fullName) => {
      pickPatient(newPatient);
      setSearchOpen(false);
      showToast(`${newPatient.name || fullName} creado ✓`);
      // Auto-agenda el turno con el paciente recién creado. Pasamos su _id como
      // override explícito: si dependiéramos del estado `patientId`, el closure
      // de este setTimeout lo lee stale (null, el setState de pickPatient todavía
      // no re-renderizó) → anotar() reabriría el cartel "no existe" y crearía un
      // segundo paciente al confirmar de nuevo. Con el id explícito va derecho.
      anotar(newPatient._id);
    },
    onError: () => showToast('No se pudo crear el paciente', 'error'),
  });

  // Precarga el paciente si venimos de "Guardar y agendar turno" (?patientId=…).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const pid = searchParams.get('patientId');
    const pname = searchParams.get('patientName');
    if (pid && pname) {
      setPatientId(pid);
      setPatientName(pname);
      setSearchParams({}, { replace: true });
      quickRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recordatorio de turno por WhatsApp.
  const clinicName = useAuthStore(s => s.clinic?.name) ?? 'tu consultorio';
  const [remindTarget, setRemindTarget] = useState<Appointment | null>(null);
  const [linkPatientTarget, setLinkPatientTarget] = useState<Appointment | null>(null);
  // Paciente elegido en el modal de vincular (antes de confirmar con "Vincular").
  const [linkSelected, setLinkSelected] = useState<string | null>(null);
  // Turno para el que se está creando un paciente nuevo (se vincula al crearlo).
  const [createLinkTarget, setCreateLinkTarget] = useState<Appointment | null>(null);
  const remindMut = useMutation({
    mutationFn: (apptId: string) => appointmentsApi.markReminderSent(apptId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
  const linkMut = useMutation({
    mutationFn: ({ apptId, patientId }: { apptId: string; patientId: string }) =>
      appointmentsApi.update(apptId, { patientId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      setLinkPatientTarget(null);
      setLinkSelected(null);
      showToast('Paciente vinculado ✓');
    },
    onError: () => showToast('No se pudo vincular el paciente', 'error'),
  });
  const dateLabel = selectedDate.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  // La lista de pacientes se abre al enfocar (aunque esté vacío): muestra
  // algunos y filtra en vivo a medida que se escribe.
  const { data: searchResults = [] } = useQuery({
    queryKey: ['patients', 'libreta-search', patientName],
    queryFn: () => patientsApi.findAll(patientName.trim() || undefined),
    enabled: searchOpen && !patientId,
  });

  // Horarios ya ocupados del día → para marcar slots y detectar sobreturno.
  const takenSet = useMemo(() => {
    const s = new Set<string>();
    appts.forEach(a => {
      if (a.status !== 'CANCELLED' && a.status !== 'NO_SHOW') s.add(hhmm(a.startsAt));
    });
    return s;
  }, [appts]);
  const isSobreturno = takenSet.has(time);

  const createMut = useMutation({
    mutationFn: appointmentsApi.create,
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast(typeof msg === 'string' ? msg : 'No se pudo anotar el turno', 'error');
    },
  });

  const pickPatient = (p: Patient) => {
    setPatientId(p._id);
    setPatientName(`${p.name} ${p.lastName}`);
    setSearchOpen(false);
  };

  const [confirmCreatePatient, setConfirmCreatePatient] = useState<string | null>(null);
  // Anti doble-submit: bloquea que dos llamadas casi simultáneas a anotar()
  // (doble-click en "Anotar"/"Sobreturno" antes de que el botón se deshabilite)
  // creen dos turnos. La guarda de arriba está en el ConfirmDialog; esta cubre
  // el path directo (paciente ya vinculado, sin diálogo de por medio).
  const submittingRef = useRef(false);

  const anotar = async (patientIdOverride?: string) => {
    const name = patientName.trim();
    if (!name) {
      showToast('Escribí un paciente');
      nameRef.current?.focus();
      return;
    }

    const finalPatientId = patientIdOverride || patientId;
    // Si no hay paciente vinculado y no es un override (creación rápida), pedir confirm
    if (!finalPatientId && !patientIdOverride) {
      setConfirmCreatePatient(name);
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const [h, m] = time.split(':').map(Number);
      const start = new Date(selectedDate);
      start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + duration * 60_000);

      // El sobreturno se detecta solo (aviso suave inline) y se apila sin diálogo.
      await createMut.mutateAsync({
        patientId: finalPatientId ?? undefined,
        patientName: name,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        title: trabajo.trim() || undefined,
        allowOverlap: isSobreturno,
      });
      qc.invalidateQueries({ queryKey: ['appointments'] });

      const firstName = ((finalPatientId && patientMap.get(finalPatientId)?.name) || name).split(' ')[0];
      showToast(
        isSobreturno
          ? `¡Listo! Sobreturno de ${firstName} anotado`
          : `¡Listo! Turno de ${firstName} anotado`,
      );

      // Solo limpiar los campos: sin saltar de horario ni robar el foco, para que
      // el usuario navegue libre por la lista.
      setPatientId(null);
      setPatientName('');
      setTrabajo('');
      setSearchOpen(false);
    } finally {
      submittingRef.current = false;
    }
  };

  const addChip = (c: string) => setTrabajo(t => (t.trim() ? `${t.trim()} ${c}` : c));

  const startSobreturno = (t: string) => {
    setTime(t);
    setPatientId(null);
    setPatientName('');
    setTrabajo('');
    quickRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => nameRef.current?.focus(), 150);
  };

  // Agrupar por horario para apilar sobreturnos bajo cada hora.
  const groups = useMemo(() => {
    const sorted = [...appts].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const map = new Map<string, Appointment[]>();
    for (const a of sorted) {
      const t = hhmm(a.startsAt);
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(a);
    }
    return Array.from(map.entries());
  }, [appts]);

  // Mismo efecto que en la ficha: al anotar un turno, las filas de abajo se
  // corren para hacerle lugar en vez de saltar. Anda igual en celular y tablet
  // (es transform puro, corre en el compositor).
  const listaRef = useRef<HTMLDivElement>(null);
  useFlip(listaRef, { insert: true });

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-app)', padding: isMobile ? 12 : 20 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 248px',
          gap: 16,
          alignItems: 'start',
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        {/* ---------- Columna principal: la hoja del cuaderno ----------
             lb-sheet--ruled dibuja la línea de margen roja a 92px del borde,
             igual que el renglón izquierdo de la libreta de papel. */}
        <div className="card lb-sheet lb-sheet--ruled" style={{ overflow: 'visible' }}>
          {/* Alta rápida */}
          <div
            ref={quickRef}
            style={{
              padding: 14,
              borderBottom: '2px solid var(--border-default)',
              background: 'var(--bg-muted)',
              position: 'relative',
              // Por encima de cualquier cosa que la lista pueda generar: sus
              // filas llegan a z-index 2 mientras el FLIP las mueve, y en un
              // empate gana la de más abajo en el HTML (la fila). El
              // formulario y sus paneles tienen que ganar siempre.
              zIndex: 20,
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
              {/* Hora + duración: popover con los slots del día */}
              <div ref={slotRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  type="button"
                  className="input"
                  onClick={() => setSlotOpen(o => !o)}
                  style={{
                    width: 120,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    background: 'var(--bg-surface)',
                  }}
                >
                  <Icon name="clock" size={13} style={{ color: 'var(--text-tertiary)' }} />
                  <span className="mono" style={{ fontWeight: 600 }}>{time}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{duration}m</span>
                </button>
                {slotOpen && (
                  <div
                    className="lb-menupop"
                    style={{
                      transformOrigin: 'top left',
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      zIndex: 30,
                      width: 420,
                      maxWidth: '92vw',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 10,
                      boxShadow: 'var(--shadow-lg)',
                      padding: 14,
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      Duración
                    </div>
                    <div className="seg" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
                      {DURATIONS.map(d => (
                        <button
                          key={d}
                          type="button"
                          className={`seg__btn ${duration === d ? 'is-active' : ''}`}
                          onClick={() => setDuration(d)}
                        >
                          {d}m
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      Slots del día
                    </div>
                    <div className="slot-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                      {slots.map(t => {
                        const taken = takenSet.has(t);
                        const sel = t === time;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              setTime(t);
                              setSlotOpen(false);
                              setSearchOpen(true);
                              setTimeout(() => nameRef.current?.focus(), 60);
                            }}
                            className="mono"
                            title={taken ? 'Ya hay turno — se anota como sobreturno' : undefined}
                            style={{
                              position: 'relative',
                              padding: '9px 0',
                              borderRadius: 6,
                              fontSize: 13,
                              fontWeight: 500,
                              background: sel ? 'var(--brand-primary)' : 'var(--bg-surface)',
                              color: sel ? 'white' : 'var(--text-primary)',
                              border: '1px solid',
                              borderColor: sel ? 'var(--brand-primary)' : 'var(--border-subtle)',
                              cursor: 'pointer',
                            }}
                          >
                            {t}
                            {taken && !sel && (
                              <span style={{ position: 'absolute', top: 3, right: 4, width: 5, height: 5, borderRadius: 5, background: 'var(--warning)' }} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 6, background: 'var(--warning)', display: 'inline-block' }} />
                      ya tiene turno (se apila como sobreturno)
                    </div>
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); setSlotOpen(false); setCustomSlotsOpen(true); }}
                      className="lb-chip lb-chip--add"
                      style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
                    >
                      <Icon name="settings" size={13} /> Personalizar horarios
                    </button>
                  </div>
                )}
              </div>

              {/* Paciente: se abre al enfocar, filtra en vivo, fallback nombre libre */}
              <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 150 }}>
                <Icon
                  name="search"
                  size={14}
                  style={{ position: 'absolute', left: 11, top: 12, color: 'var(--text-tertiary)', pointerEvents: 'none' }}
                />
                <input
                  ref={nameRef}
                  className="input"
                  placeholder="Paciente…"
                  data-quick-add-patient
                  value={patientName}
                  onChange={e => {
                    setPatientName(e.target.value);
                    setPatientId(null);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (patientName.trim() && !patientId && searchResults.length === 0) {
                        quickCreateMut.mutate(patientName.trim());
                      } else if (patientId) {
                        anotar();
                      }
                    }
                    if (e.key === 'Escape') setSearchOpen(false);
                  }}
                  style={{ width: '100%', paddingLeft: 32 }}
                />
                {patientId && (
                  <Icon
                    name="check"
                    size={14}
                    style={{ position: 'absolute', right: 10, top: 12, color: 'var(--success)' }}
                  />
                )}
                {searchOpen && !patientId && (
                  <div
                    className="lb-menupop"
                    style={{
                      transformOrigin: 'top left',
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 8,
                      boxShadow: 'var(--shadow-lg)',
                      zIndex: 20,
                      overflow: 'hidden',
                      maxHeight: 300,
                      overflowY: 'auto',
                    }}
                  >
                    {searchResults.length === 0 && patientName.trim() && (
                      <div
                        onMouseDown={e => {
                          e.preventDefault();
                          quickCreateMut.mutate(patientName.trim());
                        }}
                        style={{
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          cursor: quickCreateMut.isPending ? 'wait' : 'pointer',
                          fontSize: 12,
                          fontWeight: 500,
                          color: 'var(--brand-primary-600)',
                          background: 'var(--brand-primary-50)',
                          opacity: quickCreateMut.isPending ? 0.6 : 1,
                        }}
                      >
                        <Icon name="plus" size={14} />
                        {quickCreateMut.isPending ? 'Creando...' : `Crear: ${patientName.trim()}`}
                      </div>
                    )}
                    {searchResults.length === 0 && !patientName.trim() && (
                      <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-tertiary)' }}>
                        Sin coincidencias.
                      </div>
                    )}
                    {searchResults.slice(0, patientName.trim() ? 8 : 4).map(p => (
                      <div
                        key={p._id}
                        onMouseDown={e => {
                          e.preventDefault();
                          pickPatient(p);
                        }}
                        style={{
                          padding: '8px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 9,
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border-subtle)',
                          fontSize: 13,
                        }}
                        onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseOut={e => (e.currentTarget.style.background = '')}
                      >
                        <Avatar name={p.name} lastName={p.lastName} id={p._id} size="sm" />
                        <span style={{ flex: 1, fontWeight: 500 }}>{p.name} {p.lastName}</span>
                        {p.obraSocial && (
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{p.obraSocial}</span>
                        )}
                      </div>
                    ))}
                    {patientName.trim().length >= 1 && (
                      <div
                        onMouseDown={e => { e.preventDefault(); setSearchOpen(false); }}
                        style={{ padding: '9px 12px', fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--bg-muted)' }}
                      >
                        Enter para anotar <b style={{ color: 'var(--text-secondary)' }}>«{patientName.trim()}»</b> sin ficha
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Trabajo con solapa de chips (mismos que Ficha rápida) */}
              <div ref={trabRef} style={{ position: 'relative', flex: '1 1 180px', minWidth: 150 }}>
                <input
                  className="input"
                  placeholder="Trabajo… ej: 1°V op o limp?"
                  value={trabajo}
                  onChange={e => setTrabajo(e.target.value)}
                  onFocus={() => setTrabOpen(true)}
                  onKeyDown={e => e.key === 'Enter' && anotar()}
                  style={{ width: '100%' }}
                />
                {trabOpen && (
                  <div
                    className="lb-menupop"
                    style={{
                      transformOrigin: 'top left',
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      zIndex: 30,
                      width: 280,
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
                      {treatments.map(c => (
                        <button
                          key={c}
                          type="button"
                          className="lb-chip"
                          onMouseDown={e => { e.preventDefault(); addChip(c); }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); setTrabOpen(false); setCustomTreatOpen(true); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 10, padding: 8, borderRadius: 7, border: '1px dashed var(--border-default)', background: 'transparent', color: 'var(--brand-primary-600)', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, justifyContent: 'center' }}
                    >
                      <Icon name="settings" size={13} /> Personalizar trabajos
                    </button>
                  </div>
                )}
              </div>

              <button
                className="btn btn--primary"
                onClick={() => anotar()}
                disabled={createMut.isPending}
                style={{
                  flexShrink: 0,
                  minWidth: 132,
                  justifyContent: 'center',
                  ...(isSobreturno
                    ? { background: 'var(--warning)', borderColor: 'var(--warning)', color: '#fff' }
                    : {}),
                }}
              >
                <Icon name={isSobreturno ? 'alert' : 'plus'} size={14} />{' '}
                {isSobreturno ? 'Sobreturno' : 'Anotar'}
              </button>
            </div>
          </div>

          {/* Lista. `insert: true` porque acá una fila puede nacer EN EL MEDIO
              (un sobreturno entre dos turnos, o una hora anterior a las ya
              anotadas): las de abajo tienen que correrse para abrirle lugar. */}
          <div
            ref={listaRef}
            // Encierra el apilado de las filas: los z-index que pone el FLIP se
            // resuelven acá adentro y no pueden competir con el formulario.
            style={{ isolation: 'isolate' }}
            // La `key` remonta la lista para que la animación vuelva a correr
            // en cada salto. Solo la hoja: el formulario de arriba se queda
            // quieto (si no, se perdería lo que estuvieras tipeando).
            key={dayMove?.n ?? 0}
            className={dayMove && dayMove.n > 0 ? `lb-day-${dayMove.dir}` : undefined}
          >
          {groups.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Sin turnos anotados. Cargá el primero arriba ↑
            </div>
          ) : (
            groups.map(([t, items]) => (
              <div key={t} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {items.map((a, idx) => {
                  const label = apptLabel(a, patientMap);
                  const unresolved = needsResolution(a, now);
                  const rowPhone = a.patientId ? patientMap.get(a.patientId)?.phone : undefined;
                  const canRemind = Boolean(rowPhone);
                  return (
                    <div
                      key={a._id}
                      data-flip={a._id}
                      className="lb-row"
                      style={{
                        // Sin `transparent` explícito: un fondo inline le gana a
                        // .lb-flip, y la fila que se mueve necesita ser opaca
                        // para no transparentarse sobre la de al lado.
                        ...(unresolved ? { background: 'color-mix(in srgb, var(--warning) 6%, transparent)' } : {}),
                        borderTop: idx > 0 ? '1px dashed var(--border-subtle)' : 'none',
                        borderBottom: 'none',
                      }}
                    >
                      {idx === 0 ? (
                        <div className="lb-time">{t}</div>
                      ) : (
                        <div className="lb-sobre">sobre →</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                          <span className="lb-name">{label}</span>
                          {a.title && <span className="lb-sub">{a.title}</span>}
                          {!a.patientId && (
                            <button
                              className="btn btn--secondary"
                              onClick={e => { e.stopPropagation(); setLinkSelected(null); setLinkPatientTarget(a); }}
                              style={{ height: 24, padding: '0 9px', fontSize: 11, borderRadius: 999 }}
                            >
                              Vincular paciente
                            </button>
                          )}
                        </div>
                        {/* SCHEDULED es el estado por defecto (3 de cada 4 turnos):
                            mostrarlo en todas las filas repetía lo mismo sin
                            aportar nada y le robaba protagonismo al trabajo. El
                            badge aparece solo cuando dice algo — atendido, no
                            asistió, en el sillón. Si no hay nada que mostrar, la
                            fila ni siquiera dibuja el renglón. */}
                        {(() => {
                          const verEstado = a.status !== 'SCHEDULED';
                          const verSinFicha = !a.patientId;
                          const verFichaPend = isFichaPending(a) && !!a.patientId;
                          if (!verEstado && !verSinFicha && !verFichaPend) return null;
                          return (
                            <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                              {verEstado && <StatusBadge key={a.status} status={a.status} />}
                              {verSinFicha && (
                                <span className="badge badge--warning" title="Turno cargado en la agenda sin ficha de paciente vinculada">
                                  <Icon name="clipboard" size={10} /> Sin ficha
                                </span>
                              )}
                              {verFichaPend && <FichaPendingBadge onClick={() => onOpenFicha(a)} />}
                              {/* El estado "recordado" NO va como chip acá: lo muestra
                                  el propio botón de la acción (tilde verde + "Recordado"). */}
                            </div>
                          );
                        })()}
                      </div>
                      {/* Acciones de fila (patrón obligatorio: ícono 32×32 con
                          micro-etiqueta SIEMPRE visible debajo, nunca tooltip).
                          En celular quedan solo "Recordar" y "Más". */}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        {canRemind ? (
                          // Una vez enviado, el mismo botón queda en verde con
                          // tilde ("Recordado") — sin chip aparte. Se puede
                          // volver a tocar para reenviar.
                          <button
                            className={`lb-act ${a.reminderSent ? 'lb-act--done' : 'lb-act--wsp'}`}
                            title={a.reminderSent ? 'Ya se avisó — tocá para reenviar' : 'Recordar por WhatsApp'}
                            onClick={e => { e.stopPropagation(); setRemindTarget(a); }}
                          >
                            <span className="lb-act__ic">
                              <Icon name={a.reminderSent ? 'check' : 'whatsapp'} size={17} />
                            </span>
                            <span className="lb-act__lbl">{a.reminderSent ? 'Recordado' : 'Recordar'}</span>
                          </button>
                        ) : (
                          // El slot de WhatsApp NUNCA se oculta: sin celular se
                          // muestra apagado y al tocarlo abre editar paciente
                          // para cargar el número.
                          <button
                            className="lb-act lb-act--off"
                            title="Sin celular cargado — tocá para agregarlo"
                            onClick={e => { e.stopPropagation(); if (a.patientId) onEditPatient?.(a.patientId); }}
                          >
                            <span className="lb-act__ic"><Icon name="whatsapp" size={17} /></span>
                            <span className="lb-act__lbl">Sin celu</span>
                          </button>
                        )}
                        {a.patientId && (
                          <>
                            <button
                              className="lb-act lb-act--hide-sm"
                              title="Ver / editar datos del paciente"
                              onClick={e => { e.stopPropagation(); onEditPatient?.(a.patientId!); }}
                            >
                              <span className="lb-act__ic"><Icon name="user" size={17} /></span>
                              <span className="lb-act__lbl">Paciente</span>
                            </button>
                            <button
                              className="lb-act lb-act--hide-sm"
                              title="Abrir ficha clínica"
                              onClick={e => { e.stopPropagation(); onOpenPatient(a.patientId!); }}
                            >
                              <span className="lb-act__ic"><Icon name="clipboard" size={17} /></span>
                              <span className="lb-act__lbl">Ficha</span>
                            </button>
                          </>
                        )}
                        <ResolveMenu
                          appt={a}
                          onResolve={onResolve}
                          onOpenFicha={onOpenFicha}
                          onReschedule={onReschedule}
                          onDelete={onDelete}
                          onRemind={canRemind ? () => setRemindTarget(a) : undefined}
                          onEditPatient={a.patientId ? () => onEditPatient?.(a.patientId!) : undefined}
                        />
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={() => startSobreturno(t)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    // 94px = donde arranca el texto de las filas, o sea a la
                    // derecha de la línea de margen. Antes la cruzaba.
                    padding: '7px 16px 10px 94px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: 'var(--brand-primary-600)',
                  }}
                >
                  <Icon name="plus" size={12} /> sobreturno
                </button>
              </div>
            ))
          )}
          </div>
        </div>

        {/* ---------- Aside: Notas + Prioridades ---------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <NotesAndPriorities day={toYMD(selectedDate)} />
        </div>
      </div>

      <CustomTreatmentsModal open={customTreatOpen} initial={treatments} onClose={() => setCustomTreatOpen(false)} />
      <CustomSlotsModal open={customSlotsOpen} initial={slots} onClose={() => setCustomSlotsOpen(false)} />

      {remindTarget && (
        <AppointmentReminderModal
          open
          onClose={() => setRemindTarget(null)}
          patientName={apptLabel(remindTarget, patientMap)}
          phone={remindTarget.patientId ? patientMap.get(remindTarget.patientId)?.phone : undefined}
          dateLabel={dateLabel}
          time={hhmm(remindTarget.startsAt)}
          clinicName={clinicName}
          alreadySent={remindTarget.reminderSent}
          onSent={() => {
            remindMut.mutate(remindTarget._id);
            showToast(`Recordatorio abierto — ${apptLabel(remindTarget, patientMap).split(' ')[0]} ✓`);
          }}
        />
      )}

      {/* Confirm crear paciente si no existe y presiona Anotar */}
      {confirmCreatePatient && (
        <ConfirmDialog
          open={true}
          title="Este paciente no existe"
          message={`¿Desea crear paciente "${confirmCreatePatient}" y agendar el turno?`}
          confirmLabel="Crear y anotar"
          onConfirm={() => {
            if (quickCreateMut.isPending) return;
            quickCreateMut.mutate(confirmCreatePatient);
            setConfirmCreatePatient(null);
          }}
          onCancel={() => setConfirmCreatePatient(null)}
        />
      )}

      {/* Modal para vincular paciente a turno sin ficha */}
      {linkPatientTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setLinkPatientTarget(null)}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 440,
              width: '100%',
              boxShadow: 'var(--shadow-xl)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Vincular paciente</h3>
              <button
                onClick={() => setLinkPatientTarget(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
              Elegí el paciente para <strong>{linkPatientTarget.patientName || 'este turno'}</strong>, o creá uno nuevo.
            </p>
            <div style={{ marginBottom: 12 }}>
              <PatientPicker value={linkSelected} onChange={setLinkSelected} />
            </div>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setCreateLinkTarget(linkPatientTarget);
                setLinkPatientTarget(null);
              }}
              style={{ width: '100%', marginBottom: 16, justifyContent: 'center' }}
            >
              + Crear paciente nuevo
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                className="btn btn--secondary"
                onClick={() => setLinkPatientTarget(null)}
              >
                Cancelar
              </button>
              <button
                className="btn btn--primary"
                disabled={!linkSelected || linkMut.isPending}
                onClick={() => {
                  if (linkSelected) {
                    linkMut.mutate({ apptId: linkPatientTarget._id, patientId: linkSelected });
                  }
                }}
              >
                {linkMut.isPending ? 'Vinculando…' : 'Vincular'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alta de paciente nuevo que se vincula al turno sin ficha */}
      <NewPatientModal
        open={!!createLinkTarget}
        initialName={createLinkTarget?.patientName}
        onClose={() => setCreateLinkTarget(null)}
        onCreated={patient => {
          if (createLinkTarget) {
            linkMut.mutate({ apptId: createLinkTarget._id, patientId: patient._id });
          }
          setCreateLinkTarget(null);
        }}
      />
    </div>
  );
}

// ===========================================================
// NOTAS DEL DÍA + PRIORIDADES (un doc por clínica y día)
// ===========================================================
function NotesAndPriorities({ day }: { day: string }) {
  const { data } = useQuery({
    queryKey: ['day-notes', day],
    queryFn: () => dayNotesApi.get(day),
  });

  const [notes, setNotes] = useState('');
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [newPri, setNewPri] = useState('');
  const loadedDayRef = useRef<string>('');
  const savedSnapRef = useRef<string>('');

  const saveMut = useMutation({ mutationFn: dayNotesApi.save });

  // Cargar al cambiar de día.
  useEffect(() => {
    if (data && loadedDayRef.current !== day) {
      loadedDayRef.current = day;
      setNotes(data.notes ?? '');
      setPriorities(data.priorities ?? []);
      savedSnapRef.current = JSON.stringify({ notes: data.notes ?? '', priorities: data.priorities ?? [] });
    }
  }, [data, day]);

  // Autosave con debounce; no guarda si no cambió respecto de lo cargado.
  useEffect(() => {
    if (loadedDayRef.current !== day) return;
    const snap = JSON.stringify({ notes, priorities });
    if (snap === savedSnapRef.current) return;
    const t = setTimeout(() => {
      savedSnapRef.current = snap;
      saveMut.mutate({ day, notes, priorities });
    }, 700);
    return () => clearTimeout(t);
  }, [notes, priorities, day, saveMut]);

  const addPriority = () => {
    const text = newPri.trim();
    if (!text) return;
    setPriorities(p => [...p, { text, done: false }]);
    setNewPri('');
  };

  return (
    <>
      <div className="card">
        <div className="card__header" style={{ padding: '12px 16px' }}>
          <div className="card__title">Notas del día</div>
        </div>
        {/* Renglones de cuaderno: el texto se apoya sobre las líneas */}
        <textarea
          className="lb-lines"
          placeholder="Anotá lo que quieras…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
        />
      </div>

      <div className="card">
        <div className="card__header" style={{ padding: '9px 12px' }}>
          <div className="card__title" style={{ fontSize: 12.5 }}>Prioridades</div>
        </div>
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {priorities.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={p.done}
                onChange={() => setPriorities(list => list.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                style={{ width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 12.5,
                  color: p.done ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  textDecoration: p.done ? 'line-through' : 'none',
                }}
              >
                {p.text}
              </span>
              <button
                onClick={() => setPriorities(list => list.filter((_, j) => j !== i))}
                className="btn btn--ghost btn--icon btn--sm"
                title="Quitar"
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              className="input"
              placeholder="Pendiente…"
              value={newPri}
              onChange={e => setNewPri(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPriority()}
              style={{ flex: 1, height: 30, fontSize: 12.5 }}
            />
            <button className="btn btn--secondary btn--icon btn--sm" onClick={addPriority} title="Agregar">
              <Icon name="plus" size={13} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
