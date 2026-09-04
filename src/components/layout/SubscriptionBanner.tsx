import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { changesApi, type SubscriptionLevel } from '../../api/changes';
import { Icon, type IconName } from '../common/Icon';

/**
 * Aviso de mora, escalonado.
 *
 * El estado NO se calcula acá: lo manda el backend en el mismo latido que ya
 * pollea la app (`/changes`, cada 10s), y sale de la misma función que decide
 * cortar el acceso. Dos motivos:
 *
 *  1. El cartel no puede prometer algo distinto de lo que el sistema hace. Con
 *     el cálculo duplicado en el front, cambiar un día de un lado y no del
 *     otro pasaba desapercibido.
 *  2. `subscriptionEndsAt` se guarda en el navegador al iniciar sesión y no se
 *     vuelve a pedir. Al registrar el pago en el backoffice, el aviso seguía
 *     ahí hasta el próximo login. Ahora se va solo, dentro de los 10 segundos.
 */
type Tono = 'amarillo' | 'naranja' | 'rojo';

const TONOS: Record<Tono, { bg: string; border: string; title: string }> = {
  amarillo: { bg: '#FFFBEB', border: '#FDE68A', title: '#92400E' },
  naranja: { bg: '#FFF7ED', border: '#FED7AA', title: '#9A3412' },
  rojo: { bg: '#FEF2F2', border: '#FECACA', title: '#B91C1C' },
};

function fechaLarga(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} de ${d.toLocaleDateString('es-AR', { month: 'long' })}`;
}

/** Cada escalón dice qué pasa y qué hacer. Sin amenazar y sin eufemismos. */
function contenido(
  level: SubscriptionLevel,
  readonlyAt: string | null,
  trial: boolean,
  daysOverdue: number,
): { tono: Tono; icon: IconName; titulo: string; texto: string } | null {
  const corte = readonlyAt ? fechaLarga(readonlyAt) : null;

  // Recién terminada la prueba (días 0 a 2) el aviso no es de mora: es una
  // NOVEDAD. Algo cambió y el Dr. tiene que enterarse, aunque todavía no deba
  // nada. A un pago atrasado un día, en cambio, no hay nada que anunciarle.
  if (trial && level === 'ok' && daysOverdue >= 0) {
    return {
      tono: 'amarillo',
      // No `sparkles`: son 8 rayos radiales y en 14px se lee como un spinner
      // de "cargando". Un calendario dice "se cerró un período" sin alarmar.
      icon: 'calendar',
      titulo: 'Terminaron tus dos meses de prueba',
      texto: 'Desde ahora la cuenta es paga. Coordiná el pago con el administrador para seguir sin interrupciones.',
    };
  }

  switch (level) {
    case 'soft':
      return {
        tono: 'amarillo',
        icon: 'clock',
        titulo: trial ? 'Terminó tu prueba y no nos figura el pago' : 'No nos figura el pago de este mes',
        texto: 'Si ya lo hiciste, avisanos y lo registramos. Podés seguir usando SOI con normalidad.',
      };
    case 'firm':
      return {
        tono: 'naranja',
        icon: 'alert',
        titulo: trial ? 'Sigue sin registrarse el pago' : 'Sigue sin registrarse el pago de este mes',
        texto: corte
          ? `El ${corte} la cuenta pasa a solo lectura: vas a poder consultar las fichas pero no cargar información. Se reactiva apenas registremos el pago.`
          : 'Escribinos para regularizarlo.',
      };
    case 'readonly':
      return {
        tono: 'rojo',
        icon: 'alert',
        titulo: 'La cuenta está en solo lectura',
        texto: 'Podés consultar las fichas de tus pacientes, pero no cargar información nueva. Se reactiva apenas registremos el pago.',
      };
    // 'blocked' no llega hasta acá: esa cuenta no puede iniciar sesión.
    default:
      return null;
  }
}

export function SubscriptionBanner() {
  const clinic = useAuthStore(s => s.clinic);
  const accessToken = useAuthStore(s => s.accessToken);
  const isImpersonating = useAuthStore(s => s.isImpersonating);

  // Se cuelga del mismo heartbeat que ya corre en AppLayout — no agrega una
  // request propia, react-query comparte la caché por queryKey.
  const { data } = useQuery({
    queryKey: ['clinic-changes'],
    queryFn: changesApi.get,
    enabled: !!accessToken,
  });

  // Durante una sesión de soporte ya está la franja negra arriba; un segundo
  // aviso sería ruido, y además el estado es del cliente, no del operador.
  if (isImpersonating || !clinic) return null;

  const sub = data?.subscription;

  if (!sub) return null;

  // Prueba por terminar: se avisa la última semana, para que no lo agarre de
  // sorpresa. Es el único aviso que se muestra ANTES de la fecha.
  if (sub.trial && sub.level === 'ok' && sub.daysOverdue < 0 && sub.dueAt) {
    const dias = Math.abs(sub.daysOverdue);
    if (dias > 7) return null;
    return (
      <Banner
        tono="amarillo"
        icon="clock"
        titulo={dias === 0 ? 'Tu prueba termina hoy' : `Tu prueba termina en ${dias} ${dias === 1 ? 'día' : 'días'}`}
        texto={`Desde el ${fechaLarga(sub.dueAt)} la cuenta pasa a ser paga. Coordiná con el administrador para seguir sin interrupciones.`}
      />
    );
  }

  const c = contenido(sub.level, sub.readonlyAt, sub.trial, sub.daysOverdue);
  if (!c) return null;
  return <Banner tono={c.tono} icon={c.icon} titulo={c.titulo} texto={c.texto} />;
}

function Banner({
  tono,
  icon,
  titulo,
  texto,
}: {
  tono: Tono;
  icon: IconName;
  titulo: string;
  texto: string;
}) {
  const t = TONOS[tono];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '10px 20px',
        background: t.bg,
        borderBottom: `1px solid ${t.border}`,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: 8,
          background: '#fff',
          border: `1px solid ${t.border}`,
          color: t.title,
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={14} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: t.title }}>{titulo}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 1 }}>{texto}</div>
      </div>
    </div>
  );
}
