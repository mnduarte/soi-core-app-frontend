import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Dictado por voz → texto.
 *
 * Hoy el motor es la Web Speech API del navegador: es gratis, no necesita
 * backend y soporta español. Como las entradas de evolución guardan solo el
 * texto y el audio se descarta, no hace falta subir nada a ningún lado.
 *
 * El motor está detrás de esta interfaz a propósito. Si la precisión con
 * vocabulario odontológico no alcanza, se reemplaza por un endpoint que mande
 * el audio a un servicio de transcripción, y lo único que cambia es este
 * archivo: la pantalla no sabe de dónde sale el texto.
 *
 * Dónde NO funciona, y hay que contarlo en vez de disimularlo:
 *   · Safari en iPhone/iPad la bloquea cuando la app está instalada como PWA
 *     (y SOI es una PWA). Ahí `soportado` da true pero al arrancar tira error.
 *   · Chrome manda el audio a los servidores de Google para reconocerlo.
 * Por eso el consumidor tiene que mirar `bloqueado` además de `soportado`, y
 * dejar siempre disponible la nota escrita como camino alternativo.
 *
 * ── Por qué el acumulado es tan defensivo ──
 * Android no se comporta como el escritorio: vuelve a entregar resultados ya
 * entregados, y `e.resultIndex` no es confiable. Tres reglas, las tres
 * salidas de ver el texto duplicado en pantalla ("HolaHolaHola hola…"):
 *
 *  1. El texto de una tanda se RECONSTRUYE entero en cada evento, recorriendo
 *     `e.results` desde 0. Nunca se suma lo nuevo a lo que había: así el
 *     resultado es el mismo por más veces que llegue cada cosa.
 *  2. Cada reanudación usa una instancia NUEVA del reconocedor. Reusando la
 *     misma no hay garantía de que su lista de resultados se vacíe, y si no
 *     se vacía, lo ya acumulado se cuenta dos veces.
 *  3. Lo acumulado de tandas previas vive en `baseRef` y SOLO cambia al
 *     arrancar una tanda. Si se tocara dentro de `onresult`, cada evento lo
 *     volvería a inflar.
 */

export type EstadoDictado = 'inactivo' | 'grabando' | 'listo';

// La Web Speech API no está en los tipos del DOM, así que se declara lo mínimo
// que se usa acá en vez de traer una dependencia de tipos entera.
interface ResultadoSR {
  isFinal: boolean;
  0: { transcript: string };
}
interface EventoResultadoSR extends Event {
  resultIndex: number;
  results: { length: number; [i: number]: ResultadoSR };
}
interface EventoErrorSR extends Event {
  error: string;
}
interface MotorSR extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: EventoResultadoSR) => void) | null;
  onerror: ((e: EventoErrorSR) => void) | null;
  onend: (() => void) | null;
}
type ConstructorSR = new () => MotorSR;

