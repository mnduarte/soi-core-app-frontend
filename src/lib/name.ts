// El nombre del paciente se carga en un solo campo ("Nombre y apellido"), pero
// por detrás seguimos guardando name + lastName (todo el resto de la app los
// concatena). Partimos por el primer espacio: primera palabra = nombre, el
// resto = apellido. El display re-une ambos, así que el corte es invisible.
export function splitName(full: string): { name: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { name: parts[0] ?? '', lastName: '' };
  return { name: parts[0], lastName: parts.slice(1).join(' ') };
}
