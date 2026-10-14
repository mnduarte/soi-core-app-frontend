import type { Consent } from '../api/consents';

/**
 * Copia en PDF de un consentimiento firmado.
 *
 * Se arma **a pedido** desde los datos congelados del documento, en vez de
 * generar el PDF al firmar y guardarlo. Sale idéntico siempre —`finalText`,
 * firmas, DNI, fecha y hash son inmutables— así que almacenarlo sería guardar
 * dos veces lo mismo, con el riesgo de que una copia quede vieja.
 *
 * ── Por qué jsPDF y no imprimir la pantalla ──
 * La primera versión abría una ventana con el documento maquetado en HTML y
 * dejaba que el navegador ofreciera "Guardar como PDF". El documento salía
 * bien, pero el diálogo de impresión de Chrome tapa parte del preview y el
 * resultado se veía recortado; además obliga a elegir destino, y en tablet el
 * diálogo de impresión es un estorbo. Acá el botón baja un archivo y listo.
 *
 * La librería se carga con `import()` dinámico: son ~340 kB que no tienen por
 * qué estar en el bundle de todos los días, cuando esto se toca una vez por
 * consentimiento firmado.
 */

const DOS = (n: number) => String(n).padStart(2, '0');
const fechaLarga = (iso: string) => {
  const d = new Date(iso);
  return `${DOS(d.getDate())}/${DOS(d.getMonth() + 1)}/${d.getFullYear()} a las ${DOS(d.getHours())}:${DOS(d.getMinutes())}`;
};

/** Título de sección: "3. RIESGOS Y MOLESTIAS POSIBLES". */
const SECCION = /^\s*\d+[.)]\s+\S/;
/** Renglón de ficha: "Paciente: …", "Fecha: …". Arranca en mayúscula para no
 *  confundirlo con una frase que largó dos puntos en el medio ("…entre
 *  ellas: infección…"), que es texto corrido y no un campo. */
const CAMPO = /^[A-ZÁÉÍÓÚÑ][^\s:]{0,18}(\s[^\s:]{1,18}){0,2}:\s/;
/** Cierra una idea: lo que venga después arranca párrafo nuevo sí o sí. */
const CIERRA = /[.;:!?]$/;

type Bloque =
  | { tipo: 'seccion'; texto: string }
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'ficha'; lineas: string[] };

/**
 * Convierte el texto congelado en bloques con sentido.
 *
 * Las plantillas se escriben en un textarea angosto, así que llegan con los
 * renglones cortados a mano a ~75 caracteres. Tomar cada renglón como una
 * línea del PDF le daría al documento la medida del textarea en vez de la de
 * la hoja: columna angosta y borde derecho dentado. Hay que volver a unirlos y
 * dejar que el PDF los corte donde corresponda.
 *
 * Pero no todo renglón corto es un corte accidental: la ficha de arriba
 * ("Paciente: …" / "DNI: …") son renglones queridos, y pegarlos daría un
 * bodoque. La regla que distingue los dos casos: se une únicamente cuando el
 * renglón anterior quedó **colgado**, o sea largo (cerca del ancho con el que
 * se escribió) y sin puntuación de cierre. Nadie termina una idea así; si pasa,
 * es porque la cortó el ancho del editor.
 */
