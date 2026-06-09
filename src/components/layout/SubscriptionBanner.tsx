import { useAuthStore } from '../../store/auth.store';
import { Icon } from '../common/Icon';

const MS_PER_DAY = 86_400_000;

// Derive banner state from whichever date matters for the current status:
// - TRIAL → trialEndsAt
// - everything else → subscriptionEndsAt
// We don't have the clinic-level grace setting on the client, but we don't
// need it either — the banner is informational and the backend is what
// actually enforces the cutoff.
type BannerState = 'due-soon' | 'overdue' | null;
type BannerKind = 'trial' | 'subscription';

function deriveState(args: {
  status?: string;
  trialEndsAt?: string | null;
  subscriptionEndsAt?: string | null;
}): {
  state: BannerState;
  kind: BannerKind;
  daysToDue: number;
  due: Date | null;
} {
  const isTrial = args.status === 'TRIAL';
  const target = isTrial ? args.trialEndsAt : args.subscriptionEndsAt;
  const kind: BannerKind = isTrial ? 'trial' : 'subscription';
  if (!target) return { state: null, kind, daysToDue: 0, due: null };
  const due = new Date(target);
  const daysToDue = Math.ceil((due.getTime() - Date.now()) / MS_PER_DAY);
  if (daysToDue > 7) return { state: null, kind, daysToDue, due };
  if (daysToDue >= 0) return { state: 'due-soon', kind, daysToDue, due };
  return { state: 'overdue', kind, daysToDue, due };
}

function formatDue(d: Date): string {
  const day = d.getDate();
  const month = d.toLocaleDateString('es-AR', { month: 'long' });
  return `${day} de ${month}`;
}

export function SubscriptionBanner() {
  const clinic = useAuthStore(s => s.clinic);
  const isImpersonating = useAuthStore(s => s.isImpersonating);

  // Skip the banner during impersonation — the operator already has the
  // slate-900 "sesión de soporte" strip on top and a second alert would just
  // clutter the view.
  if (isImpersonating) return null;
  if (!clinic) return null;

  const { state, kind, daysToDue, due } = deriveState({
    status: clinic.status,
    trialEndsAt: clinic.trialEndsAt,
    subscriptionEndsAt: clinic.subscriptionEndsAt,
  });
  if (!state || !due) return null;

  const isOverdue = state === 'overdue';
  const isTrial = kind === 'trial';
  const overByDays = Math.abs(daysToDue);

  const bg = isOverdue ? '#FEF2F2' : '#FFFBEB';
  const border = isOverdue ? '#FECACA' : '#FDE68A';
  const titleColor = isOverdue ? '#B91C1C' : '#92400E';
  const icon = isOverdue ? 'alert' : 'clock';

  const title = isOverdue
    ? isTrial
      ? `Tu prueba gratuita terminó hace ${overByDays} ${overByDays === 1 ? 'día' : 'días'}`
      : `Tu pago venció hace ${overByDays} ${overByDays === 1 ? 'día' : 'días'}`
    : daysToDue === 0
    ? isTrial
      ? 'Tu prueba gratuita termina hoy'
      : 'Tu pago vence hoy'
    : isTrial
    ? `Tu prueba gratuita termina en ${daysToDue} ${daysToDue === 1 ? 'día' : 'días'}`
    : `Tu pago vence en ${daysToDue} ${daysToDue === 1 ? 'día' : 'días'}`;

  const body = isOverdue
    ? isTrial
      ? `Para seguir usando SOI, registrá tu primer pago. Contactá al administrador.`
      : `Si no se regulariza, la cuenta se va a suspender en los próximos días. Contactá al administrador para evitar la suspensión.`
    : isTrial
    ? `Tu período de prueba termina el ${formatDue(due)}. Coordiná con el administrador para mantener la cuenta activa.`
    : `Próximo vencimiento: ${formatDue(due)}. Coordiná con el administrador para evitar interrupciones del servicio.`;

  return (
    <div
      style={{
        background: bg,
        borderBottom: `1px solid ${border}`,
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}
      role="alert"
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: 'rgba(0,0,0,0.05)',
          color: titleColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={14} />
      </span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
        <div style={{ fontWeight: 600, color: titleColor }}>{title}</div>
        <div style={{ color: 'var(--text-secondary)', marginTop: 2, fontSize: 12 }}>{body}</div>
      </div>
    </div>
  );
}
