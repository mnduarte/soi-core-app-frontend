export const fmtMoney = (n: number): string => {
  if (n === 0) return '$0';
  const abs = Math.abs(n).toLocaleString('es-AR');
  return `${n < 0 ? '-' : ''}$${abs}`;
};

const AVATAR_COLORS = ['color-1', 'color-2', 'color-3', 'color-4', 'color-5', 'color-6'];

// FNV-1a hash: mixes via XOR + a coprime prime, so MongoDB ObjectIds (which share
// timestamp/process prefixes) still distribute across the 6 buckets. A simple
// rolling `h = h*31 + c` collapses to `sum % 6` because 31 ≡ 1 (mod 6) — that's
// why nearby ids all landed on the same color.
export const avatarColorFromId = (id: string): string => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return AVATAR_COLORS[(h >>> 0) % AVATAR_COLORS.length];
};

export const ageFromBirthDate = (birthDate?: string): number | null => {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
};

// Edad a mostrar: usa el campo `age` (lo carga el doctor a mano) y, para fichas
// viejas sin ese dato, la deriva de `birthDate`.
export const patientAge = (p: { age?: number | null; birthDate?: string }): number | null =>
  p.age != null ? p.age : ageFromBirthDate(p.birthDate);

// Prefixes a name with its honorific. DR → "Dr. X", DRA → "Dra. X",
// NONE/null/undefined (assistant) → just the name.
export const withTitle = (name?: string, title?: 'DR' | 'DRA' | 'NONE' | null): string => {
  if (!name) return '';
  if (title === 'DR') return `Dr. ${name}`;
  if (title === 'DRA') return `Dra. ${name}`;
  return name;
};

// Fecha corta para las columnas mono: 01/08/26
export const fmtShortDate = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
};

// "hoy" / "ayer" / "hace 10 días" / "hace 4 sem." — el subtítulo de última visita.
export const relativeDay = (iso?: string | null): string => {
  if (!iso) return 'sin visitas';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'sin visitas';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 14) return `hace ${days} días`;
  if (days < 60) return `hace ${Math.round(days / 7)} sem.`;
  return `hace ${Math.round(days / 30)} meses`;
};

export const initialsOf = (first: string, last?: string): string => {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (l) return (f[0] + l[0]).toUpperCase();
  const parts = f.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (f[0] ?? '?').toUpperCase();
};
