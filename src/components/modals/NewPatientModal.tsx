import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, FormField } from '../common/Modal';
import { SectionLabel } from '../common/Toggle';
import { Icon } from '../common/Icon';
import { patientsApi, type ScanFichaResult } from '../../api/patients';
import { useUIStore } from '../../store/ui.store';

interface NewPatientModalProps {
  open: boolean;
  onClose: () => void;
}

const OBRA_SOCIAL_OPTIONS = ['Particular', 'OSDE', 'Swiss Medical', 'Galeno', 'IOMA', 'PAMI', 'Otra'];
const ALLERGY_OPTIONS = ['Penicilina', 'Látex', 'Anestésicos', 'Aspirina', 'Otros antibióticos'];

interface FormState {
  name: string;
  lastName: string;
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
  name: '',
  lastName: '',
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

export function NewPatientModal({ open, onClose }: NewPatientModalProps) {
  const qc = useQueryClient();
  const showToast = useUIStore(s => s.showToast);
  const openModal = useUIStore(s => s.openModal);
  const navigate = useNavigate();
  const [data, setData] = useState<FormState>(EMPTY);
  const [error, setError] = useState('');

  // Photo-scan state.
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanDone, setScanDone] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<ScanFichaResult['existing']>(null);

  // Reset on every open/close transition so the form is always blank when the
  // modal becomes visible again, even if the previous close came from a submit.
  useEffect(() => {
    setData(EMPTY);
    setError('');
    setScanError('');
    setScanDone(false);
    setPreviewUrl(null);
    setDuplicate(null);
    setScanning(false);
  }, [open]);

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
        name: ex.name ?? d.name,
        lastName: ex.lastName ?? d.lastName,
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
    mutationFn: patientsApi.create,
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'No se pudo crear la ficha');
    },
  });

  const isValid = data.name.trim() && data.lastName.trim();

  const buildPayload = () => ({
    name: data.name.trim(),
    lastName: data.lastName.trim(),
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
    const created = await mutation.mutateAsync(buildPayload());
    qc.invalidateQueries({ queryKey: ['patients'] });
    if (mode === 'andSchedule') {
      showToast(`Ficha creada — ${created.name} ${created.lastName}`);
      openModal('newAppointment', { patientId: created._id });
    } else {
      showToast(`Ficha creada — ${created.name} ${created.lastName}`);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo paciente"
      sub="Crear ficha. Solo lo esencial — el resto se completa después."
      width={680}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={mutation.isPending}>Cancelar</button>
          <button
            className="btn btn--secondary"
            disabled={!isValid || mutation.isPending}
            onClick={() => submit('andSchedule')}
          >
            Guardar y agendar turno
          </button>
          <button
            className="btn btn--primary"
            disabled={!isValid || mutation.isPending}
            onClick={() => submit('close')}
          >
            <Icon name="check" /> {mutation.isPending ? 'Creando…' : 'Crear ficha'}
          </button>
        </>
      }
    >
      {error && (
        <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '8px 12px', borderRadius: 6, fontSize: 12.5, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Scan from a paper record photo — front and center. */}
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
                  color: scanDone ? '#16A34A' : 'var(--brand-primary-600)',
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

      {/* Duplicate warning — found a likely existing patient. */}
      {duplicate && (
        <div
          style={{
            border: '1px solid #FCD34D',
            background: '#FEF3C7',
            color: '#92400E',
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
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDuplicate(null)}>
                    Cargar como nuevo (duplicado)
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  Ya existe un paciente parecido: <b>{duplicate.name} {duplicate.lastName}</b>. ¿Qué querés hacer?
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={goToExisting}>
                    Ir a su ficha <Icon name="arrowRight" size={13} />
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDuplicate(null)}>
                    Cargar igual (riesgo de duplicado)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SectionLabel>Datos personales</SectionLabel>
      <div className="form-row form-row--2">
        <FormField label="Nombre">
          <input
            className="input"
            autoFocus
            placeholder="Lucía"
            value={data.name}
            onChange={e => upd('name', e.target.value)}
          />
        </FormField>
        <FormField label="Apellido">
          <input
            className="input"
            placeholder="Fernández"
            value={data.lastName}
            onChange={e => upd('lastName', e.target.value)}
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
        <FormField label="Teléfono" hint="Para WhatsApp">
          <input
            className="input"
            placeholder="+54 9 11 ..."
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {OBRA_SOCIAL_OPTIONS.map(o => (
          <button
            key={o}
            type="button"
            onClick={() => upd('obraSocial', o)}
            style={{
              padding: '5px 11px',
              fontSize: 12,
              borderRadius: 999,
              border: '1px solid',
              borderColor: data.obraSocial === o ? 'var(--brand-primary)' : 'var(--border-default)',
              background: data.obraSocial === o ? 'var(--brand-primary-50)' : 'var(--bg-surface)',
              color: data.obraSocial === o ? 'var(--brand-primary-600)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ALLERGY_OPTIONS.map(a => {
            const has = data.allergies.includes(a);
            return (
              <button
                key={a}
                type="button"
                onClick={() => toggleAllergy(a)}
                style={{
                  padding: '5px 11px',
                  fontSize: 12,
                  borderRadius: 999,
                  border: '1px solid',
                  borderColor: has ? 'var(--warning)' : 'var(--border-default)',
                  background: has ? '#FEF3C7' : 'var(--bg-surface)',
                  color: has ? '#92400E' : 'var(--text-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                }}
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
