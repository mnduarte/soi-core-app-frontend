/**
 * Cliente de la firma por link.
 *
 * Usa `fetch` pelado y NO el `apiClient` de la app: aquel agrega el token de
 * sesión y, ante un 401, intenta refrescarlo y reintenta. Nada de eso tiene
 * sentido acá — quien abre el link es un paciente sin cuenta — y además un
 * refresh disparado desde una pantalla pública podría ensuciar la sesión del
 * profesional si abre el link en el mismo navegador.
 */

const BASE = import.meta.env.VITE_API_URL ?? '';

export interface ConsentPublico {
  templateName: string;
  finalText: string;
  patientName: string;
  clinicName: string;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${url}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) {
    // El backend contesta lo mismo para token inexistente, vencido o ya
    // firmado. Se respeta ese mensaje tal cual, sin inventarle matices.
    throw new Error(cuerpo?.message?.message ?? cuerpo?.message ?? 'No se pudo abrir el consentimiento');
  }
  return cuerpo?.data ?? cuerpo;
}

export const publicConsentsApi = {
  ver: (token: string) => pedir<ConsentPublico>(`/public/consents/${token}`),

  firmar: (token: string, dto: { signaturePng: string; dni?: string }) =>
    pedir<{ ok: boolean }>(`/public/consents/${token}/sign`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),
};
