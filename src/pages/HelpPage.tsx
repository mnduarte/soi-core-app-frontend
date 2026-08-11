import type { ReactNode } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { Icon, type IconName } from '../components/common/Icon';

// Bolds text wrapped in **double asterisks** so step strings can highlight the
// exact button/label the dentist has to look for.
function withBold(text: string): ReactNode[] {
  return text.split('**').map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>));
}

interface Pin {
  x: number;
  y: number;
  w: number;
  h: number;
  tag: string;
  below?: boolean;
  round?: boolean;
}
interface Shot {
  src: string;
  pins: Pin[];
}
interface Flow {
  icon: IconName;
  title: string;
  sub: string;
  steps: string[];
  shots: Shot[];
}

const RED = '#E11D48';

const FLOWS: Flow[] = [
  {
    icon: 'check',
    title: 'Activá tu cuenta',
    sub: 'La primera vez, desde el mensaje que te enviamos por WhatsApp.',
    shots: [
      { src: '/ayuda/01-invite.jpg', pins: [{ x: 6, y: 48, w: 82, h: 11, tag: 'Abrí este link' }] },
      { src: '/ayuda/02-activar.jpg', pins: [{ x: 57, y: 72, w: 35, h: 8, tag: 'Crear contraseña y entrar' }] },
    ],
    steps: [
      'Abrí el **link** del WhatsApp.',
      'Ingresá la **contraseña temporal** (la del mensaje) y elegí una **contraseña nueva** (mínimo 8 caracteres).',
      'Tocá **Crear contraseña y entrar**.',
      'De ahí en más entrás a la misma pantalla con tu **usuario y contraseña**.',
    ],
  },
  {
    icon: 'home',
    title: 'Tu tablero',
    sub: 'Turnos del día, pendientes y accesos rápidos.',
    shots: [{ src: '/ayuda/03-dashboard.jpg', pins: [{ x: 1, y: 18, w: 21, h: 13, tag: 'Tu menú' }] }],
    steps: [
      'En el **menú** de la izquierda están **Agenda**, **Pacientes**, **Galería** y **Pagos**.',
      'Las **Acciones rápidas** crean un turno, un paciente o un cobro en un toque.',
    ],
  },
  {
    icon: 'users',
    title: 'Crear un paciente',
    sub: 'Desde Pacientes → Nuevo paciente. Solo lo esencial.',
    shots: [
      {
        src: '/ayuda/04-paciente.jpg',
        pins: [
          { x: 5, y: 35, w: 30, h: 9, tag: 'Fecha de nacimiento' },
          { x: 76, y: 88, w: 21, h: 6, tag: 'Crear ficha' },
        ],
      },
    ],
    steps: [
      'Cargá **nombre, apellido y teléfono**.',
      'La **fecha de nacimiento** calcula la edad sola.',
      'Tocá **Crear ficha** — o **Guardar y agendar turno**.',
    ],
  },
  {
    icon: 'calendar',
    title: 'Agendar un turno',
    sub: 'Desde la agenda o desde la ficha del paciente.',
    shots: [
      {
        src: '/ayuda/05-turno.jpg',
        pins: [
          { x: 5, y: 18, w: 90, h: 7, tag: 'Elegí el paciente' },
          { x: 68, y: 88, w: 25, h: 6, tag: 'Confirmar turno' },
        ],
      },
    ],
    steps: [
      'Elegí el **paciente**, la **fecha**, la **hora** y el **motivo**.',
      'Tocá **Confirmar turno**.',
      'Cuando quieras, enviale al paciente un **recordatorio por WhatsApp** del turno.',
    ],
  },
  {
    icon: 'clipboard',
    title: 'Atender un turno',
    sub: 'En la agenda, en el turno tocá el menú ⋯.',
    shots: [{ src: '/ayuda/06-atender.jpg', pins: [{ x: 12, y: 33, w: 27, h: 5, tag: 'Marcar atendido' }] }],
    steps: [
      'En el turno tocá **⋯** → **Marcar atendido**.',
      'Queda un aviso **“Ficha pendiente”** hasta que documentes la visita.',
    ],
  },
  {
    icon: 'history',
    title: 'Cargar la evolución',
    sub: 'En la pestaña Historial. Queda en la historia clínica con fecha.',
    shots: [{ src: '/ayuda/07-evolucion.jpg', pins: [{ x: 38, y: 46, w: 16, h: 5, tag: 'Nueva entrada' }] }],
    steps: [
      'Pestaña **Historial** → **+ Nueva entrada**.',
      'Elegí el **tipo** (Tratamiento / Control / Foto / Nota), escribí la nota — o tocá una **frase rápida**.',
      'Tocá **Guardar entrada**.',
    ],
  },
  {
    icon: 'tooth',
    title: 'Odontograma',
    sub: 'En la pestaña Ficha. Cada diente tiene 5 caras clickeables.',
    shots: [
      { src: '/ayuda/08-odontograma.jpg', pins: [{ x: 8, y: 78, w: 30, h: 13, tag: 'Click en una cara del diente' }] },
    ],
    steps: [
      'Elegí **Existente** (ya hecho) o **Requerida** (a hacer) y el código (caries, corona…).',
      'Hacé **click en la cara** del diente para marcarla.',
    ],
  },
  {
    icon: 'list',
    title: 'Plan de tratamiento',
    sub: 'Debajo del odontograma. Cargá las prestaciones con su precio.',
    shots: [{ src: '/ayuda/09-plan.jpg', pins: [{ x: 42, y: 85, w: 14, h: 5, tag: 'Agregar al plan' }] }],
    steps: [
      'Tocá **+ Agregar** y cargá la prestación, el/los **diente(s)** y el **precio**.',
      'Al terminar, marcá el ítem como **Completado** → se genera el **cargo** en la cuenta del paciente.',
    ],
  },
  {
    icon: 'cash',
    title: 'Cobrar y recordar pagos',
    sub: 'Pestaña Pagos: cuenta corriente simple, con recordatorio por WhatsApp.',
    shots: [
      {
        src: '/ayuda/10-pagos.jpg',
        pins: [
          { x: 42, y: 42, w: 16, h: 5, tag: 'Registrar cobro' },
          { x: 63, y: 66, w: 33, h: 5, tag: 'Recordar por WhatsApp', below: true },
        ],
      },
    ],
    steps: [
      '**Registrar cobro** (monto + método). El saldo se ajusta solo.',
      'Si el paciente debe, tocá **Recordar pago por WhatsApp**: el mensaje sale listo, vos confirmás.',
    ],
  },
  {
    icon: 'camera',
    title: 'Fotos del paciente',
    sub: 'Galería por sesiones, con comparación antes/después.',
    shots: [
      {
        src: '/ayuda/11-fotos.jpg',
        pins: [
          { x: 28, y: 40, w: 43, h: 6, tag: 'Elegí o sacá la foto' },
          { x: 78, y: 91, w: 18, h: 6, tag: 'Subir' },
        ],
      },
    ],
    steps: [
      'Tocá **Subir fotos** (o la pestaña **Galería** → **Subir**).',
      'Arrastrá las fotos o tocá **Elegir archivos** / **Sacar foto**.',
      'Asigná **tipo** y una **sesión** → **Subir**.',
    ],
  },
];