const getSR = (): ConstructorSR | null => {
  const w = window as unknown as {
    SpeechRecognition?: ConstructorSR;
    webkitSpeechRecognition?: ConstructorSR;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const MENSAJES: Record<string, string> = {
  'not-allowed': 'No nos diste permiso para usar el micrófono.',
  'service-not-allowed': 'Este navegador no deja dictar acá. Escribí la nota a mano.',
  'audio-capture': 'No encontramos micrófono en este dispositivo.',
  network: 'El dictado necesita internet y no hay conexión.',
};

/** Pega dos tramos sin dejarlos pegoteados ni meter espacios de más. */
const unir = (a: string, b: string) => {
  if (!a) return b;
  if (!b) return a;
  return /\s$/.test(a) ? a + b : `${a} ${b}`;
};

export function useDictado(idioma = 'es-AR') {
  const [soportado] = useState(() => getSR() !== null);
  const [estado, setEstado] = useState<EstadoDictado>('inactivo');
  const [texto, setTexto] = useState('');
  const [parcial, setParcial] = useState('');
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Se apaga para toda la sesión cuando el navegador rechaza el dictado: no
  // tiene sentido volver a ofrecer un botón que ya sabemos que no anda.
  const [bloqueado, setBloqueado] = useState(false);

  const motor = useRef<MotorSR | null>(null);
  const quiereGrabar = useRef(false);
  /** Lo dictado en tandas anteriores (cada corte de Chrome abre una nueva). */
  const baseRef = useRef('');
  /** Base + lo firme de la tanda actual. Es el texto que vale. */
  const finalRef = useRef('');
  /** Lo que todavía está interpretando. En ref porque `parar` lo lee ya. */
  const parcialRef = useRef('');
  /** Se reasigna en cada render para que `onend` llame a la versión viva. */
  const arrancarRef = useRef<(base: string) => void>(() => {});

  // Timer del contador. Va aparte del motor porque la API no informa duración.
  useEffect(() => {
    if (estado !== 'grabando') return;
    const t = setInterval(() => setSegundos(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [estado]);

  const arrancar = useCallback(
    (base: string) => {
      const SR = getSR();
      if (!SR) return;

      // Instancia nueva en cada tanda: ver regla 2 del comentario de arriba.
      const m = new SR();
      baseRef.current = base;
      finalRef.current = base;
      parcialRef.current = '';
      m.lang = idioma;
      m.continuous = true;
      m.interimResults = true;

      m.onresult = e => {
        let firme = '';
        let enCurso = '';
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          const t = r[0].transcript.trim();
          if (!t) continue;
          if (r.isFinal) firme = unir(firme, t);
          else enCurso = unir(enCurso, t);
        }
        finalRef.current = unir(baseRef.current, firme);
        parcialRef.current = enCurso;
        setTexto(finalRef.current);
        setParcial(enCurso);
      };

      m.onerror = e => {
        // "no-speech" pasa todo el tiempo cuando el Dr. hace una pausa larga;
        // no es un error que haya que mostrarle a nadie.
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        setError(MENSAJES[e.error] ?? 'No se pudo dictar. Probá escribiendo la nota.');
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setBloqueado(true);
        quiereGrabar.current = false;
        setEstado(finalRef.current.trim() ? 'listo' : 'inactivo');
      };

      m.onend = () => {
        // Chrome corta solo cada tanto aunque `continuous` esté puesto. Si el
        // usuario no pidió parar, se reanuda con una instancia nueva: si no, el
        // dictado se muere en silencio a mitad de una frase.
        if (quiereGrabar.current) {
          // Lo que estaba a medio confirmar se pierde al cortar la tanda, así
          // que se arrastra como parte de la base de la siguiente.
          const acumulado = unir(finalRef.current, parcialRef.current);
          try {
            arrancarRef.current(acumulado);
            return;
          } catch {
            quiereGrabar.current = false;
          }
        }
        setEstado(finalRef.current.trim() ? 'listo' : 'inactivo');
      };

      motor.current = m;
      m.start();
    },
    [idioma],
  );
  // En un efecto y no en el render: escribir un ref durante el render está
  // prohibido por el compilador. Alcanza, porque `onend` solo puede dispararse
  // después de que el usuario arrancó el dictado, o sea mucho después de que
  // este efecto corrió.
  useEffect(() => {
    arrancarRef.current = arrancar;
  }, [arrancar]);

  const empezar = useCallback(() => {
    if (!getSR() || bloqueado) return;
    setTexto('');
    setParcial('');
    setSegundos(0);
    setError(null);
    quiereGrabar.current = true;
    try {
      arrancar('');
      setEstado('grabando');
    } catch {
      setError('No se pudo abrir el micrófono.');
      setBloqueado(true);
      quiereGrabar.current = false;
    }
  }, [arrancar, bloqueado]);

  /** Devuelve TODO lo dictado, ya consolidado. Hace falta que lo devuelva:
   *  quien llama no puede leer el estado recién actualizado hasta el próximo
   *  render, y para entonces ya quiere insertar el texto. */
  const parar = useCallback((): string => {
    quiereGrabar.current = false;
    // Lo que estaba a medio confirmar también cuenta. El motor marca como
    // "firme" recién cada tanto, así que en un dictado corto TODO lo dicho
    // vive en el parcial: tomar solo lo firme perdía la frase entera.
    if (parcialRef.current) {
      finalRef.current = unir(finalRef.current, parcialRef.current);
      baseRef.current = finalRef.current;
      parcialRef.current = '';
      setTexto(finalRef.current);
      setParcial('');
    }
    motor.current?.stop();
    setEstado(finalRef.current.trim() ? 'listo' : 'inactivo');
    return finalRef.current;
  }, []);

  const descartar = useCallback(() => {
    quiereGrabar.current = false;
    motor.current?.abort();
    baseRef.current = '';
    finalRef.current = '';
    parcialRef.current = '';
    setTexto('');
    setParcial('');
    setSegundos(0);
    setEstado('inactivo');
    setError(null);
  }, []);

  /** Para cuando el usuario corrige el texto transcripto antes de guardarlo. */
  const corregir = useCallback((valor: string) => {
    baseRef.current = valor;
    finalRef.current = valor;
    setTexto(valor);
  }, []);

  // Soltar el micrófono al desmontar: sin esto la luz del micrófono queda
  // prendida después de salir de la ficha.
  useEffect(() => () => {
    quiereGrabar.current = false;
    motor.current?.abort();
  }, []);

  return {
    /** El navegador expone la API (no garantiza que vaya a dejar usarla). */
    soportado,
    /** El navegador ya rechazó el dictado en esta sesión. */
    bloqueado,
    estado,
    /** Lo transcripto en firme. */
    texto,
    /** Lo que todavía está interpretando, para mostrarlo en gris. */
    parcial,
    segundos,
    error,
    empezar,
    parar,
    descartar,
    corregir,
  };
}
