import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { patientsApi, type Patient } from '../api/patients';
import { clinicalEntriesApi } from '../api/clinical-entries';
import { transactionsApi } from '../api/transactions';
import { ageFromBirthDate, fmtMoney } from '../lib/format';
import { TabBar } from '../components/common/TabBar';
import { PatientHeader } from '../components/patient/PatientHeader';
import { OdontogramCard } from '../components/patient/OdontogramCard';
import { TreatmentPlanCard } from '../components/patient/TreatmentPlanCard';
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
      <PatientHeader patient={patient} />

      <div style={{ background: 'var(--bg-surface)' }}>
        <TabBar
          active={tab}
          onChange={k => setTab(k as TabKey)}
          tabs={[
            { key: 'ficha',     label: 'Ficha odontológica' },
            { key: 'historial', label: 'Historial', count: history.length || undefined },
            { key: 'galeria',   label: 'Galería' },
            { key: 'pagos',     label: 'Pagos' },
            { key: 'datos',     label: 'Datos' },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 24, background: 'var(--bg-app)' }}>
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
        {tab === 'galeria' && <GaleriaPlaceholder />}
        {tab === 'pagos' && <PagosTab patientId={patient._id} />}
        {tab === 'datos' && <DatosTab patient={patient} />}
      </div>
    </div>
  );
}

// ===========================================================
// HISTORIAL
// ===========================================================
function HistorialTab({ patientId }: { patientId: string }) {
  const { data: entries = [] } = useQuery({
    queryKey: ['clinical-entries', patientId],
    queryFn: () => clinicalEntriesApi.findAll(patientId),
  });

  return (
    <div className="r-aside">
      <div className="card">
        <div className="card__header">
          <div>
            <div className="card__title">Evolución clínica</div>
            <div className="card__sub">
              {entries.length} entrada{entries.length !== 1 ? 's' : ''} · ordenadas por fecha
            </div>
          </div>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => alert('Próximamente — formulario de nueva entrada')}
          >
            + Nueva entrada
          </button>
        </div>
        {entries.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontSize: 13,
            }}
          >
            Sin entradas clínicas todavía.
          </div>
        ) : (
          <div style={{ padding: '8px 20px 20px' }}>
            {entries.map((h, i) => {
              const d = new Date(h.createdAt);
              const date = d.toLocaleDateString('es-AR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });
              return (
                <div
                  key={h._id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 1fr',
                    gap: 16,
                    padding: '16px 0',
                    borderBottom: i < entries.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{date}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                      {h.procedure ?? 'Anotación'}
                    </div>
                  </div>
                  <div>
                    {h.toothNumber && (
                      <span className="badge badge--brand" style={{ marginBottom: 6 }}>
                        Diente {h.toothNumber}
                      </span>
                    )}
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
      <div />
    </div>
  );
}

// ===========================================================
// PAGOS
// ===========================================================
function PagosTab({ patientId }: { patientId: string }) {
  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', patientId],
    queryFn: () => transactionsApi.findAll(patientId),
  });
  const { data: balance } = useQuery({
    queryKey: ['balance', patientId],
    queryFn: () => transactionsApi.getBalance(patientId),
  });

  return (
    <div className="r-aside">
      <div className="card">
        <div className="card__header">
          <div>
            <div className="card__title">Cuenta corriente</div>
            <div className="card__sub">
              {transactions.length} movimiento{transactions.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        {transactions.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontSize: 13,
            }}
          >
            Sin movimientos todavía.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Concepto</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => {
                const isPayment = t.type === 'PAYMENT';
                return (
                  <tr key={t._id}>
                    <td className="mono" style={{ color: 'var(--text-secondary)' }}>
                      {new Date(t.createdAt).toLocaleDateString('es-AR')}
                    </td>
                    <td>
                      <span className={`badge badge--${isPayment ? 'success' : 'neutral'}`}>
                        {t.type}
                      </span>
                    </td>
                    <td>{t.description ?? '—'}</td>
                    <td
                      className="mono"
                      style={{
                        textAlign: 'right',
                        fontWeight: 600,
                        color: isPayment ? 'var(--success)' : 'var(--text-primary)',
                      }}
                    >
                      {isPayment ? '+' : '-'}
                      {fmtMoney(Math.abs(t.amount))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card__header">
          <div className="card__title">Resumen</div>
        </div>
        <div className="card__body">
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Saldo actual</div>
          <div
            className="mono"
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: (balance?.balance ?? 0) < 0 ? 'var(--danger)' : 'var(--success)',
            }}
          >
            {fmtMoney(balance?.balance ?? 0)}
          </div>
        </div>
      </div>
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

// ===========================================================
// GALERÍA
// ===========================================================
function GaleriaPlaceholder() {
  return (
    <div className="card">
      <div
        style={{
          padding: 48,
          textAlign: 'center',
          color: 'var(--text-tertiary)',
          fontSize: 13,
        }}
      >
        Galería — próximamente. Requiere integración con Cloudinary (signed uploads).
      </div>
    </div>
  );
}
