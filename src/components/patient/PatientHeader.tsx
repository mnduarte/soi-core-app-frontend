import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { patientsApi, type Patient } from '../../api/patients';
import { appointmentsApi } from '../../api/appointments';
import { transactionsApi } from '../../api/transactions';
import { useUIStore } from '../../store/ui.store';
import { Avatar } from '../common/Avatar';
import { Icon } from '../common/Icon';
import { WhatsAppReminderModal } from './WhatsAppReminderModal';
import { patientAge, fmtMoney } from '../../lib/format';
import { toWhatsAppNumber } from '../../lib/phone';

interface PatientHeaderProps {
  patient: Patient;
  // When the content area is scrolled, the header collapses to just the
  // breadcrumb + name + balance, freeing vertical space.
  collapsed?: boolean;
}

export function PatientHeader({ patient, collapsed = false }: PatientHeaderProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const openModal = useUIStore(s => s.openModal);
  const showToast = useUIStore(s => s.showToast);
  const [reminding, setReminding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`¿Eliminar a ${patient.name} ${patient.lastName}? Se puede recuperar después.`)) return;
    try {
      await patientsApi.remove(patient._id);
      qc.invalidateQueries({ queryKey: ['patients'] });
      showToast('Paciente eliminado');
      navigate('/patients');
    } catch {
      showToast('No se pudo eliminar el paciente');
    }
  };

  const { data: balance } = useQuery({
    queryKey: ['balance', patient._id],
    queryFn: () => transactionsApi.getBalance(patient._id),
  });

  const { data: appts = [] } = useQuery({
    queryKey: ['appointments', 'by-patient', patient._id],
    queryFn: () => appointmentsApi.findAll({ patientId: patient._id }),
  });

  const now = Date.now();
  const past = appts
    .filter(a => new Date(a.endsAt).getTime() <= now && a.status === 'COMPLETED')
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const future = appts
    .filter(a => new Date(a.startsAt).getTime() > now && a.status !== 'CANCELLED' && a.status !== 'NO_SHOW')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const lastVisit = past[0];
  const nextVisit = future[0];

  const daysSince = (iso?: string) =>
    iso ? Math.floor((now - new Date(iso).getTime()) / 86_400_000) : null;
  const daysUntil = (iso?: string) =>
    iso ? Math.ceil((new Date(iso).getTime() - now) / 86_400_000) : null;

  const age = patientAge(patient);
  const bal = balance?.balance ?? 0;

  return (
    <div
      className="patient-head"
      data-collapsed={collapsed}
      style={{
        padding: collapsed ? '12px 28px' : '18px 28px 0',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div className="row" style={{ gap: 8, marginBottom: collapsed ? 8 : 12, fontSize: 12.5, color: 'var(--text-tertiary)' }}>
        <button
          type="button"
          onClick={() => navigate('/patients')}
          className="row"
          style={{ gap: 4, cursor: 'pointer', color: 'inherit', background: 'none', border: 'none', padding: 0 }}
        >
          <Icon name="arrowLeft" size={12} /> Pacientes
        </button>
        <Icon name="chevronRight" size={11} style={{ opacity: 0.5 }} />
        <span style={{ color: 'var(--text-primary)' }}>{patient.name} {patient.lastName}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: collapsed ? 12 : 18, flexWrap: 'wrap' }}>
        <Avatar
          name={patient.name}
          lastName={patient.lastName}
          id={patient._id}
          size={collapsed ? 'md' : 'xl'}
        />

        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <h1
              style={{
                fontSize: collapsed ? 19 : 24,
                fontWeight: 600,
                letterSpacing: '-0.015em',
                margin: 0,
                transition: 'font-size 0.2s ease',
              }}
            >
              {patient.name} {patient.lastName}
            </h1>
            {bal > 0 && (
              <span className="badge badge--danger">Debe {fmtMoney(bal)}</span>
            )}
            {bal < 0 && (
              <span className="badge badge--success">A favor {fmtMoney(-bal)}</span>
            )}
          </div>

          <div className="patient-head__collapsible">
            <div
              className="row"
              style={{
                gap: 16,
                marginTop: 6,
                fontSize: 12.5,
                color: 'var(--text-secondary)',
                flexWrap: 'wrap',
              }}
            >
              {age != null && <span><b style={{ color: 'var(--text-primary)' }}>{age}</b> años</span>}
              {age != null && patient.phone && <span>·</span>}
              {patient.phone && (
                <span>
                  <Icon name="phone" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                  {patient.phone}
                </span>
              )}
            </div>
            {patient.email && (
              <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <Icon name="mail" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                {patient.email}
              </div>
            )}
            {(patient.obraSocial || patient.nAfiliado) && (
              <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                {patient.obraSocial}
                {patient.obraSocial && patient.nAfiliado && ' · '}
                {patient.nAfiliado && `N° ${patient.nAfiliado}`}
              </div>
            )}
            {(patient.address || patient.locality) && (
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
                {[patient.address, patient.locality].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        </div>

        <div className="patient-head__collapsible">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn--whatsapp btn--sm"
              onClick={() => {
                if (bal > 0) setReminding(true);
                else if (patient.phone) window.open(`https://wa.me/${toWhatsAppNumber(patient.phone)}`, '_blank');
              }}
            >
              <Icon name="whatsapp" size={14} /> WhatsApp
            </button>
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => openModal('uploadPhotos', { patientId: patient._id })}
            >
              <Icon name="camera" size={12} /> Subir fotos
            </button>
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => openModal('registerPayment', { patientId: patient._id })}
            >
              <Icon name="cash" size={12} /> Cobrar
            </button>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => openModal('newAppointment', { patientId: patient._id })}
            >
              <Icon name="calendar" size={12} /> Nuevo turno
            </button>
            <div style={{ position: 'relative' }}>
              <button className="btn btn--ghost btn--icon" onClick={() => setMenuOpen(o => !o)}>
                <Icon name="more" />
              </button>
              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      marginTop: 4,
                      minWidth: 190,
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 10,
                      boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.15))',
                      overflow: 'hidden',
                      zIndex: 50,
                    }}
                  >
                    <button
                      className="patient-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate(`/patients/${patient._id}?tab=datos`);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 13, textAlign: 'left', color: 'var(--text-secondary)',
                      }}
                    >
                      <Icon name="edit" size={14} /> Editar datos
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        handleDelete();
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 13, textAlign: 'left', color: 'var(--danger)',
                        borderTop: '1px solid var(--border-subtle)',
                      }}
                    >
                      <Icon name="trash" size={14} /> Eliminar paciente
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="patient-head__collapsible">
      <div
        style={{
          display: 'flex',
          gap: 28,
          marginTop: 18,
          padding: '14px 0 0',
          borderTop: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
          rowGap: 14,
        }}
      >
        <Stat label="Tratamientos" value={past.length} sub="totales" />
        <Stat
          label="Última visita"
          value={lastVisit ? `hace ${daysSince(lastVisit.startsAt)}d` : '—'}
          sub={lastVisit?.title ?? 'sin registros'}
        />
        <Stat
          label="Próxima"
          value={nextVisit ? `en ${daysUntil(nextVisit.startsAt)}d` : '—'}
          sub={nextVisit ? 'agendada' : 'sin agendar'}
        />
        <Stat label="Fotos" value={0} sub="en galería" />
        <Stat
          label="Saldo"
          value={fmtMoney(bal)}
          sub={bal > 0 ? 'pendiente' : bal < 0 ? 'a favor' : 'al día'}
          color={bal > 0 ? 'var(--danger)' : 'var(--success)'}
        />
      </div>
      </div>

      <WhatsAppReminderModal
        open={reminding}
        onClose={() => setReminding(false)}
        patient={patient}
        balance={bal}
      />
    </div>
  );
}

function Stat({
  label, value, sub, color,
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 17,
          fontWeight: 600,
          color: color ?? 'var(--text-primary)',
          marginTop: 2,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{sub}</div>
      )}
    </div>
  );
}
