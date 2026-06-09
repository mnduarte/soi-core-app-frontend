import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { patientsApi, type Patient } from '../api/patients';
import { clinicalEntriesApi, type ClinicalEntryType } from '../api/clinical-entries';
import { NewClinicalEntryModal } from '../components/patient/NewClinicalEntryModal';
import { AddChargeModal } from '../components/patient/AddChargeModal';
import { WhatsAppReminderModal } from '../components/patient/WhatsAppReminderModal';
import { transactionsApi } from '../api/transactions';
import { ageFromBirthDate, fmtMoney } from '../lib/format';
import { useUIStore } from '../store/ui.store';
import { Icon } from '../components/common/Icon';
import { TabBar } from '../components/common/TabBar';
import { PatientHeader } from '../components/patient/PatientHeader';
import { OdontogramCard } from '../components/patient/OdontogramCard';
import { TreatmentPlanCard } from '../components/patient/TreatmentPlanCard';
import { GalleryContainer } from '../components/gallery/GalleryContainer';
import {
  ObservationsCard,
  NextAppointmentCard,
  AllergiesCard,
} from '../components/patient/SideRail';

type TabKey = 'ficha' | 'historial' | 'galeria' | 'pagos' | 'datos';

export default function PatientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('ficha');
  // Collapses the header once the content scrolls. Hysteresis (12 vs 48) avoids
  // flicker right around the threshold.
  const [collapsed, setCollapsed] = useState(false);

  const { data: patient, isLoading, isError } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientsApi.findById(id!),
    enabled: Boolean(id),
  });

  // Eagerly fetch the history count so the tab badge stays accurate even when
  // the tab isn't open. Cheap enough that it's worth the small upfront request.
  const { data: history = [] } = useQuery({
    queryKey: ['clinical-entries', id],
    queryFn: () => clinicalEntriesApi.findAll(id!),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="content" style={{ padding: 32 }}>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Cargando ficha…</div>
      </div>
    );
  }

  if (isError || !patient) {
    return (
      <div className="content" style={{ padding: 32 }}>
        <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>
          No se pudo cargar la ficha del paciente.
        </div>
        <button className="btn btn--secondary btn--sm" onClick={() => navigate('/patients')}>
          Volver a pacientes
        </button>
      </div>
    );
  }

  return (
    <div
      className="content"
      style={{
        padding: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <PatientHeader patient={patient} collapsed={collapsed} />

      <div style={{ background: 'var(--bg-surface)' }}>
        <TabBar
          active={tab}
          onChange={k => setTab(k as TabKey)}
          tabs={[
            { key: 'ficha',     label: 'Ficha' },
            { key: 'historial', label: 'Historial', count: history.length || undefined },
            { key: 'galeria',   label: 'Galería' },
            { key: 'pagos',     label: 'Pagos' },
            { key: 'datos',     label: 'Datos' },
          ]}
        />
      </div>

      <div
        onScroll={e => {
          const st = e.currentTarget.scrollTop;
          setCollapsed(prev => (prev ? st > 12 : st > 48));
        }}
        style={{ flex: 1, overflow: 'auto', padding: 24, background: 'var(--bg-app)' }}
      >
        {tab === 'ficha' && (
          <div className="r-aside">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <OdontogramCard patientId={patient._id} />
              <TreatmentPlanCard patientId={patient._id} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ObservationsCard patient={patient} />
              <NextAppointmentCard patient={patient} />
              <AllergiesCard patient={patient} />
            </div>
          </div>
        )}

        {tab === 'historial' && <HistorialTab patientId={patient._id} />}
        {tab === 'galeria' && <GalleryContainer patientId={patient._id} embedded />}
        {tab === 'pagos' && <PagosTab patient={patient} />}
        {tab === 'datos' && <DatosTab patient={patient} />}
      </div>
    </div>
  );
}

// ===========================================================
// HISTORIAL
// ===========================================================
const ENTRY_TYPE_META: Record<ClinicalEntryType, { label: string; badge: string }> = {
  TREATMENT: { label: 'Tratamiento', badge: 'badge--brand' },
  CONTROL: { label: 'Control', badge: 'badge--info' },
  PHOTO: { label: 'Foto', badge: 'badge--warning' },
  NOTE: { label: 'Nota', badge: 'badge--neutral' },
};

type TypeFilter = 'Todos' | ClinicalEntryType;

function HistorialTab({ patientId }: { patientId: string }) {
  const [adding, setAdding] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('Todos');
  const { data: entries = [] } = useQuery({
    queryKey: ['clinical-entries', patientId],
    queryFn: () => clinicalEntriesApi.findAll(patientId),
  });

  const filtered = entries.filter(h => typeFilter === 'Todos' || h.type === typeFilter);

  const counts = {
    total: entries.length,
    TREATMENT: entries.filter(e => e.type === 'TREATMENT').length,
    CONTROL: entries.filter(e => e.type === 'CONTROL').length,
    PHOTO: entries.filter(e => e.type === 'PHOTO').length,
  };

  return (
    <div className="r-aside">
      {/* Timeline */}
      <div className="card">
        <div className="card__header">
          <div>
            <div className="card__title">Evolución clínica</div>
            <div className="card__sub">
              {filtered.length} {filtered.length === 1 ? 'entrada' : 'entradas'}
              {filtered.length !== entries.length ? ` de ${entries.length}` : ''} · ordenadas por fecha
            </div>
          </div>
          <button className="btn btn--primary btn--sm" onClick={() => setAdding(true)}>
            + Nueva entrada
          </button>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            {entries.length === 0 ? 'Sin entradas clínicas todavía.' : 'No hay entradas con este filtro.'}
          </div>
        ) : (
          <div style={{ padding: '8px 20px 20px' }}>
            {filtered.map((h, i) => {
              const date = new Date(h.createdAt).toLocaleDateString('es-AR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });
              return (
                <div key={h._id} className="timeline__item">
                  <span className={`timeline__dot ${i === 0 ? 'timeline__dot--current' : ''}`} />
                  <div className="timeline__date">
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{date}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                      {h.procedure ?? ENTRY_TYPE_META[h.type]?.label ?? 'Anotación'}
                    </div>
                  </div>
                  <div className="timeline__body">
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                        {h.procedure ?? ENTRY_TYPE_META[h.type]?.label ?? 'Anotación'}
                      </span>
                      {h.type && (
                        <span className={`badge ${ENTRY_TYPE_META[h.type]?.badge ?? 'badge--neutral'}`}>
                          {ENTRY_TYPE_META[h.type]?.label ?? h.type}
                        </span>
                      )}
                      {h.toothNumber && <span className="badge badge--brand">Diente {h.toothNumber}</span>}
                      {h.appointmentId && (
                        <span className="badge badge--neutral" title="Documentada desde un turno">
                          desde turno
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: 'var(--text-secondary)',
                        marginTop: 6,
                        lineHeight: 1.55,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {h.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sidebar: filtros + resumen */}
      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <div className="card__header">
            <div className="card__title">Filtros</div>
          </div>
          <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div className="field-label">Tipo de evento</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['Todos', 'TREATMENT', 'CONTROL', 'PHOTO', 'NOTE'] as TypeFilter[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={`badge badge--${typeFilter === t ? 'brand' : 'neutral'}`}
                    style={{ cursor: 'pointer', border: 'none' }}
                  >
                    {t === 'Todos' ? 'Todos' : ENTRY_TYPE_META[t].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="field-label">Período</div>
              <input className="input" defaultValue="Todo el historial" readOnly />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <div className="card__title">Resumen</div>
          </div>
          <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
            <div className="row row--between">
              <span style={{ color: 'var(--text-tertiary)' }}>Total entradas</span><b>{counts.total}</b>
            </div>
            <div className="row row--between">
              <span style={{ color: 'var(--text-tertiary)' }}>Tratamientos</span><b>{counts.TREATMENT}</b>
            </div>
            <div className="row row--between">
              <span style={{ color: 'var(--text-tertiary)' }}>Controles</span><b>{counts.CONTROL}</b>
            </div>
            <div className="row row--between">
              <span style={{ color: 'var(--text-tertiary)' }}>Fotos</span><b>{counts.PHOTO}</b>
            </div>
          </div>
        </div>
      </div>

      <NewClinicalEntryModal open={adding} onClose={() => setAdding(false)} patientId={patientId} />
    </div>
  );
}

// ===========================================================
// PAGOS
// ===========================================================
const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Débito', 'Crédito (1-6 cuotas)', 'Mercado Pago'];

function PagosTab({ patient }: { patient: Patient }) {
  const patientId = patient._id;
  const openModal = useUIStore(s => s.openModal);
  const [charging, setCharging] = useState(false);
  const [reminding, setReminding] = useState(false);

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', patientId],
    queryFn: () => transactionsApi.findAll(patientId),
  });
  const { data: balance } = useQuery({
    queryKey: ['balance', patientId],
    queryFn: () => transactionsApi.getBalance(patientId),
  });
  const bal = balance?.balance ?? 0;

  // Cuenta corriente deuda-positiva: CHARGE/REFUND = DEBE (sube), PAYMENT = HABER
  // (baja). Anulados quedan fuera (coincide con el saldo del backend). Backend
  // ordena desc; mostramos cronológico (viejo → nuevo) con saldo acumulado.
  const ledger = [...transactions].filter(t => !t.voidedAt && t.type !== 'VOID').reverse();
  let running = 0;
  const rows = ledger.map(t => {
    const debe = t.type === 'PAYMENT' ? 0 : t.amount;
    const haber = t.type === 'PAYMENT' ? t.amount : 0;
    running += debe - haber;
    return { t, debe, haber, saldo: running };
  });
  const totalDebe = rows.reduce((s, r) => s + r.debe, 0);
  const totalHaber = rows.reduce((s, r) => s + r.haber, 0);

  return (
    <div className="r-aside">
      <div className="card">
        <div className="card__header">
          <div>
            <div className="card__title">Cuenta corriente</div>
            <div className="card__sub">
              {rows.length} movimiento{rows.length !== 1 ? 's' : ''} · saldo {fmtMoney(bal)}
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn--secondary btn--sm" onClick={() => setCharging(true)}>
              <Icon name="plus" size={12} /> Agregar cargo
            </button>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => openModal('registerPayment', { patientId })}
            >
              <Icon name="cash" size={12} /> Registrar cobro
            </button>
          </div>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
            Sin movimientos todavía. Completá un ítem del plan o agregá un cargo.
          </div>
        ) : (
          <div className="table-scroll">
          <table className="tbl" style={{ minWidth: 480 }}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th style={{ textAlign: 'right' }}>Debe</th>
                <th style={{ textAlign: 'right' }}>Haber</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, debe, haber, saldo }) => (
                <tr key={t._id} style={{ cursor: 'default' }}>
                  <td className="mono" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(t.createdAt).toLocaleDateString('es-AR')}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      {haber > 0 && <Icon name="cash" size={12} style={{ color: 'var(--success)' }} />}
                      {t.description ?? (haber > 0 ? `Pago — ${t.paymentMethod ?? 'efectivo'}` : 'Cargo')}
                    </div>
                  </td>
                  <td className="mono" style={{ textAlign: 'right', color: debe ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                    {debe ? fmtMoney(debe) : '—'}
                  </td>
                  <td className="mono" style={{ textAlign: 'right', color: haber ? 'var(--success)' : 'var(--text-tertiary)' }}>
                    {haber ? fmtMoney(haber) : '—'}
                  </td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: saldo > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                    {fmtMoney(saldo)}
                  </td>
                </tr>
              ))}
              <tr style={{ background: 'var(--bg-muted)' }}>
                <td colSpan={2} style={{ fontWeight: 600 }}>Totales</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(totalDebe)}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>{fmtMoney(totalHaber)}</td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: bal > 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtMoney(bal)}</td>
              </tr>
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <div className="card__header">
            <div className="card__title">Resumen</div>
          </div>
          <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Saldo actual</div>
              <div
                className="mono"
                style={{ fontSize: 26, fontWeight: 700, color: bal > 0 ? 'var(--danger)' : 'var(--success)' }}
              >
                {fmtMoney(bal)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {bal > 0 ? 'pendiente de cobro' : bal < 0 ? 'saldo a favor' : 'al día'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Total cargado</div>
                <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{fmtMoney(totalDebe)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Total cobrado</div>
                <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--success)' }}>{fmtMoney(totalHaber)}</div>
              </div>
            </div>
            <button
              className="btn btn--whatsapp btn--sm"
              disabled={bal <= 0}
              style={{ opacity: bal <= 0 ? 0.5 : 1 }}
              onClick={() => setReminding(true)}
            >
              <Icon name="whatsapp" size={14} /> Recordar pago por WhatsApp
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <div className="card__title">Métodos aceptados</div>
          </div>
          <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
            {PAYMENT_METHODS.map(m => (
              <div key={m} className="row" style={{ gap: 8 }}>
                <Icon name="check" size={12} style={{ color: 'var(--success)' }} /> {m}
              </div>
            ))}
          </div>
        </div>
      </div>

      <AddChargeModal open={charging} onClose={() => setCharging(false)} patientId={patientId} />
      <WhatsAppReminderModal
        open={reminding}
        onClose={() => setReminding(false)}
        patient={patient}
        balance={bal}
      />
    </div>
  );
}

// ===========================================================
// DATOS
// ===========================================================
function DatosTab({ patient }: { patient: Patient }) {
  const age = ageFromBirthDate(patient.birthDate);
  return (
    <div className="r-aside">
      <div className="card">
        <div className="card__header">
          <div className="card__title">Datos personales</div>
        </div>
        <div className="card__body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Nombre" value={`${patient.name} ${patient.lastName}`} />
          <Field label="Edad" value={age != null ? `${age} años` : '—'} />
          <Field label="DNI" value={patient.dni ?? '—'} />
          <Field label="Teléfono" value={patient.phone ?? '—'} />
          <Field label="Email" value={patient.email ?? '—'} />
          <Field label="Domicilio" value={patient.address ?? '—'} />
          <Field label="Localidad" value={patient.locality ?? '—'} />
        </div>
      </div>

      <div className="card">
        <div className="card__header">
          <div className="card__title">Obra social</div>
        </div>
        <div className="card__body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Cobertura" value={patient.obraSocial ?? 'Particular'} />
          <Field label="Nº de afiliado" value={patient.nAfiliado ?? '—'} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <div
        style={{
          padding: '9px 12px',
          background: 'var(--bg-muted)',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {value}
      </div>
    </div>
  );
}

