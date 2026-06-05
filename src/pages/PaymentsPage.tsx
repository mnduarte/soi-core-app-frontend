import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { transactionsApi, type Transaction } from '../api/transactions';
import { patientsApi, type Patient } from '../api/patients';
import { useUIStore } from '../store/ui.store';
import { PageHeader } from '../components/common/PageHeader';
import { Avatar } from '../components/common/Avatar';
import { Icon } from '../components/common/Icon';
import { WhatsAppReminderModal } from '../components/patient/WhatsAppReminderModal';
import { fmtMoney } from '../lib/format';

// Signo deuda-positiva: CHARGE/REFUND suman, PAYMENT resta, VOID ignora.
function signedDebt(t: Transaction): number {
  if (t.voidedAt || t.type === 'VOID') return 0;
  if (t.type === 'PAYMENT') return -t.amount;
  return t.amount; // CHARGE, REFUND
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
function isSameDay(a: Date, b: Date) {
  return isSameMonth(a, b) && a.getDate() === b.getDate();
}

export default function PaymentsPage() {
  const openModal = useUIStore(s => s.openModal);
  const [reminderPatient, setReminderPatient] = useState<{ patient: Patient; balance: number } | null>(null);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => transactionsApi.findAll(),
  });
  const { data: patients = [] } = useQuery({
    queryKey: ['patients', 'all'],
    queryFn: () => patientsApi.findAll(),
  });

  const patientMap = useMemo(() => {
    const m = new Map<string, Patient>();
    patients.forEach(p => m.set(p._id, p));
    return m;
  }, [patients]);

  // Solo cobros vigentes (no anulados) cuentan para KPIs y saldos.
  const live = useMemo(
    () => transactions.filter(t => !t.voidedAt && t.type === 'PAYMENT'),
    [transactions],
  );

  const kpis = useMemo(() => {
    const now = new Date();
    const month = live.filter(t => isSameMonth(new Date(t.createdAt), now));
    const today = live.filter(t => isSameDay(new Date(t.createdAt), now));
    const cobradoMes = month.reduce((s, t) => s + t.amount, 0);
    const cobradoHoy = today.reduce((s, t) => s + t.amount, 0);
    const ticket = month.length ? Math.round(cobradoMes / month.length) : 0;
    return { cobradoMes, cobradoHoy, count: month.length, ticket, todayCount: today.length };
  }, [live]);

  // Saldo (deuda) por paciente, derivado de los movimientos. > 0 = debe.
  const debtors = useMemo(() => {
    const totals = new Map<string, number>();
    transactions.forEach(t => totals.set(t.patientId, (totals.get(t.patientId) ?? 0) + signedDebt(t)));
    return [...totals.entries()]
      .map(([patientId, balance]) => ({ patient: patientMap.get(patientId), balance }))
      .filter(r => r.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [transactions, patientMap]);

  const totalDebt = debtors.reduce((s, d) => s + d.balance, 0);

  const recent = useMemo(() => transactions.slice(0, 8), [transactions]);

  if (isLoading) {
    return (
      <div className="content" style={{ padding: 32, color: 'var(--text-tertiary)', fontSize: 13 }}>
        Cargando pagos…
      </div>
    );
  }

  return (
    <div className="content fade-in">
      <PageHeader
        title="Pagos"
        sub="Registro de cobros y saldos por paciente"
        actions={
          <button className="btn btn--primary" onClick={() => openModal('registerPayment')}>
            <Icon name="plus" /> Registrar cobro
          </button>
        }
      />

      {/* KPIs */}
      <div className="r-metrics" style={{ marginBottom: 18 }}>
        <div className="metric">
          <div className="metric__label">Cobrado del mes</div>
          <div className="metric__value">{fmtMoney(kpis.cobradoMes)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 6 }}>
            {kpis.count} cobro{kpis.count !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="metric">
          <div className="metric__label">Cobros hoy</div>
          <div className="metric__value">{fmtMoney(kpis.cobradoHoy)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 6 }}>
            {kpis.todayCount} transacci{kpis.todayCount !== 1 ? 'ones' : 'ón'}
          </div>
        </div>
        <div className="metric">
          <div className="metric__label">Ticket promedio</div>
          <div className="metric__value">{fmtMoney(kpis.ticket)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 6 }}>del mes</div>
        </div>
        <div className="metric">
          <div className="metric__label">Por cobrar</div>
          <div className="metric__value" style={{ color: totalDebt > 0 ? 'var(--danger)' : undefined }}>
            {fmtMoney(totalDebt)}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 6 }}>
            {debtors.length} paciente{debtors.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="r-2col">
        {/* Pacientes con saldo */}
        <div className="card">
          <div className="card__header">
            <div>
              <div className="card__title">Pacientes con saldo</div>
              <div className="card__sub">{debtors.length} pacientes · {fmtMoney(totalDebt)} total</div>
            </div>
          </div>
          {debtors.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Nadie con saldo pendiente. 🎉
            </div>
          ) : (
            <div className="table-scroll">
            <table className="tbl" style={{ minWidth: 420 }}>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Obra social</th>
                  <th style={{ textAlign: 'right' }}>Saldo</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {debtors.map(({ patient, balance }, i) => (
                  <tr key={patient?._id ?? i}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        {patient && <Avatar name={patient.name} lastName={patient.lastName} id={patient._id} size="sm" />}
                        <div style={{ fontWeight: 500 }}>
                          {patient ? `${patient.name} ${patient.lastName}` : 'Paciente'}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge--neutral">{patient?.obraSocial ?? 'Particular'}</span>
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--danger)' }}>
                      {fmtMoney(balance)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {patient && (
                        <button
                          className="btn btn--ghost btn--icon"
                          title="Recordar pago por WhatsApp"
                          onClick={() => setReminderPatient({ patient, balance })}
                        >
                          <Icon name="whatsapp" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Movimientos recientes */}
        <div className="card">
          <div className="card__header">
            <div className="card__title">Movimientos recientes</div>
          </div>
          {recent.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              Sin movimientos.
            </div>
          ) : (
            <div>
              {recent.map((t, i) => (
                <MovementRow
                  key={t._id}
                  t={t}
                  patient={patientMap.get(t.patientId)}
                  last={i === recent.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {reminderPatient && (
        <WhatsAppReminderModal
          open
          onClose={() => setReminderPatient(null)}
          patient={reminderPatient.patient}
          balance={reminderPatient.balance}
        />
      )}
    </div>
  );
}

function MovementRow({ t, patient, last }: { t: Transaction; patient?: Patient; last: boolean }) {
  const isPayment = t.type === 'PAYMENT' && !t.voidedAt;
  const isCharge = t.type === 'CHARGE' && !t.voidedAt;
  const when = new Date(t.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  return (
    <div
      style={{
        padding: '12px 20px',
        borderBottom: last ? 'none' : '1px solid var(--border-subtle)',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 12,
        alignItems: 'center',
        opacity: t.voidedAt ? 0.55 : 1,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: isPayment ? '#ECFDF5' : 'var(--bg-muted)',
          color: isPayment ? 'var(--success)' : 'var(--text-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={isPayment ? 'cash' : isCharge ? 'receipt' : 'undo'} size={14} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          {patient ? `${patient.name} ${patient.lastName}` : 'Paciente'}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
          {(t.description ?? (isPayment ? 'Cobro' : isCharge ? 'Cargo' : t.type))} · {when}
        </div>
      </div>
      <div
        className="mono"
        style={{ fontSize: 13, fontWeight: 600, color: isPayment ? 'var(--success)' : 'var(--text-primary)' }}
      >
        {isPayment ? '−' : '+'}{fmtMoney(Math.abs(t.amount))}
      </div>
    </div>
  );
}
