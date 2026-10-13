import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Dictado por voz → texto.
 *
 * Hoy el motor es la Web Speech API del navegador: es gratis, no necesita
 * backend y soporta español. Como las entradas de evolución guardan solo el
 * texto y el audio se descarta, no hace falta subir nada a ningún lado — el
 * navegador devuelve la transcripción y listo.
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
  const finalRef = useRef('');
  // Lo que todavía está interpretando. Va en un ref además del estado porque
  // `parar` necesita leerlo en el momento, no en el próximo render.
  const parcialRef = useRef('');
  /**
   * Lo dictado en tandas ANTERIORES de reconocimiento.
   *
   * Chrome corta solo cada tanto y lo reanudamos (ver `onend`). Cada tanda
   * arranca con su lista de resultados vacía, así que lo de las tandas
   * previas se guarda acá y se le suma lo de la tanda actual.
   */
  const baseRef = useRef('');

  // Timer del contador. Va aparte del motor porque la API no informa duración.
  useEffect(() => {
    if (estado !== 'grabando') return;
    const t = setInterval(() => setSegundos(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [estado]);

  /** Devuelve TODO lo dictado, ya consolidado. Hace falta que lo devuelva:
   *  quien llama no puede leer el estado recién actualizado hasta el próximo
   *  render, y para entonces ya quiere insertar el texto. */
  const parar = useCallback((): string => {
    quiereGrabar.current = false;
    // Lo que estaba a medio confirmar también cuenta. El motor marca como
    // "firme" recién cada tanto, así que en un dictado corto TODO lo dicho
    // vive en el parcial: tomar solo lo firme perdía la frase entera.
    if (parcialRef.current.trim()) {
      finalRef.current += parcialRef.current;
      baseRef.current = finalRef.current;
      parcialRef.current = '';
      setTexto(finalRef.current);
      setParcial('');
    }
    motor.current?.stop();
    setEstado(finalRef.current.trim() ? 'listo' : 'inactivo');
    return finalRef.current;
  }, []);

  const empezar = useCallback(() => {
    const SR = getSR();
    if (!SR || bloqueado) return;

    finalRef.current = '';
    parcialRef.current = '';
    baseRef.current = '';
    setTexto('');
    setParcial('');
    setSegundos(0);
    setError(null);

    const m = new SR();
    m.lang = idioma;
    m.continuous = true;
    m.interimResults = true;

    m.onresult = e => {
      // Se RECONSTRUYE el texto entero en cada evento en vez de ir sumando
      // lo nuevo. Parece más caro y es lo único correcto: Android vuelve a
      // entregar resultados que ya había entregado, y sumando cada entrega
      // el texto se duplicaba ("HolaHolaHola hola..."). Reconstruir da el
      // mismo resultado sin importar cuántas veces llegue cada cosa.
      //
      // Se recorre desde 0 y no desde `e.resultIndex` por lo mismo: ese
      // índice no es confiable entre implementaciones.
      let firme = '';
      let enCurso = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) firme += r[0].transcript;
        else enCurso += r[0].transcript;
      }
      finalRef.current = baseRef.current + firme;
      parcialRef.current = enCurso;
      setTexto(finalRef.current);
      setParcial(enCurso);
    };

    m.onerror = e => {
      // "no-speech" pasa todo el tiempo cuando el Dr. hace una pausa larga; no
      // es un error que haya que mostrarle a nadie.
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      setError(MENSAJES[e.error] ?? 'No se pudo dictar. Probá escribiendo la nota.');
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setBloqueado(true);
      quiereGrabar.current = false;
      setEstado(finalRef.current.trim() ? 'listo' : 'inactivo');
    };

    m.onend = () => {
      // Chrome corta solo cada tanto aunque `continuous` esté puesto. Si el
      // usuario no pidió parar, se reanuda: si no, el dictado se muere en
      // silencio a mitad de una frase y parece que la app se colgó.
      if (quiereGrabar.current) {
        try {
          // La tanda que viene arranca con resultados vacíos, así que lo de
          // esta pasa a ser la base. Sin esto, al reanudar se perdía todo lo
          // dicho antes del corte.
          baseRef.current = finalRef.current;
          m.start();
          return;
        } catch {
          quiereGrabar.current = false;
        }
      }
      setEstado(finalRef.current.trim() ? 'listo' : 'inactivo');
    };

    motor.current = m;
    quiereGrabar.current = true;
    try {
      m.start();
      setEstado('grabando');
    } catch {
      setError('No se pudo abrir el micrófono.');
      setBloqueado(true);
      quiereGrabar.current = false;
    }
  }, [idioma, bloqueado]);

  const descartar = useCallback(() => {
    quiereGrabar.current = false;
    motor.current?.abort();
    finalRef.current = '';
    parcialRef.current = '';
    baseRef.current = '';
    setTexto('');
    setParcial('');
    setSegundos(0);
    setEstado('inactivo');
    setError(null);
  }, []);

  /** Para cuando el usuario corrige el texto transcripto antes de guardarlo. */
  const corregir = useCallback((valor: string) => {
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
    /** Lo que todavía está interpretando, para mostrarlo en gris mientras habla. */
    parcial,
    segundos,
    error,
    empezar,
    parar,
    descartar,
    corregir,
  };
}