function PinBox({ p }: { p: Pin }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${p.x}%`,
        top: `${p.y}%`,
        width: `${p.w}%`,
        height: `${p.h}%`,
        border: `2.5px solid ${RED}`,
        borderRadius: p.round ? '50%' : 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: '50%',
          [p.below ? 'top' : 'bottom']: '100%',
          transform: `translate(-50%, ${p.below ? '6px' : '-6px'})`,
          background: RED,
          color: 'white',
          fontSize: 10.5,
          fontWeight: 700,
          padding: '2px 7px',
          borderRadius: 5,
          whiteSpace: 'nowrap',
        }}
      >
        {p.tag}
      </span>
    </div>
  );
}

function ShotImg({ shot }: { shot: Shot }) {
  return (
    <div
      style={{
        position: 'relative',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 10,
      }}
    >
      <img src={shot.src} alt="" style={{ display: 'block', width: '100%', height: 'auto' }} />
      {shot.pins.map((p, i) => (
        <PinBox key={i} p={p} />
      ))}
    </div>
  );
}

function FlowSection({ index, flow }: { index: number; flow: Flow }) {
  return (
    <section style={{ marginBottom: 30, maxWidth: 720 }}>
      <div className="row" style={{ gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
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
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>
            {index}. {flow.title}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{flow.sub}</div>
        </div>
      </div>

      {flow.shots.map((s, i) => (
        <ShotImg key={i} shot={s} />
      ))}

      <ol style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {flow.steps.map((step, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13.5, lineHeight: 1.5 }}>
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
    </section>
  );
}

export default function HelpPage() {
  return (
    <div className="content fade-in">
      <PageHeader title="Ayuda" sub="Guía rápida de SOI — cada flujo, paso a paso." />

      {FLOWS.map((f, i) => (
        <FlowSection key={f.title} index={i + 1} flow={f} />
      ))}

      <div
        style={{
          marginTop: 8,
          maxWidth: 720,
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
        <Icon name="whatsapp" size={16} style={{ color: 'var(--success)', marginTop: 1, flexShrink: 0 }} />
        <span>¿Algo no funciona o tenés una duda? Escribinos por WhatsApp y te ayudamos.</span>
      </div>
    </div>
  );
}
