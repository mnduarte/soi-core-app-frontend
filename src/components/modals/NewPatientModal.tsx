import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, FormField } from '../common/Modal';
import { SectionLabel } from '../common/Toggle';
import { Icon } from '../common/Icon';
import { patientsApi, type Patient, type ScanFichaResult } from '../../api/patients';
import { patientAge } from '../../lib/format';
import { whatsAppPreview } from '../../lib/phone';
import { splitName } from '../../lib/name';
import { useUIStore } from '../../store/ui.store';

interface NewPatientModalProps {
  open: boolean;
  onClose: () => void;
  // Si viene, el modal edita ese paciente en vez de crear uno nuevo.
  editPatientId?: string;
  // Si viene, tras crear se llama con el paciente recién creado (para vincularlo
  // a algo, ej. un turno sin ficha) en vez de la navegación por defecto.
  onCreated?: (patient: Patient) => void;
  // Precarga el campo "Nombre y apellido" al abrir en modo alta (ej. el nombre
  // suelto del turno de la agenda que se está por vincular). En alta desde cero
  // no se pasa y el campo queda vacío.
  initialName?: string;
}

const OBRA_SOCIAL_OPTIONS = ['Particular', 'OSDE', 'Swiss Medical', 'Galeno', 'IOMA', 'PAMI', 'Otra'];
const ALLERGY_OPTIONS = ['Penicilina', 'Látex', 'Anestésicos', 'Aspirina', 'Otros antibióticos'];

interface FormState {
  fullName: string;
  age: string;
  dni: string;
  phone: string;
  email: string;
  obraSocial: string;
  nAfiliado: string;
  address: string;
  locality: string;
  allergies: string[];
  notes: string;
}

const EMPTY: FormState = {
  fullName: '',
  age: '',
  dni: '',
  phone: '',
  email: '',
  obraSocial: '',
  nAfiliado: '',
  address: '',
  locality: 'CABA',
  allergies: [],
  notes: '',
};

// Downscale a photo client-side (max edge ~1500px, JPEG) before sending — keeps
// the payload small and the vision cost low without losing legibility.
async function fileToScaledBase64(file: File, maxEdge = 1500): Promise<{ data: string; mediaType: string }> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error('read'));
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('img'));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { data: dataUrl.split(',')[1] ?? '', mediaType: file.type || 'image/jpeg' };
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL('image/jpeg', 0.85);
  return { data: out.split(',')[1] ?? '', mediaType: 'image/jpeg' };
}

// Map an extracted obra social string to one of the chip options (else '').
function matchObra(v?: string): string | undefined {
  if (!v) return undefined;
  const found = OBRA_SOCIAL_OPTIONS.find(o => o.toLowerCase() === v.trim().toLowerCase());
  return found ?? 'Otra';
}

// Age derived from a birthdate (YYYY-MM-DD), for the live hint next to the field.
function computeAge(iso: string): number | null {
  if (!iso) return null;
  const b = new Date(iso);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a >= 0 && a < 150 ? a : null;
}