export function parsear(texto: string): Bloque[] {
  const lineas = texto.split('\n').map(l => l.trim());
  // El ancho se deduce del propio texto en vez de fijarlo: cada plantilla se
  // escribió en un editor distinto. El margen de 14 tolera la última palabra
  // que no llegó a entrar en el renglón.
  const ancho = Math.max(0, ...lineas.map(l => l.length));
  const umbral = Math.max(40, ancho - 14);

  const bloques: Bloque[] = [];
  let actual: string[] = [];
  // Una tanda de campos seguidos es UN bloque con los renglones pegados: son
  // una ficha, no cinco párrafos sueltos separados por aire.
  let ficha = false;
  const cerrar = () => {
    if (actual.length)
      bloques.push(
        ficha ? { tipo: 'ficha', lineas: actual } : { tipo: 'parrafo', texto: actual.join(' ') },
      );
    actual = [];
    ficha = false;
  };

  for (const l of lineas) {
    if (!l) {
      cerrar();
      continue;
    }
    if (SECCION.test(l)) {
      cerrar();
      bloques.push({ tipo: 'seccion', texto: l });
      continue;
    }
    const campo = CAMPO.test(l);
    const previa = actual[actual.length - 1];
    const colgada =
      !ficha && previa !== undefined && previa.length >= umbral && !CIERRA.test(previa);
    // Se corta cuando cambia la naturaleza del renglón (prosa ↔ ficha) y
    // cuando el anterior ya cerró su idea.
    if (campo !== ficha || (!colgada && !campo)) cerrar();
    if (campo) ficha = true;
    actual.push(l);
  }
  cerrar();
  return bloques;
}

interface Datos {
  consent: Consent;
  paciente: string;
  consultorio?: string;
}

/** Nombre de archivo que se entienda en la carpeta de Descargas, sin
 *  caracteres que Windows rechace. */
const nombreArchivo = (consent: Consent, paciente: string) =>
  `Consentimiento - ${paciente} - ${consent.templateName}`
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) + '.pdf';

// Medidas de la hoja, en mm. A4 con márgenes de documento, no de pantalla.
const ANCHO_HOJA = 210;
const ALTO_HOJA = 297;
const M = 20; // izquierda y derecha
const M_SUP = 18;
const M_INF = 18;
const W = ANCHO_HOJA - M * 2;
const Y_MAX = ALTO_HOJA - M_INF;

