import type { AuthUser, ClinicInfo } from '../store/auth.store';
import { withTitle } from './format';

/**
 * Escribirle al que hizo el sistema, por WhatsApp.
 *
 * No hay formulario a propósito. Un formulario necesita dónde guardar, algo que
 * avise y un lugar para responder — y la respuesta iba a salir por WhatsApp
 * igual. Además, la mitad de las consultas vienen con una captura de pantalla, y
 * eso WhatsApp ya lo resuelve.
 *
 * Lo que sí aporta la app es la identidad: quién escribe, de qué consultorio, con
 * qué usuario, qué versión tiene instalada y desde qué pantalla escribió. Eso
 * ahorra el ida y vuelta de "¿quién sos?" y, sobre todo, el de "¿qué versión
 * tenés?" — que con la copia local de la app es una pregunta real: alguien puede
 * estar viendo una versión de hace una semana y describir un problema que ya no
 * existe.
 */
const NUMERO = '5491133419653';

/** El nombre corto de la pantalla, no la URL con el id del paciente adentro. */
function pantalla(pathname: string): string {
  const raiz = pathname.split('/')[1] ?? '';
  const nombres: Record<string, string> = {
    '': 'inicio',
    agenda: 'agenda',
    patients: 'pacientes',
    'ficha-rapida': 'ficha clínica',
    gallery: 'galería',
    payments: 'pagos',
    ayuda: 'ayuda',
  };
  return nombres[raiz] ?? raiz;
}

export function linkSoporte(
  user: AuthUser | null,
  clinic: ClinicInfo | null,
  pathname: string,
): string {
  // El usuario creado desde el backoffice tiene un email sintético
  // (usuario@molar.local): de ahí sale el nombre de usuario, que es lo que
  // identifica la cuenta sin ambigüedad en el buscador del backoffice.
  const usuario = user?.email?.split('@')[0];
  const quien = [withTitle(user?.name, user?.title), clinic?.name].filter(Boolean).join(' — ');

  const texto = [
    'Hola',
    '',
    quien + (usuario ? ` (${usuario})` : ''),
    '',
    'Mi consulta:',
    '',
    `— SOI ${__SOI_VERSION__} · ${pantalla(pathname)}`,
  ].join('\n');

  return `https://wa.me/${NUMERO}?text=${encodeURIComponent(texto)}`;
}
