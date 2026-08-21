import type { CSSProperties, ReactNode } from 'react';

export type IconName =
  | 'search' | 'bell' | 'plus' | 'home' | 'calendar' | 'users' | 'user'
  | 'tooth' | 'image' | 'receipt' | 'settings' | 'whatsapp'
  | 'chevronDown' | 'chevronRight' | 'chevronLeft' | 'more'
  | 'phone' | 'mail' | 'camera' | 'upload' | 'download' | 'edit' | 'trash'
  | 'check' | 'x' | 'clock' | 'filter'
  | 'arrowRight' | 'arrowLeft' | 'arrowUp' | 'arrowDown'
  | 'sparkles' | 'cash' | 'alert' | 'menu' | 'grid' | 'list' | 'layers'
  | 'history' | 'link' | 'star' | 'send' | 'zap' | 'flame'
  | 'sun' | 'moon' | 'smartphone' | 'clipboard' | 'undo' | 'eye' | 'eyeOff' | 'help';

const ICONS: Record<IconName, ReactNode> = {
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>,
  eyeOff: <><path d="M9.9 4.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a13 13 0 0 1-2.1 2.9" /><path d="M6.6 6.6A13 13 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 3.4-.6" /><path d="M9.5 9.5a3 3 0 0 0 4.2 4.2" /><path d="m2 2 20 20" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  home: <><path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M16 4a4 4 0 0 1 0 8" /><path d="M22 21a7 7 0 0 0-5-6.7" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  tooth: <><path d="M12 2c-3.5 0-6 2-6 5 0 1.5.5 2.5 1 4 .5 1.5.5 3 .5 5 0 3 1.5 6 2 6s1-1 1.5-3 .5-3 1-3 .5 1 1 3 1 3 1.5 3 2-3 2-6c0-2 0-3.5.5-5s1-2.5 1-4c0-3-2.5-5-6-5z" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></>,
  receipt: <><path d="M4 2v20l3-2 3 2 3-2 3 2 4-2V2" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  whatsapp: <><path d="M3 21l1.6-4.6A8 8 0 1 1 7.5 19.8L3 21z" /></>,
  chevronDown: <><path d="m6 9 6 6 6-6" /></>,
  chevronRight: <><path d="m9 6 6 6-6 6" /></>,
  chevronLeft: <><path d="m15 6-6 6 6 6" /></>,
  more: <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
  phone: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L7.9 9.6a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 7L2 7" /></>,
  camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5M12 3v12" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z" /></>,
  trash: <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>,
  check: <><path d="M20 6 9 17l-5-5" /></>,
  x: <><path d="M18 6 6 18M6 6l12 12" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  filter: <><path d="M22 3H2l8 9.5V19l4 2v-8.5z" /></>,
  arrowRight: <><path d="M5 12h14M13 5l7 7-7 7" /></>,
  arrowLeft: <><path d="M19 12H5M12 5l-7 7 7 7" /></>,
  arrowUp: <><path d="M12 19V5M5 12l7-7 7 7" /></>,
  arrowDown: <><path d="M12 5v14M19 12l-7 7-7-7" /></>,
  sparkles: <><path d="M12 3v3M12 18v3M21 12h-3M6 12H3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7 5.6 5.6" /></>,
  cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
  layers: <><path d="m12 2 10 6-10 6L2 8z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>,
  star: <><path d="M12 2l3 7h7l-5.5 4.5 2 7.5L12 17l-6.5 4 2-7.5L2 9h7z" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4z" /><path d="m22 2-11 11" /></>,
  zap: <><path d="M13 2 3 14h9l-1 8 10-12h-9z" /></>,
  flame: <><path d="M12 2s4 5 4 9a4 4 0 0 1-8 0c0-2 2-4 2-6 1.5 1 2 3 2 3z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></>,
  smartphone: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></>,
  clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /><path d="M9 12h6M9 16h4" /></>,
  undo: <><path d="M3 7v6h6" /><path d="M3.5 13a9 9 0 1 0 2.1-9.4L3 7" /></>,
};

// ============================================================
// Íconos del mockup (emojis) — INTERRUPTOR
// Poner en false para volver a los SVG del sistema.
//
// Ojo con lo que implica dejarlo en true:
//   · Cada sistema operativo dibuja los emojis distinto (Windows, Android del
//     consultorio, iPhone) — no se ven iguales en todos lados.
//   · Los emojis a color IGNORAN el color del contexto, así que se pierde el
//     código de color (WhatsApp verde, borrar en terracota, activo en azul).
//     Los glifos de texto (✆ ✎ ⋯ ✓ ✕ ⌕ +) sí lo respetan.
// Los nombres que no estén acá siguen usando el SVG.
// ============================================================
const USE_MOCKUP_EMOJI = true;

const EMOJI: Partial<Record<IconName, string>> = {
  calendar: '📅',
  users: '👥',
  clipboard: '📋',
  history: '🕐',
  clock: '🕐',
  user: '👤',
  // 🖼 y 🗑 son de un bloque viejo de Unicode: por defecto se dibujan como
  // texto monocromático (gris). El carácter invisible U+FE0F fuerza la
  // versión a color, para que acompañen a 🦷 y ✏️.
  image: '🖼️',
  tooth: '🦷',
  cash: '💵',
  camera: '📷',
  // trash NO va como emoji: el 🗑 de Windows es un tacho casi blanco, ilegible
  // a 14px, y encima el emoji ignora el color del contexto — el botón de borrar
  // está en terracota (peligro) y quedaba pálido y sin jerarquía. El SVG se
  // dibuja nítido y sí toma la terracota, que acá es información.
  receipt: '🧾',
  // Editar va como emoji (no como el glifo ✎) para que acompañe a 🖼 y 🦷: en
  // la misma barra de la ficha y en las filas de las tablas quedaban mezclados
  // un dibujito a color y una tilde monocromática.
  edit: '✏️',
  // Glifos de texto: monocromáticos, heredan el color del contexto.
  whatsapp: '✆',
  phone: '✆',
  more: '⋯',
  check: '✓',
  x: '✕',
  search: '⌕',
  plus: '+',
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Grosor del trazo. Por defecto 2.1 (ver nota abajo). */
  strokeWidth?: number;
}

// Trazo 2.1: el rediseño "Libreta" pide íconos que se lean firmes sobre el
// papel crema (el mockup los dibujaba con emojis, más pesados visualmente).
// Se usan SVG y no emojis a propósito: los emojis los dibuja cada sistema
// operativo distinto — en la tablet Android del consultorio se verían con otro
// estilo y a color, rompiendo la paleta. Ver handoff-libreta, regla 5.
export function Icon({ name, size = 17, className, style, strokeWidth = 2.1 }: IconProps) {
  const emoji = USE_MOCKUP_EMOJI ? EMOJI[name] : undefined;
  if (emoji) {
    return (
      <span
        className={className}
        aria-hidden="true"
        style={{
          // Cuadrado del mismo tamaño que el SVG, para que no se muevan los
          // layouts que reservan ese espacio.
          width: size,
          height: size,
          fontSize: size * 0.95,
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontStyle: 'normal',
          ...style,
        }}
      >
        {emoji}
      </span>
    );
  }

  const paths = ICONS[name];
  if (!paths) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}
