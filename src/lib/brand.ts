// Applies the clinic's brand color at runtime by overriding the CSS variables
// that index.css defines. The dentist app ships with a blue default; once the
// session knows the clinic's brandColor (from /auth/login), we recolor the
// whole UI to match what the super-admin picked in the backoffice.

// index.css :root defaults — restored when there's no clinic color (logout).
const DEFAULTS: Record<string, string> = {
  '--brand-primary': '#2F54EB',
  '--brand-primary-600': '#2848D6',
  '--brand-primary-50': '#EEF2FF',
  '--brand-primary-100': '#E0E7FF',
};

function parseHex(hex: string): [number, number, number] | null {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// Darken/lighten by a percentage (-10 = 10% darker), like the prototype's
// shadeColor — used for the pressed/hover -600 tone.
function shade(hex: string, percent: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const amt = Math.round(2.55 * percent);
  const clamp = (v: number) => Math.max(0, Math.min(255, v + amt));
  const [r, g, b] = rgb.map(clamp);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function alpha(hex: string, a: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

export function applyBrandColor(color?: string | null): void {
  const root = document.documentElement.style;
  if (!color || !parseHex(color)) {
    for (const [k, v] of Object.entries(DEFAULTS)) root.setProperty(k, v);
    return;
  }
  root.setProperty('--brand-primary', color);
  root.setProperty('--brand-primary-600', shade(color, -10));
  root.setProperty('--brand-primary-50', alpha(color, 0.08));
  root.setProperty('--brand-primary-100', alpha(color, 0.16));
}
