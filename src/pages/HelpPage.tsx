import type { ReactNode } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { Icon, type IconName } from '../components/common/Icon';

// Bolds text wrapped in **double asterisks** so step strings can highlight the
// exact button/label the dentist has to look for.
function withBold(text: string): ReactNode[] {
  return text.split('**').map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>));
}

interface Flow {
  icon: IconName;
  title: string;
  sub: string;
  steps: string[];
}

const FLOWS: Flow[] = [
  {
    icon: 'check',
    title: 'Activá tu cuenta',
    sub: 'La primera vez, desde el link que te enviamos por WhatsApp.',
    steps: [
      'Abrí el **link de invitación** que te llegó por WhatsApp.',
      'Escribí tu **usuario** y tocá **Continuar**.',
      'Te pide la **contraseña temporal** (la del WhatsApp) y una **nueva contraseña** (mínimo 8 caracteres).',
      'Tocá **Crear contraseña y entrar**. ¡Listo, ya estás adentro!',
    ],
  },
  {
    icon: 'user',
    title: 'Ingresar',
    sub: 'Tu acceso de todos los días.',
    steps: [
      'Entrá a la app y escribí tu **usuario** → **Continuar**.',
      'Poné tu **contraseña**. Tocá el **ojo** 👁️ para verla si querés.',
      'Tocá **Ingresar al consultorio**.',
      '¿La olvidaste? Tocá **¿Olvidaste?** y te avisamos para enviarte una nueva por WhatsApp.',
    ],
  },
  {
    icon: 'users',
    title: 'Crear un paciente',
    sub: 'Cargar una ficha nueva en segundos.',
    steps: [
      'Andá a **Pacientes** (menú izquierdo) → **Nuevo paciente**.',
      'Cargá lo esencial: **nombre, apellido y teléfono**. El resto se completa después.',
      'Tocá **Crear ficha** — o **Guardar y agendar turno** si ya querés darle un turno.',
    ],
  },
  {
    icon: 'calendar',
    title: 'Agendar un turno',
    sub: 'Desde la agenda o desde la ficha del paciente.',
    steps: [
      'En **Agenda** tocá **Nuevo turno** (o entrá a la ficha del paciente → **Nuevo turno**).',
      'Elegí el **paciente**, la **fecha**, la **hora** y el **motivo**.',
      'Dejá activado el **recordatorio por WhatsApp** (se manda 24 hs antes).',
      'Tocá **Confirmar turno**.',
    ],
  },
  {
    icon: 'clipboard',
    title: 'Atender y cargar la ficha',
    sub: 'Documentar la visita queda enlazado al turno.',
    steps: [
      'En **Agenda**, en el turno tocá el menú **⋯** → **Marcar atendido**.',
      'Queda un aviso amarillo **“Ficha pendiente”**.',
      'Tocá ese aviso: se abre **Nueva entrada de evolución**.',
      'Elegí el **tipo**, escribí la nota (o usá una **plantilla rápida**) y tocá **Guardar entrada**.',
      'El aviso “Ficha pendiente” desaparece solo. ✅',
    ],
  },
  {
    icon: 'tooth',
    title: 'Odontograma y plan',
    sub: 'Marcar dientes y cargar tratamientos.',
    steps: [
      'Entrá a la ficha del paciente → pestaña **Ficha**.',
      'En el **odontograma**, hacé click en una cara del diente para marcarla.',
      'En **Plan de tratamiento** tocá **Agregar** y cargá la prestación con su **precio**.',
      'Cuando terminás un tratamiento, marcá el ítem como **Completado**: se genera el **cargo** en la cuenta corriente del paciente.',
    ],
  },
  {
    icon: 'cash',
    title: 'Cobrar y recordar pagos',
    sub: 'Cuenta corriente simple, con recordatorio por WhatsApp.',
    steps: [
      'En la ficha → pestaña **Pagos** → **Registrar cobro** (monto + método). El saldo baja solo.',
      'Para cargar algo a mano, **Agregar cargo**.',
      'Si el paciente debe, tocá **Recordar pago por WhatsApp**: el mensaje sale listo, vos solo confirmás el envío.',
      'En el menú **Pagos** ves todos los pacientes con saldo de un vistazo.',
    ],
  },
  {
    icon: 'camera',
    title: 'Fotos del paciente',
    sub: 'Galería por sesiones, con comparación antes/después.',
    steps: [
      'En la ficha tocá **Subir fotos** (o la pestaña **Galería**).',
      'Arrastrá las fotos o tocá **Elegir archivos** / **Sacar foto** con la cámara.',
      'Asigná **tipo** (intraoral, extraoral, radiografía) y una **sesión**.',
      'Tocá **Subir**. Después podés usar **Comparar antes/después**.',
    ],
  },
];

function FlowCard({ index, flow }: { index: number; flow: Flow }) {
  return (
    <div className="card">
      <div className="card__header">
        <div className="row" style={{ gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: 'var(--brand-primary-50)',
              color: 'var(--brand-primary-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name={flow.icon} size={17} />
          </div>
          <div>
            <div className="card__title">
              {index}. {flow.title}
            </div>
            <div className="card__sub">{flow.sub}</div>
          </div>
        </div>
      </div>
      <div className="card__body">
        <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {flow.steps.map((step, i) => (
            <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
              <span
                style={{
                  flexShrink: 0,
                  width: 20,
                  height: 20,
                  borderRadius: 50,
                  background: 'var(--bg-muted)',
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                {i + 1}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>{withBold(step)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <div className="content fade-in">
      <PageHeader title="Ayuda" sub="Guía rápida de SOI — cada flujo, paso a paso." />

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
        }}
      >
        {FLOWS.map((f, i) => (
          <FlowCard key={f.title} index={i + 1} flow={f} />
        ))}
      </div>

      <div
        style={{
          marginTop: 20,
          padding: '14px 16px',
          background: 'var(--brand-primary-50)',
          border: '1px solid var(--brand-primary-100)',
          borderRadius: 10,
          fontSize: 13,
          color: 'var(--text-secondary)',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}
      >
        <Icon name="whatsapp" size={16} style={{ color: '#25D366', marginTop: 1, flexShrink: 0 }} />
        <span>
          ¿Algo no funciona o tenés una duda? Escribinos por WhatsApp y te ayudamos. La idea es que
          uses SOI todo el día sin trabarte.
        </span>
      </div>
    </div>
  );
}
