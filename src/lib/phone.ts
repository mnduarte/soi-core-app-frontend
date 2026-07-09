// Normaliza un teléfono a los dígitos internacionales que espera wa.me.
// Best-effort para Argentina: WhatsApp necesita 54 + 9 + área (sin 0) + número
// (sin 15). Respeta otros países si el número trae código (00… o 54…).
export function toWhatsAppNumber(raw?: string): string {
  if (!raw) return '';
  let d = raw.replace(/\D/g, '');
  if (!d) return '';

  // Prefijo internacional "00" → ya viene con código de país (ej. 00591… Bolivia).
  if (d.startsWith('00')) return d.slice(2);

  // Ya tiene código de Argentina.
  if (d.startsWith('54')) {
    let rest = d.slice(2);
    if (rest.startsWith('9')) rest = rest.slice(1);
    return '549' + stripArLocal(rest);
  }

  // Heurística: 12+ dígitos y no arranca en 0 → asumimos que ya trae país.
  if (d.length >= 12) return d;

  // Número local argentino.
  return '549' + stripArLocal(d);
}

// Quita el 0 inicial (troncal) y el 15 de celular (formato viejo, ej. 11 15 …).
function stripArLocal(d: string): string {
  d = d.replace(/^0/, '');
  const m = d.match(/^(\d{2,4})15(\d{6,8})$/);
  return m ? m[1] + m[2] : d;
}

// Vista previa legible del número que va a usar WhatsApp.
export function whatsAppPreview(raw?: string): string {
  const d = toWhatsAppNumber(raw);
  if (!d) return '';
  // Caso típico Buenos Aires: 549 + 11 + 8 dígitos.
  if (/^549\d{10}$/.test(d)) {
    const n = d.slice(3); // área + número (10 díg)
    return `+54 9 ${n.slice(0, 2)} ${n.slice(2, 6)}-${n.slice(6)}`;
  }
  return '+' + d;
}
