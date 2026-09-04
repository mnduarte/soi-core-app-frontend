/**
 * Texto de los recordatorios de turno, en un solo lugar.
 *
 * Lo usan el recordatorio de la agenda y el buscador de turnos. Vive acá y no
 * dentro de un componente por dos razones: exportar funciones desde un archivo
 * de componentes rompe Fast Refresh, y sobre todo porque si el texto viviera en
 * dos lados el paciente recibiría uno u otro según desde dónde se lo mandaron.
 *
 * Sin emojis a propósito: WhatsApp Desktop los recibe rotos (�) cuando vienen
 * pre-cargados por link. El texto queda limpio en todos los dispositivos.
 */
export function buildMsg(
  firstName: string,
  clinic: string,
  dateLabel: string,
  time: string,
): string {
  return `Hola ${firstName}, te escribimos de ${clinic}. Te recordamos tu turno el ${dateLabel} a las ${time} hs. Si no podés venir, avisanos así lo reprogramamos. ¡Te esperamos!`;
}

/**
 * Recordatorio cuando el paciente tiene VARIOS turnos por delante.
 *
 * El mensaje de uno solo ("te recordamos tu turno el viernes") es directamente
 * incorrecto acá: el paciente se queda creyendo que tiene uno y falta a los
 * otros dos. Se listan todos, que además suele ser lo que preguntó.
 */
export function buildMsgVarios(
  firstName: string,
  clinic: string,
  turnos: { fecha: string; hora: string }[],
): string {
  if (turnos.length === 0) return '';
  if (turnos.length === 1) {
    return buildMsg(firstName, clinic, turnos[0].fecha, turnos[0].hora);
  }
  const lista = turnos.map(t => `- ${t.fecha} a las ${t.hora} hs`).join('\n');
  return [
    `Hola ${firstName}, te escribimos de ${clinic}. Te recordamos tus próximos turnos:`,
    lista,
    'Si no podés venir a alguno, avisanos así lo reprogramamos. ¡Te esperamos!',
  ].join('\n');
}
