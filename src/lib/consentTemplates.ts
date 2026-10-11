/**
 * Plantillas de consentimiento informado.
 *
 * El consultorio guarda las suyas en `settings.consentTemplates`. Mientras no
 * cargue ninguna, se ofrecen estas, igual que pasa con los trabajos rápidos y
 * las categorías de fotos: un consultorio nuevo tiene que poder ver cómo
 * funciona el circuito el primer día, sin configurar nada.
 *
 * ⚠️ SON UN MODELO PARA REVISAR, NO UN TEXTO VALIDADO.
 * El contenido de un consentimiento informado tiene peso legal y lo define el
 * profesional (o el modelo de su colegio), no este archivo. Por eso cada una
 * trae `esEjemplo: true`: la interfaz lo avisa en pantalla para que nadie lo
 * use con un paciente creyendo que está aprobado.
 */

export interface ConsentTemplateVersion {
  id: string;
  /** 1, 2, 3… es lo que se muestra como "v3". */
  n: number;
  body: string;
  createdAt: string;
  createdByName?: string;
}

export interface ConsentTemplate {
  id: string;
  name: string;
  /** Hay que firmarla antes de hacer el trabajo. */
  required?: boolean;
  /** Fuera de los selects, pero no borrada: hay firmados que la referencian. */
  archived?: boolean;
  /** Nunca se edita una versión: cada "Guardar" agrega una. La última es la
   *  vigente. */
  versions: ConsentTemplateVersion[];
  /** Viene del código y no del consultorio: hay que revisarla antes de usarla. */
  esEjemplo?: boolean;
}

/** La versión vigente de una plantilla: siempre la última. */
export const versionVigente = (p: ConsentTemplate): ConsentTemplateVersion | undefined =>
  p.versions[p.versions.length - 1];

/** Variables que se reemplazan al generar el consentimiento. */
/**
 * `profesional` es el nombre pelado, sin "Dr." adelante: el tratamiento lo
 * pone el TEXTO de la plantilla ("el/la Dr./Dra. {{profesional}}"), no el
 * dato. Así una plantilla puede decir "la asistente {{profesional}}" o
 * cualquier otra fórmula sin pelearse con un prefijo que vino pegado.
 */
export const VARIABLES = [
  'paciente', 'dni', 'profesional', 'matricula', 'trabajo', 'fecha',
] as const;

const CIRUGIA = `CONSENTIMIENTO INFORMADO — CIRUGÍA ORAL / EXTRACCIÓN DENTARIA

Paciente: {{paciente}}
DNI: {{dni}}
Profesional: {{profesional}} — matrícula {{matricula}}
Práctica: {{trabajo}}
Fecha: {{fecha}}

1. EN QUÉ CONSISTE
Se me explicó que la práctica indicada consiste en la extracción de una o más
piezas dentarias, o en un procedimiento quirúrgico sobre los tejidos de la
boca, realizada bajo anestesia local.

2. POR QUÉ SE INDICA
Se me informaron los motivos por los que se indica esta práctica en mi caso
particular, y qué se espera conseguir con ella.

3. RIESGOS Y MOLESTIAS POSIBLES
Entiendo que toda intervención, aun realizada correctamente, puede presentar
complicaciones. Se me informó que las más frecuentes son dolor e inflamación
en los días posteriores, sangrado, hematoma y dificultad para abrir la boca,
y que son habitualmente transitorias.

Se me informó también que existen complicaciones menos frecuentes, entre
ellas: infección de la zona operada, alveolitis, lesión de dientes o
restauraciones vecinas, fractura de una raíz o del hueso que la rodea,
comunicación con el seno maxilar en piezas superiores, y alteración
transitoria —excepcionalmente permanente— de la sensibilidad del labio, el
mentón o la lengua por proximidad con un nervio.

4. ALTERNATIVAS
Se me informaron las alternativas posibles a esta práctica, si las hubiera, y
qué puede ocurrir si decido no realizarla.

5. ANTES Y DESPUÉS
Me comprometo a informar al profesional sobre mis enfermedades, alergias,
medicación que tomo y tratamientos previos, y a seguir las indicaciones
posteriores que se me entreguen.

6. DECLARACIÓN
Declaro que recibí esta información en lenguaje claro, que tuve la
oportunidad de hacer preguntas y que fueron respondidas, y que comprendo lo
que voy a firmar.

Sé que puedo revocar este consentimiento en cualquier momento antes de la
práctica, sin tener que dar explicaciones y sin que eso afecte mi atención.

Presto mi consentimiento para la realización de la práctica descripta.`;

export const PLANTILLAS_EJEMPLO: ConsentTemplate[] = [
  {
    id: 'ejemplo-cirugia',
    name: 'Cirugía oral / extracción (ejemplo)',
    required: true,
    archived: false,
    esEjemplo: true,
    versions: [
      {
        id: 'ejemplo-cirugia-v1',
        n: 1,
        body: CIRUGIA,
        createdAt: '2026-01-01T00:00:00.000Z',
        createdByName: 'Modelo de SOI',
      },
    ],
  },
];

export const FALTANTE = '__________';

export interface Trozo {
  texto: string;
  /** Salió de una variable: se resalta para que se vea qué completó solo. */
  variable?: boolean;
  /** La variable no tenía valor: queda un espacio para llenar a mano. */
  falta?: boolean;
}

/**
 * Parte el cuerpo en trozos para poder pintar distinto lo que se completó.
 * El doctor tiene que ver de un vistazo qué puso el sistema y, sobre todo,
 * qué quedó en blanco — un `__________` perdido en dos páginas de texto se
 * pasa por alto, resaltado no.
 */
export function segmentar(
  cuerpo: string,
  datos: Partial<Record<(typeof VARIABLES)[number], string>>,
): Trozo[] {
  const trozos: Trozo[] = [];
  let i = 0;
  for (const m of cuerpo.matchAll(/\{\{(\w+)\}\}/g)) {
    const at = m.index ?? 0;
    if (at > i) trozos.push({ texto: cuerpo.slice(i, at) });
    const valor = datos[m[1] as (typeof VARIABLES)[number]];
    const hay = !!valor && valor.trim().length > 0;
    trozos.push({ texto: hay ? valor! : FALTANTE, variable: true, falta: !hay });
    i = at + m[0].length;
  }
  if (i < cuerpo.length) trozos.push({ texto: cuerpo.slice(i) });
  return trozos;
}

/** Reemplaza las variables del cuerpo. Lo que no se conoce queda como un
 *  espacio para completar a mano, nunca como "{{dni}}" crudo en pantalla. */
export function aplicarVariables(
  cuerpo: string,
  datos: Partial<Record<(typeof VARIABLES)[number], string>>,
): string {
  return cuerpo.replace(/\{\{(\w+)\}\}/g, (_, clave: string) => {
    const v = datos[clave as (typeof VARIABLES)[number]];
    return v && v.trim() ? v : '__________';
  });
}
