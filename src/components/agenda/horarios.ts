/**
 * Horarios y duraciones de la agenda.
 *
 * Viven en su propio archivo y no junto al componente: exportar constantes
 * desde un archivo que además exporta componentes rompe el fast refresh de
 * Vite, y el lint del proyecto lo marca.
 */

export const DURACIONES = [15, 30, 45, 60, 90];

/** Por defecto. El consultorio los cambia en "Personalizar horarios" y
 *  entonces vienen de `settings.slotTimes`. */
export const HORARIOS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30',
];