export function NewPatientModal({ open, onClose, editPatientId, onCreated, initialName }: NewPatientModalProps) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const navigate = useNavigate();
  const editing = Boolean(editPatientId);
  // Alta desde un turno de la agenda: el turno ya existe, así que no ofrecemos
  // "agendar turno" y el botón crea + vincula.
  const linking = Boolean(onCreated);
  const [data, setData] = useState<FormState>(EMPTY);
  const [error, setError] = useState('');

  // En edición: traer el paciente y precargar el formulario.
  const { data: editPatient } = useQuery({
    queryKey: ['patient', editPatientId],
    queryFn: () => patientsApi.findById(editPatientId!),
    enabled: open && editing,
  });

  // Photo-scan state.
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanDone, setScanDone] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<ScanFichaResult['existing']>(null);
  const [dupReason, setDupReason] = useState<'name' | 'dni' | null>(null);
  const [dupDismissed, setDupDismissed] = useState(false);

  // Reset on every open/close transition so the form is always blank when the
  // modal becomes visible again, even if the previous close came from a submit.
  // En edición no lo blanqueamos: se precarga con el paciente (efecto de abajo).
  useEffect(() => {
    // En alta precargamos el nombre si vino (ej. turno suelto de la agenda);
    // si no, queda vacío como en un alta desde cero.
    if (!editing) setData(initialName ? { ...EMPTY, fullName: initialName } : EMPTY);
    setError('');
    setScanError('');
    setScanDone(false);
    setPreviewUrl(null);
    setDuplicate(null);
    setDupReason(null);
    setDupDismissed(false);
    setScanning(false);
  }, [open, editing, initialName]);

  // Aviso de duplicado al cargar a mano: por DNI (fuerte) o nombre+apellido.
  // Es suave: se puede crear igual (el DNI no bloquea). No corre en edición.
  useEffect(() => {
    if (editing || dupDismissed) return;
    const { name, lastName: last } = splitName(data.fullName);
    const dni = data.dni.trim();
    if (dni.length < 6 && (name.length < 2 || last.length < 2)) return;
    const t = setTimeout(async () => {
      try {
        if (dni.length >= 6) {
          const byDni = await patientsApi.findAll(dni);
          const m = byDni.find(p => (p.dni ?? '').trim() === dni);
          if (m) {
            setDuplicate({ _id: m._id, name: m.name, lastName: m.lastName, deleted: false });
            setDupReason('dni');
            return;
          }
        }
        if (name.length >= 2 && last.length >= 2) {
          const byName = await patientsApi.findAll(`${name} ${last}`);
          const m = byName.find(
            p =>
              p.name.trim().toLowerCase() === name.toLowerCase() &&
              p.lastName.trim().toLowerCase() === last.toLowerCase(),
          );
          if (m) {
            setDuplicate({ _id: m._id, name: m.name, lastName: m.lastName, deleted: false });
            setDupReason('name');
          }
        }
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(t);
  }, [data.fullName, data.dni, editing, dupDismissed]);

  // Precarga del paciente a editar.
  useEffect(() => {
    if (open && editing && editPatient) {
      const age = patientAge(editPatient);
      setData({
        fullName: `${editPatient.name} ${editPatient.lastName ?? ''}`.trim(),
        age: age != null ? String(age) : '',
        dni: editPatient.dni ?? '',
        phone: editPatient.phone ?? '',
        email: editPatient.email ?? '',
        obraSocial: editPatient.obraSocial ?? '',
        nAfiliado: editPatient.nAfiliado ?? '',
        address: editPatient.address ?? '',
        locality: editPatient.locality ?? '',
        allergies: editPatient.medicalHistory?.allergies ?? [],
        notes: editPatient.medicalHistory?.notes ?? '',
      });
    }
  }, [open, editing, editPatient]);

  const onPhoto = async (file?: File) => {
    if (!file) return;
    setScanError('');
    setScanDone(false);
    setDuplicate(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setScanning(true);
    try {
      const { data: b64, mediaType } = await fileToScaledBase64(file);
      const res = await patientsApi.scanFicha(b64, mediaType);
      const ex = res.extracted;
      // La ficha vieja puede traer la edad escrita o la fecha de nacimiento; si
      // viene la fecha la convertimos a edad para precargar el campo.
      const scannedAge = ex.age ?? (ex.birthDate ? computeAge(ex.birthDate)?.toString() : undefined);
      setData(d => ({
        ...d,
        fullName: [ex.name, ex.lastName].filter(Boolean).join(' ') || d.fullName,
        age: scannedAge ?? d.age,
        dni: ex.dni ?? d.dni,
        phone: ex.phone ?? d.phone,
        email: ex.email ?? d.email,
        address: ex.address ?? d.address,
        locality: ex.locality ?? d.locality,
        obraSocial: matchObra(ex.obraSocial) ?? d.obraSocial,
        notes: ex.notes ?? d.notes,
      }));
      setDuplicate(res.existing);
      setScanDone(true);
      showToast('Datos cargados de la foto — revisalos ✓');
      window.setTimeout(() => setScanDone(false), 4000);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setScanError(typeof msg === 'string' ? msg : 'No se pudo leer la foto. Probá con una más nítida.');
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = '';
      URL.revokeObjectURL(url);
      setPreviewUrl(null);
    }
  };

  const goToExisting = () => {
    if (!duplicate) return;
    navigate(`/patients/${duplicate._id}`);
    onClose();
  };

  const restoreAndGo = async () => {
    if (!duplicate) return;
    try {
      await patientsApi.restore(duplicate._id);
      showToast('Paciente recuperado con su historial ✓');
      navigate(`/patients/${duplicate._id}`);
      onClose();
    } catch {
      showToast('No se pudo recuperar el paciente');
    }
  };

  const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => setData(d => ({ ...d, [k]: v }));

  const toggleAllergy = (a: string) => {
    setData(d => ({
      ...d,
      allergies: d.allergies.includes(a) ? d.allergies.filter(x => x !== a) : [...d.allergies, a],
    }));
  };

  const mutation = useMutation({
    mutationFn: (payload: Partial<Patient>) =>
      editing ? patientsApi.update(editPatientId!, payload) : patientsApi.create(payload),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : editing ? 'No se pudieron guardar los datos' : 'No se pudo crear la ficha');
    },
  });

  const isValid = data.fullName.trim().length >= 2;

  const buildPayload = () => ({
    ...splitName(data.fullName),
    phone: data.phone.trim() || undefined,
    email: data.email.trim() || undefined,
    locality: data.locality.trim() || undefined,
    obraSocial: data.obraSocial || undefined,
    nAfiliado: data.nAfiliado.trim() || undefined,
    age: data.age.trim() ? Number(data.age) : undefined,
    dni: data.dni.trim() || undefined,
    address: data.address.trim() || undefined,
    medicalHistory:
      data.allergies.length || data.notes.trim()
        ? {
            allergies: data.allergies.length ? data.allergies : undefined,
            notes: data.notes.trim() || undefined,
          }
        : undefined,
  });

  const submit = async (mode: 'close' | 'andSchedule') => {
    const saved = await mutation.mutateAsync(buildPayload());
    qc.invalidateQueries({ queryKey: ['patients'] });
    if (editing) {
      qc.invalidateQueries({ queryKey: ['patient', editPatientId] });
      showToast(`¡Listo! Datos de ${saved.name} actualizados`);
      onClose();
      return;
    }
    // Alta desde un flujo que necesita el paciente creado (ej. vincularlo a un
    // turno sin ficha): delega en el callback y no navega.
    if (onCreated) {
      showToast(`¡Listo! Ficha de ${saved.name} creada`);
      onCreated(saved);
      onClose();
      return;
    }
    if (mode === 'andSchedule') {
      showToast(`¡Listo! Ficha de ${saved.name} creada`);
      onClose();
      // A la Libreta diaria con el paciente ya seleccionado en el alta rápida.
      navigate(`/agenda?patientId=${saved._id}&patientName=${encodeURIComponent(`${saved.name} ${saved.lastName}`)}`);
    } else {
      showToast(`¡Listo! Ficha de ${saved.name} creada`);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar paciente' : 'Nuevo paciente'}
      sub={editing ? 'Actualizá los datos del paciente.' : 'Crear ficha. Solo lo esencial — el resto se completa después.'}
      width={620}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={mutation.isPending}>Cancelar</button>
          {!editing && !linking && (
            <button
              className="btn btn--secondary"
              disabled={!isValid || mutation.isPending}
              onClick={() => submit('andSchedule')}
            >
              Guardar y agendar turno
            </button>
          )}
          <button
            className="btn btn--primary"
            disabled={!isValid || mutation.isPending}
            onClick={() => submit('close')}
          >
            <Icon name="check" />{' '}
            {mutation.isPending
              ? 'Guardando…'
              : editing
              ? 'Guardar cambios'
              : linking
              ? 'Crear y vincular'
              : 'Crear ficha'}
          </button>
        </>
      }
    >
      {error && (
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '8px 12px', borderRadius: 6, fontSize: 12.5, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Scan de la ficha por foto — solo al crear (en edición no aplica). */}
      {!editing && (
      <div
        style={{
          border: '1px dashed var(--brand-primary-100)',
          background: 'var(--brand-primary-50)',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={e => onPhoto(e.target.files?.[0])}
        />
        <div className="row row--between" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 10, minWidth: 0, alignItems: 'center' }}>
            {scanning && previewUrl && (
              <img
                src={previewUrl}
                alt=""
                style={{
                  width: 40,
                  height: 40,
                  objectFit: 'cover',
                  borderRadius: 8,
                  border: '1px solid var(--border-subtle)',
                  flexShrink: 0,
                }}
              />
            )}
            {scanning && <div className="spinner" style={{ width: 18, height: 18 }} />}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: scanDone ? 'var(--success)' : 'var(--brand-primary)',
                }}
              >
                {scanning
                  ? 'Leyendo la ficha con IA…'
                  : scanDone
                    ? '✓ Datos cargados de la foto'
                    : '¿El paciente ya tiene ficha en papel?'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1 }}>
                {scanning
                  ? 'Reconociendo nombre, DNI, teléfono y más — tarda unos segundos.'
                  : scanDone
                    ? 'Revisá los datos y guardá. Podés corregir lo que haga falta.'
                    : 'Sacale una foto y completamos los datos solos. Revisalos antes de guardar.'}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            style={{ flexShrink: 0 }}
          >
            <Icon name="camera" size={14} />
            {scanning ? 'Leyendo…' : 'Cargar desde foto'}
          </button>
        </div>
        {scanError && (
          <div style={{ fontSize: 12, color: 'var(--danger)' }}>{scanError}</div>
        )}
      </div>
      )}

      {/* Duplicate warning — found a likely existing patient. */}
      {duplicate && (
        <div
          style={{
            border: '1px solid var(--warning-border)',
            background: 'var(--warning-bg)',
            color: 'var(--warning)',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 16,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <Icon name="alert" size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {duplicate.deleted ? (
              <>
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  Este paciente estaba <b>eliminado</b>: <b>{duplicate.name} {duplicate.lastName}</b>. Conviene <b>recuperarlo</b> para no perder su historial (ficha, fotos, pagos).
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={restoreAndGo}>
                    <Icon name="undo" size={13} /> Recuperar paciente
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setDuplicate(null); setDupDismissed(true); }}>
                    Cargar como nuevo (duplicado)
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  {dupReason === 'dni' ? (
                    <>Ese <b>DNI</b> ya pertenece a <b>{duplicate.name} {duplicate.lastName}</b>. Podés cargarlo igual (si este es el correcto, después borrás el otro).</>
                  ) : (
                    <>Ya existe un paciente parecido: <b>{duplicate.name} {duplicate.lastName}</b>. ¿Qué querés hacer?</>
                  )}
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={goToExisting}>
                    Ir a su ficha <Icon name="arrowRight" size={13} />
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setDuplicate(null); setDupDismissed(true); }}>
                    Cargar igual (riesgo de duplicado)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SectionLabel>Datos personales</SectionLabel>
      <div className="form-row">
        <FormField label="Nombre y apellido">
          <input
            className="input"
            autoFocus
            placeholder="Lucía Fernández"
            value={data.fullName}
            onChange={e => upd('fullName', e.target.value)}
          />
        </FormField>
      </div>
      <div className="form-row form-row--3">
        <FormField label="Edad" hint="años">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            max={130}
            placeholder="35"
            value={data.age}
            onChange={e => upd('age', e.target.value)}
          />
        </FormField>
        <FormField
          label="Celular (WhatsApp)"
          hint={data.phone.trim() ? `WhatsApp: ${whatsAppPreview(data.phone)}` : 'Con este número se manda el recordatorio'}
        >
          <input
            className="input"
            placeholder="11 4563 5988"
            value={data.phone}
            onChange={e => upd('phone', e.target.value)}
          />
        </FormField>
        <FormField label="Email">
          <input
            className="input"
            type="email"
            placeholder="opcional"
            value={data.email}
            onChange={e => upd('email', e.target.value)}
          />
        </FormField>
      </div>
      <div className="form-row form-row--2">
        <FormField label="DNI">
          <input
            className="input"
            placeholder="opcional"
            value={data.dni}
            onChange={e => upd('dni', e.target.value)}
          />
        </FormField>
        <FormField label="Domicilio">
          <input
            className="input"
            placeholder="Calle y número"
            value={data.address}
            onChange={e => upd('address', e.target.value)}
          />
        </FormField>
      </div>

      <SectionLabel>Obra social</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {OBRA_SOCIAL_OPTIONS.map(o => (
          <button
            key={o}
            type="button"
            className={`chip-pill ${data.obraSocial === o ? 'is-active' : ''}`}
            onClick={() => upd('obraSocial', o)}
          >
            {o}
          </button>
        ))}
      </div>
      <div className="form-row form-row--2">
        <FormField label="Nº de afiliado">
          <input
            className="input"
            placeholder="opcional"
            value={data.nAfiliado}
            onChange={e => upd('nAfiliado', e.target.value)}
          />
        </FormField>
        <FormField label="Localidad">
          <input
            className="input"
            value={data.locality}
            onChange={e => upd('locality', e.target.value)}
          />
        </FormField>
      </div>

      <SectionLabel hint="(opcional, se puede completar después)">Antecedentes</SectionLabel>
      <FormField label="Alergias y advertencias">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ALLERGY_OPTIONS.map(a => {
            const has = data.allergies.includes(a);
            return (
              <button
                key={a}
                type="button"
                className={`chip-pill ${has ? 'is-active' : ''}`}
                onClick={() => toggleAllergy(a)}
                style={
                  has
                    ? {
                        // Las alergias marcadas van en terracota (alerta), no en azul.
                        borderColor: 'var(--warning)',
                        background: 'var(--warning-bg)',
                        color: 'var(--warning)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }
                    : undefined
                }
              >
                {has && <Icon name="check" size={11} />}{a}
              </button>
            );
          })}
        </div>
      </FormField>

      <FormField label="Notas clínicas iniciales">
        <textarea
          className="input"
          style={{ height: 60, padding: 10, resize: 'none' }}
          placeholder="Hipertensión, diabético, embarazo, medicación habitual…"
          value={data.notes}
          onChange={e => upd('notes', e.target.value)}
        />
      </FormField>
    </Modal>
  );
}