export async function descargarConsentimiento({ consent, paciente, consultorio }: Datos) {
  const { jsPDF, GState } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const anulado = !!consent.annulledAt;

  /**
   * Casi toda plantilla abre con su propio título en mayúsculas
   * ("CONSENTIMIENTO INFORMADO — CIRUGÍA ORAL"). Si encima le poníamos arriba
   * el nombre con que está guardada en la app, el documento salía con dos
   * títulos distintos diciendo lo mismo. Cuando el texto trae el suyo, ESE es
   * el título y se saca del cuerpo; si no trae ninguno, se usa el nombre de la
   * plantilla.
   */
  const lineas = consent.finalText.split('\n');
  const i = lineas.findIndex(l => l.trim());
  const primera = i >= 0 ? lineas[i].trim() : '';
  const traeTitulo =
    !!primera &&
    primera.length <= 100 &&
    !SECCION.test(primera) &&
    primera === primera.toUpperCase() &&
    /[A-ZÁÉÍÓÚÑ]/.test(primera);

  const titulo = traeTitulo ? primera : consent.templateName;
  const resto = traeTitulo ? lineas.slice(i + 1).join('\n') : consent.finalText;
  // Si el texto ya nombra al paciente —casi siempre, porque la plantilla trae
  // su variable {{paciente}}— repetirlo arriba es ruido.
  const yaIdentifica = paciente.trim().length > 2 && resto.includes(paciente.trim());

  let y = M_SUP;

  const serif = (tam: number, negrita = false) => {
    doc.setFont('times', negrita ? 'bold' : 'normal');
    doc.setFontSize(tam);
    doc.setTextColor(17);
  };

  /** Encabezado chico de las páginas 2 en adelante: en un documento que se
   *  firma, cada hoja tiene que poder identificarse sola. */
  const encabezadoCorrido = () => {
    doc.setFont('times', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(consultorio ?? '', M, M_SUP - 5);
    doc.text(paciente, ANCHO_HOJA - M, M_SUP - 5, { align: 'right' });
    doc.setDrawColor(190);
    doc.setLineWidth(0.2);
    doc.line(M, M_SUP - 3, ANCHO_HOJA - M, M_SUP - 3);
    doc.setTextColor(17);
  };

  const nuevaPagina = () => {
    doc.addPage();
    y = M_SUP + 2;
    encabezadoCorrido();
  };

  /** Pide lugar para lo que viene; si no entra, pasa de hoja. */
  const lugar = (alto: number) => {
    if (y + alto > Y_MAX) nuevaPagina();
  };

  // ── Encabezado de la primera página ──
  serif(13, true);
  doc.text(consultorio ?? '', M, y + 4);
  doc.setFont('times', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80);
  doc.text('C O N S E N T I M I E N T O   I N F O R M A D O', ANCHO_HOJA - M, y + 4, {
    align: 'right',
  });
  doc.setDrawColor(17);
  doc.setLineWidth(0.6);
  doc.line(M, y + 6.5, ANCHO_HOJA - M, y + 6.5);
  y += 14;

  // ── Título ──
  serif(15, true);
  for (const l of doc.splitTextToSize(titulo, W)) {
    lugar(7);
    doc.text(l, M, y);
    y += 7;
  }
  y += 2;

  if (!yaIdentifica) {
    serif(10, false);
    doc.setTextColor(60);
    const id = `Paciente: ${paciente}${consent.dni ? `   ·   DNI: ${consent.dni}` : ''}`;
    doc.text(id, M, y);
    y += 6;
  }
  y += 3;

  // ── Cuerpo ──
  const ALTO_LINEA = 5.1;

  /** Cuánto mide un bloque, para saber si entra antes de empezar a dibujarlo. */
  const altoDe = (b: Bloque): number => {
    if (b.tipo === 'seccion') return 3.5 + ALTO_LINEA + 0.6;
    if (b.tipo === 'ficha') return b.lineas.length * 4.8 + 2.5;
    serif(10.5, false); // splitTextToSize mide con la tipografía activa
    return doc.splitTextToSize(b.texto, W).length * ALTO_LINEA + 2.6;
  };

  const dibujar = (b: Bloque) => {
    if (b.tipo === 'seccion') {
      y += 3.5;
      serif(10.5, true);
      // Un título solo al pie de la hoja no sirve de nada: si no entra con al
      // menos dos renglones de texto debajo, se va con ellos.
      lugar(ALTO_LINEA * 3);
      doc.text(b.texto, M, y);
      y += ALTO_LINEA + 0.6;
      return;
    }

    if (b.tipo === 'ficha') {
      serif(10.5, false);
      for (const l of b.lineas) {
        lugar(4.8);
        doc.text(l, M, y);
        y += 4.8;
      }
      y += 2.5;
      return;
    }

    serif(10.5, false);
    const ls: string[] = doc.splitTextToSize(b.texto, W);
    ls.forEach((l, k) => {
      lugar(ALTO_LINEA);
      // Justificado, salvo el último renglón: estirar el que cierra el párrafo
      // deja esos huecos enormes entre palabras que delatan un PDF mal armado.
      if (k === ls.length - 1) doc.text(l, M, y);
      else doc.text(l, M, y, { align: 'justify', maxWidth: W });
      y += ALTO_LINEA;
    });
    y += 2.6;
  };

  const bloques = parsear(resto);
  /**
   * El último bloque viaja con las firmas.
   *
   * Si el bloque de firmas no entra en la hoja, se va solo a la siguiente y
   * queda una hoja de firma pelada, sin una línea del documento. En cualquier
   * papel que se firma eso es justo lo que no puede pasar: la firma tiene que
   * estar sobre el texto al que se refiere. Arrastrando el cierre, la hoja
   * nueva siempre lleva al menos el párrafo que se está consintiendo.
   */
  const cierre = consent.status === 'SIGNED' && bloques.length > 1 ? bloques.pop()! : null;
  for (const b of bloques) dibujar(b);

  // ── Firmas ──
  if (consent.status === 'SIGNED') {
    // Hueco + espacio para la firma + línea + pie + verificación.
    const ALTO_BLOQUE = 6 + 16 + 6 + 12;
    lugar((cierre ? altoDe(cierre) : 0) + ALTO_BLOQUE);
    if (cierre) dibujar(cierre);

    y += 6;
    const colW = (W - 12) / 2;
    const linea = y + 16;

    const columna = (x: number, png: string | undefined, pie: string) => {
      if (png) {
        try {
          const p = doc.getImageProperties(png);
          const h = Math.min(13, (colW * p.height) / p.width);
          const w = (h * p.width) / p.height;
          doc.addImage(png, 'PNG', x, linea - h - 1, w, h);
        } catch {
          // Una firma ilegible no puede tirar abajo la descarga del
          // documento: sale la línea en blanco, como si no la hubiera.
        }
      }
      doc.setDrawColor(60);
      doc.setLineWidth(0.3);
      doc.line(x, linea, x + colW, linea);
      serif(9, false);
      doc.setTextColor(50);
      doc.text(doc.splitTextToSize(pie, colW), x, linea + 4.5);
    };

    columna(
      M,
      consent.signaturePng,
      `${paciente}${consent.dni ? ` — DNI ${consent.dni}` : ''}`,
    );
    columna(
      M + colW + 12,
      consent.professionalSignaturePng,
      [consent.professionalName, consent.professionalLicense && `Mat. ${consent.professionalLicense}`]
        .filter(Boolean)
        .join(' — ') || 'Profesional',
    );
    y = linea + 12;

    // ── Pie de verificación ──
    lugar(10);
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(`Firmado el ${consent.signedAt ? fechaLarga(consent.signedAt) : ''}`, M, y);
    y += 3.6;
    if (consent.hash) {
      for (const l of doc.splitTextToSize(`Verificación: ${consent.hash}`, W)) {
        doc.text(l, M, y);
        y += 3.6;
      }
    }
    // Además del sello cruzado: el sello se ve, esto se lee y se cita.
    if (anulado) {
      y += 1.5;
      doc.setTextColor(168, 32, 32);
      const texto = `ANULADO el ${fechaLarga(consent.annulledAt!)}${
        consent.annulledReason ? ` - ${consent.annulledReason}` : ''
      }`;
      for (const l of doc.splitTextToSize(texto, W)) {
        lugar(4);
        doc.text(l, M, y);
        y += 3.6;
      }
    }
  } else {
    y += 6;
    lugar(12);
    doc.setDrawColor(150);
    doc.setLineWidth(0.3);
    doc.rect(M, y - 4.5, W, 9);
    serif(9.5, false);
    doc.text('Esta copia todavía no está firmada.', M + 3, y + 1);
  }

  // ── Numeración y sello, al final: recién acá se sabe cuántas hojas son ──
  const hojas = doc.getNumberOfPages();
  for (let p = 1; p <= hojas; p++) {
    doc.setPage(p);

    /**
     * El sello de anulado va en TODAS las hojas y en diagonal.
     *
     * Si fuera una línea al pie, alcanza con no imprimir la última hoja para
     * que el documento vuelva a parecer válido. Cruzado sobre el texto no hay
     * forma de presentarlo como vigente.
     *
     * Con transparencia, para que no tape lo que dice el consentimiento: si
     * este navegador no la soporta, no se dibuja. Un bloque opaco encima del
     * texto sería peor que no tener sello.
     */
    if (anulado) {
      try {
        doc.saveGraphicsState();
        doc.setGState(new GState({ opacity: 0.22 }));
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(70);
        doc.setTextColor(168, 32, 32);
        // Arranca abajo a la izquierda del centro para que, subiendo a 38°,
        // quede centrado sobre la diagonal de la hoja.
        doc.text('ANULADO', 55, 188, { angle: 38 });
        doc.restoreGraphicsState();
      } catch {
        /* sin transparencia no va el sello: ver arriba */
      }
    }

    if (hojas > 1) {
      doc.setFont('times', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`${p} de ${hojas}`, ANCHO_HOJA - M, ALTO_HOJA - M_INF + 8, { align: 'right' });
    }
  }

  doc.save(nombreArchivo(consent, paciente));
}
